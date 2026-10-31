from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create(self, login: str, password: str | None, **extra):
        if not login:
            raise ValueError("Login kiritilishi shart")
        user = self.model(login=login.strip().lower(), **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_user(self, login: str, password: str | None = None, **extra):
        return self._create(login, password, **extra)

    def create_superuser(self, login: str, password: str | None = None, **extra):
        extra.setdefault("role", User.Roles.SUPER_ADMIN)
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("is_active", True)
        return self._create(login, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    class Roles(models.TextChoices):
        SUPER_ADMIN = "SUPER_ADMIN", "Super Admin"
        DIRECTOR = "DIRECTOR", "Direktor"
        TEACHER = "TEACHER", "O'qituvchi"
        STUDENT = "STUDENT", "O'quvchi"

    class Language(models.TextChoices):
        UZ = "UZ", "O'zbekcha"
        EN = "EN", "English"

    class Theme(models.TextChoices):
        LIGHT = "LIGHT", "Yorug'"
        DARK = "DARK", "Qorong'i"

    login = models.CharField("Login", max_length=64, unique=True)
    role = models.CharField("Rol", max_length=16, choices=Roles.choices, default=Roles.STUDENT)
    director = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True, related_name="managed_users")
    first_name = models.CharField("Ism", max_length=64)
    last_name = models.CharField("Familiya", max_length=64)
    phone = models.CharField("Telefon", max_length=32, blank=True)
    avatar = models.ImageField("Avatar", upload_to="avatars/%Y/%m/", blank=True, null=True)
    external_avatar_url = models.URLField(blank=True)
    telegram_chat_id = models.CharField(max_length=64, blank=True, null=True, unique=True)
    language = models.CharField(
        "Til", max_length=2, choices=Language.choices, default=Language.UZ
    )
    theme = models.CharField(
        "Mavzu", max_length=5, choices=Theme.choices, default=Theme.LIGHT
    )
    is_blocked = models.BooleanField("Bloklangan", default=False)
    # Parol o'zgarganda oshiriladi — eski sessiyalarni bekor qilish uchun.
    token_version = models.PositiveIntegerField(default=0)

    is_active = models.BooleanField("Faol", default=True)
    is_staff = models.BooleanField("Admin panelga kirish", default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "login"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    class Meta:
        verbose_name = "Foydalanuvchi"
        verbose_name_plural = "Foydalanuvchilar"
        ordering = ["first_name", "last_name"]
        indexes = [
            models.Index(fields=["role"]),
            models.Index(fields=["login"]),
            models.Index(fields=["role", "first_name"]),
        ]

    def __str__(self) -> str:
        return f"{self.full_name} ({self.login})"

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def short_name(self) -> str:
        initials = f"{self.first_name[:1]}{self.last_name[:1]}".upper()
        return initials or self.login[:2].upper()

    @property
    def is_teacher(self) -> bool:
        return self.role == self.Roles.TEACHER

    @property
    def is_student(self) -> bool:
        return self.role == self.Roles.STUDENT

    @property
    def is_super_admin(self) -> bool:
        return self.role == self.Roles.SUPER_ADMIN

    @property
    def is_director(self) -> bool:
        return self.role == self.Roles.DIRECTOR

    def can_login(self) -> bool:
        return self.is_active and not self.is_blocked


class TeacherProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="teacher_profile",
    )
    center_name = models.CharField("O'quv markazi", max_length=120)
    city = models.CharField("Shahar", max_length=80)
    # Telegram bot bilan moslik uchun maydonlar (bot alohida servisda ishlaydi).
    telegram_chat_id = models.CharField(max_length=64, blank=True, null=True)
    telegram_link_token = models.CharField(
        max_length=64, blank=True, null=True, unique=True
    )
    telegram_linked_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "O'qituvchi profili"
        verbose_name_plural = "O'qituvchi profillari"

    def __str__(self) -> str:
        return f"{self.user.full_name} — {self.center_name}"


class StudentProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="student_profile",
    )
    parent_phone = models.CharField("Ota-ona telefoni", max_length=32, blank=True)
    # Telegram bot bilan moslik uchun maydonlar.
    parent_telegram_chat_id = models.CharField(max_length=64, blank=True, null=True)
    telegram_link_token = models.CharField(
        max_length=64, blank=True, null=True, unique=True
    )
    telegram_linked_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "O'quvchi profili"
        verbose_name_plural = "O'quvchi profillari"

    def __str__(self) -> str:
        return f"{self.user.full_name} (o'quvchi)"


class LoginAttempt(models.Model):
    """Login brutingdan himoya: (ip, login) juftligi bo'yicha urinishlar."""

    key = models.CharField(max_length=200, unique=True)
    failures = models.PositiveIntegerField(default=0)
    blocked_until = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Login urinishi"
        verbose_name_plural = "Login urinishlari"

    def __str__(self) -> str:
        return f"{self.key} — {self.failures}"
