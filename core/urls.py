from django.urls import path

from core import views

app_name = "core"

urlpatterns = [
    path("", views.home, name="home"),
    path("files/<str:scope>/<int:pk>/", views.serve_file, name="file"),
]
