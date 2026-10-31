from django.conf import settings
from django.db import models
from django.utils import timezone


class Conversation(models.Model):
    class Type(models.TextChoices):
        GROUP = "GROUP", "Guruh"
        DIRECT = "DIRECT", "Shaxsiy"

    type = models.CharField("Turi", max_length=8, choices=Type.choices, default=Type.DIRECT)
    group = models.OneToOneField(
        "academics.Group",
        on_delete=models.CASCADE,
        related_name="conversation",
        blank=True,
        null=True,
    )
    last_message_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Suhbat"
        verbose_name_plural = "Suhbatlar"
        ordering = ["-last_message_at"]

    def __str__(self) -> str:
        if self.group_id:
            return f"Guruh: {self.group.name}"
        names = ", ".join(p.user.full_name for p in self.participants.select_related("user"))
        return names or f"Suhbat #{self.pk}"

    @property
    def title(self) -> str:
        return self.group.name if self.group_id else "Shaxsiy suhbat"

    def last_message(self):
        return self.messages.select_related("sender").order_by("-created_at").first()

    def unread_for(self, user) -> int:
        return (
            self.messages.exclude(sender=user)
            .exclude(reads__user=user)
            .count()
        )


class ConversationParticipant(models.Model):
    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="participants"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_participations",
    )

    class Meta:
        verbose_name = "Suhbat ishtirokchisi"
        verbose_name_plural = "Suhbat ishtirokchilari"
        unique_together = [("conversation", "user")]
        ordering = ["user__first_name"]

    def __str__(self) -> str:
        return f"{self.user.full_name}"


class Message(models.Model):
    class Type(models.TextChoices):
        TEXT = "TEXT", "Matn"
        IMAGE = "IMAGE", "Rasm"
        FILE = "FILE", "Fayl"
        VIDEO = "VIDEO", "Video"
        VOICE = "VOICE", "Ovozli xabar"

    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="messages"
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_messages",
    )
    type = models.CharField("Turi", max_length=8, choices=Type.choices, default=Type.TEXT)
    text = models.TextField("Matn", blank=True)
    file = models.FileField(
        "Fayl", upload_to="chat/%Y/%m/", blank=True, null=True
    )
    external_file_url = models.URLField(blank=True)
    edited_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Xabar"
        verbose_name_plural = "Xabarlar"
        ordering = ["created_at"]
        indexes = [models.Index(fields=["conversation", "created_at"])]

    def __str__(self) -> str:
        return f"{self.sender.full_name}: {self.text[:30]}"

    @property
    def is_edited(self) -> bool:
        return self.edited_at is not None

    def reader_ids(self):
        return list(self.reads.values_list("user_id", flat=True))


class MessageRead(models.Model):
    message = models.ForeignKey(
        Message, on_delete=models.CASCADE, related_name="reads"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="message_reads",
    )
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "O'qilganlik"
        verbose_name_plural = "O'qilganliklar"
        unique_together = [("message", "user")]
