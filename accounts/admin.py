from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from accounts.models import LoginAttempt, StudentProfile, TeacherProfile, User


class TeacherProfileInline(admin.StackedInline):
    model = TeacherProfile
    can_delete = False


class StudentProfileInline(admin.StackedInline):
    model = StudentProfile
    can_delete = False


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ("first_name", "last_name")
    list_display = ("login", "first_name", "last_name", "role", "phone", "is_blocked")
    list_filter = ("role", "is_blocked", "is_active")
    search_fields = ("login", "first_name", "last_name", "phone")
    fieldsets = (
        (None, {"fields": ("login", "password")}),
        ("Shaxsiy ma'lumotlar", {"fields": ("first_name", "last_name", "phone", "avatar")}),
        ("Rol va holat", {"fields": ("role", "language", "theme", "is_blocked", "is_active", "is_staff", "is_superuser")}),
        ("Sanalar", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("login", "first_name", "last_name", "role", "password1", "password2"),
            },
        ),
    )
    inlines = [TeacherProfileInline, StudentProfileInline]


@admin.register(LoginAttempt)
class LoginAttemptAdmin(admin.ModelAdmin):
    list_display = ("key", "failures", "blocked_until", "updated_at")
    search_fields = ("key",)


admin.site.site_header = "Teacher Web — Django admin"
admin.site.site_title = "Teacher Web"
