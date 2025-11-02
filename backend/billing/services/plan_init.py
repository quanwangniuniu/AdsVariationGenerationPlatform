"""
Compatibility helpers for legacy imports.

Historically the workspace plan initialisation logic lived in this module.
The canonical implementation now resides in ``billing.apps``; we re-export
the public helpers here so existing imports continue to work without
duplicating behaviour.
"""

from ..apps import BillingConfig, ensure_default_workspace_plans, init_plans_after_migrate

__all__ = [
    "BillingConfig",
    "ensure_default_workspace_plans",
    "init_plans_after_migrate",
]
