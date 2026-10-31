from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/mobile/", include("mobile.urls")),
    path("", include("core.urls")),
    path("", include("accounts.urls")),
    path("teacher/", include("academics.urls_teacher")),
    path("student/", include("academics.urls_student")),
    path("staff/", include("accounts.urls_staff")),
    path("director/", include("directors.urls")),
    path("payments/", include("payments.urls")),
    path("notifications/", include("notifications.urls")),
    path("chat/", include("chat.urls")),
    path("", include("assessments.urls")),
    path("", include("integrations.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
