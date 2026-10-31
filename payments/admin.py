from django.contrib import admin

from payments.models import Payment, PaymentDeadline


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "student_name",
        "group_name",
        "period_year",
        "period_month",
        "amount",
        "status",
    )
    list_filter = ("status", "period_year", "period_month")
    search_fields = ("student_name", "group_name")


@admin.register(PaymentDeadline)
class PaymentDeadlineAdmin(admin.ModelAdmin):
    list_display = ("teacher", "period_year", "period_month", "due_date")
    list_filter = ("period_year", "period_month")
