import os
from django.core.management.base import BaseCommand, CommandError

from integrations.services import TelegramSetupError, configure_telegram


class Command(BaseCommand):
    help = "Telegram bot webhook va buyruqlar ro'yxatini sozlaydi."

    def add_arguments(self, parser):
        parser.add_argument("--token", default="")
        parser.add_argument("--base-url", default="")
        parser.add_argument("--secret", default="")
        parser.add_argument("--username", default="")

    def handle(self, *args, **options):
        token = (options["token"] or os.environ.get("TELEGRAM_BOT_TOKEN", "")).strip()
        base_url = (options["base_url"] or os.environ.get("PUBLIC_APP_URL", "") or os.environ.get("TELEGRAM_WEBHOOK_URL", "")).strip()
        if base_url.endswith("/telegram/webhook/"):
            base_url = base_url[: -len("/telegram/webhook/")]
        secret = (options["secret"] or os.environ.get("TELEGRAM_WEBHOOK_SECRET", "")).strip()
        if not token or not base_url.startswith("https://"):
            raise CommandError("TELEGRAM_BOT_TOKEN va HTTPS PUBLIC_APP_URL kerak.")
        try:
            result = configure_telegram(token=token, base_url=base_url, secret=secret, username=options["username"])
        except TelegramSetupError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS(f"@{result['username']} webhook: {result['webhook_url']}"))
