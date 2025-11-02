from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="tokentransaction",
            name="idempotency_key",
            field=models.CharField(
                blank=True,
                help_text="Unique key to guarantee idempotent transaction writes",
                max_length=255,
                null=True,
            ),
        ),
        migrations.AddConstraint(
            model_name="tokentransaction",
            constraint=models.UniqueConstraint(
                condition=Q(idempotency_key__isnull=False),
                fields=("idempotency_key",),
                name="unique_token_transaction_idempotency_key",
            ),
        ),
        migrations.AddConstraint(
            model_name="tokentransaction",
            constraint=models.UniqueConstraint(
                condition=Q(stripe_payment_id__isnull=False),
                fields=("stripe_payment_id",),
                name="unique_token_transaction_stripe_payment_id",
            ),
        ),
    ]
