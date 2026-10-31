from django.urls import path

from accounts import views
from directors import staff_views

app_name = "staff"

urlpatterns = [
    path("", views.staff_dashboard, name="staff_dashboard"),
    path("directors/", staff_views.director_list, name="staff_directors"),
    path("directors/new/", staff_views.director_create, name="staff_director_create"),
    path("teachers/", views.teacher_list, name="staff_teachers"),
    path("teachers/new/", views.teacher_create, name="staff_teacher_create"),
    path("teachers/<int:pk>/", views.teacher_detail, name="staff_teacher_detail"),
    path("teachers/<int:pk>/edit/", views.teacher_edit, name="staff_teacher_edit"),
    path("teachers/<int:pk>/delete/", views.teacher_delete, name="staff_teacher_delete"),
    path(
        "teachers/<int:pk>/block/",
        views.teacher_toggle_block,
        name="staff_teacher_block",
    ),
]
