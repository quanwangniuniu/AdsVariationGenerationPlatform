import logging
import re
from typing import Iterable, List, Set

from django.core.cache import cache

from .models import ModerationTerm

LOGGER = logging.getLogger(__name__)

WORD_PATTERN = re.compile(r"[A-Za-z]+(?:['-][A-Za-z]+)*")
CACHE_KEY = "templates.moderation_terms.active"
CACHE_TTL_SECONDS = 300
DEFAULT_BLOCKED_TERMS = frozenset(
    {
        "fuck",
        "shit",
        "bitch",
        "asshole",
        "bastard",
        "cunt",
        "dick",
        "motherfucker",
        "slut",
        "whore",
    }
)


class ModerationError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def normalize_content(raw: str) -> str:
    normalized = " ".join(raw.strip().split())
    return normalized


def extract_words(content: str) -> List[str]:
    return WORD_PATTERN.findall(content)


def count_words(content: str) -> int:
    words = extract_words(content)
    return len(words)


def _load_active_terms() -> Set[str]:
    cached = cache.get(CACHE_KEY)
    if cached is not None:
        return cached

    terms = set(
        ModerationTerm.objects.filter(is_active=True).values_list("term", flat=True)
    )
    cache.set(CACHE_KEY, terms, CACHE_TTL_SECONDS)
    return terms


def invalidate_term_cache() -> None:
    cache.delete(CACHE_KEY)


def check_content_allowed(content: str) -> None:
    lowered_words = {word.lower() for word in extract_words(content)}

    default_blocked = DEFAULT_BLOCKED_TERMS.intersection(lowered_words)
    if default_blocked:
        LOGGER.info("Template moderation blocked", extra={"error_code": "TEMPLATE_BLOCKED_BY_POLICY"})
        raise ModerationError(
            code="TEMPLATE_BLOCKED_BY_POLICY",
            message="Template contains prohibited language.",
        )

    terms = _load_active_terms()
    blocked = terms.intersection(lowered_words)
    if blocked:
        LOGGER.info("Template moderation blocked", extra={"error_code": "TEMPLATE_BLOCKED_BY_POLICY"})
        raise ModerationError(
            code="TEMPLATE_BLOCKED_BY_POLICY",
            message="Template contains prohibited language.",
        )
