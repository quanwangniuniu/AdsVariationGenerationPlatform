import pytest
from django.core.cache import cache

from template_library.models import ModerationTerm
from template_library.services import (
    ModerationError,
    check_content_allowed,
    count_words,
    invalidate_term_cache,
)


@pytest.mark.django_db
def test_count_words_handles_punctuation_and_multiple_spaces():
    content = "Launch   the-new product, now! It's great."
    assert count_words(content) == 6


@pytest.mark.django_db
def test_check_content_allowed_blocks_active_term():
    ModerationTerm.objects.create(term="forbidden", is_active=True)

    with pytest.raises(ModerationError) as exc:
        check_content_allowed("This includes FORBIDDEN language")

    assert exc.value.code == "TEMPLATE_BLOCKED_BY_POLICY"


@pytest.mark.django_db
def test_check_content_allowed_blocks_default_term():
    with pytest.raises(ModerationError) as exc:
        check_content_allowed("Trying to sneak in Fuck words here")

    assert exc.value.code == "TEMPLATE_BLOCKED_BY_POLICY"


@pytest.mark.django_db
def test_check_content_allowed_ignores_inactive_term():
    ModerationTerm.objects.create(term="blocked", is_active=False)

    # Should not raise because term inactive
    check_content_allowed("Use blocked words carefully")


@pytest.mark.parametrize(
    "content,expected",
    [
        ("", 0),
        ("word", 1),
        ("word\n" * 48, 48),
        ("  Mixed   spacing and punctuation!  ", 4),
        ("word " * 49, 49),
    ],
)
def test_count_words_covers_boundaries(content, expected):
    assert count_words(content) == expected


@pytest.mark.django_db
def test_check_content_allowed_matches_whole_words_only():
    ModerationTerm.objects.create(term="ban", is_active=True)

    # Should not raise because "banana" is not a whole-word match for "ban"
    check_content_allowed("Eating bananas is healthy")


@pytest.mark.django_db
def test_check_content_allowed_respects_cache_invalidation():
    cache.delete("templates.moderation_terms.active")
    term = ModerationTerm.objects.create(term="forbidden", is_active=True)

    with pytest.raises(ModerationError):
        check_content_allowed("This contains forbidden content")

    term.is_active = False
    term.save()
    invalidate_term_cache()

    # Cache was invalidated, so inactive term should now allow content
    check_content_allowed("This contains forbidden content")
