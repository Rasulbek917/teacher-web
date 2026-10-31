import json
import os
import urllib.request
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Telegram bot webhook va buyruqlar ro'yxatini sozlaydi."

    def handle(self, *args, **options):
        token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
        webhook = os.environ.get("TELEGRAM_WEBHOOK_URL", "").strip()
        secret = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "").strip()
        if not token or not webhook.startswith("https://") or not secret:
            raise CommandError("TELEGRAM_BOT_TOKEN, HTTPS TELEGRAM_WEBHOOK_URL va TELEGRAM_WEBHOOK_SECRET kerak.")
        api = f"https://api.telegram.org/bot{token}"
        commands = [{"command": name, "description": description} for name, description in [
            ("start", "Akkauntni ulash"), ("testlar", "Guruh testlari"),
            ("test", "Test token orqali ochish"), ("natijalar", "Test natijalari"),
            ("homework", "Uy vazifalari"), ("grade", "Baholar"),
            ("oylik", "Oylik to'lov yoki tushum"), ("davomat", "Bugungi davomat"),
            ("stop", "Telegram ulanishini bekor qilish"),
        ]]
        requests = [
            ("setWebhook", {"url": webhook, "secret_token": secret, "allowed_updates": ["message"]}),
            ("setMyCommands", {"commands": commands}),
        ]
        for method, payload in requests:
            request = urllib.request.Request(f"{api}/{method}", data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}, method="POST")
            try:
                with urllib.request.urlopen(request, timeout=20) as response:
                    result = json.loads(response.read())
            except Exception as exc:
                raise CommandError(f"Telegram {method} so'rovi bajarilmadi: {exc}") from exc
            if not result.get("ok"):
                raise CommandError(f"Telegram {method} xato qaytardi")
            self.stdout.write(self.style.SUCCESS(f"{method}: OK"))
