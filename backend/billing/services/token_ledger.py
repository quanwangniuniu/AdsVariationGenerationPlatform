"""Token ledger helpers providing credit/debit operations with idempotency."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from django.contrib.auth import get_user_model
from django.db import transaction

from billing.models import TokenAccount, TokenTransaction
from workspace.models import Workspace

User = get_user_model()


class LedgerError(Exception):
    """Base exception type for ledger issues."""


class TokenAccountNotFound(LedgerError):
    """Raised when the target account cannot be located."""


class IdempotencyConflict(LedgerError):
    """Raised when an existing transaction conflicts with the requested mutation."""


class InsufficientTokenBalance(LedgerError):
    """Raised when attempting to debit more tokens than available."""


@dataclass(frozen=True)
class LedgerOperationResult:
    account: TokenAccount
    transaction: TokenTransaction
    created: bool


def credit_workspace_tokens(
    workspace_id,
    amount: int,
    reason: str,
    idempotency_key: str,
    *,
    stripe_payment_id: Optional[str] = None,
) -> TokenTransaction:
    """Credit tokens to a workspace-level account."""

    if amount <= 0:
        raise ValueError("Amount must be a positive integer for credit operations.")
    if not idempotency_key:
        raise ValueError("Idempotency key is required for workspace credits.")

    workspace = _get_workspace(workspace_id)

    with transaction.atomic():
        account = _lock_workspace_account(workspace)
        result = _apply_transaction(
            account=account,
            amount=amount,
            reason=reason,
            transaction_type=TokenTransaction.TransactionType.PURCHASE,
            idempotency_key=idempotency_key,
            stripe_payment_id=stripe_payment_id,
        )
        return result.transaction


def debit_workspace_tokens(
    workspace_id,
    amount: int,
    reason: str,
    idempotency_key: Optional[str] = None,
) -> TokenTransaction:
    """Debit tokens from a workspace-level account."""

    workspace = _get_workspace(workspace_id)

    with transaction.atomic():
        account = _lock_workspace_account(workspace)
        result = _apply_transaction(
            account=account,
            amount=-abs(amount),
            reason=reason,
            transaction_type=TokenTransaction.TransactionType.CONSUME,
            idempotency_key=idempotency_key,
        )
        return result.transaction


def credit_user_tokens(
    user_id,
    amount: int,
    reason: str,
    idempotency_key: str,
    *,
    stripe_payment_id: Optional[str] = None,
) -> TokenTransaction:
    if amount <= 0:
        raise ValueError("Amount must be a positive integer for credit operations.")
    if not idempotency_key:
        raise ValueError("Idempotency key is required for user credits.")

    user = _get_user(user_id)

    with transaction.atomic():
        account = _lock_user_account(user)
        result = _apply_transaction(
            account=account,
            amount=amount,
            reason=reason,
            transaction_type=TokenTransaction.TransactionType.PURCHASE,
            idempotency_key=idempotency_key,
            stripe_payment_id=stripe_payment_id,
        )
        return result.transaction


def debit_user_tokens(
    user_id,
    amount: int,
    reason: str,
    idempotency_key: Optional[str] = None,
) -> TokenTransaction:
    user = _get_user(user_id)

    with transaction.atomic():
        account = _lock_user_account(user)
        result = _apply_transaction(
            account=account,
            amount=-abs(amount),
            reason=reason,
            transaction_type=TokenTransaction.TransactionType.CONSUME,
            idempotency_key=idempotency_key,
        )
        return result.transaction


def consume(
    token_account: TokenAccount,
    amount: int,
    *,
    description: str = "",
    idempotency_key: Optional[str] = None,
) -> LedgerOperationResult:
    """Debit a specific ``TokenAccount`` instance, preserving idempotency when requested."""

    if amount <= 0:
        raise ValueError("Amount must be a positive integer for consumption.")

    with transaction.atomic():
        locked_account = TokenAccount.objects.select_for_update().get(pk=token_account.pk)
        return _apply_transaction(
            account=locked_account,
            amount=-abs(amount),
            reason=description,
            transaction_type=TokenTransaction.TransactionType.CONSUME,
            idempotency_key=idempotency_key,
        )


def credit(
    token_account: TokenAccount,
    amount: int,
    *,
    description: str = "",
    idempotency_key: Optional[str] = None,
    stripe_payment_id: Optional[str] = None,
) -> LedgerOperationResult:
    """Credit a ``TokenAccount`` instance."""

    if amount <= 0:
        raise ValueError("Amount must be a positive integer for credits.")

    with transaction.atomic():
        locked_account = TokenAccount.objects.select_for_update().get(pk=token_account.pk)
        return _apply_transaction(
            account=locked_account,
            amount=amount,
            reason=description,
            transaction_type=TokenTransaction.TransactionType.PURCHASE,
            idempotency_key=idempotency_key,
            stripe_payment_id=stripe_payment_id,
        )


def _apply_transaction(
    *,
    account: TokenAccount,
    amount: int,
    reason: str,
    transaction_type: str,
    idempotency_key: Optional[str],
    stripe_payment_id: Optional[str] = None,
) -> LedgerOperationResult:
    if amount == 0:
        raise ValueError("Amount must be non-zero for ledger operations.")

    existing = _locate_existing_transaction(account, idempotency_key, stripe_payment_id)
    if existing:
        _validate_existing(existing, account, amount, transaction_type)
        return LedgerOperationResult(account=account, transaction=existing, created=False)

    signed_amount = amount

    if transaction_type == TokenTransaction.TransactionType.CONSUME and (account.balance + signed_amount) < 0:
        raise InsufficientTokenBalance("Token balance is insufficient for the requested debit.")

    account.balance = (account.balance or 0) + signed_amount
    account.save(update_fields=["balance", "updated_at"])

    transaction = TokenTransaction.objects.create(
        account=account,
        amount=signed_amount,
        type=transaction_type,
        description=reason or "",
        idempotency_key=idempotency_key or None,
        stripe_payment_id=stripe_payment_id or None,
    )

    return LedgerOperationResult(account=account, transaction=transaction, created=True)


def _locate_existing_transaction(
    account: TokenAccount,
    idempotency_key: Optional[str],
    stripe_payment_id: Optional[str],
) -> Optional[TokenTransaction]:
    if idempotency_key:
        transaction = TokenTransaction.objects.filter(idempotency_key=idempotency_key).first()
        if transaction:
            return transaction
    if stripe_payment_id:
        transaction = TokenTransaction.objects.filter(stripe_payment_id=stripe_payment_id).first()
        if transaction:
            return transaction
    return None


def _validate_existing(
    transaction: TokenTransaction,
    account: TokenAccount,
    amount: int,
    transaction_type: str,
) -> None:
    if transaction.account_id != account.id:
        raise IdempotencyConflict("Existing transaction is tied to a different account.")
    if transaction.type != transaction_type:
        raise IdempotencyConflict("Existing transaction type does not match the request.")
    if transaction.amount != amount:
        raise IdempotencyConflict("Existing transaction amount does not match the request.")


def _lock_workspace_account(workspace: Workspace) -> TokenAccount:
    account, _ = TokenAccount.objects.get_or_create(workspace=workspace)
    return TokenAccount.objects.select_for_update().get(pk=account.pk)


def _lock_user_account(user: User) -> TokenAccount:
    account, _ = TokenAccount.objects.get_or_create(user=user)
    return TokenAccount.objects.select_for_update().get(pk=account.pk)


def _get_workspace(workspace_id) -> Workspace:
    try:
        return Workspace.objects.get(pk=workspace_id)
    except Workspace.DoesNotExist as exc:
        raise TokenAccountNotFound("Workspace does not exist.") from exc


def _get_user(user_id) -> User:
    try:
        return User.objects.get(pk=user_id)
    except User.DoesNotExist as exc:
        raise TokenAccountNotFound("User does not exist.") from exc
