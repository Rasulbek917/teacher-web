import json
import os
import re
import urllib.parse
import urllib.request


def telegram_send(chat_id, text):
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
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
    username = os.environ.get("TELEGRAM_BOT_USERNAME", "").strip().lstrip("@")
    if not re.fullmatch(r"[A-Za-z0-9_]{5,32}", username):
        return ""
    base = f"https://t.me/{urllib.parse.quote(username)}"
    return f"{base}?start={urllib.parse.quote(token)}" if token else base
