import json
import os
import re
import secrets
import urllib.error
import urllib.parse
import urllib.request


BOT_COMMANDS = [
    ("start", "Akkauntni ulash"),
    ("testlar", "Guruh testlari"),
    ("test", "Test token orqali ochish"),
    ("natijalar", "Test natijalari"),
    ("homework", "Uy vazifalari"),
    ("grade", "Baholar"),
    ("oylik", "Oylik to'lov yoki tushum"),
    ("davomat", "Bugungi davomat"),
    ("stop", "Telegram ulanishini bekor qilish"),
]


class TelegramSetupError(Exception):
    pass


def telegram_config():
    try:
        from .models import TelegramConfig
    except Exception:
        return None
    try:
        return TelegramConfig.objects.order_by("pk").first()
    except Exception:
        return None


def telegram_bot_token():
    config = telegram_config()
    if config and config.bot_token:
        return config.bot_token.strip()
    return os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()


def telegram_bot_username():
    config = telegram_config()
    if config and config.bot_username:
        return config.bot_username.strip().lstrip("@")
    return os.environ.get("TELEGRAM_BOT_USERNAME", "").strip().lstrip("@")


def telegram_webhook_secret():
    config = telegram_config()
    if config and config.webhook_secret:
        return config.webhook_secret.strip()
    return os.environ.get("TELEGRAM_WEBHOOK_SECRET", "").strip()


def _telegram_api(token, method, payload):
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/{method}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            result = json.loads(response.read())
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise TelegramSetupError(f"Telegram {method} so‘rovi bajarilmadi: {exc}") from exc
    if not result.get("ok"):
        description = result.get("description") or "noma’lum xato"
        raise TelegramSetupError(f"Telegram {method}: {description}")
    return result


def configure_telegram(*, token, base_url, secret="", username=""):
    """Activate the webhook and remember the credentials in the database."""
    token = (token or "").strip()
    base_url = (base_url or "").strip().rstrip("/")
    secret = (secret or "").strip() or secrets.token_urlsafe(32)
    if not token:
        raise TelegramSetupError("Bot tokeni kiritilmagan.")
    if not base_url.startswith("https://"):
        raise TelegramSetupError("Sayt manzili HTTPS bo‘lishi kerak.")
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,128}", secret):
        raise TelegramSetupError("Webhook secret 16–128 ta harf, raqam, _ yoki - bo‘lsin.")

    me = _telegram_api(token, "getMe", {})
    bot_username = str((me.get("result") or {}).get("username") or username).strip().lstrip("@")
    if not re.fullmatch(r"[A-Za-z0-9_]{5,32}", bot_username):
        raise TelegramSetupError("Bot username aniqlanmadi. BotFather’dagi tokenni tekshiring.")

    webhook_url = f"{base_url}/telegram/webhook/"
    _telegram_api(token, "setWebhook", {
        "url": webhook_url,
        "secret_token": secret,
        "allowed_updates": ["message"],
        "drop_pending_updates": True,
    })
    _telegram_api(token, "setMyCommands", {
        "commands": [{"command": name, "description": description} for name, description in BOT_COMMANDS],
    })

    from .models import TelegramConfig
    config = TelegramConfig.objects.order_by("pk").first() or TelegramConfig()
    config.bot_token = token
    config.bot_username = bot_username
    config.webhook_secret = secret
    config.webhook_url = webhook_url
    config.save()
    return {"username": bot_username, "webhook_url": webhook_url}


def telegram_webhook_info():
    token = telegram_bot_token()
    if not token:
        return {"url": "", "pending_update_count": 0, "last_error_message": ""}
    try:
        result = _telegram_api(token, "getWebhookInfo", {})
    except TelegramSetupError:
        return {"url": "", "pending_update_count": 0, "last_error_message": "getWebhookInfo bajarilmadi"}
    info = result.get("result") or {}
    return {
        "url": info.get("url", ""),
        "pending_update_count": info.get("pending_update_count", 0),
        "last_error_message": info.get("last_error_message", ""),
    }


def telegram_send(chat_id, text):
    token = telegram_bot_token()
    if not token or not chat_id:
        return False
    payload = json.dumps({"chat_id": str(chat_id), "text": str(text), "disable_web_page_preview": True}).encode()
    request = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=payload, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status == 200
    except Exception:
        return False


def bot_link(token=None):
    username = telegram_bot_username()
    if not re.fullmatch(r"[A-Za-z0-9_]{5,32}", username):
        return ""
    base = f"https://t.me/{urllib.parse.quote(username)}"
    return f"{base}?start={urllib.parse.quote(token)}" if token else base
