import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from billing.models import UserBillingProfile


@pytest.mark.django_db
def test_profile_credit_endpoint_creates_profile_and_returns_defaults():
    user = get_user_model().objects.create_user(
        username="alice",
        email="alice@example.com",
        password="pass1234",
    )

    client = APIClient()
    client.force_authenticate(user=user)

    response = client.get("/api/billing/profile/credit/")

    assert response.status_code == 200
    payload = response.json()

    profile = UserBillingProfile.objects.get(user=user)
    assert payload["stripe_customer_id"] == profile.stripe_customer_id == ""
    assert payload["credit_balance"] == "0.00"
    assert payload["user"]["id"] == str(user.id)
    assert payload["currency"]


@pytest.mark.django_db
def test_profile_credit_endpoint_reflects_existing_balance():
    user = get_user_model().objects.create_user(
        username="bob",
        email="bob@example.com",
        password="pass1234",
    )
    profile = UserBillingProfile.get_or_create_for_user(user)
    profile.credit_balance = 12.34
    profile.last_stripe_balance = 12.34
    profile.save(update_fields=["credit_balance", "last_stripe_balance", "updated_at"])

    client = APIClient()
    client.force_authenticate(user=user)

    response = client.get("/api/billing/profile/credit/")

    assert response.status_code == 200
    payload = response.json()

    assert payload["credit_balance"] == "12.34"
    assert payload["last_stripe_balance"] == "12.34"
    assert payload["user"]["email"] == "bob@example.com"
