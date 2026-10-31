from django.conf import settings
from django.db import models


class Notification(models.Model):
    class Type(models.TextChoices):
        LESSON_SOON = "LESSON_SOON", "Dars yaqinlashdi"
        HOMEWORK_SUBMITTED = "HOMEWORK_SUBMITTED", "Vazifa topshirildi"
        HOMEWORK_REVIEWED = "HOMEWORK_REVIEWED", "Vazifa tekshirildi"
        PAYMENT_REMINDER = "PAYMENT_REMINDER", "To'lov eslatmasi"
        TEST_PUBLISHED = "TEST_PUBLISHED", "Yangi test"
        TEST_RESULT = "TEST_RESULT", "Test natijasi"
        SYSTEM = "SYSTEM", "Tizim"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    type = models.CharField("Turi", max_length=32, choices=Type.choices, default=Type.SYSTEM)
    title = models.CharField("Sarlavha", max_length=160)
    body = models.TextField("Matn", blank=True)
    link = models.CharField("Havola", max_length=200, blank=True)
    is_read = models.BooleanField("O'qilgan", default=False)
    dedupe_key = models.CharField(
        "Takrorlanmaslik kaliti", max_length=200, blank=True, null=True, unique=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Bildirishnoma"
        verbose_name_plural = "Bildirishnomalar"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "is_read"]),
            models.Index(fields=["user", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.user.full_name}: {self.title}"
