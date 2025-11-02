from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ApiAccessLog',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('timestamp', models.DateTimeField(auto_now_add=True)),
                ('method', models.CharField(max_length=8)),
                ('path', models.CharField(max_length=255)),
                ('action', models.CharField(blank=True, max_length=128)),
                ('status_code', models.PositiveSmallIntegerField()),
                ('workspace_id', models.UUIDField(blank=True, null=True)),
                ('payload', models.JSONField(blank=True, null=True)),
                ('response', models.JSONField(blank=True, null=True)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.CharField(blank=True, max_length=255)),
                ('request_id', models.CharField(blank=True, max_length=64)),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='api_access_logs', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'audit_api_access_log',
                'ordering': ('-timestamp',),
            },
        ),
        migrations.AddIndex(
            model_name='apiaccesslog',
            index=models.Index(fields=['user', '-timestamp'], name='audit_log_user_ts'),
        ),
        migrations.AddIndex(
            model_name='apiaccesslog',
            index=models.Index(fields=['action', '-timestamp'], name='audit_log_action_ts'),
        ),
        migrations.AddIndex(
            model_name='apiaccesslog',
            index=models.Index(fields=['status_code', '-timestamp'], name='audit_log_status_ts'),
        ),
    ]
