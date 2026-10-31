from django.urls import path

from academics import views_student as views

app_name = "student"

urlpatterns = [
    path("", views.home, name="student_home"),
    path("group/", views.group_page, name="group"),
    path("homework/", views.homework_list, name="homework_list"),
    path("homework/<int:pk>/", views.homework_detail, name="homework_detail"),
    path("homework/<int:pk>/submit/", views.homework_submit, name="homework_submit"),
    path("grades/", views.grades_page, name="grades"),
    path("materials/", views.materials_page, name="materials"),
    path("stats/", views.stats_page, name="stats"),
]
