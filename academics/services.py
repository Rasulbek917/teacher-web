from datetime import date, datetime, timedelta

from django.db.models import Avg, Count, Q
from django.utils import timezone

from academics.models import Attendance, Group, GroupMembership, Homework, Submission
from accounts.models import StudentProfile, User


def next_student_login() -> str:
    last = (
        User.objects.filter(login__startswith="student")
        .extra(select={"num": "CAST(SUBSTR(login, 8) AS INTEGER)"})
        .order_by("-num")
        .values_list("num", flat=True)
        .first()
    )
    number = (last or 0) + 1
    login = f"student{number}"
    while User.objects.filter(login=login).exists():
        number += 1
        login = f"student{number}"
    return login


def create_student(teacher, data):
    from django.db import transaction

    with transaction.atomic():
        login = data.get("login") or next_student_login()
        password = data.get("password") or "student123"
        user = User.objects.create_user(
            login=login,
            password=password,
            role=User.Roles.STUDENT,
            director=(teacher if teacher.role == User.Roles.DIRECTOR else getattr(teacher, "director", None)),
            first_name=data["first_name"],
            last_name=data["last_name"],
            phone=data.get("phone") or "",
        )
        StudentProfile.objects.create(
            user=user, parent_phone=data.get("parent_phone") or ""
        )
        GroupMembership.objects.create(
            group=data["group"],
            student=user,
            custom_price=data.get("custom_price"),
        )
    return user


def attendance_pct(student, group=None, start=None, end=None):
    qs = Attendance.objects.filter(student=student)
    if group is not None:
        qs = qs.filter(group=group)
    if start:
        qs = qs.filter(date__gte=start)
    if end:
        qs = qs.filter(date__lte=end)
    total = qs.count()
    if not total:
        return None
    present = qs.filter(present=True).count()
    return round(100 * present / total)


def average_grade(student, group=None, start=None, end=None):
    qs = Submission.objects.filter(
        student=student, grade__isnull=False, reviewed_at__isnull=False
    )
    if group is not None:
        qs = qs.filter(homework__group=group)
    if start:
        qs = qs.filter(homework__created_at__date__gte=start)
    if end:
        qs = qs.filter(homework__created_at__date__lte=end)
    result = qs.aggregate(avg=Avg("grade")).get("avg")
    return round(result) if result is not None else None


def homework_completion(student, group=None, start=None, end=None, as_of=None):
    group_ids = GroupMembership.objects.filter(student=student).values_list("group_id", flat=True)
    if group is not None:
        group_ids = [group.pk] if GroupMembership.objects.filter(student=student, group=group).exists() else []
    hw = Homework.objects.filter(group_id__in=group_ids)
    due_window = Q(due_at__isnull=False)
    no_due_window = Q(due_at__isnull=True)
    if start:
        due_window &= Q(due_at__date__gte=start)
        no_due_window &= Q(created_at__date__gte=start)
    if end:
        due_window &= Q(due_at__date__lte=end)
        no_due_window &= Q(created_at__date__lte=end)
    if as_of:
        due_window &= Q(due_at__date__lte=as_of)
        no_due_window &= Q(created_at__date__lte=as_of)
    hw = hw.filter(due_window | no_due_window)
    total = hw.count()
    done = Submission.objects.filter(student=student, homework__in=hw).count()
    return {"total": total, "submitted": done, "percent": round(100 * done / total) if total else None}


def submission_pct(student, start=None, end=None, group=None):
    counts = homework_completion(student, group=group, start=start, end=end, as_of=timezone.localdate())
    return counts["percent"]


def _range_bounds(anchor: date, unit: str):
    if unit == "week":
        start = anchor - timedelta(days=anchor.weekday())
        return start, start + timedelta(days=6)
    if unit == "month":
        start = anchor.replace(day=1)
        next_month = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
        return start, next_month - timedelta(days=1)
    return anchor, anchor


def _attendance_metrics(group, start, end):
    qs = Attendance.objects.filter(group=group, date__gte=start, date__lte=end)
    total = qs.count()
    present = qs.filter(present=True).count()
    return {
        "total": total,
        "present": present,
        "absent": total - present,
        "attendance_pct": round(100 * present / total) if total else None,
    }


def _homeworks_for_period(group, start, end):
    return Homework.objects.filter(group=group).filter(
        Q(due_at__date__gte=start, due_at__date__lte=end)
        | Q(due_at__isnull=True, created_at__date__gte=start, created_at__date__lte=end)
    )


def _homework_metrics(group, start, end, homeworks=None):
    homeworks = homeworks if homeworks is not None else _homeworks_for_period(group, start, end)
    hw_count = homeworks.count()
    student_ids = group.memberships.values_list("student_id", flat=True)
    expected = hw_count * group.memberships.count()
    submissions = Submission.objects.filter(homework__in=homeworks, student_id__in=student_ids)
    submitted = submissions.count()
    graded = submissions.filter(grade__isnull=False, reviewed_at__isnull=False)
    avg = graded.aggregate(avg=Avg("grade")).get("avg")
    return {
        "homeworks": hw_count,
        "expected": expected,
        "submitted": submitted,
        "submission_pct": round(100 * submitted / expected) if expected else None,
        "avg_grade": round(avg) if avg is not None else None,
        "graded": graded.count(),
    }


def _group_student_metrics(group, start, end, homeworks):
    from assessments.models import Attempt

    homework_ids = list(homeworks.values_list("id", flat=True))
    rows = []
    for membership in group.memberships.select_related("student").order_by("student__first_name", "student__last_name"):
        attendance = Attendance.objects.filter(group=group, student=membership.student, date__gte=start, date__lte=end)
        attendance_total = attendance.count()
        attendance_present = attendance.filter(present=True).count()
        submissions = Submission.objects.filter(student=membership.student, homework_id__in=homework_ids)
        submitted = submissions.count()
        graded = submissions.filter(grade__isnull=False, reviewed_at__isnull=False)
        average = graded.aggregate(value=Avg("grade"))["value"]
        test_attempts = Attempt.objects.filter(
            student=membership.student,
            test__group=group,
            submitted_at__date__gte=start,
            submitted_at__date__lte=end,
        )
        test_average = test_attempts.aggregate(value=Avg("percentage"))["value"]
        rows.append({
            "student": membership.student,
            "attendance_total": attendance_total,
            "attendance_present": attendance_present,
            "attendance_pct": round(100 * attendance_present / attendance_total) if attendance_total else None,
            "homework_total": len(homework_ids),
            "homework_submitted": submitted,
            "homework_pct": round(100 * submitted / len(homework_ids)) if homework_ids else None,
            "graded_count": graded.count(),
            "average_grade": round(average) if average is not None else None,
            "test_attempts": test_attempts.count(),
            "test_average": round(test_average) if test_average is not None else None,
        })
    return rows


def _test_metrics(group, start, end):
    from assessments.models import Attempt

    attempts = Attempt.objects.filter(
        test__group=group,
        submitted_at__date__gte=start,
        submitted_at__date__lte=end,
    )
    average = attempts.aggregate(value=Avg("percentage"))["value"]
    return {
        "test_attempts": attempts.count(),
        "test_average": round(average) if average is not None else None,
    }


def group_stats(group: Group, anchor: date, unit: str = "week"):
    start, end = _range_bounds(anchor, unit)
    att = _attendance_metrics(group, start, end)
    homeworks = _homeworks_for_period(group, start, end)
    hw = _homework_metrics(group, start, end, homeworks)
    tests = _test_metrics(group, start, end)
    return {
        "start": start,
        "end": end,
        "totals": {**att, **hw, **tests},
        "students_count": group.memberships.count(),
        "students": _group_student_metrics(group, start, end, homeworks),
    }


def group_stats_bundle(group: Group, anchor: date):
    return {
        "week": group_stats(group, anchor, "week"),
        "month": group_stats(group, anchor, "month"),
    }


def group_grade_summary(group: Group):
    """Har bir o'quvchi bo'yicha baholangan / tekshirilmagan / o'rtacha baho."""
    students = (
        User.objects.filter(group_memberships__group=group)
        .annotate(
            graded_count=Count(
                "submissions",
                filter=Q(
                    submissions__homework__group=group,
                    submissions__reviewed_at__isnull=False,
                    submissions__grade__isnull=False,
                ),
                distinct=True,
            ),
            unchecked_count=Count(
                "submissions",
                filter=Q(
                    submissions__homework__group=group,
                    submissions__reviewed_at__isnull=True,
                ),
                distinct=True,
            ),
            avg_grade=Avg(
                "submissions__grade",
                filter=Q(
                    submissions__homework__group=group,
                    submissions__reviewed_at__isnull=False,
                ),
            ),
        )
        .order_by("first_name", "last_name")
    )
    rows = []
    for student in students:
        rows.append(
            {
                "student": student,
                "graded_count": student.graded_count,
                "unchecked_count": student.unchecked_count,
                "average_grade": round(student.avg_grade) if student.avg_grade is not None else None,
            }
        )
    return rows


def student_homework_rows(student, group=None):
    group_ids = list(
        GroupMembership.objects.filter(student=student).values_list("group_id", flat=True)
    )
    homeworks = (
        Homework.objects.filter(group_id__in=group_ids)
        .select_related("group")
        .order_by("-created_at")
    )
    if group is not None:
        homeworks = homeworks.filter(group=group)
    submissions = {
        s.homework_id: s
        for s in Submission.objects.filter(student=student, homework__in=homeworks)
    }
    rows = []
    for hw in homeworks:
        rows.append(
            {
                "homework": hw,
                "submission": submissions.get(hw.id),
                "status": _student_homework_status(hw, submissions.get(hw.id)),
            }
        )
    return rows


def _student_homework_status(homework, submission):
    if submission:
        return submission.status
    if homework.due_at and homework.due_at < timezone.now():
        return "MISSING"
    return "PENDING"


def due_lessons_soon(teacher=None, within_minutes: int = 60):
    """Bugungi darslar ichida `within_minutes` ichida boshlanadigan guruhlar."""
    now = timezone.localtime()
    weekday = now.isoweekday()
    result = []
    groups = Group.objects.annotate(students_count=Count("memberships", distinct=True))
    if teacher is not None:
        groups = groups.filter(teacher=teacher)
    for group in groups.select_related("teacher"):
        if weekday not in group.days_list:
            continue
        try:
            hour, minute = [int(x) for x in group.lesson_time.split(":")[:2]]
        except (ValueError, AttributeError):
            continue
        lesson_at = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        delta = (lesson_at - now).total_seconds() / 60
        if 0 <= delta <= within_minutes:
            result.append({"group": group, "lesson_at": lesson_at, "minutes": int(delta)})
    return result
