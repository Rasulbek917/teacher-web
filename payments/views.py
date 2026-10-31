from datetime import date

from django.contrib import messages
from django.core.paginator import Paginator
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_POST

from academics.models import Group
from accounts.models import User
from core.decorators import student_required, teacher_required
from core.utils import month_name, parse_ym, year_options
from payments.models import Payment
from payments.services import (
    cancel_payment,
    get_deadline,
    mark_paid,
    month_rows,
    rows_summary,
    send_payment_reminders,
    set_deadline,
    student_month_rows,
)


@teacher_required
def payment_list(request):
    year, month = parse_ym(request)
    group_id = request.GET.get("group") or ""
    search = (request.GET.get("q") or "").strip()
    rows = month_rows(
        request.user,
        year,
        month,
        group_id=group_id or None,
        search=search,
    )
    summary = rows_summary(rows)
    paginator = Paginator(rows, 50)
    page_obj = paginator.get_page(request.GET.get("page"))
    deadline = get_deadline(request.user, year, month)

    context = {
        "year": year,
        "month": month,
        "month_label": month_name(month),
        "years": year_options(),
        "groups": request.user.teacher_groups.order_by("name"),
        "group_id": group_id,
        "search": search,
        "rows": page_obj.object_list,
        "page_obj": page_obj,
        "summary": summary,
        "deadline": deadline,
        "total": paginator.count,
    }
    return render(request, "payments/payment_list.html", context)


@teacher_required
@require_POST
def payment_mark_paid(request, pk=None):
    group = get_object_or_404(
        Group, pk=request.POST.get("group"), teacher=request.user
    )
    student = get_object_or_404(
        User.objects.filter(
            role=User.Roles.STUDENT,
            group_memberships__group=group,
        ).distinct(),
        pk=request.POST.get("student"),
    )
    year, month = parse_ym(request)
    try:
        amount = int(request.POST.get("amount") or 0)
    except (TypeError, ValueError):
        messages.error(request, "To'lov summasini raqamda kiriting.")
        return redirect(request.POST.get("next") or "payments:list")
    paid_at_raw = request.POST.get("paid_at") or ""
    paid_at = None
    if paid_at_raw:
        try:
            from datetime import datetime
            paid_at = datetime.fromisoformat(paid_at_raw)
            if timezone.is_naive(paid_at):
                paid_at = timezone.make_aware(paid_at)
        except ValueError:
            messages.error(request, "To'lov sanasi noto'g'ri formatda.")
            return redirect(request.POST.get("next") or "payments:list")
    try:
        mark_paid(
            request.user,
            student=student,
            group=group,
            year=year,
            month=month,
            amount=amount,
            paid_at=paid_at,
        )
    except ValueError as exc:
        messages.error(request, str(exc))
        return redirect(request.POST.get("next") or "payments:list")
    messages.success(
        request, f"{student.full_name} — {group.name}: to'lov saqlandi."
    )
    return redirect(request.POST.get("next") or "payments:list")


@teacher_required
@require_POST
def payment_cancel(request, pk):
    payment = get_object_or_404(Payment, pk=pk, teacher=request.user)
    cancel_payment(payment.pk, request.user)
    messages.success(request, "To'lov bekor qilindi.")
    return redirect(request.POST.get("next") or "payments:list")


@teacher_required
@require_POST
def payment_deadline(request):
    year, month = parse_ym(request)
    raw = request.POST.get("due_date") or ""
    due = None
    if raw:
        try:
            due = date.fromisoformat(raw)
        except ValueError:
            due = None
    set_deadline(request.user, year, month, due)
    messages.success(request, "To'lov muddati saqlandi.")
    return redirect(f"{request.POST.get('next') or '/payments/'}")


@teacher_required
@require_POST
def payment_remind(request):
    year, month = parse_ym(request)
    result = send_payment_reminders(request.user, year, month)
    if result["sent"]:
        messages.success(
            request,
            f"{result['sent']} ta o'quvchiga eslatma yuborildi."
            + (f" ({result['already']} ta allaqachon yuborilgan)" if result["already"] else ""),
        )
    elif result["already"]:
        messages.info(request, "Bu oy uchun eslatmalar allaqachon yuborilgan.")
    else:
        messages.info(request, "Barcha to'lovlar amalga oshirilgan.")
    return redirect(request.POST.get("next") or "payments:list")


@student_required
def student_payments(request):
    year, month = parse_ym(request)
    rows = student_month_rows(request.user, year, month)
    deadline = None
    memberships = request.user.group_memberships.select_related("group")
    if memberships.exists():
        from payments.services import get_deadline

        deadline = get_deadline(memberships.first().group.teacher, year, month)
    return render(
        request,
        "payments/student_payments.html",
        {
            "rows": rows,
            "year": year,
            "month": month,
            "month_label": month_name(month),
            "years": year_options(),
            "deadline": deadline,
        },
    )
