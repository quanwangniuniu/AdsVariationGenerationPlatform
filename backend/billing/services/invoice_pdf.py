"""
Utilities for resolving and streaming invoice PDFs.
"""
from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from io import BytesIO
from typing import Iterable, Optional

import requests
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

from decimal import Decimal
from billing.models import InvoiceRecord
from billing.services.stripe_payments import retrieve_invoice, StripeServiceError, StripeInvoiceNotFound

logger = logging.getLogger(__name__)

DEFAULT_STORAGE_PREFIX = getattr(
    settings, "BILLING_INVOICE_PDF_PREFIX", "billing/invoices"
)
MAX_PDF_BYTES = getattr(settings, "BILLING_INVOICE_PDF_MAX_BYTES", 10 * 1024 * 1024)


class InvoicePdfError(RuntimeError):
    """Base error type for invoice PDF retrieval failures."""


class InvoicePdfNotFound(InvoicePdfError):
    """Raised when neither storage nor Stripe can provide a PDF."""


@dataclass(frozen=True)
class ResolvedInvoicePdf:
    storage_path: str
    filename: str
    size: Optional[int]
    is_absolute: bool = False


def _guess_pdf_storage_path(invoice: InvoiceRecord) -> str:
    stripe_id = invoice.stripe_invoice_id or ""
    suffix = stripe_id or str(invoice.id)
    return os.path.join(DEFAULT_STORAGE_PREFIX, f"{suffix}.pdf")


def _store_pdf_bytes(path: str, content: bytes) -> str:
    if os.path.isabs(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as target:
            target.write(content)
        return path

    try:
        saved_path = default_storage.save(path, ContentFile(content))
    except Exception as exc:  # pragma: no cover - storage backend specific failures
        raise InvoicePdfError(f"Failed to persist invoice PDF: {exc}") from exc
    return saved_path


def _is_pdf_response(headers: dict[str, str]) -> bool:
    content_type = headers.get("Content-Type") or ""
    return "pdf" in content_type.lower()


def _read_response_bytes(response: requests.Response) -> bytes:
    chunks: list[bytes] = []
    total = 0
    for chunk in response.iter_content(chunk_size=1024 * 256):
        if not chunk:
            continue
        total += len(chunk)
        if total > MAX_PDF_BYTES:
            raise InvoicePdfError("Stripe invoice PDF exceeds allowed size.")
        chunks.append(chunk)
    return b"".join(chunks)


def _looks_like_pdf(payload: bytes) -> bool:
    head = payload.lstrip()[:4]
    return head == b"%PDF"


def _escape_pdf_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _build_placeholder_pdf(invoice: InvoiceRecord, invoice_data: dict) -> bytes:
    metadata = invoice_data.get("metadata") or {}
    currency = (invoice.currency or "aud").upper()
    amount = invoice.total_amount or Decimal("0.00")
    token_qty = metadata.get("token_quantity") or metadata.get("tokens")
    workspace_line = "Workspace: " + (invoice.workspace.name if invoice.workspace else "N/A")
    lines = [
        "Token Purchase Receipt",
        f"Invoice: {invoice.stripe_invoice_id or invoice.id}",
        workspace_line,
        f"Amount: {amount} {currency}",
    ]
    if token_qty:
        lines.append(f"Tokens: {token_qty}")
    purchaser = metadata.get("purchaser_user_id") or metadata.get("initiator_user_id")
    if purchaser:
        lines.append(f"Initiator User ID: {purchaser}")
    issued = invoice.issued_at.isoformat() if invoice.issued_at else "N/A"
    lines.append(f"Issued At: {issued}")
    lines.append("This PDF is auto-generated because Stripe did not supply a receipt.")

    content_commands = []
    start_y = 720
    line_height = 18
    for idx, line in enumerate(lines):
        y = start_y - idx * line_height
        escaped = _escape_pdf_text(line)
        content_commands.append(f"BT /F1 12 Tf 72 {y} Td ({escaped}) Tj ET")
    content_stream = "\n".join(content_commands)
    stream_bytes = content_stream.encode("utf-8")

    buffer = BytesIO()
    buffer.write(b"%PDF-1.4\n")
    offsets = []

    def write_obj(obj: str) -> None:
        offsets.append(buffer.tell())
        buffer.write(obj.encode("utf-8"))

    write_obj("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n")
    write_obj("2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj\n")
    write_obj(
        "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >> endobj\n"
    )
    write_obj(f"4 0 obj << /Length {len(stream_bytes)} >> stream\n{content_stream}\nendstream\nendobj\n")
    write_obj("5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n")

    xref_offset = buffer.tell()
    buffer.write(b"xref\n")
    buffer.write(f"0 {len(offsets)+1}\n".encode("utf-8"))
    buffer.write(b"0000000000 65535 f \n")
    for off in offsets:
        buffer.write(f"{off:010d} 00000 n \n".encode("utf-8"))
    buffer.write(b"trailer << /Size ")
    buffer.write(str(len(offsets)+1).encode("utf-8"))
    buffer.write(b" /Root 1 0 R >>\nstartxref\n")
    buffer.write(f"{xref_offset}\n".encode("utf-8"))
    buffer.write(b"%%EOF")

    return buffer.getvalue()


def _download_pdf(url: str) -> bytes:
    try:
        response = requests.get(url, timeout=30, stream=True, allow_redirects=True, headers={"Accept": "application/pdf"})
    except requests.RequestException as exc:  # pragma: no cover - network failure handling
        raise InvoicePdfError(f"Unable to download invoice PDF: {exc}") from exc

    if response.status_code == 404:
        raise InvoicePdfNotFound("Stripe invoice PDF URL returned 404.")
    if response.status_code >= 400:
        raise InvoicePdfError(f"Stripe invoice PDF download failed with status {response.status_code}.")

    payload = _read_response_bytes(response)

    if _is_pdf_response(response.headers) or _looks_like_pdf(payload):
        return payload

    # HTML fallback: attempt to locate a direct download link (invoice/.../pdf or invoice/...&download=1)
    html = ""
    if payload:
        try:
            html = payload.decode("utf-8", errors="ignore")
        except Exception:
            html = ""

    download_link = None
    if html:
        match = re.search(r'href="(?P<link>https://(?:invoice|pay)\.stripe\.com/[^"]+pdf[^"]*)"', html)
        if match:
            download_link = match.group("link")

    alt_candidates = [
        download_link,
        url.replace("/i/", "/invoice/") if "/i/" in url else None,
        url.replace("/invoice/", "/invoice/") + "&download=1" if "/invoice/" in url and "download=1" not in url else None,
    ]

    for candidate in alt_candidates:
        if not candidate:
            continue
        try:
            alt_resp = requests.get(
                candidate,
                timeout=30,
                stream=True,
                allow_redirects=True,
                headers={"Accept": "application/pdf"},
            )
        except requests.RequestException:
            continue
        if alt_resp.status_code >= 400:
            continue
        alt_payload = _read_response_bytes(alt_resp)
        if _is_pdf_response(alt_resp.headers) or _looks_like_pdf(alt_payload):
            return alt_payload

    raise InvoicePdfError("Stripe returned a non-PDF payload.")


def resolve_invoice_pdf(invoice: InvoiceRecord) -> ResolvedInvoicePdf:
    """
    Ensure a local PDF copy exists for ``invoice`` and return its storage metadata.

    Resolution order:
        1. Existing ``pdf_storage_path`` when file is present.
        2. Download from Stripe's ``invoice_pdf`` URL, save, and hydrate the model.

    Raises:
        InvoicePdfNotFound: when no PDF is available from storage or Stripe.
        InvoicePdfError: on download errors.
    """

    storage_path = invoice.pdf_storage_path
    if storage_path:
        if os.path.isabs(storage_path):
            if os.path.exists(storage_path):
                filename = os.path.basename(storage_path) or f"{invoice.stripe_invoice_id or invoice.id}.pdf"
                size = os.path.getsize(storage_path)
                return ResolvedInvoicePdf(
                    storage_path=storage_path,
                    filename=filename,
                    size=size,
                    is_absolute=True,
                )
            logger.warning(
                "Invoice %s absolute pdf path missing: %s",
                invoice.stripe_invoice_id or invoice.id,
                storage_path,
            )
        elif default_storage.exists(storage_path):
            size = default_storage.size(storage_path)
            filename = os.path.basename(storage_path) or f"{invoice.stripe_invoice_id or invoice.id}.pdf"
            return ResolvedInvoicePdf(
                storage_path=storage_path,
                filename=filename,
                size=size,
                is_absolute=False,
            )

    metadata = invoice.metadata or {}
    invoice_data = metadata.get("stripe_invoice_snapshot")
    if invoice_data and not isinstance(invoice_data, dict):
        invoice_data = None

    pdf_url = metadata.get("invoice_pdf_url")
    is_token_invoice = bool(
        metadata.get("token_account_id")
        or metadata.get("token_quantity")
        or metadata.get("source") == "token_purchase"
    )

    if not invoice_data or not pdf_url:
        try:
            invoice_data = retrieve_invoice(
                invoice.stripe_invoice_id or str(invoice.id),
                expand=["customer"],
            )
            metadata = invoice_data.get("metadata") or metadata
            pdf_url = invoice_data.get("invoice_pdf") or pdf_url
            is_token_invoice = bool(
                metadata.get("token_account_id")
                or metadata.get("token_quantity")
                or metadata.get("source") == "token_purchase"
            )
        except StripeInvoiceNotFound as exc:
            if not is_token_invoice:
                logger.info(
                    "Stripe reports invoice %s missing; treating as not found.",
                    invoice.stripe_invoice_id or invoice.id,
                )
                raise InvoicePdfNotFound(str(exc)) from exc
            invoice_data = {"metadata": metadata}
        except StripeServiceError as exc:
            raise InvoicePdfError(str(exc)) from exc

    if not pdf_url:
        if is_token_invoice:
            logger.info(
                "Invoice %s missing invoice_pdf; generating placeholder.",
                invoice.stripe_invoice_id or invoice.id,
            )
            pdf_bytes = _build_placeholder_pdf(invoice, invoice_data)
        else:
            logger.warning(
                "Invoice %s does not expose invoice_pdf URL; falling back failed.",
                invoice.stripe_invoice_id or invoice.id,
            )
            raise InvoicePdfNotFound("Invoice PDF is not available from Stripe.")
    else:
        try:
            pdf_bytes = _download_pdf(pdf_url)
        except InvoicePdfNotFound:
            if is_token_invoice:
                logger.info(
                    "Invoice %s download failed; generating placeholder.",
                    invoice.stripe_invoice_id or invoice.id,
                )
                pdf_bytes = _build_placeholder_pdf(invoice, invoice_data)
            else:
                raise


    inferred_path = (
        storage_path if storage_path and not os.path.isabs(storage_path) else _guess_pdf_storage_path(invoice)
    )
    saved_path = _store_pdf_bytes(inferred_path, pdf_bytes)

    if saved_path != invoice.pdf_storage_path:
        invoice.pdf_storage_path = saved_path
        invoice.save(update_fields=["pdf_storage_path", "updated_at"])

    filename = os.path.basename(saved_path) or f"{invoice.stripe_invoice_id or invoice.id}.pdf"
    size = len(pdf_bytes)

    return ResolvedInvoicePdf(
        storage_path=saved_path,
        filename=filename,
        size=size,
        is_absolute=os.path.isabs(saved_path),
    )
