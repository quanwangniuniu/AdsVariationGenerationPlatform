"""Billing API views for token products and purchases."""
from __future__ import annotations

import logging

from rest_framework import status
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from billing.models import TokenAccount
from billing.permissions import BillingPermissionLevel, check_workspace_billing_permission
from billing.serializers import UserTokenPurchaseSerializer, WorkspaceTokenPurchaseSerializer
from billing.services.product_catalog import get_token_products
from billing.services.stripe_payments import (
    StripeConfigurationError,
    StripeServiceError,
    create_token_checkout_session,
)

logger = logging.getLogger(__name__)


def _ensure_user_token_account(user) -> TokenAccount:
    account, _ = TokenAccount.objects.get_or_create(user=user, defaults={})
    return account


def _ensure_workspace_token_account(workspace) -> TokenAccount:
    account, _ = TokenAccount.objects.get_or_create(workspace=workspace, defaults={})
    return account


class TokenProductListView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        account = _ensure_user_token_account(request.user)
        products = [
            {
                "key": product.key,
                "name": f"{product.tokens} Tokens",  # Add name field
                "description": f"Purchase {product.tokens} tokens for ${product.unit_amount_decimal}",  # Add description
                "token_amount": product.tokens,  # Frontend expects token_amount
                "price_amount": str(product.unit_amount_decimal),  # Frontend expects price_amount as string
                "currency": product.currency.upper(),  # Uppercase currency code
                "is_active": True,  # Add is_active field
                # Keep legacy fields for backward compatibility
                "stripe_product_id": product.stripe_product_id,
                "tokens": product.tokens,
                "unit_amount": product.unit_amount,
                "unit_amount_decimal": str(product.unit_amount_decimal),
            }
            for product in get_token_products()
        ]

        return Response(
            {
                "balance": account.balance,  # Frontend expects balance at top level
                "token_account": {  # Keep this for backward compatibility
                    "id": str(account.id),
                    "balance": account.balance,
                },
                "products": products,
            }
        )


class TokenPurchaseView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        account = _ensure_user_token_account(request.user)
        serializer = UserTokenPurchaseSerializer(
            data=request.data,
            context={"request": request, "token_account": account},
        )
        serializer.is_valid(raise_exception=True)

        token_product = serializer.validated_data["token_product"]
        quantity = serializer.validated_data["quantity"]

        try:
            session_info = create_token_checkout_session(
                user=request.user,
                token_account=account,
                product_key=token_product.key,
                quantity=quantity,
            )
        except (StripeConfigurationError, StripeServiceError) as exc:
            logger.warning("Unable to create Stripe checkout session: %s", exc)
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        response_payload = {
            "checkout_session_id": session_info.get("id"),
            "checkout_url": session_info.get("url"),
        }

        return Response(response_payload, status=status.HTTP_201_CREATED)


class WorkspaceTokenProductListView(APIView):
    """Expose purchasable token packs and balance for a workspace."""

    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, workspace_id):  # noqa: D401 (params mandated by router)
        """Return workspace token balance and available token packs."""
        workspace, permissions = check_workspace_billing_permission(
            user=request.user,
            workspace_id=workspace_id,
            level=BillingPermissionLevel.MANAGE_TOKENS,
        )
        request.workspace = workspace
        request.workspace_permissions = permissions
        account = _ensure_workspace_token_account(workspace)
        products = [
            {
                "key": product.key,
                "name": f"{product.tokens} Tokens",  # Add name field
                "description": f"Purchase {product.tokens} tokens for ${product.unit_amount_decimal}",  # Add description
                "token_amount": product.tokens,  # Frontend expects token_amount
                "price_amount": str(product.unit_amount_decimal),  # Frontend expects price_amount as string
                "currency": product.currency.upper(),  # Uppercase currency code
                "is_active": True,  # Add is_active field
                # Keep legacy fields for backward compatibility
                "stripe_product_id": product.stripe_product_id,
                "tokens": product.tokens,
                "unit_amount": product.unit_amount,
                "unit_amount_decimal": str(product.unit_amount_decimal),
            }
            for product in get_token_products()
        ]

        return Response(
            {
                "balance": account.balance,  # Frontend expects balance at top level
                "token_account": {  # Keep this for backward compatibility
                    "id": str(account.id),
                    "balance": account.balance,
                },
                "products": products,
            }
        )


class WorkspaceTokenPurchaseView(APIView):
    """Initiate a Stripe checkout for workspace-level token purchases."""

    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, workspace_id):  # noqa: D401 (params mandated by router)
        """Create a Stripe session for workspace token purchase requests."""
        workspace, permissions = check_workspace_billing_permission(
            user=request.user,
            workspace_id=workspace_id,
            level=BillingPermissionLevel.MANAGE_TOKENS,
        )
        request.workspace = workspace
        request.workspace_permissions = permissions
        account = _ensure_workspace_token_account(workspace)

        serializer = WorkspaceTokenPurchaseSerializer(
            data=request.data,
            context={
                "request": request,
                "token_account": account,
                "workspace_permissions": permissions,
            },
        )
        serializer.is_valid(raise_exception=True)

        token_product = serializer.validated_data["token_product"]
        quantity = serializer.validated_data["quantity"]

        try:
            session_info = create_token_checkout_session(
                user=request.user,
                token_account=account,
                product_key=token_product.key,
                quantity=quantity,
                workspace=workspace,
            )
        except (StripeConfigurationError, StripeServiceError) as exc:
            logger.warning(
                "Unable to create workspace Stripe checkout session: %s", exc
            )
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        response_payload = {
            "checkout_session_id": session_info.get("id"),
            "checkout_url": session_info.get("url"),
        }

        return Response(response_payload, status=status.HTTP_201_CREATED)
