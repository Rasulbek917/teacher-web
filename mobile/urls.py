from django.urls import path

from . import api

app_name = "mobile_api"

urlpatterns = [
    path("login/", api.login, name="login"),
    path("logout/", api.logout, name="logout"),
    path("avatar/", api.avatar, name="avatar"),
    path("bootstrap/", api.bootstrap, name="bootstrap"),
    path("section/<str:name>/", api.section, name="section"),
    path("action/", api.action, name="action"),
]
