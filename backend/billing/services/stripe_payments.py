"""Stripe checkout and webhook helpers used across the billing flows."""
from __future__ import annotations

import logging
from decimal import Decimal
from typing import TYPE_CHECKING, Any, Dict, Iterable, Optional
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

from django.conf import settings
import stripe

from .product_catalog import get_token_product, get_workspace_plan_product
from .stripe_sdk import ensure_stripe_modules_loaded

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from billing.models import WorkspacePlan, WorkspaceSubscription


class StripeConfigurationError(RuntimeError):
    """Raised when mandatory Stripe configuration is missing."""


class StripeServiceError(RuntimeError):
    """Raised when Stripe returns an operational error."""


class StripeWebhookSignatureError(StripeServiceError):
    """Raised when webhook signature validation fails."""


class StripeInvoiceNotFound(StripeServiceError):
    """Raised when a specific Stripe invoice cannot be found."""


def _configure_stripe() -> None:
    secret_key = getattr(settings, "STRIPE_SECRET_KEY", "")
    if not secret_key:
        raise StripeConfigurationError("STRIPE_SECRET_KEY is not configured.")

    ensure_stripe_modules_loaded()
    stripe.api_key = secret_key
    api_version = getattr(settings, "STRIPE_API_VERSION", None)
    if api_version:
        stripe.api_version = api_version


def _build_public_url(path: str) -> str:
    base_url = getattr(settings, "BILLING_PUBLIC_BASE_URL", "")
    if not base_url:
        return ""
    normalized_base = base_url if base_url.endswith("/") else f"{base_url}/"
    normalized_path = path.lstrip("/")
    return urljoin(normalized_base, normalized_path)


def _default_success_url() -> str:
    url = getattr(settings, "STRIPE_SUCCESS_URL", "") or _build_public_url("billing/success")
    if not url:
        raise StripeConfigurationError("STRIPE_SUCCESS_URL or BILLING_PUBLIC_BASE_URL must be configured.")
    return url


def _default_cancel_url() -> str:
    url = getattr(settings, "STRIPE_CANCEL_URL", "") or _build_public_url("billing/cancel")
    if not url:
        raise StripeConfigurationError("STRIPE_CANCEL_URL or BILLING_PUBLIC_BASE_URL must be configured.")
    return url


def _stringify_metadata(values: Dict[str, Any]) -> Dict[str, str]:
    return {key: "" if value is None else str(value) for key, value in values.items()}


def _append_checkout_params(url: str, params: Dict[str, Any], *, include_session: bool = False) -> str:
    """Append query parameters to success/cancel URLs, preserving existing values."""

    if not params and not include_session:
        return url

    split_url = urlsplit(url)
    existing_params = dict(parse_qsl(split_url.query, keep_blank_values=True))

    for key, value in params.items():
        if value in (None, ""):
            continue
        existing_params[key] = str(value)

    session_fragment: Optional[str] = None
    if include_session and "session_id" not in existing_params:
        session_fragment = "session_id={CHECKOUT_SESSION_ID}"

    if "session_id" in existing_params:
        query = urlencode(existing_params, doseq=True)
    else:
        query = urlencode(existing_params, doseq=True)
        if session_fragment:
            query = f"{query}&{session_fragment}" if query else session_fragment

    return urlunsplit((split_url.scheme, split_url.netloc, split_url.path, query, split_url.fragment))


def _ensure_user_billing_profile(user):
    from billing.models import UserBillingProfile  # Lazy import to avoid circular dependency

    return UserBillingProfile.get_or_create_for_user(user)


def _ensure_stripe_customer(profile, *, email: Optional[str]) -> str:
    if profile.stripe_customer_id:
        return profile.stripe_customer_id

    _configure_stripe()
    customer = stripe.Customer.create(email=email)
    customer_id = str(customer.get("id"))
    profile.stripe_customer_id = customer_id
    profile.save(update_fields=["stripe_customer_id", "updated_at"])
    return customer_id


def resolve_plan_price_id(identifier: str, *, interval: Optional[str] = None) -> str:
    """Return a Stripe price identifier for a workspace plan.

    Accepts either an explicit price id (``price_``) or a product id (``prod_``).
    When given a product id, the function queries Stripe for an active price that
    matches the requested recurring ``interval`` and falls back to the first
    active price available.
    """

    if not identifier:
        raise StripeConfigurationError("Workspace plan is missing Stripe price or product identifier.")

    if identifier.startswith("price_"):
        return identifier

    if not identifier.startswith("prod_"):
        return identifier

    return _find_price_for_product(identifier, interval=interval)


def _find_price_for_product(product_id: str, *, interval: Optional[str]) -> str:
    """Fetch the active price id for a Stripe product, matching the interval when possible."""

    _configure_stripe()

    product = None
    try:
        product = stripe.Product.retrieve(product_id, expand=["default_price"])
    except stripe.error.StripeError as exc:  # pragma: no cover - defensive logging
        logger.warning("Unable to retrieve Stripe product %s: %s", product_id, exc)

    if product:
        default_price = getattr(product, "default_price", None)
        price_id = None
        recurring_interval = None

        if isinstance(default_price, dict):
            price_id = default_price.get("id")
            recurring_interval = (default_price.get("recurring") or {}).get("interval")
        else:
            price_id = getattr(default_price, "id", None)
            recurring_interval = getattr(getattr(default_price, "recurring", None), "interval", None)

        if price_id:
            if interval is None or recurring_interval == interval:
                logger.info(
                    "Resolved Stripe price %s from default_price for product %s (interval=%s).",
                    price_id,
                    product_id,
                    recurring_interval,
                )
                return str(price_id)

    try:
        prices = stripe.Price.list(product=product_id, active=True, limit=100)
    except stripe.error.StripeError as exc:  # pragma: no cover - network exceptions mocked in higher layers
        logger.error("Unable to list Stripe prices for product %s: %s", product_id, exc)
        raise StripeServiceError(str(exc)) from exc

    price_data = getattr(prices, "data", None) or []
    if not price_data:
        raise StripeServiceError(f"No active Stripe prices found for product {product_id}.")

    if interval:
        for price in price_data:
            recurring = price.get("recurring") or {}
            if recurring.get("interval") == interval and price.get("id"):
                logger.info(
                    "Resolved Stripe price %s for product %s (interval=%s)",
                    price.get("id"),
                    product_id,
                    interval,
                )
                return str(price["id"])

    for price in price_data:
        if price.get("id"):
            logger.info(
                "Resolved Stripe price %s for product %s using first active price.",
                price.get("id"),
                product_id,
            )
            return str(price["id"])

    raise StripeServiceError(f"Active Stripe prices for product {product_id} are missing identifiers.")


def create_token_checkout_session(
    *,
    user,
    token_account,
    product_key: str,
    quantity: int = 1,
    workspace=None,
    success_url: Optional[str] = None,
    cancel_url: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Create a Stripe Checkout session for purchasing token packs."""

    if quantity <= 0:
        raise ValueError("Quantity must be a positive integer.")

    product = get_token_product(product_key)
    billing_profile = _ensure_user_billing_profile(user)
    customer_id = _ensure_stripe_customer(billing_profile, email=getattr(user, "email", None))

    session_metadata = {
        "token_account_id": str(getattr(token_account, "id", "")),
        "product_key": product.key,
        "product_id": product.stripe_product_id,
        "token_quantity": str(product.tokens * quantity),
        "purchaser_user_id": str(getattr(user, "id", "")),
        "initiator_user_id": str(getattr(user, "id", "")),
    }

    if workspace is not None:
        session_metadata["workspace_id"] = str(getattr(workspace, "id", ""))

    if metadata:
        session_metadata.update(metadata)

    line_item = {
        "price_data": {
            "currency": product.currency,
            "unit_amount": product.unit_amount,
            "product_data": {
                "name": f"Token top-up ({product.tokens} tokens)",
                "metadata": {
                    "product_id": product.stripe_product_id,
                    "tokens": str(product.tokens),
                },
            },
        },
        "quantity": quantity,
    }

    resolved_success = _append_checkout_params(
        success_url or _default_success_url(),
        {
            "context": "token_purchase",
            "workspace_id": str(getattr(workspace, "id", "")) if workspace else None,
            "product_key": product.key,
            "quantity": quantity,
        },
        include_session=True,
    )
    resolved_cancel = _append_checkout_params(
        cancel_url or _default_cancel_url(),
        {
            "context": "token_purchase",
            "workspace_id": str(getattr(workspace, "id", "")) if workspace else None,
            "product_key": product.key,
        },
        include_session=False,
    )

    return create_checkout_session(
        success_url=resolved_success,
        cancel_url=resolved_cancel,
        line_items=[line_item],
        mode="payment",
        metadata=session_metadata,
        customer=customer_id,
        client_reference_id=str(getattr(token_account, "id", "")),
        invoice_creation={"enabled": True},
    )


def create_workspace_plan_checkout_session(
    *,
    user,
    workspace,
    target_plan: "WorkspacePlan",
    plan_key: str,
    subscription: Optional["WorkspaceSubscription"] = None,
    success_url: Optional[str] = None,
    cancel_url: Optional[str] = None,
    billing_cycle: str = "monthly",
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Create a Stripe Checkout session for workspace subscription purchases.

    Use Stripe price-based line items to avoid mixing price_data.product and price_data.product_data.
    """

    plan_product = get_workspace_plan_product(plan_key)
    if not getattr(plan_product, "stripe_product_id", None):
        raise StripeConfigurationError("Selected workspace plan is not billable via Stripe.")

    cycle = billing_cycle.lower()
    if cycle not in {"monthly", "annual", "annually", "yearly", "month", "year"}:
        raise ValueError("Unsupported billing cycle; expected monthly or yearly.")

    interval = "year" if cycle in {"annual", "annually", "yearly", "year"} else "month"

    # Resolve a concrete Stripe price id from the plan's configured identifier (price_ or prod_)
    price_identifier = getattr(target_plan, "stripe_product_id", "")
    if not price_identifier:
        raise StripeConfigurationError("Workspace plan is missing Stripe price/product identifier.")

    line_item: Dict[str, Any]
    try:
        price_id = resolve_plan_price_id(price_identifier, interval=interval)
        line_item = {"price": price_id, "quantity": 1}
    except StripeServiceError as exc:
        logger.warning(
            "Falling back to inline price data for plan %s (%s): %s",
            target_plan.name,
            plan_key,
            exc,
        )
        currency = str(getattr(settings, "STRIPE_CURRENCY", "aud")).lower()
        unit_amount = target_plan.monthly_price
        try:
            unit_amount_decimal = Decimal(unit_amount)
        except Exception:
            unit_amount_decimal = Decimal("0")
        if interval == "year" and unit_amount_decimal > 0:
            unit_amount_decimal = (unit_amount_decimal * Decimal("12")).quantize(Decimal("0.01"))
        unit_amount_cents = int((unit_amount_decimal * Decimal("100")).quantize(Decimal("1")))
        if unit_amount_cents <= 0:
            raise StripeServiceError("Unable to resolve Stripe price for workspace plan.") from exc

        line_item = {
            "price_data": {
                "currency": currency,
                "unit_amount": unit_amount_cents,
                "recurring": {"interval": interval},
                "product_data": {
                    "name": target_plan.name,
                    "metadata": {
                        "plan_key": plan_key,
                        "plan_id": str(getattr(target_plan, "id", "")),
                    },
                },
            },
            "quantity": 1,
        }

    session_metadata: Dict[str, Any] = {
        "workspace_id": str(getattr(workspace, "id", "")),
        "plan_key": plan_key,
        "plan_id": str(getattr(target_plan, "id", "")),
        "mode": "workspace_plan",
        "billing_cycle": interval,
    }

    owner_user = user
    billing_profile = None

    if subscription is not None:
        owner_user = subscription.billing_owner or user
        from billing.services.subscription_lifecycle import assign_billing_owner

        billing_profile = assign_billing_owner(subscription, owner_user)
        session_metadata["workspace_subscription_id"] = str(getattr(subscription, "id", ""))
        if getattr(subscription, "stripe_subscription_id", None):
            session_metadata["previous_subscription_id"] = subscription.stripe_subscription_id
    else:
        billing_profile = _ensure_user_billing_profile(owner_user)

    session_metadata["initiator_user_id"] = str(getattr(user, "id", ""))
    session_metadata["billing_owner_user_id"] = str(getattr(owner_user, "id", ""))

    customer_id = billing_profile.stripe_customer_id if billing_profile else ""

    if subscription is not None and subscription.stripe_customer_id:
        customer_id = subscription.stripe_customer_id

    if metadata:
        session_metadata.update(metadata)

    subscription_data = {"metadata": _stringify_metadata(session_metadata)}

    if not customer_id:
        customer_id = _ensure_stripe_customer(billing_profile, email=getattr(owner_user, "email", None))
        if subscription is not None:
            subscription.stripe_customer_id = customer_id
            subscription.save(update_fields=["stripe_customer_id"])

    resolved_success = _append_checkout_params(
        success_url or _default_success_url(),
        {
            "context": "workspace_subscription",
            "workspace_id": str(getattr(workspace, "id", "")),
            "plan_key": plan_key,
            "billing_cycle": interval,
        },
        include_session=True,
    )
    resolved_cancel = _append_checkout_params(
        cancel_url or _default_cancel_url(),
        {
            "context": "workspace_subscription",
            "workspace_id": str(getattr(workspace, "id", "")),
            "plan_key": plan_key,
        },
        include_session=False,
    )

    return create_checkout_session(
        success_url=resolved_success,
        cancel_url=resolved_cancel,
        line_items=[line_item],
        mode="subscription",
        metadata=session_metadata,
        client_reference_id=str(getattr(workspace, "id", "")),
        customer=customer_id,
        subscription_data=subscription_data,
    )


def create_checkout_session(
    *,
    success_url: str,
    cancel_url: str,
    line_items: Iterable[Dict[str, Any]],
    mode: str = "payment",
    metadata: Optional[Dict[str, Any]] = None,
    client_reference_id: Optional[str] = None,
    customer_email: Optional[str] = None,
    customer: Optional[str] = None,
    payment_intent_data: Optional[Dict[str, Any]] = None,
    expand: Optional[Iterable[str]] = None,
    subscription_data: Optional[Dict[str, Any]] = None,
    invoice_creation: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Wrapper around ``stripe.checkout.Session.create`` with consistent error handling."""

    _configure_stripe()

    options: Dict[str, Any] = {
        "success_url": success_url,
        "cancel_url": cancel_url,
        "mode": mode,
        "line_items": list(line_items),
    }

    if metadata:
        options["metadata"] = _stringify_metadata(metadata)
    if client_reference_id:
        options["client_reference_id"] = str(client_reference_id)
    if customer_email:
        options["customer_email"] = customer_email
    if customer:
        options["customer"] = customer
    if payment_intent_data:
        options["payment_intent_data"] = payment_intent_data
    if expand:
        options["expand"] = list(expand)
    if subscription_data:
        options["subscription_data"] = subscription_data
    if invoice_creation:
        options["invoice_creation"] = invoice_creation

    try:
        session = stripe.checkout.Session.create(**options)
    except stripe.error.StripeError as exc:  # pragma: no cover - passthrough
        logger.warning("Stripe checkout session creation failed: %s", exc)
        raise StripeServiceError(str(exc)) from exc

    try:
        return session.to_dict_recursive()  # type: ignore[attr-defined]
    except AttributeError:
        return dict(session)


def parse_event(payload: str, sig_header: str, secret: Optional[str] = None) -> stripe.Event:
    """Validate and deserialize a Stripe webhook payload."""

    if not sig_header:
        raise StripeWebhookSignatureError("Stripe-Signature header is missing.")

    webhook_secret = secret or getattr(settings, "STRIPE_WEBHOOK_SECRET", "")
    if not webhook_secret:
        raise StripeConfigurationError("STRIPE_WEBHOOK_SECRET is not configured.")

    _configure_stripe()

    try:
        return stripe.Webhook.construct_event(payload=payload, sig_header=sig_header, secret=webhook_secret)
    except stripe.error.SignatureVerificationError as exc:
        logger.warning("Stripe webhook signature verification failed: %s", exc)
        raise StripeWebhookSignatureError("Stripe webhook signature verification failed.") from exc
    except ValueError as exc:
        logger.error("Received malformed Stripe webhook payload: %s", exc)
        raise StripeServiceError("Malformed Stripe webhook payload.") from exc


def retrieve_subscription(subscription_id: str, *, expand: Optional[Iterable[str]] = None) -> Dict[str, Any]:
    """Fetch a Stripe subscription object as a plain dictionary."""

    if not subscription_id:
        raise ValueError("subscription_id is required.")

    _configure_stripe()

    kwargs: Dict[str, Any] = {}
    if expand:
        kwargs["expand"] = list(expand)

    try:
        subscription = stripe.Subscription.retrieve(subscription_id, **kwargs)
    except stripe.error.StripeError as exc:  # pragma: no cover - Stripe client passthrough
        logger.warning("Failed to retrieve Stripe subscription %s: %s", subscription_id, exc)
        raise StripeServiceError(str(exc)) from exc

    try:
        return subscription.to_dict_recursive()  # type: ignore[attr-defined]
    except AttributeError:
        return dict(subscription)


def retrieve_customer(customer_id: str) -> Dict[str, Any]:
    """Fetch a Stripe customer object."""

    if not customer_id:
        raise ValueError("customer_id is required.")

    _configure_stripe()

    try:
        customer = stripe.Customer.retrieve(customer_id)
    except stripe.error.StripeError as exc:  # pragma: no cover - Stripe client passthrough
        logger.warning("Failed to retrieve Stripe customer %s: %s", customer_id, exc)
        raise StripeServiceError(str(exc)) from exc

    try:
        return customer.to_dict_recursive()  # type: ignore[attr-defined]
    except AttributeError:
        return dict(customer)


def retrieve_invoice(invoice_id: str, *, expand: Optional[Iterable[str]] = None) -> Dict[str, Any]:
    """Fetch a Stripe invoice object as a plain dictionary."""

    if not invoice_id:
        raise ValueError("invoice_id is required.")

    _configure_stripe()
    kwargs: Dict[str, Any] = {}
    if expand:
        kwargs["expand"] = list(expand)

    try:
        invoice = stripe.Invoice.retrieve(invoice_id, **kwargs)
    except stripe.error.StripeError as exc:  # pragma: no cover
        logger.warning("Failed to retrieve Stripe invoice %s: %s", invoice_id, exc)
        if (
            getattr(exc, "code", "") == "resource_missing"
            or getattr(exc, "http_status", None) == 404
        ):
            raise StripeInvoiceNotFound(str(exc)) from exc
        raise StripeServiceError(str(exc)) from exc

    try:
        return invoice.to_dict_recursive()  # type: ignore[attr-defined]
    except AttributeError:
        return dict(invoice)


def pay_invoice(invoice_id: str) -> Dict[str, Any]:
    """Attempt to pay a pending Stripe invoice and return the resulting payload."""

    if not invoice_id:
        raise ValueError("invoice_id is required.")

    _configure_stripe()

    try:
        invoice = stripe.Invoice.pay(invoice_id)
    except stripe.error.StripeError as exc:  # pragma: no cover - Stripe client passthrough
        logger.warning("Failed to pay Stripe invoice %s: %s", invoice_id, exc)
        raise StripeServiceError(str(exc)) from exc

    try:
        return invoice.to_dict_recursive()  # type: ignore[attr-defined]
    except AttributeError:
        return dict(invoice)


def create_refund(
    *,
    payment_intent: str,
    amount_minor: int,
    currency: str,
    reason: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Create a Stripe refund for a payment intent."""

    if not payment_intent:
        raise ValueError("payment_intent is required.")
    if amount_minor <= 0:
        raise ValueError("amount_minor must be positive.")

    _configure_stripe()

    params: Dict[str, Any] = {
        "payment_intent": payment_intent,
        "amount": amount_minor,
    }
    if reason:
        params["reason"] = reason
    if metadata:
        params["metadata"] = metadata

    try:
        refund = stripe.Refund.create(**params)
    except stripe.error.StripeError as exc:  # pragma: no cover - Stripe client passthrough
        logger.warning("Failed to create Stripe refund for payment %s: %s", payment_intent, exc)
        raise StripeServiceError(str(exc)) from exc

    try:
        return refund.to_dict_recursive()  # type: ignore[attr-defined]
    except AttributeError:
        return dict(refund)


def modify_subscription_item_price(
    subscription_id: str,
    *,
    item_id: str,
    price_id: str,
    proration_behavior: str = "create_prorations",
    payment_behavior: str = "pending_if_incomplete",
    idempotency_key: Optional[str] = None,
) -> Dict[str, Any]:
    """Update a Stripe subscription item's price with optional proration."""

    if not subscription_id:
        raise ValueError("subscription_id is required.")
    if not item_id:
        raise ValueError("item_id is required.")
    if not price_id:
        raise ValueError("price_id is required.")

    _configure_stripe()

    params: Dict[str, Any] = {
        "items": [
            {
                "id": item_id,
                "price": price_id,
            }
        ],
        "proration_behavior": proration_behavior,
    }
    if payment_behavior:
        params["payment_behavior"] = payment_behavior

    request_options: Dict[str, Any] = {}
    if idempotency_key:
        request_options["idempotency_key"] = idempotency_key

    try:
        subscription = stripe.Subscription.modify(subscription_id, **params, **request_options)
    except stripe.error.StripeError as exc:  # pragma: no cover - Stripe client passthrough
        logger.warning("Failed to modify Stripe subscription %s: %s", subscription_id, exc)
        raise StripeServiceError(str(exc)) from exc

    try:
        return subscription.to_dict_recursive()  # type: ignore[attr-defined]
    except AttributeError:
        return dict(subscription)
