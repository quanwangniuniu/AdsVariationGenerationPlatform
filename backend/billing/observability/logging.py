"""Structured logging helper for billing endpoints."""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger("billing")


def log_billing_event(*, message: str, request_id: Optional[str] = None, workspace_id: Optional[str] = None,
                      actor: Optional[str] = None, extra: Optional[Dict[str, Any]] = None) -> None:
    payload: Dict[str, Any] = {"message": message}
    if request_id:
        payload["request_id"] = request_id
    if workspace_id:
        payload["workspace_id"] = workspace_id
    if actor:
        payload["actor"] = actor
    if extra:
        payload.update(extra)
    logger.info(payload)
