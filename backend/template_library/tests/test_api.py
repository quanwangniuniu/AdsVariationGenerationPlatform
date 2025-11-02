import logging

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from template_library.models import ModerationTerm, Template

User = get_user_model()


def create_user(username: str = "alice", password: str = "pass1234"):
    return User.objects.create_user(username=username, password=password, email=f"{username}@example.com")


def auth_client(user=None):
    if user is None:
        user = create_user()
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


VALID_TEMPLATE = "Generate an energetic ad for our new gadget launch."
LONG_TEMPLATE = "word " * 49
SENSITIVE_TEMPLATE = "This contains forbidden phrasing"
DEFAULT_PROFANITY_TEMPLATE = "This contains some fuck words"
UPDATED_TEMPLATE = "Fresh launch copy"


@pytest.mark.django_db
def test_create_template_success():
    client, user = auth_client()
    payload = {"title": "Launch", "content": VALID_TEMPLATE}
    response = client.post("/api/templates/", payload, format="json")

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["content"] == payload["content"].strip()
    assert data["word_count"] == 9  # "Generate an energetic ad for our new gadget launch." = 9 words
    template = Template.objects.get(id=data["id"])
    assert template.owner == user


@pytest.mark.django_db
def test_create_template_rejects_long_content(caplog):
    client, _ = auth_client()
    with caplog.at_level(logging.INFO, logger="template_library.views"):
        response = client.post("/api/templates/", {"content": LONG_TEMPLATE}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    body = response.json()
    assert body == {
        "code": "TEMPLATE_TOO_LONG",
        "message": "Template must be 48 words or fewer.",
    }
    assert Template.objects.count() == 0
    assert caplog.records
    assert all("word" not in record.getMessage() for record in caplog.records)


@pytest.mark.django_db
def test_create_template_rejects_sensitive_term(caplog):
    client, _ = auth_client()
    ModerationTerm.objects.create(term="forbidden", is_active=True)

    with caplog.at_level(logging.INFO, logger="template_library.views"):
        response = client.post("/api/templates/", {"content": SENSITIVE_TEMPLATE}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {
        "code": "TEMPLATE_BLOCKED_BY_POLICY",
        "message": "Template contains prohibited language.",
    }
    assert Template.objects.count() == 0
    assert caplog.records
    assert all("forbidden" not in record.getMessage().lower() for record in caplog.records)
    # Check that at least one record has the expected error code
    assert any(getattr(record, "error_code", "") == "TEMPLATE_BLOCKED_BY_POLICY" for record in caplog.records)


@pytest.mark.django_db
def test_create_template_rejects_default_profanity(caplog):
    client, _ = auth_client()

    with caplog.at_level(logging.INFO, logger="template_library.views"):
        response = client.post("/api/templates/", {"content": DEFAULT_PROFANITY_TEMPLATE}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {
        "code": "TEMPLATE_BLOCKED_BY_POLICY",
        "message": "Template contains prohibited language.",
    }
    assert Template.objects.count() == 0
    assert caplog.records
    assert all("fuck" not in record.getMessage().lower() for record in caplog.records)
    assert any(getattr(record, "error_code", "") == "TEMPLATE_BLOCKED_BY_POLICY" for record in caplog.records)


@pytest.mark.django_db
def test_create_template_requires_authentication():
    client = APIClient()
    response = client.post(
        "/api/templates/", {"content": VALID_TEMPLATE}, format="json"
    )
    # DRF returns 403 Forbidden (not 401 Unauthorized) when no auth credentials provided
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert Template.objects.count() == 0


@pytest.mark.django_db
def test_list_templates_returns_only_owners_records():
    client, user = auth_client()
    other = create_user("bob")
    Template.objects.create(
        owner=user,
        content="User one template",
        word_count=3,
    )
    Template.objects.create(
        owner=other,
        content="Other user template",
        word_count=3,
    )

    response = client.get("/api/templates/")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    # API now returns paginated response
    assert data["count"] == 1
    assert len(data["results"]) == 1
    assert data["results"][0]["content"] == "User one template"


@pytest.mark.django_db
def test_update_template_success():
    client, user = auth_client()
    template = Template.objects.create(
        owner=user,
        content="Original copy here",
        word_count=3,
    )

    payload = {"title": "Updated launch template", "content": UPDATED_TEMPLATE}
    response = client.patch(f"/api/templates/{template.id}/", payload, format="json")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["title"] == payload["title"]
    assert data["content"] == UPDATED_TEMPLATE
    assert data["word_count"] == 3

    template.refresh_from_db()
    assert template.title == payload["title"]
    assert template.content == UPDATED_TEMPLATE
    assert template.word_count == 3


@pytest.mark.django_db
def test_partial_update_template_retains_existing_content():
    client, user = auth_client()
    template = Template.objects.create(
        owner=user,
        title="Initial",
        content="Keep this content",
        word_count=3,
    )

    response = client.patch(
        f"/api/templates/{template.id}/",
        {"title": "Renamed template"},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["title"] == "Renamed template"
    assert data["content"] == "Keep this content"
    assert data["word_count"] == 3

    template.refresh_from_db()
    assert template.title == "Renamed template"
    assert template.content == "Keep this content"
    assert template.word_count == 3


@pytest.mark.django_db
def test_update_template_rejects_default_profanity(caplog):
    client, user = auth_client()
    template = Template.objects.create(
        owner=user,
        content="Original content safe",
        word_count=3,
    )

    with caplog.at_level(logging.INFO, logger="template_library.views"):
        response = client.patch(
            f"/api/templates/{template.id}/",
            {"content": DEFAULT_PROFANITY_TEMPLATE},
            format="json",
        )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {
        "code": "TEMPLATE_BLOCKED_BY_POLICY",
        "message": "Template contains prohibited language.",
    }
    template.refresh_from_db()
    assert template.content == "Original content safe"
    assert caplog.records
    assert all("fuck" not in record.getMessage().lower() for record in caplog.records)
    assert any(getattr(record, "error_code", "") == "TEMPLATE_BLOCKED_BY_POLICY" for record in caplog.records)


@pytest.mark.django_db
def test_update_template_requires_ownership():
    client, user = auth_client()
    other = create_user("carol")
    template = Template.objects.create(
        owner=other,
        content="Other user template",
        word_count=3,
    )

    response = client.patch(
        f"/api/templates/{template.id}/",
        {"title": "Not allowed"},
        format="json",
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_delete_template_success():
    client, user = auth_client()
    template = Template.objects.create(
        owner=user,
        content="Disposable template",
        word_count=2,
    )

    response = client.delete(f"/api/templates/{template.id}/")

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not Template.objects.filter(id=template.id).exists()


@pytest.mark.django_db
def test_delete_template_requires_ownership():
    client, user = auth_client()
    other = create_user("dave")
    template = Template.objects.create(
        owner=other,
        content="Other user template",
        word_count=3,
    )

    response = client.delete(f"/api/templates/{template.id}/")

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert Template.objects.filter(id=template.id).exists()
