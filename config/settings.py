"""Teacher Web — Django sozlamalari (SQLite, server-rendered + Tailwind)."""
from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent

# Local development reads .env while explicit process environment takes priority.
env_file = BASE_DIR / ".env"
if env_file.is_file():
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ.setdefault(name.strip(), value)

SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    "dev-only-secret-key-o-zgartiring-productionda-32-belgidan-kam-bolmasin",
)

# Keep production safe when the deployment variable is missing. Local .env can
# explicitly set DJANGO_DEBUG=1 for development.
DEBUG = os.environ.get("DJANGO_DEBUG", "0") == "1"

ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",")
    if h.strip()
]
CSRF_TRUSTED_ORIGINS = [
    o.strip()
    for o in os.environ.get("DJANGO_CSRF_TRUSTED_ORIGINS", "").split(",")
    if o.strip()
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.humanize",
    # Loyiha ilovalari
    "accounts",
    "academics",
    "payments",
    "notifications",
    "chat",
    "core",
    "assessments",
    "directors",
    "integrations",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# WhiteNoise faqat o'rnatilgan bo'lsa ishlaydi (dev uchun staticfiles bilan ham yetarli).
try:  # pragma: no cover
    import whitenoise  # noqa: F401
except ImportError:  # pragma: no cover
    MIDDLEWARE.remove("whitenoise.middleware.WhiteNoiseMiddleware")

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "core.context_processors.ui",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
if DATABASE_URL.startswith(("postgres://", "postgresql://")):
    from urllib.parse import unquote, urlparse
    db_url = urlparse(DATABASE_URL)
    DATABASES = {"default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": unquote(db_url.path.lstrip("/")),
        "USER": unquote(db_url.username or ""),
        "PASSWORD": unquote(db_url.password or ""),
        "HOST": db_url.hostname or "localhost",
        "PORT": db_url.port or 5432,
        "CONN_MAX_AGE": 60,
        "OPTIONS": {"sslmode": os.environ.get("DB_SSLMODE", "prefer")},
    }}
else:
    DATABASES = {"default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.environ.get("DJANGO_DB_PATH", str(BASE_DIR / "db.sqlite3")),
    }}

AUTH_USER_MODEL = "accounts.User"
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "accounts.hashers.LegacyBCryptPasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.ScryptPasswordHasher",
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LOGIN_URL = "accounts:login"
LOGIN_REDIRECT_URL = "core:home"
LOGOUT_REDIRECT_URL = "accounts:login"

LANGUAGE_CODE = "uz"
TIME_ZONE = "Asia/Tashkent"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATICFILES_DIRS = [BASE_DIR / "static"]
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

MESSAGE_STORAGE = "django.contrib.messages.storage.session.SessionStorage"

# Yuklash limitlari (o'quv videolari uchun kengaytirilgan).
DATA_UPLOAD_MAX_MEMORY_SIZE = 260 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024

# Login brutingdan himoya: 5 xato -> 5 daqiqa blok.
LOGIN_MAX_ATTEMPTS = int(os.environ.get("LOGIN_MAX_ATTEMPTS", "5"))
LOGIN_BLOCK_MINUTES = int(os.environ.get("LOGIN_BLOCK_MINUTES", "5"))

SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = False
X_FRAME_OPTIONS = "SAMEORIGIN"

if not DEBUG:
    SESSION_COOKIE_SECURE = os.environ.get("DJANGO_SECURE_COOKIES", "1") == "1"
    CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_REFERRER_POLICY = "same-origin"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}

# Production defaults remain conservative and configurable through environment.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = os.environ.get("DJANGO_SECURE_COOKIES", "0" if DEBUG else "1") == "1"
CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "SAMEORIGIN"
