"""
Compatibility helpers for the Stripe Python SDK.

The project currently pins an older Stripe SDK (7.x) that exposes a number of
submodules (``stripe.billing_portal`` etc.) lazily via ``__getattr__``.
When Django imports our billing services during app initialisation the lazy
attributes remain ``None`` and later API calls crash while Stripe attempts to
hydrate ``_object_classes`` (see STRPY-27581).

To keep the runtime stable without forcing an immediate dependency bump we
eagerly import the critical submodules once before any API call.
"""

from __future__ import annotations

import importlib
import logging
from typing import Iterable

import stripe

logger = logging.getLogger(__name__)

# Submodules referenced by ``stripe._object_classes`` and other helpers.
_REQUIRED_SUBMODULES = (
    "apps",
    "billing_portal",
    "checkout",
    "climate",
    "financial_connections",
    "identity",
    "issuing",
    "radar",
    "reporting",
    "sigma",
    "tax",
    "terminal",
    "test_helpers",
    "treasury",
)

_SDK_PRELOADED = False


def ensure_stripe_modules_loaded(
    *, modules: Iterable[str] = _REQUIRED_SUBMODULES, force: bool = False
) -> None:
    """Import Stripe submodules that older SDK releases expose lazily.

    Args:
        modules: Iterable of module basenames (e.g. ``'billing_portal'``).
        force: When ``True`` re-import even if we already initialised once.
    """

    global _SDK_PRELOADED

    if _SDK_PRELOADED and not force:
        return

    for name in modules:
        attribute = getattr(stripe, name, None)
        if attribute is not None:
            continue

        try:
            module = importlib.import_module(f"stripe.{name}")
        except ImportError as exc:  # pragma: no cover - Defensive safety net.
            logger.warning("Failed to preload stripe.%s: %s", name, exc)
            continue

        setattr(stripe, name, module)

    _SDK_PRELOADED = True
