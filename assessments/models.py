import secrets
from django.conf import settings
from django.db import models
from django.utils import timezone


def make_token():
    return secrets.token_urlsafe(18)


class Test(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Qoralama"
        PUBLISHED = "PUBLISHED", "Nashr qilingan"
        ARCHIVED = "ARCHIVED", "Arxivlangan"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="created_tests")
    group = models.ForeignKey("academics.Group", on_delete=models.SET_NULL, null=True, blank=True, related_name="tests")
    title = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    subject = models.CharField(max_length=100, blank=True)
    topic = models.CharField(max_length=180, blank=True)
    grade_level = models.CharField(max_length=60, blank=True)
    difficulty = models.CharField(max_length=12, default="MIXED")
    language = models.CharField(max_length=8, default="uz")
    ai_generated = models.BooleanField(default=False)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class TestCollaborator(models.Model):
    test = models.ForeignKey(Test, on_delete=models.CASCADE, related_name="collaborators")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="shared_tests")
    can_edit = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["test", "user"], name="uniq_test_collaborator")]


class Question(models.Model):
    test = models.ForeignKey(Test, on_delete=models.CASCADE, related_name="questions")
    order = models.PositiveIntegerField()
    text = models.TextField()
    explanation = models.TextField(blank=True)
    difficulty = models.CharField(max_length=12, default="MEDIUM")

    class Meta:
        ordering = ["order"]
        constraints = [models.UniqueConstraint(fields=["test", "order"], name="uniq_question_order")]


class Option(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="options")
    order = models.PositiveIntegerField()
    text = models.TextField()
    is_correct = models.BooleanField(default=False)

    class Meta:
        ordering = ["order"]
        constraints = [models.UniqueConstraint(fields=["question", "order"], name="uniq_option_order")]


class TestShare(models.Model):
    test = models.ForeignKey(Test, on_delete=models.CASCADE, related_name="shares")
    token = models.CharField(max_length=40, unique=True, default=make_token)
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    start_at = models.DateTimeField(null=True, blank=True)
    end_at = models.DateTimeField(null=True, blank=True)
    time_limit_minutes = models.PositiveSmallIntegerField(null=True, blank=True)
    allow_retries = models.BooleanField(default=False)
    max_attempts = models.PositiveSmallIntegerField(default=1)
    shuffle_questions = models.BooleanField(default=False)
    shuffle_options = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def available(self):
        now = timezone.now()
        return self.is_active and (not self.expires_at or self.expires_at > now) and (not self.start_at or self.start_at <= now) and (not self.end_at or self.end_at >= now)


class Attempt(models.Model):
    class Status(models.TextChoices):
        IN_PROGRESS = "IN_PROGRESS", "Jarayonda"
        SUBMITTED = "SUBMITTED", "Topshirilgan"
        EXPIRED = "EXPIRED", "Muddati o'tgan"

    test = models.ForeignKey(Test, on_delete=models.CASCADE, related_name="attempts")
    share = models.ForeignKey(TestShare, on_delete=models.SET_NULL, null=True, related_name="attempts")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="test_attempts")
    attempt_number = models.PositiveSmallIntegerField(default=1)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.IN_PROGRESS)
    started_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    question_order = models.JSONField(null=True, blank=True)
    option_order = models.JSONField(null=True, blank=True)
    score = models.PositiveSmallIntegerField(null=True, blank=True)
    total = models.PositiveSmallIntegerField(null=True, blank=True)
    percentage = models.FloatField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]


class Answer(models.Model):
    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(Question, on_delete=models.CASCADE)
    option = models.ForeignKey(Option, on_delete=models.SET_NULL, null=True, blank=True)
    is_correct = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["attempt", "question"], name="uniq_attempt_answer")]


class AiMaterial(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ai_materials")
    kind = models.CharField(max_length=24)
    title = models.CharField(max_length=180)
    subject = models.CharField(max_length=100, blank=True)
    topic = models.CharField(max_length=180, blank=True)
    grade_level = models.CharField(max_length=60, blank=True)
    input_text = models.TextField(blank=True)
    content = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)


class AiConversation(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ai_conversations")
    selected_student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="ai_student_conversations")
    title = models.CharField(max_length=100, default="Yangi chat")
    is_pinned = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_pinned", "-updated_at"]

    def __str__(self):
        return self.title


class AiChatMessage(models.Model):
    class Role(models.TextChoices):
        USER = "USER", "Foydalanuvchi"
        ASSISTANT = "ASSISTANT", "AI yordamchi"

    conversation = models.ForeignKey(AiConversation, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=10, choices=Role.choices)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"{self.get_role_display()}: {self.content[:50]}"
