from django.db import models


class TelegramConfig(models.Model):
    """Bot credentials saved at runtime so production needs no extra env setup."""

    bot_token = models.CharField(max_length=200)
    bot_username = models.CharField(max_length=64, blank=True)
    webhook_secret = models.CharField(max_length=128)
    webhook_url = models.CharField(max_length=300, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.bot_username or "Telegram bot"


class TelegramUpdateLog(models.Model):
    update_id = models.BigIntegerField(primary_key=True)
    created_at = models.DateTimeField(auto_now_add=True)


class TelegramNotificationLog(models.Model):
    dedupe_key = models.CharField(max_length=220, unique=True)
    sent_at = models.DateTimeField(auto_now_add=True)


class ParentNotificationLog(models.Model):
    student = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="parent_notification_logs")
    group = models.ForeignKey("academics.Group", on_delete=models.SET_NULL, null=True, blank=True)
    kind = models.CharField(max_length=40)
    dedupe_key = models.CharField(max_length=220, unique=True)
    period_year = models.PositiveSmallIntegerField(null=True, blank=True)
    period_month = models.PositiveSmallIntegerField(null=True, blank=True)
    offset_days = models.SmallIntegerField(null=True, blank=True)
    sent_at = models.DateTimeField()


class LegacyUploadedFile(models.Model):
    path = models.CharField(max_length=500, unique=True)
    filename = models.CharField(max_length=255)
    mime_type = models.CharField(max_length=160)
    size = models.PositiveIntegerField()
    scope = models.CharField(max_length=24)
    scope_id = models.CharField(max_length=120, blank=True)
    owner = models.ForeignKey("accounts.User", on_delete=models.CASCADE)
    created_at = models.DateTimeField()
