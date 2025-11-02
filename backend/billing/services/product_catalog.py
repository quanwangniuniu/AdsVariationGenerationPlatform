"""Helper utilities for exposing Stripe product configuration to the billing flows."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
import logging
import re
from typing import Dict, Mapping, Optional, Tuple

from django.conf import settings
import stripe

from .stripe_sdk import ensure_stripe_modules_loaded
logger = logging.getLogger(__name__)


class ProductCatalogError(Exception):
    """Base exception for product catalog issues."""


class ProductNotFound(ProductCatalogError):
    """Raised when a requested product key cannot be found in the catalog."""


class CatalogConfigurationError(ProductCatalogError):
    """Raised when the product catalog in settings is missing or malformed."""


@dataclass(frozen=True)
class TokenProduct:
    """Represents a purchasable token pack."""

    key: str
    stripe_product_id: str
    tokens: int
    unit_amount: int
    unit_amount_decimal: Decimal
    currency: str


@dataclass(frozen=True)
class WorkspacePlanProduct:
    """Represents a Stripe-backed workspace subscription plan."""

    key: str
    stripe_product_id: Optional[str]


def _get_product_settings() -> Mapping[str, object]:
    try:
        product_settings = settings.STRIPE_PRODUCT_IDS
    except AttributeError as exc:
        raise CatalogConfigurationError("STRIPE_PRODUCT_IDS is not defined in Django settings.") from exc

    if not isinstance(product_settings, Mapping):
        raise CatalogConfigurationError("STRIPE_PRODUCT_IDS must be a mapping of product keys to identifiers.")

    return product_settings


def _resolve_token_pack_details(key: str) -> Tuple[int, int, Decimal, str]:
    """Return (tokens, unit_amount_cents, unit_amount_decimal, currency) for a pack."""

    details = getattr(settings, "STRIPE_TOKEN_PRODUCT_DETAILS", {}) or {}
    configured = details.get(key, {}) if isinstance(details, dict) else {}

    tokens = int(configured.get("tokens") or _infer_token_quantity(key))
    if tokens <= 0:
        raise CatalogConfigurationError(f"Token product '{key}' must define a positive token quantity.")

    currency = str(configured.get("currency") or getattr(settings, "STRIPE_CURRENCY", "aud")).lower()

    unit_amount_cents = configured.get("unit_amount")
    if unit_amount_cents is None:
        price_per_100 = Decimal(str(getattr(settings, "STRIPE_TOKEN_PRICE_PER_100", 0)))
        if price_per_100 <= 0:
            raise CatalogConfigurationError(
                "STRIPE_TOKEN_PRICE_PER_100 must be configured (> 0) to derive token pricing."
            )
        derived = (price_per_100 / Decimal("100")) * Decimal(tokens)
        unit_amount_cents = int((derived * 100).quantize(Decimal("1")))
    else:
        unit_amount_cents = int(unit_amount_cents)

    if unit_amount_cents <= 0:
        raise CatalogConfigurationError(f"Token product '{key}' must resolve to a positive unit amount.")

    return tokens, unit_amount_cents, (Decimal(unit_amount_cents) / Decimal("100")), currency


def _infer_token_quantity(key: str) -> int:
    match = re.search(r"(\d+)$", key)
    if not match:
        raise CatalogConfigurationError(
            f"Unable to infer token quantity from product key '{key}'. Configure STRIPE_TOKEN_PRODUCT_DETAILS."
        )
    return int(match.group(1))


def _build_token_catalog(product_settings: Mapping[str, object]) -> Dict[str, TokenProduct]:
    """Build token catalog by fetching product and price information from Stripe API."""
    catalog: Dict[str, TokenProduct] = {}

    # Configure Stripe API
    secret_key = getattr(settings, "STRIPE_SECRET_KEY", "")
    if not secret_key:
        logger.warning("STRIPE_SECRET_KEY not configured, falling back to config-based pricing")
        # Fallback to old behavior if Stripe is not configured
        return _build_token_catalog_from_config(product_settings)

    stripe.api_key = secret_key
    ensure_stripe_modules_loaded()

    for key, value in product_settings.items():
        if isinstance(value, str) and key.startswith("token_"):
            stripe_product_id = value

            try:
                # Fetch product details from Stripe
                product = stripe.Product.retrieve(stripe_product_id)

                # Get the active price for this product
                prices = stripe.Price.list(product=stripe_product_id, active=True, limit=1)

                if not prices.data:
                    logger.warning(f"No active price found for product {stripe_product_id}, skipping")
                    continue

                price = prices.data[0]

                # Extract token quantity from product name or metadata
                tokens = _extract_token_quantity(product, key)

                catalog[key] = TokenProduct(
                    key=key,
                    stripe_product_id=stripe_product_id,
                    tokens=tokens,
                    unit_amount=price.unit_amount,
                    unit_amount_decimal=Decimal(price.unit_amount) / Decimal("100"),
                    currency=price.currency,
                )

                logger.info(f"Loaded token product from Stripe: {key} ({tokens} tokens @ {price.unit_amount} {price.currency})")

            except stripe.error.StripeError as exc:
                logger.error(f"Failed to fetch Stripe product {stripe_product_id}: {exc}")
                # Fall back to config-based pricing for this product
                try:
                    tokens, unit_amount, unit_amount_decimal, currency = _resolve_token_pack_details(key)
                    catalog[key] = TokenProduct(
                        key=key,
                        stripe_product_id=stripe_product_id,
                        tokens=tokens,
                        unit_amount=unit_amount,
                        unit_amount_decimal=unit_amount_decimal,
                        currency=currency,
                    )
                    logger.warning(f"Using config-based pricing for {key} due to Stripe API error")
                except Exception as e:
                    logger.error(f"Failed to create product {key}: {e}")

    return catalog


def _extract_token_quantity(product, key: str) -> int:
    """Extract token quantity from Stripe product metadata, name, or key."""
    # Try metadata first
    if hasattr(product, 'metadata') and product.metadata:
        if 'tokens' in product.metadata:
            try:
                return int(product.metadata['tokens'])
            except (ValueError, TypeError):
                pass

    # Try extracting from product name
    if hasattr(product, 'name') and product.name:
        match = re.search(r'(\d+)', product.name)
        if match:
            return int(match.group(1))

    # Fall back to inferring from key
    return _infer_token_quantity(key)


def _build_token_catalog_from_config(product_settings: Mapping[str, object]) -> Dict[str, TokenProduct]:
    """Fallback: Build token catalog from configuration without Stripe API."""
    catalog: Dict[str, TokenProduct] = {}
    for key, value in product_settings.items():
        if isinstance(value, str) and key.startswith("token_"):
            tokens, unit_amount, unit_amount_decimal, currency = _resolve_token_pack_details(key)
            catalog[key] = TokenProduct(
                key=key,
                stripe_product_id=value,
                tokens=tokens,
                unit_amount=unit_amount,
                unit_amount_decimal=unit_amount_decimal,
                currency=currency,
            )
    return catalog


def _build_workspace_plan_catalog(product_settings: Mapping[str, object]) -> Dict[str, WorkspacePlanProduct]:
    raw_workspace_plans = product_settings.get("workspace_plans", {})
    if not isinstance(raw_workspace_plans, Mapping):
        raise CatalogConfigurationError("STRIPE_PRODUCT_IDS['workspace_plans'] must be a mapping of plan keys to product IDs.")

    catalog: Dict[str, WorkspacePlanProduct] = {
        "free": WorkspacePlanProduct(key="free", stripe_product_id=None)
    }

    for key, value in raw_workspace_plans.items():
        if not isinstance(value, str):
            raise CatalogConfigurationError(
                f"Workspace plan '{key}' must map to a Stripe product identifier string."
            )
        catalog[key] = WorkspacePlanProduct(key=key, stripe_product_id=value)

    return catalog


_TOKEN_CATALOG: Optional[Dict[str, TokenProduct]] = None
_WORKSPACE_PLAN_CATALOG: Optional[Dict[str, WorkspacePlanProduct]] = None


def get_token_products() -> Tuple[TokenProduct, ...]:
    """Return all configured token products."""

    global _TOKEN_CATALOG
    if _TOKEN_CATALOG is None:
        _TOKEN_CATALOG = _build_token_catalog(_get_product_settings())
    return tuple(_TOKEN_CATALOG.values())


def get_token_product(key: str) -> TokenProduct:
    """Fetch a single token product by key, raising if it does not exist."""

    products = {product.key: product for product in get_token_products()}
    try:
        return products[key]
    except KeyError as exc:
        raise ProductNotFound(f"Unknown token product '{key}'.") from exc


def get_workspace_plan_products(include_free: bool = True) -> Tuple[WorkspacePlanProduct, ...]:
    """Return the configured workspace plans.

    Args:
        include_free: Whether to include the implicit free plan in the result.
    """

    global _WORKSPACE_PLAN_CATALOG
    if _WORKSPACE_PLAN_CATALOG is None:
        _WORKSPACE_PLAN_CATALOG = _build_workspace_plan_catalog(_get_product_settings())

    plans = tuple(_WORKSPACE_PLAN_CATALOG.values())
    if include_free:
        return plans

    return tuple(plan for plan in plans if plan.key != "free")


def get_workspace_plan_product(key: str) -> WorkspacePlanProduct:
    """Fetch a workspace plan by key, raising if it is not configured."""

    plans = {plan.key: plan for plan in get_workspace_plan_products(include_free=True)}
    try:
        return plans[key]
    except KeyError as exc:
        raise ProductNotFound(f"Unknown workspace plan '{key}'.") from exc
