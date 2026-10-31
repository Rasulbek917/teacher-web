from django.urls import path

from chat import views

app_name = "chat"

urlpatterns = [
    path("", views.chat_list, name="list"),
    path("direct/", views.start_direct, name="start_direct"),
    path("<int:pk>/", views.chat_room, name="room"),
    path("<int:pk>/messages/", views.messages_json, name="messages_json"),
    path("<int:pk>/send/", views.send_json, name="send_json"),
]
