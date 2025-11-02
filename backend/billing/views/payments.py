"""Payment retry and refund endpoints."""
from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ReadOnlyModelViewSet

from billing.filters import PaymentRecordFilter
from billing.models import PaymentRecord, WorkspaceSubscription
from billing.observability.logging import log_billing_event
from billing.observability.metrics import (
    BILLING_REQUEST_COUNT,
    BILLING_REQUEST_LATENCY,
    PAYMENT_FAILURE_COUNT,
    PAYMENT_SUCCESS_COUNT,
)
from billing.pagination import BoundedPageNumberPagination
from billing.permissions import BillingPermissionLevel, check_workspace_billing_permission
from billing.serializers import (
    InvoiceRecordSerializer,
    PaymentRecordSerializer,
    PaymentRefundRequestSerializer,
    RefundRecordSerializer,
)
from billing.services import payments as payment_services
from billing.services.refunds import record_refund
from billing.services.stripe_payments import StripeServiceError, create_refund, pay_invoice


class BillingMetricsMixin:
    endpoint_label: str = "billing"
    method: str = "POST"

    def _record_request(self, status: int) -> None:
        BILLING_REQUEST_COUNT.labels(
            endpoint=self.endpoint_label,
            method=self.method,
            status=str(status),
        ).inc()

    def _success_response(
        self,
        payload,
        *,
        status: int,
        workspace_id: str | None,
        message: str,
    ):
        self._record_request(status)
        if workspace_id:
            PAYMENT_SUCCESS_COUNT.labels(workspace_id=workspace_id).inc()
        log_billing_event(message=message, workspace_id=workspace_id)
        return Response(payload, status=status)

    def _error_response(
        self,
        *,
        status: int,
        code: str,
        message: str,
        details: dict | None = None,
        workspace_id: str | None = None,
        failure_reason: str | None = None,
    ):
        self._record_request(status)
        if workspace_id and failure_reason:
            PAYMENT_FAILURE_COUNT.labels(workspace_id=workspace_id, reason=failure_reason).inc()
        log_billing_event(
            message=message,
            workspace_id=workspace_id,
            extra={"code": code, "details": details or {}},
        )
        payload = {"code": code, "message": message, "details": details or {}}
        return Response(payload, status=status)

    @staticmethod
    def _workspace_str(workspace_id):
        return str(workspace_id) if workspace_id else None


class UserPaymentViewSet(ReadOnlyModelViewSet):
    """List payment records visible to the authenticated user."""

    serializer_class = PaymentRecordSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination
    filterset_class = PaymentRecordFilter
    ordering_fields = ("created_at", "amount", "status")
    ordering = ("-created_at",)

    def get_queryset(self):
        user = self.request.user
        return (
            PaymentRecord.objects.select_related("invoice", "workspace", "initiator")
            .filter(initiator=user)
            .order_by("-created_at")
        )


class WorkspacePaymentViewSet(ReadOnlyModelViewSet):
    """List payment records for a specific workspace."""

    serializer_class = PaymentRecordSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = BoundedPageNumberPagination
    filterset_class = PaymentRecordFilter
    ordering_fields = ("created_at", "amount", "status")
    ordering = ("-created_at",)

    def get_queryset(self):
        workspace, _ = check_workspace_billing_permission(
            user=self.request.user,
            workspace_id=self.kwargs["workspace_id"],
            level=BillingPermissionLevel.VIEW_BILLING,
        )
        self.request.workspace = workspace
        try:
            workspace.subscription  # noqa: B018 (access forces existence check)
        except WorkspaceSubscription.DoesNotExist:
            return PaymentRecord.objects.none()

        return (
            PaymentRecord.objects.select_related("invoice", "workspace", "initiator")
            .filter(workspace=workspace, initiator=self.request.user)
            .order_by("-created_at")
        )


class PaymentRetryView(BillingMetricsMixin, APIView):
    permission_classes = [IsAuthenticated]
    endpoint_label = "payments.retry"

    def post(self, request, payment_id, workspace_id=None):
        with BILLING_REQUEST_LATENCY.labels(endpoint=self.endpoint_label, method=self.method).time():
            if not getattr(settings, "BILLING_API_WRITE_ENABLED", True):
                return self._error_response(
                    status=503,
                    code="billing_writes_disabled",
                    message="Billing write operations are temporarily disabled.",
                )
            try:
                payment = self._get_payment(payment_id)
            except ValueError:
                return self._error_response(
                    status=404,
                    code="payment_not_found",
                    message="Payment not found.",
                )

            payment_workspace = self._workspace_str(payment.workspace_id)
            invoice = payment.invoice
            if invoice is None:
                return self._error_response(
                    status=400,
                    code="invalid_payment",
                    message="Payment is not linked to an invoice.",
                    workspace_id=payment_workspace,
                    failure_reason="invalid_payment",
                )

            if payment.initiator_id != request.user.id:
                return self._error_response(
                    status=403,
                    code="forbidden",
                    message="You are not allowed to retry this payment.",
                    workspace_id=payment_workspace,
                    failure_reason="initiator_mismatch",
                )

            workspace_obj = payment.workspace or invoice.workspace
            subscription = None
            if workspace_obj is not None:
                try:
                    subscription = workspace_obj.subscription
                except WorkspaceSubscription.DoesNotExist:
                    subscription = None

            if subscription is None:
                return self._error_response(
                    status=409,
                    code="subscription_missing",
                    message="Subscription is no longer available for this payment.",
                    workspace_id=payment_workspace,
                    failure_reason="subscription_missing",
                )

            if workspace_id:
                workspace, _ = check_workspace_billing_permission(
                    user=request.user,
                    workspace_id=workspace_id,
                    level=BillingPermissionLevel.MANAGE_BILLING,
                )
                if payment.workspace_id != workspace.id:
                    return self._error_response(
                        status=404,
                        code="payment_not_found",
                        message="Payment not found for the workspace.",
                    )

            if subscription.billing_owner_id != request.user.id:
                return self._error_response(
                    status=403,
                    code="forbidden",
                    message="Only the billing owner can retry this subscription payment.",
                    workspace_id=payment_workspace,
                    failure_reason="not_billing_owner",
                )

            if subscription.status == "canceled":
                return self._error_response(
                    status=409,
                    code="subscription_inactive",
                    message="Subscription is not active for this payment.",
                    workspace_id=payment_workspace,
                    failure_reason="subscription_inactive",
                )

            if payment.status not in {
                PaymentRecord.Status.FAILED,
                PaymentRecord.Status.REQUIRES_ACTION,
                PaymentRecord.Status.REQUIRES_PAYMENT_METHOD,
            }:
                return self._error_response(
                    status=409,
                    code="payment_not_retryable",
                    message="Payment is not in a retryable state.",
                    workspace_id=payment_workspace,
                    failure_reason="payment_not_retryable",
                )

            if not invoice.stripe_invoice_id:
                return self._error_response(
                    status=400,
                    code="missing_stripe_invoice",
                    message="Stripe invoice id is required to retry payment.",
                    workspace_id=payment_workspace,
                    failure_reason="missing_stripe_invoice",
                )

            try:
                stripe_invoice = pay_invoice(invoice.stripe_invoice_id)
            except StripeServiceError as exc:
                return self._error_response(
                    status=502,
                    code="stripe_error",
                    message=str(exc),
                    workspace_id=payment_workspace,
                    failure_reason="stripe_error",
                )

            result = payment_services.process_invoice_paid_event(stripe_invoice, initiator=request.user)
            payment_record = result.payment or payment

            response_payload = {
                "payment": PaymentRecordSerializer(payment_record, context={"request": request}).data,
                "invoice": InvoiceRecordSerializer(result.invoice).data,
            }
            return self._success_response(
                response_payload,
                status=202,
                workspace_id=payment_workspace,
                message="Payment retry succeeded",
            )

    @staticmethod
    def _get_payment(payment_id: str) -> PaymentRecord:
        try:
            return PaymentRecord.objects.select_related("invoice", "workspace").get(pk=payment_id)
        except PaymentRecord.DoesNotExist as exc:
            raise ValueError("payment_not_found") from exc


class PaymentRefundView(BillingMetricsMixin, APIView):
    permission_classes = [IsAuthenticated]
    endpoint_label = "payments.refund"

    def post(self, request, payment_id, workspace_id=None):
        with BILLING_REQUEST_LATENCY.labels(endpoint=self.endpoint_label, method=self.method).time():
            if not getattr(settings, "BILLING_API_WRITE_ENABLED", True):
                return self._error_response(
                    status=503,
                    code="billing_writes_disabled",
                    message="Billing write operations are temporarily disabled.",
                )
            try:
                payment = self._get_payment(payment_id)
            except ValueError:
                return self._error_response(
                    status=404,
                    code="payment_not_found",
                    message="Payment not found.",
                )

            payment_workspace = self._workspace_str(payment.workspace_id)
            invoice = payment.invoice
            if invoice is None:
                return self._error_response(
                    status=400,
                    code="invalid_payment",
                    message="Refund cannot be created for this payment.",
                    workspace_id=payment_workspace,
                    failure_reason="invalid_payment",
                )

            if payment.initiator_id != request.user.id:
                return self._error_response(
                    status=403,
                    code="forbidden",
                    message="Only the initiator can refund this payment.",
                    workspace_id=payment_workspace,
                    failure_reason="initiator_mismatch",
                )

            workspace_obj = payment.workspace or invoice.workspace
            subscription = None
            if workspace_obj is not None:
                try:
                    subscription = workspace_obj.subscription
                except WorkspaceSubscription.DoesNotExist:
                    subscription = None

            if workspace_id:
                workspace, _ = check_workspace_billing_permission(
                    user=request.user,
                    workspace_id=workspace_id,
                    level=BillingPermissionLevel.MANAGE_BILLING,
                )
                if payment.workspace_id != workspace.id:
                    return self._error_response(
                        status=404,
                        code="payment_not_found",
                        message="Payment not found for the workspace.",
                    )

            if subscription is None:
                return self._error_response(
                    status=409,
                    code="subscription_missing",
                    message="Subscription is no longer available for this payment.",
                    workspace_id=payment_workspace,
                    failure_reason="subscription_missing",
                )

            if subscription.billing_owner_id != request.user.id:
                return self._error_response(
                    status=403,
                    code="forbidden",
                    message="Only the billing owner can refund this subscription payment.",
                    workspace_id=payment_workspace,
                    failure_reason="not_billing_owner",
                )

            if subscription.status == "canceled":
                return self._error_response(
                    status=409,
                    code="subscription_inactive",
                    message="Subscription is not active for this payment.",
                    workspace_id=payment_workspace,
                    failure_reason="subscription_inactive",
                )

            serializer = PaymentRefundRequestSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            data = serializer.validated_data

            amount = data["amount"]
            if amount > payment.amount:
                return self._error_response(
                    status=422,
                    code="amount_exceeds_payment",
                    message="Refund amount exceeds original payment.",
                    workspace_id=payment_workspace,
                    failure_reason="amount_exceeds_payment",
                )

            currency = (data.get("currency") or payment.currency).lower()

            if not payment.stripe_payment_intent_id:
                return self._error_response(
                    status=400,
                    code="invalid_payment",
                    message="Refund cannot be created for this payment.",
                    workspace_id=payment_workspace,
                    failure_reason="invalid_payment",
                )

            amount_minor = int((amount * Decimal("100")).quantize(Decimal("1")))

            try:
                refund_payload = create_refund(
                    payment_intent=payment.stripe_payment_intent_id,
                    amount_minor=amount_minor,
                    currency=currency,
                    reason=data.get("reason"),
                    metadata=data.get("metadata", {}),
                )
            except StripeServiceError as exc:
                return self._error_response(
                    status=502,
                    code="stripe_error",
                    message=str(exc),
                    workspace_id=payment_workspace,
                    failure_reason="stripe_error",
                )

            refund = record_refund(
                payment=payment,
                amount=amount,
                currency=currency,
                reason=data.get("reason", ""),
                payload=refund_payload,
                initiator=request.user,
            )

            response_payload = {
                "payment": PaymentRecordSerializer(payment, context={"request": request}).data,
                "refund": RefundRecordSerializer(refund).data,
            }
            return self._success_response(
                response_payload,
                status=202,
                workspace_id=payment_workspace,
                message="Payment refund created",
            )

    @staticmethod
    def _get_payment(payment_id: str) -> PaymentRecord:
        try:
            return PaymentRecord.objects.select_related("invoice", "workspace").get(pk=payment_id)
        except PaymentRecord.DoesNotExist as exc:
            raise ValueError("payment_not_found") from exc
