from django.urls import path
from . import views

app_name = "integrations"
urlpatterns = [
    path("telegram/", views.telegram_settings, name="telegram"),
    path("telegram/open/", views.telegram_open, name="telegram_open"),
    path("telegram/webhook/", views.telegram_webhook, name="webhook"),
    path("cron/reminders/", views.cron_reminders, name="cron_reminders"),
    path("teacher/students/<int:student_id>/telegram/", views.student_parent_link, name="parent_link"),
    path("teacher/tests/<int:test_id>/telegram/", views.send_test_telegram, name="send_test"),
]
