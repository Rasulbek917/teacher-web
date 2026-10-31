from django.conf import settings
from django.db import models
from django.utils import timezone


class Payment(models.Model):
    class Status(models.TextChoices):
        PAID = "PAID", "To'langan"
        PARTIAL = "PARTIAL", "Qisman"
        UNPAID = "UNPAID", "To'lanmagan"

    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="teacher_payments",
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="student_payments",
        blank=True,
        null=True,
    )
    group = models.ForeignKey(
        "academics.Group",
        on_delete=models.SET_NULL,
        related_name="payments",
        blank=True,
        null=True,
    )
    student_name = models.CharField("O'quvchi", max_length=120)
    group_name = models.CharField("Guruh", max_length=120)
    price_snapshot = models.PositiveIntegerField("Narx (snapshot)", default=0)
    period_year = models.PositiveIntegerField("Yil")
    period_month = models.PositiveSmallIntegerField("Oy")
    amount = models.PositiveIntegerField("To'langan summa", default=0)
    status = models.CharField(
        "Holat", max_length=8, choices=Status.choices, default=Status.UNPAID
    )
    paid_at = models.DateTimeField("To'langan vaqt", blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "To'lov"
        verbose_name_plural = "To'lovlar"
        ordering = ["-period_year", "-period_month", "student_name"]
        unique_together = [("student", "group", "period_year", "period_month")]
        indexes = [
            models.Index(fields=["teacher", "period_year", "period_month"]),
            models.Index(fields=["student"]),
            models.Index(fields=["group"]),
        ]

    def __str__(self) -> str:
        return f"{self.student_name} — {self.period_year}-{self.period_month:02d}"

    @property
    def month_label(self) -> str:
        from core.utils import month_name

        return f"{month_name(self.period_month)} {self.period_year}"


class PaymentDeadline(models.Model):
    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="payment_deadlines",
    )
    period_year = models.PositiveIntegerField("Yil")
    period_month = models.PositiveSmallIntegerField("Oy")
    due_date = models.DateField("To'lov muddati")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "To'lov muddati"
        verbose_name_plural = "To'lov muddatlari"
        unique_together = [("teacher", "period_year", "period_month")]
        ordering = ["-period_year", "-period_month"]

    def __str__(self) -> str:
        return f"{self.period_year}-{self.period_month:02d} → {self.due_date}"

    @property
    def is_overdue(self) -> bool:
        return self.due_date < timezone.localdate()
