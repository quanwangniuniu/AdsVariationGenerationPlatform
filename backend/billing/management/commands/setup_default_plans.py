"""
Create default workspace plan data

This command will create the standard Free, Basic, Professional, and Enterprise plans
"""

from decimal import Decimal

from django.core.management.base import BaseCommand

from billing.models import WorkspacePlan


class Command(BaseCommand):

    help = 'Create default workspace plans'

    def add_arguments(self, parser):
        parser.add_argument(
            '--update',
            action='store_true',
            help='Update existing plans'
        )

    def handle(self, *args, **options):
        update_existing = options['update']

        # Read configuration from settings.py
        from django.conf import settings

        stripe_products = getattr(settings, 'STRIPE_PRODUCT_IDS', {}).get('workspace_plans', {})

        plans_data = [
            {
                'name': 'Free',
                'description': 'Free plan - suitable for personal users and small teams (up to 10 users, 20GB storage)',
                'monthly_price': Decimal('0.00'),
                'max_users': 10,
                'max_storage_gb': 20,
                'stripe_product_id': None,  # Free plan does not require a Stripe product/price ID
            },
            {
                'name': 'Basic',
                'description': 'Basic plan - suitable for small teams and startups (up to 50 users, 100GB storage)',
                'monthly_price': Decimal('29.00'),
                'max_users': 50,
                'max_storage_gb': 100,
                'stripe_product_id': stripe_products.get('basic', 'prod_T8rx4pEeTushUy'),
            },
            {
                'name': 'Pro',
                'description': 'Pro plan with advanced collaboration limits (up to 200 users, 500GB storage)',
                'monthly_price': Decimal('70.00'),  # Adjust the price based on settings.py comments
                'max_users': 200,
                'max_storage_gb': 500,
                'stripe_product_id': stripe_products.get('pro', 'prod_T8sdrP8F8JoPBU'),
            },
            {
                'name': 'Enterprise',
                'description': 'Enterprise plan - suitable for large organizations (up to 1000 users, 2000GB storage)',
                'monthly_price': Decimal('249.00'),  # Adjust the price based on settings.py comments
                'max_users': 1000,
                'max_storage_gb': 2000,
                'stripe_product_id': stripe_products.get('enterprise', 'prod_T8sevfvksg5kjz'),
            },
        ]

        created_count = 0
        updated_count = 0

        for plan_data in plans_data:
            plan_name = plan_data['name']

            try:
                plan = WorkspacePlan.objects.get(name=plan_name)
                if update_existing:
                    # Update existing plan
                    for key, value in plan_data.items():
                        if key != 'name':  # Do not update the name
                            setattr(plan, key, value)
                    plan.save()
                    updated_count += 1
                    self.stdout.write(
                        self.style.SUCCESS(f'✓ Updated plan: {plan_name}')
                    )
                else:
                    self.stdout.write(
                        self.style.WARNING(f'○ Plan already exists: {plan_name} (use --update to update)')
                    )
            except WorkspacePlan.DoesNotExist:
                # Create new plan
                plan = WorkspacePlan.objects.create(**plan_data)
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f'✓ Created plan: {plan_name}')
                )

        # Summary
        self.stdout.write('\n' + '=' * 50)
        self.stdout.write(f'Plan setup completed:')
        self.stdout.write(f'  • Created: {created_count} plan(s)')
        if update_existing:
            self.stdout.write(f'  • Updated: {updated_count} plan(s)')
        self.stdout.write(f'  • Total: {WorkspacePlan.objects.count()} plan(s)')

        # Display all plans
        self.stdout.write('\nCurrent plans:')
        for plan in WorkspacePlan.objects.all().order_by('monthly_price'):
            price_display = f"${plan.monthly_price}/month" if plan.monthly_price > 0 else "Free"
            self.stdout.write(
                f"  • {plan.name}: {price_display} "
                f"({plan.max_users} users, {plan.max_storage_gb}GB)"
            )

        if not update_existing and (updated_count == 0 and created_count == 0):
            self.stdout.write(
                self.style.WARNING('\nNote: All plans already exist. Use the --update flag to update existing plans.')
            )
