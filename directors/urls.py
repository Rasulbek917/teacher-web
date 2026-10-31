from django.urls import path

from directors import views

app_name = "directors"
urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("teachers/", views.teachers, name="teachers"),
    path("teachers/new/", views.teacher_create, name="teacher_create"),
    path("groups/", views.groups, name="groups"),
    path("groups/new/", views.group_create, name="group_create"),
    path("students/", views.students, name="students"),
    path("students/new/", views.student_create, name="student_create"),
    path("payments/", views.payments, name="payments"),
    path("reviews/", views.reviews, name="reviews"),
    path("announcements/", views.announcements, name="announcements"),
]
