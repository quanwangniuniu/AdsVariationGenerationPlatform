from decimal import Decimal

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0010_alter_workspacesubscription_auto_renew_enabled'),
    ]

    operations = [
        migrations.CreateModel(
            name='UserBillingProfile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('stripe_customer_id', models.CharField(blank=True, help_text='Stripe customer identifier tied to this user.', max_length=255)),
                ('default_payment_method_id', models.CharField(blank=True, help_text='Last known default payment method id.', max_length=255)),
                ('credit_balance', models.DecimalField(decimal_places=2, default=Decimal('0.00'), help_text='Cached customer balance (credits positive).', max_digits=12)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.OneToOneField(help_text='User owning this billing profile.', on_delete=django.db.models.deletion.CASCADE, related_name='billing_profile', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'User billing profile',
                'verbose_name_plural': 'User billing profiles',
                'db_table': 'billing_user_profile',
                'ordering': ['user__id'],
            },
        ),
        migrations.AddField(
            model_name='workspacesubscription',
            name='billing_owner',
            field=models.ForeignKey(blank=True, help_text='User whose Stripe customer funds this subscription.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='billing_owned_subscriptions', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='billingtransaction',
            name='initiator',
            field=models.ForeignKey(blank=True, help_text='User who initiated the financial event when available.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='initiated_billing_transactions', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='invoicerecord',
            name='initiator',
            field=models.ForeignKey(blank=True, help_text='User who initiated the invoice workflow.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='initiated_invoices', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='paymentrecord',
            name='initiator',
            field=models.ForeignKey(blank=True, help_text='User who initiated this payment attempt.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='initiated_payments', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='refundrecord',
            name='initiator',
            field=models.ForeignKey(blank=True, help_text='User who requested the refund when applicable.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='initiated_refunds', to=settings.AUTH_USER_MODEL),
        ),
    ]
