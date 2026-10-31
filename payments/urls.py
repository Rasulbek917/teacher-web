from django.urls import path

from payments import views

app_name = "payments"

urlpatterns = [
    path("", views.payment_list, name="list"),
    path("mark-paid/", views.payment_mark_paid, name="mark_paid"),
    path("<int:pk>/cancel/", views.payment_cancel, name="cancel"),
    path("deadline/", views.payment_deadline, name="deadline"),
    path("remind/", views.payment_remind, name="remind"),
    path("my/", views.student_payments, name="student_payments"),
]
