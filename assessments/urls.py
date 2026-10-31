from django.urls import path
from . import views

app_name = "assessments"
urlpatterns = [
    path("teacher/assistant/", views.assistant, name="assistant"),
    path("teacher/assistant/chat/<int:pk>/", views.assistant, name="assistant_conversation"),
    path("teacher/assistant/chat/new/", views.assistant_new_chat, name="assistant_new_chat"),
    path("teacher/assistant/chat/<int:pk>/rename/", views.assistant_rename_chat, name="assistant_rename_chat"),
    path("teacher/assistant/chat/<int:pk>/pin/", views.assistant_pin_chat, name="assistant_pin_chat"),
    path("teacher/assistant/chat/<int:pk>/delete/", views.assistant_delete_chat, name="assistant_delete_chat"),
    path("teacher/assistant/chat/", views.assistant_chat, name="assistant_chat"),
    path("teacher/assistant/materials/", views.assistant_materials, name="materials"),
    path("teacher/assistant/materials/<int:pk>/", views.assistant_material_detail, name="material_detail"),
    path("teacher/assistant/materials/<int:pk>/edit/", views.assistant_material_edit, name="material_edit"),
    path("teacher/assistant/materials/<int:pk>/delete/", views.assistant_material_delete, name="material_delete"),
    path("teacher/tests/", views.test_list, name="list"),
    path("teacher/tests/new/", views.test_create, name="create"),
    path("teacher/tests/ai/", views.test_generate, name="generate"),
    path("teacher/tests/<int:pk>/", views.test_detail, name="detail"),
    path("teacher/tests/<int:pk>/edit/", views.test_edit, name="edit"),
    path("teacher/tests/<int:pk>/delete/", views.test_delete, name="delete"),
    path("teacher/tests/<int:pk>/copy/", views.test_duplicate, name="duplicate"),
    path("teacher/tests/<int:pk>/analytics/", views.test_analytics, name="analytics"),
    path("teacher/tests/<int:pk>/recommendations/", views.test_recommendations, name="recommendations"),
    path("teacher/tests/<int:pk>/archive/", views.test_archive, name="archive"),
    path("teacher/tests/<int:pk>/collaborators/", views.collaborator_add, name="collaborator_add"),
    path("teacher/tests/<int:pk>/collaborators/<int:collaborator_id>/remove/", views.collaborator_remove, name="collaborator_remove"),
    path("teacher/tests/<int:pk>/publish/", views.test_publish, name="publish"),
    path("t/<str:token>/", views.public_test, name="public"),
    path("student/tests/", views.student_tests, name="student_tests"),
    path("student/tests/results/", views.my_results, name="results"),
]
