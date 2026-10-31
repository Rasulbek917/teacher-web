from django.conf import settings
from django.db import models
from django.urls import reverse
from django.utils import timezone

from core.utils import WEEKDAYS_UZ, lesson_days_label


class Group(models.Model):
    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="teacher_groups",
        verbose_name="O'qituvchi",
    )
    name = models.CharField("Guruh nomi", max_length=120)
    level = models.CharField("Daraja", max_length=60, blank=True)
    lesson_days = models.JSONField("Dars kunlari", default=list, blank=True)
    lesson_time = models.CharField("Dars vaqti", max_length=5, default="09:00")
    monthly_price = models.PositiveIntegerField("Oylik to'lov (so'm)", default=300000)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Guruh"
        verbose_name_plural = "Guruhlar"
        ordering = ["name"]
        indexes = [models.Index(fields=["teacher"])]

    def __str__(self) -> str:
        return self.name

    def get_absolute_url(self):
        return reverse("academics:group_detail", args=[self.pk])

    @property
    def days_label(self) -> str:
        return lesson_days_label(self.lesson_days)

    @property
    def days_list(self) -> list[int]:
        result = []
        for d in self.lesson_days or []:
            try:
                result.append(int(d))
            except (TypeError, ValueError):
                continue
        return result

    @property
    def weekday_choices(self):
        return [(num, name) for num, name in WEEKDAYS_UZ.items()]


class GroupMembership(models.Model):
    group = models.ForeignKey(
        Group, on_delete=models.CASCADE, related_name="memberships"
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="group_memberships",
    )
    custom_price = models.PositiveIntegerField("Individual narx", blank=True, null=True)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Guruh a'zoligi"
        verbose_name_plural = "Guruh a'zoliklari"
        unique_together = [("group", "student")]
        ordering = ["student__first_name", "student__last_name"]

    def __str__(self) -> str:
        return f"{self.student.full_name} → {self.group.name}"

    @property
    def effective_price(self) -> int:
        return self.custom_price if self.custom_price is not None else self.group.monthly_price


class Attendance(models.Model):
    group = models.ForeignKey(
        Group, on_delete=models.CASCADE, related_name="attendance_records"
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="attendance_records",
    )
    date = models.DateField("Sana", default=timezone.localdate)
    present = models.BooleanField("Keldi", default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Davomat"
        verbose_name_plural = "Davomat"
        unique_together = [("student", "group", "date")]
        ordering = ["-date", "student__first_name"]
        indexes = [
            models.Index(fields=["group", "date"]),
            models.Index(fields=["student", "date"]),
        ]

    def __str__(self) -> str:
        return f"{self.student.full_name} — {self.date}"


class Material(models.Model):
    class Type(models.TextChoices):
        VIDEO = "VIDEO", "Video"
        IMAGE = "IMAGE", "Rasm"

    class VideoSource(models.TextChoices):
        UPLOAD = "UPLOAD", "Yuklangan video"
        YOUTUBE = "YOUTUBE", "YouTube"

    group = models.ForeignKey(
        Group, on_delete=models.CASCADE, related_name="materials"
    )
    type = models.CharField("Turi", max_length=8, choices=Type.choices, default=Type.VIDEO)
    title = models.CharField("Sarlavha", max_length=160)
    description = models.TextField("Tavsif", blank=True)
    video_source = models.CharField(
        "Video manbasi", max_length=8, choices=VideoSource.choices, blank=True
    )
    file = models.FileField("Fayl", upload_to="materials/%Y/%m/", blank=True, null=True)
    youtube_url = models.URLField("YouTube havolasi", blank=True)
    external_file_url = models.URLField(blank=True)
    image_urls = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Material"
        verbose_name_plural = "Materiallar"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["group"])]

    def __str__(self) -> str:
        return self.title

    @property
    def is_video(self) -> bool:
        return self.type == self.Type.VIDEO

    @property
    def youtube_embed(self) -> str:
        url = self.youtube_url or ""
        for marker in ("youtu.be/", "youtube.com/watch?v=", "youtube.com/embed/"):
            if marker in url:
                token = url.split(marker, 1)[1].split("&")[0].split("?")[0]
                if token:
                    return f"https://www.youtube.com/embed/{token}"
        return ""


class MaterialImage(models.Model):
    material = models.ForeignKey(
        Material, on_delete=models.CASCADE, related_name="images"
    )
    file = models.ImageField("Rasm", upload_to="materials/images/%Y/%m/")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Material rasmi"
        verbose_name_plural = "Material rasmlari"

    def __str__(self) -> str:
        return self.file.name


class Homework(models.Model):
    group = models.ForeignKey(
        Group, on_delete=models.CASCADE, related_name="homeworks"
    )
    title = models.CharField("Sarlavha", max_length=160)
    description = models.TextField("Tavsif", blank=True)
    due_at = models.DateTimeField("Muddat", blank=True, null=True)
    attachment = models.FileField(
        "Biriktirma", upload_to="homework/%Y/%m/", blank=True, null=True
    )
    attachment_urls = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Uy vazifasi"
        verbose_name_plural = "Uy vazifalari"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["group"]), models.Index(fields=["due_at"])]

    def __str__(self) -> str:
        return self.title

    @property
    def is_past_due(self) -> bool:
        return bool(self.due_at and self.due_at < timezone.now())

    @property
    def total_students(self) -> int:
        return self.group.memberships.count()

    @property
    def submitted_count(self) -> int:
        return self.submissions.count()

    @property
    def not_submitted_count(self) -> int:
        return max(0, self.total_students - self.submitted_count)

    @property
    def unchecked_count(self) -> int:
        return self.submissions.filter(reviewed_at__isnull=True).count()


class Submission(models.Model):
    class Status(models.TextChoices):
        SUBMITTED = "SUBMITTED", "Topshirilgan"
        LATE = "LATE", "Kechikkan"

    class Result(models.TextChoices):
        DONE = "DONE", "Bajarildi"
        WRONG = "WRONG", "Xato"

    homework = models.ForeignKey(
        Homework, on_delete=models.CASCADE, related_name="submissions"
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="submissions",
    )
    text = models.TextField("Javob matni", blank=True)
    file = models.FileField(
        "Javob fayli", upload_to="submissions/%Y/%m/", blank=True, null=True
    )
    external_file_url = models.URLField(blank=True)
    status = models.CharField(
        "Holat", max_length=12, choices=Status.choices, default=Status.SUBMITTED
    )
    result = models.CharField(
        "Natija", max_length=8, choices=Result.choices, blank=True
    )
    grade = models.PositiveSmallIntegerField("Baho", blank=True, null=True)
    comment = models.TextField("Izoh", blank=True)
    submitted_at = models.DateTimeField(default=timezone.now)
    reviewed_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Topshiriq"
        verbose_name_plural = "Topshiriqlar"
        unique_together = [("homework", "student")]
        ordering = ["-submitted_at"]
        indexes = [models.Index(fields=["student"])]

    def __str__(self) -> str:
        return f"{self.student.full_name} — {self.homework.title}"

    def save(self, *args, **kwargs):
        if self.homework_id and self.homework.due_at and self.submitted_at:
            self.status = (
                self.Status.LATE
                if self.submitted_at > self.homework.due_at
                else self.Status.SUBMITTED
            )
        if self.grade is not None:
            self.grade = max(0, min(100, int(self.grade)))
        super().save(*args, **kwargs)

    @property
    def is_reviewed(self) -> bool:
        return self.reviewed_at is not None or bool(self.result)

    @property
    def status_label(self) -> str:
        if self.is_reviewed:
            return "Tekshirilgan"
        if self.status == self.Status.LATE:
            return "Kechikkan"
        return "Topshirilgan"
