from django.urls import path

from core import views

app_name = "core"

urlpatterns = [
    path("", views.home, name="home"),
    path("download/android/", views.download_android, name="android_app"),
    path("files/<str:scope>/<int:pk>/", views.serve_file, name="file"),
]
