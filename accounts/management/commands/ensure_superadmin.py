"""Create the configured first super admin without demo users or sample data."""

import os

from django.core.management.base import BaseCommand, CommandError

from accounts.models import User


class Command(BaseCommand):
    help = "Create the configured super admin once, if it does not already exist."

    def handle(self, *args, **options):
        login = os.environ.get("SUPERADMIN_LOGIN", "superadmin").strip().lower()
        password = os.environ.get("SUPERADMIN_PASSWORD", "")
        if not password:
            self.stdout.write("SUPERADMIN_PASSWORD is unset; skipping initial admin creation.")
            return

        user = User.objects.filter(login=login).first()
        if user:
            if user.role != User.Roles.SUPER_ADMIN:
                raise CommandError("The configured super admin login belongs to a non-admin account.")
            self.stdout.write("Configured super admin already exists; leaving its password unchanged.")
            return

        User.objects.create_superuser(
            login=login,
            password=password,
            first_name=os.environ.get("SUPERADMIN_FIRST_NAME", "Super"),
            last_name=os.environ.get("SUPERADMIN_LAST_NAME", "Admin"),
        )
        self.stdout.write(self.style.SUCCESS("Configured super admin account created."))
