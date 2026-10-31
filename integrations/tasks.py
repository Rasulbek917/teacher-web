from datetime import datetime, timedelta
from django.db import IntegrityError
from django.db.models import Q
from django.utils import timezone
from accounts.models import User
from academics.models import Attendance, Group
from payments.models import Payment, PaymentDeadline
from .models import TelegramNotificationLog
from .services import telegram_send


def _send_once(dedupe_key, chat_id, text):
    try:
        TelegramNotificationLog.objects.create(dedupe_key=dedupe_key)
    except IntegrityError:
        return False
    if not telegram_send(chat_id, text):
        TelegramNotificationLog.objects.filter(dedupe_key=dedupe_key).delete()
        return False
    return True


def send_scheduled_reminders(now=None, lesson_minutes=30):
    now = now or timezone.localtime()
    sent = {"lessons": 0, "payments": 0}
    start, end = now, now + timedelta(minutes=lesson_minutes)
    weekday = now.isoweekday()
    groups = Group.objects.select_related("teacher").prefetch_related("memberships__student__student_profile")
    for group in groups:
        if weekday not in group.days_list:
            continue
        try:
            hour, minute = map(int, group.lesson_time.split(":"))
            lesson_at = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        except (TypeError, ValueError):
            continue
        if not (start < lesson_at <= end):
            continue
        for membership in group.memberships.all():
            profile = getattr(membership.student, "student_profile", None)
            chat_id = getattr(profile, "parent_telegram_chat_id", None)
            if chat_id:
                dedupe = f"lesson:{group.pk}:{membership.student_id}:{now.date()}"
                if _send_once(dedupe, chat_id, f"Eslatma: {group.name} guruhidagi dars {group.lesson_time} da boshlanadi."):
                    sent["lessons"] += 1

    today = now.date()
    deadlines = PaymentDeadline.objects.filter(due_date__lte=today + timedelta(days=7)).select_related("teacher")
    for deadline in deadlines:
        delta = (deadline.due_date - today).days
        if delta > 7 or (delta < 0 and abs(delta) % 2 != 0):
            continue
        payments = Payment.objects.filter(teacher=deadline.teacher, period_year=deadline.period_year, period_month=deadline.period_month).exclude(status="PAID").filter(student__isnull=False).select_related("student", "group")
        # Missing payment rows are unpaid memberships too.
        from academics.models import GroupMembership
        memberships = GroupMembership.objects.filter(group__teacher=deadline.teacher).select_related("student", "group", "student__student_profile")
        for membership in memberships:
            payment = payments.filter(student=membership.student, group=membership.group).first()
            if payment and payment.status == "PAID":
                continue
            profile = getattr(membership.student, "student_profile", None)
            chat_id = getattr(profile, "parent_telegram_chat_id", None)
            if not chat_id:
                continue
            if delta == 7:
                kind, label = "week", "To'lov muddati 7 kundan keyin"
            elif delta == 0:
                kind, label = "due", "Bugun to'lov muddati"
            else:
                kind, label = "overdue", f"To'lov {abs(delta)} kundan beri kechikmoqda"
            dedupe = f"payment:{deadline.teacher_id}:{deadline.period_year}:{deadline.period_month}:{membership.student_id}:{membership.group_id}:{kind}:{today}"
            amount = (payment.price_snapshot - payment.amount) if payment else membership.effective_price
            text = f"{label}: {membership.group.name} guruhi uchun {amount:,} so'm.".replace(",", " ")
            if _send_once(dedupe, chat_id, text):
                sent["payments"] += 1
    return sent
