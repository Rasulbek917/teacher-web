from datetime import timedelta

from django.contrib import messages
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_POST

from academics.forms import StudentSubmitForm
from academics.models import (
    Attendance,
    Group,
    GroupMembership,
    Homework,
    Material,
    Submission,
)
from academics.services import (
    attendance_pct,
    average_grade,
    homework_completion,
    student_homework_rows,
    submission_pct,
)
from accounts.models import User
from core.decorators import student_required
from core.utils import parse_ym
from notifications.models import Notification
from notifications.services import notify
from payments.services import student_month_rows


def _student_groups(user):
    return Group.objects.filter(memberships__student=user).order_by("name")


@student_required
def home(request):
    user = request.user
    today = timezone.localdate()
    groups = _student_groups(user)
    memberships = GroupMembership.objects.filter(student=user).select_related("group")
    week_start = today - timedelta(days=30)
    year, month = parse_ym(request)
    payments = student_month_rows(user, year, month)
    unpaid = [p for p in payments if p["status"] != "PAID"]
    rows = student_homework_rows(user)
    lessons_today = [g for g in groups if today.isoweekday() in g.days_list]

    context = {
        "groups": groups,
        "memberships": memberships,
        "attendance": attendance_pct(user, start=week_start),
        "avg_grade": average_grade(user),
        "submission_pct": submission_pct(user),
        "recent_rows": rows[:5],
        "homework_total": len(rows),
        "homework_done": sum(1 for r in rows if r["submission"]),
        "payments": payments,
        "unpaid_count": len(unpaid),
        "outstanding": sum(p["price"] - p["amount"] for p in unpaid),
        "lessons_today": lessons_today,
        "year": year,
        "month": month,
    }
    return render(request, "academics/student_home.html", context)


@student_required
def group_page(request):
    groups = _student_groups(request.user)
    data = []
    for group in groups:
        membership = group.memberships.filter(student=request.user).first()
        data.append(
            {
                "group": group,
                "membership": membership,
                "materials_count": group.materials.count(),
                "homeworks_count": group.homeworks.count(),
                "attendance": attendance_pct(request.user, group=group),
            }
        )
    return render(request, "academics/student_group.html", {"items": data})


@student_required
def homework_list(request):
    group_id = request.GET.get("group") or None
    group = _student_groups(request.user).filter(pk=group_id).first() if group_id else None
    rows = student_homework_rows(request.user, group=group)
    status_filter = request.GET.get("status") or ""
    if status_filter == "done":
        rows = [r for r in rows if r["submission"]]
    elif status_filter == "pending":
        rows = [r for r in rows if not r["submission"]]
    return render(
        request,
        "academics/student_homework.html",
        {
            "rows": rows,
            "groups": _student_groups(request.user),
            "group": group,
            "status_filter": status_filter,
        },
    )


@student_required
def homework_detail(request, pk):
    homework = get_object_or_404(
        Homework.objects.select_related("group").filter(
            group__memberships__student=request.user
        ),
        pk=pk,
    )
    submission = homework.submissions.filter(student=request.user).first()
    form = StudentSubmitForm(
        initial={"text": submission.text if submission else ""}
    )
    return render(
        request,
        "academics/student_homework_detail.html",
        {"homework": homework, "submission": submission, "form": form},
    )


@student_required
@require_POST
def homework_submit(request, pk):
    homework = get_object_or_404(
        Homework.objects.select_related("group").filter(
            group__memberships__student=request.user
        ),
        pk=pk,
    )
    submission = homework.submissions.filter(student=request.user).first()
    form = StudentSubmitForm(request.POST, request.FILES)
    if not form.is_valid():
        messages.error(request, "Matn yoki fayl yuboring.")
        return redirect("student:homework_detail", pk=homework.pk)

    text = form.cleaned_data.get("text") or (submission.text if submission else "")
    uploaded = form.cleaned_data.get("file")
    if submission:
        submission.text = text
        if uploaded:
            submission.file = uploaded
        submission.submitted_at = timezone.now()
        submission.reviewed_at = None
        submission.result = ""
        submission.grade = None
        submission.save()
    else:
        submission = Submission.objects.create(
            homework=homework,
            student=request.user,
            text=text,
            file=uploaded,
            submitted_at=timezone.now(),
        )

    notify(
        homework.group.teacher,
        type=Notification.Type.HOMEWORK_SUBMITTED,
        title="Yangi topshiriq",
        body=f"{request.user.full_name} — «{homework.title}» vazifasini topshirdi.",
        link=f"/teacher/homework/{homework.pk}/",
    )
    messages.success(request, "Topshiriq yuborildi.")
    return redirect("student:homework_detail", pk=homework.pk)


@student_required
def grades_page(request):
    submissions = (
        Submission.objects.filter(student=request.user)
        .select_related("homework__group")
        .order_by("-homework__created_at")
    )
    graded = [s for s in submissions if s.is_reviewed]
    avg = average_grade(request.user)
    return render(
        request,
        "academics/student_grades.html",
        {
            "submissions": submissions,
            "graded_count": len(graded),
            "avg_grade": avg,
        },
    )


@student_required
def materials_page(request):
    group_id = request.GET.get("group") or None
    materials = (
        Material.objects.filter(group__memberships__student=request.user)
        .select_related("group")
        .prefetch_related("images")
        .order_by("-created_at")
    )
    if group_id:
        materials = materials.filter(group_id=group_id)
    type_filter = request.GET.get("type") or ""
    if type_filter in ("VIDEO", "IMAGE"):
        materials = materials.filter(type=type_filter)
    return render(
        request,
        "academics/student_materials.html",
        {
            "materials": materials,
            "groups": _student_groups(request.user),
            "group_id": group_id,
            "type_filter": type_filter,
        },
    )


@student_required
def stats_page(request):
    from assessments.models import Attempt
    from django.db.models import Avg

    groups = _student_groups(request.user)
    rows = []
    for group in groups:
        homework = homework_completion(request.user, group=group, as_of=timezone.localdate())
        rows.append(
            {
                "group": group,
                "attendance": attendance_pct(request.user, group=group),
                "avg_grade": average_grade(request.user, group=group),
                "homework_total": homework["total"],
                "homework_done": homework["submitted"],
                "submission_pct": homework["percent"],
                "test_count": Attempt.objects.filter(student=request.user, test__group=group, submitted_at__isnull=False).count(),
                "test_avg": Attempt.objects.filter(student=request.user, test__group=group, submitted_at__isnull=False).aggregate(value=Avg("percentage"))["value"],
            }
        )
    test_summary = Attempt.objects.filter(student=request.user, submitted_at__isnull=False).aggregate(count=Count("id"), average=Avg("percentage"))
    today = timezone.localdate()
    recent = Attendance.objects.filter(
        student=request.user, date__gte=today - timedelta(days=29), date__lte=today
    ).select_related("group").order_by("-date", "-id")
    return render(
        request,
        "academics/student_stats.html",
        {
            "rows": rows,
            "attendance": attendance_pct(request.user, start=today - timedelta(days=29), end=today),
            "avg_grade": average_grade(request.user),
            "submission_pct": submission_pct(request.user),
            "test_count": test_summary["count"],
            "test_avg": round(test_summary["average"]) if test_summary["average"] is not None else None,
            "recent_attendance": recent,
        },
    )
