from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """
    User admin configuration
    """
    list_display = (
        'username', 'email', 'first_name', 'last_name',
        'is_active', 'phone', 'location', 'created_at'
    )
    list_filter = (
        'is_active', 'is_staff', 'is_superuser', 'gender',
        'created_at', 'birth_date'
    )
    search_fields = (
        'username', 'email', 'first_name', 'last_name',
        'phone', 'location'
    )
    ordering = ('-created_at',)
    readonly_fields = ('created_at', 'updated_at')

    # Extend the default fieldsets to include new fields
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Personal Information', {
            'fields': ('phone', 'bio', 'location', 'birth_date', 'website', 'avatar', 'gender')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at')
        }),
    )

    # Add new fields to the add user form
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('Personal Information', {
            'fields': ('phone', 'bio', 'location', 'birth_date', 'website', 'avatar', 'gender')
        }),
    )