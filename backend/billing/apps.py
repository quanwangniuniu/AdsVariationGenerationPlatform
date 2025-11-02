import logging
from decimal import Decimal
from typing import Dict, List
from django.apps import AppConfig
from django.db.models.signals import post_migrate

logger = logging.getLogger(__name__)

_PLANS_INITIALISED = False


def ensure_default_workspace_plans(*, force: bool = False) -> Dict[str, List[str]]:
    """Ensure the default workspace plans exist with the expected configuration."""
    global _PLANS_INITIALISED
    if _PLANS_INITIALISED and not force:
        return {"created": [], "updated": []}

    from django.conf import settings
    from django.db import OperationalError, ProgrammingError
    from .models import WorkspacePlan

    plan_keys = ("free", "basic", "pro", "enterprise")
    name_mapping = {
        "free": "Free",
        "basic": "Basic",
        "pro": "Pro",
        "enterprise": "Enterprise",
    }

    created, updated = [], []
    plan_config = getattr(settings, "PLAN_CONFIG", {}) or {}
    product_ids = getattr(settings, "STRIPE_PRODUCT_IDS", {}).get("workspace_plans", {}) or {}

    try:
        for key in plan_keys:
            plan_name = name_mapping[key]
            config = plan_config.get(key, {})
            stripe_product_id = product_ids.get(key)

            if key != "free" and not stripe_product_id:
                logger.warning("No Stripe product configured for workspace plan '%s'.", key)

            defaults = {
                "stripe_product_id": stripe_product_id,
                "description": config.get("description", f"Auto-generated {plan_name} workspace plan"),
                "monthly_price": Decimal(str(config.get("monthly_price", 0))),
                "max_users": int(config.get("max_users", 0)),
                "max_storage_gb": int(config.get("max_storage_gb", 0)),
            }

            plan, was_created = WorkspacePlan.objects.get_or_create(name=plan_name, defaults=defaults)
            if was_created:
                created.append(plan_name)
                continue

            fields_to_update = []
            for field, expected in defaults.items():
                current = getattr(plan, field)
                if field == "monthly_price":
                    expected = Decimal(str(expected))
                if current != expected:
                    setattr(plan, field, expected)
                    fields_to_update.append(field)

            if fields_to_update:
                plan.save(update_fields=fields_to_update)
                updated.append(plan_name)

    except (OperationalError, ProgrammingError):
        logger.debug("Database not ready for workspace plan initialisation.")
        return {"created": [], "updated": []}

    _PLANS_INITIALISED = True

    if created or updated:
        logger.info("Workspace plan initialisation completed. created=%s updated=%s", created, updated)
    else:
        logger.info("Workspace plan initialisation completed. No changes required.")

    return {"created": created, "updated": updated}


def init_plans_after_migrate(sender, **kwargs):
    """Called automatically after migrations to initialize default plans."""
    logger.info("[Billing] Running ensure_default_workspace_plans() after migrate…")
    ensure_default_workspace_plans(force=True)


class BillingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'billing'

    def ready(self):
        # Connect signal so plans are ensured after every migrate run
        post_migrate.connect(init_plans_after_migrate, sender=self)

        # Ensure workspace plans are present during normal app start-up as well.
        # The helper already guards against database availability issues and will
        # skip duplicate work within the same process.
        try:
            ensure_default_workspace_plans()
        except Exception:  # pragma: no cover - defensive logging
            logger.exception("Failed to ensure default workspace plans during app startup.")
