from django.urls import path

from academics import views_teacher as views

app_name = "academics"

urlpatterns = [
    path("", views.dashboard, name="teacher_dashboard"),
    # Guruhlar
    path("groups/", views.group_list, name="group_list"),
    path("groups/new/", views.group_create, name="group_create"),
    path("groups/<int:pk>/", views.group_detail, name="group_detail"),
    path("groups/<int:pk>/edit/", views.group_edit, name="group_edit"),
    path("groups/<int:pk>/delete/", views.group_delete, name="group_delete"),
    path(
        "groups/<int:pk>/members/add/",
        views.group_member_add,
        name="group_member_add",
    ),
    path(
        "groups/<int:pk>/members/<int:membership_id>/remove/",
        views.group_member_remove,
        name="group_member_remove",
    ),
    # O'quvchilar
    path("students/", views.student_list, name="student_list"),
    path("students/new/", views.student_create, name="student_create"),
    path("students/<int:pk>/", views.student_detail, name="student_detail"),
    path("students/<int:pk>/edit/", views.student_edit, name="student_edit"),
    path("students/<int:pk>/delete/", views.student_delete, name="student_delete"),
    path("students/<int:pk>/block/", views.student_block, name="student_block"),
    path(
        "students/<int:pk>/reset-password/",
        views.student_reset_password,
        name="student_reset_password",
    ),
    path(
        "students/<int:pk>/memberships/add/",
        views.student_membership_add,
        name="student_membership_add",
    ),
    path(
        "students/<int:pk>/memberships/<int:membership_id>/remove/",
        views.student_membership_remove,
        name="student_membership_remove",
    ),
    # Materiallar
    path("materials/", views.material_list, name="material_list"),
    path("materials/new/", views.material_create, name="material_create"),
    path("materials/<int:pk>/edit/", views.material_edit, name="material_edit"),
    path("materials/<int:pk>/delete/", views.material_delete, name="material_delete"),
    path(
        "materials/<int:pk>/images/<int:image_id>/delete/",
        views.material_image_delete,
        name="material_image_delete",
    ),
    # Uy vazifalari
    path("homework/", views.homework_list, name="homework_list"),
    path("homework/new/", views.homework_create, name="homework_create"),
    path("homework/<int:pk>/", views.homework_detail, name="homework_detail"),
    path("homework/<int:pk>/edit/", views.homework_edit, name="homework_edit"),
    path("homework/<int:pk>/delete/", views.homework_delete, name="homework_delete"),
    path(
        "submissions/<int:pk>/review/",
        views.submission_review,
        name="submission_review",
    ),
    # Davomat, baholar, statistika
    path("attendance/", views.attendance, name="attendance"),
    path("attendance/mark/", views.attendance_mark, name="attendance_mark"),
    path("grades/", views.grades, name="grades"),
    path("grades/student/<int:pk>/", views.grade_student, name="grade_student"),
    path("statistics/", views.statistics, name="statistics"),
]
