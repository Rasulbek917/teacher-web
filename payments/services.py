from django.db import transaction
from django.urls import reverse
from django.utils import timezone

from academics.models import GroupMembership
from accounts.models import User
from notifications.models import Notification
from notifications.services import notify
from payments.models import Payment, PaymentDeadline


def month_rows(teacher, year: int, month: int, group_id=None, search: str = ""):
    memberships = (
        GroupMembership.objects.filter(group__teacher=teacher)
        .select_related("student", "group")
        .order_by("student__first_name", "student__last_name")
    )
    if group_id:
        memberships = memberships.filter(group_id=group_id)
    if search:
        memberships = memberships.filter(student__first_name__icontains=search) | memberships.filter(
            student__last_name__icontains=search
        )

    payments = {
        (p.student_id, p.group_id): p
        for p in Payment.objects.filter(
            teacher=teacher, period_year=year, period_month=month
        )
    }

    rows = []
    for membership in memberships:
        payment = payments.get((membership.student_id, membership.group_id))
        price = payment.price_snapshot if payment else membership.effective_price
        if payment:
            status = payment.status
            amount = payment.amount
            paid_at = payment.paid_at
            payment_id = payment.id
        else:
            status = Payment.Status.UNPAID
            amount = 0
            paid_at = None
            payment_id = None
        rows.append(
            {
                "membership": membership,
                "student": membership.student,
                "group": membership.group,
                "price": price,
                "payment": payment,
                "payment_id": payment_id,
                "status": status,
                "amount": amount,
                "paid_at": paid_at,
            }
        )
    return rows


def rows_summary(rows):
    income = sum(r["amount"] for r in rows)
    paid = sum(1 for r in rows if r["status"] == Payment.Status.PAID)
    partial = sum(1 for r in rows if r["status"] == Payment.Status.PARTIAL)
    unpaid = sum(1 for r in rows if r["status"] == Payment.Status.UNPAID)
    outstanding = sum(max(0, r["price"] - r["amount"]) for r in rows)
    return {
        "income": income,
        "paid": paid,
        "partial": partial,
        "unpaid": unpaid,
        "outstanding": outstanding,
        "total": len(rows),
    }


@transaction.atomic
def mark_paid(teacher, *, student, group, year, month, amount, paid_at=None):
    if group.teacher_id != teacher.pk:
        raise ValueError("Guruh sizga tegishli emas.")
    membership = GroupMembership.objects.filter(student=student, group=group).first()
    if not membership:
        raise ValueError("O'quvchi tanlangan guruh a'zosi emas.")
    price = membership.effective_price
    amount = int(amount or 0)
    if amount < 0:
        raise ValueError("To'lov summasi manfiy bo'lishi mumkin emas.")
    if amount > price:
        raise ValueError("To'lov summasi oylik narxdan oshmasligi kerak.")
    if amount >= price:
        status = Payment.Status.PAID
    elif amount > 0:
        status = Payment.Status.PARTIAL
    else:
        status = Payment.Status.UNPAID

    payment, _ = Payment.objects.update_or_create(
        teacher=teacher,
        student=student,
        group=group,
        period_year=year,
        period_month=month,
        defaults={
            "student_name": student.full_name,
            "group_name": group.name,
            "price_snapshot": price,
            "amount": amount,
            "status": status,
            "paid_at": (paid_at or timezone.now()) if amount else None,
        },
    )
    return payment


def cancel_payment(payment_id, teacher):
    Payment.objects.filter(pk=payment_id, teacher=teacher).delete()


def get_deadline(teacher, year, month):
    return PaymentDeadline.objects.filter(
        teacher=teacher, period_year=year, period_month=month
    ).first()


def set_deadline(teacher, year, month, due_date):
    if not due_date:
        PaymentDeadline.objects.filter(
            teacher=teacher, period_year=year, period_month=month
        ).delete()
        return None
    deadline, _ = PaymentDeadline.objects.update_or_create(
        teacher=teacher,
        period_year=year,
        period_month=month,
        defaults={"due_date": due_date},
    )
    return deadline


def send_payment_reminders(teacher, year, month):
    """Ilova ichidagi eslatmalar (Telegram botga tegmaydi)."""
    rows = month_rows(teacher, year, month)
    sent = already = 0
    for row in rows:
        if row["status"] == Payment.Status.PAID:
            continue
        status_label = "qisman to'langan" if row["status"] == Payment.Status.PARTIAL else "to'lanmagan"
        dedupe = f"payment:{teacher.pk}:{year}:{month}:{row['student'].pk}:{row['group'].pk}"
        if Notification.objects.filter(dedupe_key=dedupe).exists():
            already += 1
            continue
        notify(
            row["student"],
            type=Notification.Type.PAYMENT_REMINDER,
            title="To'lov eslatmasi",
            body=(
                f"{row['group'].name} guruhi uchun {row['price']:,} so'mlik oylik to'lovdan "
                f"{max(0, row['price'] - row['amount']):,} so'm {status_label}."
            ).replace(",", " "),
            link=reverse("payments:student_payments"),
            dedupe_key=dedupe,
        )
        try:
            profile = row["student"].student_profile
            if profile.parent_telegram_chat_id:
                from integrations.services import telegram_send
                telegram_send(profile.parent_telegram_chat_id, f"{row['group'].name} guruhi uchun {max(0, row['price'] - row['amount']):,} so'm oylik to'lov {status_label}.")
        except Exception:
            pass
        sent += 1
    return {"sent": sent, "already": already}


def student_month_rows(student, year, month):
    memberships = (
        GroupMembership.objects.filter(student=student)
        .select_related("group")
        .order_by("group__name")
    )
    payments = {
        p.group_id: p
        for p in Payment.objects.filter(
            student=student, period_year=year, period_month=month
        )
    }
    rows = []
    for membership in memberships:
        payment = payments.get(membership.group_id)
        rows.append(
            {
                "group": membership.group,
                "price": payment.price_snapshot if payment else membership.effective_price,
                "payment": payment,
                "status": payment.status if payment else Payment.Status.UNPAID,
                "amount": payment.amount if payment else 0,
                "paid_at": payment.paid_at if payment else None,
            }
        )
    return rows
