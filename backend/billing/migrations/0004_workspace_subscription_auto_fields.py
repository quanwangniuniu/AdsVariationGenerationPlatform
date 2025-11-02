from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0003_webhookeventlog_alter_tokentransaction_account"),
    ]

    operations = [
        migrations.AddField(
            model_name="workspacesubscription",
            name="auto_renew_enabled",
            field=models.BooleanField(
                default=True,
                help_text="Whether the subscription should renew automatically.",
            ),
        ),
        migrations.AddField(
            model_name="workspacesubscription",
            name="pending_plan",
            field=models.ForeignKey(
                blank=True,
                help_text="Target plan scheduled to activate at the next billing period end.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="pending_subscriptions",
                to="billing.workspaceplan",
            ),
        ),
        migrations.AddField(
            model_name="workspacesubscription",
            name="renewal_attempt_count",
            field=models.PositiveIntegerField(
                default=0,
                help_text="Number of consecutive failed renewal attempts.",
            ),
        ),
        migrations.AddField(
            model_name="workspacesubscription",
            name="last_renewal_attempt_at",
            field=models.DateTimeField(
                blank=True,
                help_text="Timestamp of the most recent renewal attempt.",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="workspacesubscription",
            name="last_renewal_status",
            field=models.CharField(
                choices=[
                    ("never", "Never Attempted"),
                    ("success", "Success"),
                    ("failed", "Failed"),
                    ("retry", "Retry Scheduled"),
                ],
                default="never",
                help_text="Outcome of the most recent renewal attempt.",
                max_length=20,
            ),
        ),
    ]
