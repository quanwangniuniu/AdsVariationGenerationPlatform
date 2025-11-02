from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0006_alter_billingauditlog_id_and_more"),
    ]

    operations = [
        migrations.RenameField(
            model_name="workspaceplan",
            old_name="stripe_price_id",
            new_name="stripe_product_id",
        ),
    ]

