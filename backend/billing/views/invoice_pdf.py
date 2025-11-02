from __future__ import annotations

import mimetypes
import os
from typing import IO, Optional

from django.core.files.storage import default_storage
from django.http import FileResponse, Http404, JsonResponse
from django.utils.translation import gettext_lazy as translate
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from billing.models import BillingAuditLog, InvoiceRecord
from billing.permissions import BillingPermissionLevel, check_workspace_billing_permission
from billing.services.invoice_pdf import resolve_invoice_pdf, InvoicePdfError, InvoicePdfNotFound


class BaseInvoicePdfView(APIView):
    permission_classes = [IsAuthenticated]
    audit_event = "billing.invoice.pdf_download"

    def get(self, request, *args, **kwargs):
        invoice = self._get_invoice(request, *args, **kwargs)
        try:
            resolved = resolve_invoice_pdf(invoice)
            file_handle = self._open_pdf(resolved)
        except InvoicePdfNotFound:
            return self._error_response(
                status=status.HTTP_404_NOT_FOUND,
                code="invoice_pdf_not_found",
                message=translate("Invoice PDF is not available."),
                request=request,
                invoice=invoice,
                result="not_found",
            )
        except InvoicePdfError as exc:
            return self._error_response(
                status=status.HTTP_502_BAD_GATEWAY,
                code="invoice_pdf_fetch_failed",
                message=str(exc),
                request=request,
                invoice=invoice,
                result="failed",
            )
        except OSError:
            return self._error_response(
                status=status.HTTP_404_NOT_FOUND,
                code="invoice_pdf_missing",
                message=translate("Invoice PDF storage missing."),
                request=request,
                invoice=invoice,
                result="missing",
            )

        content_type, _ = mimetypes.guess_type(resolved.filename)
        response = FileResponse(
            file_handle,
            content_type=content_type or "application/pdf",
        )
        response["Content-Disposition"] = f'attachment; filename="{resolved.filename}"'
        if resolved.size is not None:
            response["Content-Length"] = str(resolved.size)

        self._record_audit(
            request=request,
            invoice=invoice,
            storage_path=resolved.storage_path,
            result="success",
        )
        return response

    def _error_response(self, *, status: int, code: str, message: str, request, invoice, result: str):
        self._record_audit(
            request=request,
            invoice=invoice,
            storage_path=invoice.pdf_storage_path or "",
            result=result,
        )
        return JsonResponse({"code": code, "message": message, "details": {}}, status=status)

    def _open_pdf(self, resolved) -> IO[bytes]:
        if resolved.is_absolute:
            if not os.path.exists(resolved.storage_path):
                raise OSError("absolute_pdf_missing")
            return open(resolved.storage_path, "rb")

        if not default_storage.exists(resolved.storage_path):
            raise OSError("relative_pdf_missing")
        return default_storage.open(resolved.storage_path, "rb")

    def _record_audit(self, *, request, invoice: InvoiceRecord, storage_path: str, result: str) -> None:
        BillingAuditLog.objects.create(
            workspace=invoice.workspace,
            event_type=self.audit_event,
            stripe_id=invoice.stripe_invoice_id or "",
            actor=f"user:{request.user.id}",
            request_id=request.headers.get("X-Request-ID", ""),
            details={
                "invoice_id": str(invoice.id),
                "storage_path": storage_path,
                "result": result,
            },
        )

    def _get_invoice(self, request, *args, **kwargs) -> InvoiceRecord:
        raise NotImplementedError  # pragma: no cover


class UserInvoicePdfView(BaseInvoicePdfView):
    def _get_invoice(self, request, *args, **kwargs) -> InvoiceRecord:
        invoice_id = kwargs["invoice_id"]
        try:
            invoice = InvoiceRecord.objects.select_related("workspace", "workspace__owner").get(id=invoice_id)
        except InvoiceRecord.DoesNotExist as exc:
            raise Http404(translate("Invoice not found.")) from exc

        if invoice.initiator_id != request.user.id:
            raise Http404(translate("Invoice not found."))

        return invoice


class WorkspaceInvoicePdfView(BaseInvoicePdfView):
    def _get_invoice(self, request, *args, **kwargs) -> InvoiceRecord:
        workspace_id = kwargs["workspace_id"]
        invoice_id = kwargs["invoice_id"]

        workspace, _ = check_workspace_billing_permission(
            user=request.user,
            workspace_id=workspace_id,
            level=BillingPermissionLevel.VIEW_BILLING,
        )

        try:
            invoice = InvoiceRecord.objects.select_related("workspace").get(id=invoice_id, workspace=workspace)
        except InvoiceRecord.DoesNotExist as exc:
            raise Http404(translate("Invoice not found for the workspace.")) from exc

        return invoice
