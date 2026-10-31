from datetime import date

from django.contrib import messages
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_POST

from accounts.forms import StaffTeacherForm
from accounts.models import StudentProfile, TeacherProfile, User
from academics.models import Group, GroupMembership, Homework, Submission
from academics.services import create_student
from core.decorators import director_required
from core.utils import MONTHS_UZ, money, month_name, now_year_month, parse_ym, year_options
from directors.forms import AnnouncementForm, DirectorGroupForm, DirectorStudentForm
from notifications.models import Notification
from notifications.services import notify_many
from payments.models import Payment


def _student_scope(director):
    return User.objects.filter(role=User.Roles.STUDENT).filter(
        Q(director=director) | Q(group_memberships__group__teacher__director=director)
    ).distinct()


def _month_payments(director, year, month):
    return Payment.objects.filter(teacher__director=director).filter(
        Q(paid_at__year=year, paid_at__month=month)
        | Q(paid_at__isnull=True, period_year=year, period_month=month)
    )


@director_required
def dashboard(request):
    year, month = parse_ym(request)
    teachers = User.objects.filter(role=User.Roles.TEACHER, director=request.user)
    groups = Group.objects.filter(teacher__director=request.user)
    students = _student_scope(request.user)
    payment_rows = _month_payments(request.user, year, month)
    income = payment_rows.aggregate(total=Sum("amount"))["total"] or 0
    homeworks = Homework.objects.filter(group__teacher__director=request.user)
    unchecked = Submission.objects.filter(
        homework__group__teacher__director=request.user,
        reviewed_at__isnull=True,
    ).count()
    recent_homeworks = homeworks.select_related("group", "group__teacher").annotate(
        submitted_count=Count("submissions", distinct=True),
        reviewed_count=Count("submissions", filter=Q(submissions__reviewed_at__isnull=False), distinct=True),
        waiting_count=Count("submissions", filter=Q(submissions__reviewed_at__isnull=True), distinct=True),
    )[:8]
    return render(request, "directors/dashboard.html", {
        "teachers_count": teachers.count(),
        "groups_count": groups.count(),
        "students_count": students.count(),
        "income": money(income),
        "income_raw": income,
        "unchecked_count": unchecked,
        "recent_homeworks": recent_homeworks,
        "year": year,
        "month": month,
        "month_label": month_name(month),
        "income_label": f"{month_name(month)} tushumi",
        "month_choices": list(enumerate(MONTHS_UZ, 1)),
        "years": year_options(),
    })


@director_required
def teachers(request):
    rows = User.objects.filter(role=User.Roles.TEACHER, director=request.user).annotate(
        groups_count=Count("teacher_groups", distinct=True),
        students_count=Count("teacher_groups__memberships__student", distinct=True),
    ).order_by("first_name", "last_name")
    return render(request, "directors/teachers.html", {"teachers": rows})


@director_required
def teacher_create(request):
    form = StaffTeacherForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        data = form.cleaned_data
        with transaction.atomic():
            teacher = User.objects.create_user(
                login=data["login"],
                password=data["password"],
                role=User.Roles.TEACHER,
                director=request.user,
                first_name=data["first_name"],
                last_name=data["last_name"],
                phone=data.get("phone") or "",
            )
            TeacherProfile.objects.create(user=teacher, center_name=data["center_name"], city=data["city"])
        messages.success(request, f"{teacher.full_name} o'qituvchi sifatida qo'shildi.")
        return redirect("directors:teachers")
    return render(request, "directors/form.html", {"form": form, "title": "O'qituvchi qo'shish", "back_url": reverse("directors:teachers")})


@director_required
def groups(request):
    rows = Group.objects.filter(teacher__director=request.user).select_related("teacher").annotate(
        students_count=Count("memberships", distinct=True),
        homework_count=Count("homeworks", distinct=True),
    )
    return render(request, "directors/groups.html", {"groups": rows})


@director_required
def group_create(request):
    form = DirectorGroupForm(request.POST or None, director=request.user)
    if request.method == "POST" and form.is_valid():
        group = form.save()
        messages.success(request, f"{group.name} guruhi yaratildi.")
        return redirect("directors:groups")
    return render(request, "directors/form.html", {"form": form, "title": "Guruh yaratish", "back_url": reverse("directors:groups")})


@director_required
def students(request):
    rows = _student_scope(request.user).select_related("student_profile").annotate(
        groups_count=Count("group_memberships__group", filter=Q(group_memberships__group__teacher__director=request.user), distinct=True)
    ).order_by("first_name", "last_name")
    return render(request, "directors/students.html", {"students": rows})


@director_required
def student_create(request):
    form = DirectorStudentForm(request.POST or None, director=request.user)
    if request.method == "POST" and form.is_valid():
        data = form.cleaned_data
        if not Group.objects.filter(pk=data["group"].pk, teacher__director=request.user).exists():
            messages.error(request, "Tanlangan guruh markazingizga tegishli emas.")
            return redirect("directors:student_create")
        with transaction.atomic():
            student = create_student(request.user, data)
            profile, _ = StudentProfile.objects.get_or_create(user=student)
            profile.parent_phone = data.get("parent_phone") or ""
            profile.save(update_fields=["parent_phone"])
        messages.success(request, f"{student.full_name} qo'shildi. Login: {student.login}. Parol: {data.get('password') or 'student123'}.")
        return redirect("directors:students")
    return render(request, "directors/form.html", {"form": form, "title": "O'quvchi qo'shish", "back_url": reverse("directors:students")})


@director_required
def payments(request):
    year, month = parse_ym(request)
    rows = _month_payments(request.user, year, month).select_related("student", "teacher", "group").order_by("-paid_at", "student_name")
    summary = rows.aggregate(income=Sum("amount"), students=Count("student", distinct=True))
    return render(request, "directors/payments.html", {
        "payments": rows,
        "income": money(summary["income"] or 0),
        "income_raw": summary["income"] or 0,
        "payer_count": summary["students"] or 0,
        "year": year,
        "month": month,
        "month_label": month_name(month),
        "month_choices": list(enumerate(MONTHS_UZ, 1)),
        "years": year_options(),
    })


@director_required
def reviews(request):
    rows = Homework.objects.filter(group__teacher__director=request.user).select_related("group", "group__teacher").annotate(
        expected_count=Count("group__memberships", distinct=True),
        submitted_count=Count("submissions", distinct=True),
        reviewed_count=Count("submissions", filter=Q(submissions__reviewed_at__isnull=False), distinct=True),
        unchecked_count=Count("submissions", filter=Q(submissions__reviewed_at__isnull=True), distinct=True),
    ).order_by("-created_at")
    teachers = User.objects.filter(role=User.Roles.TEACHER, director=request.user).order_by("first_name", "last_name")
    return render(request, "directors/reviews.html", {"homeworks": rows, "teachers": teachers})


@director_required
def announcements(request):
    form = AnnouncementForm(request.POST or None, director=request.user)
    if request.method == "POST" and form.is_valid():
        audience = form.cleaned_data["audience"]
        if audience == "STUDENTS_ALL":
            recipients = _student_scope(request.user)
        elif audience == "TEACHERS_ALL":
            recipients = User.objects.filter(role=User.Roles.TEACHER, director=request.user)
        elif audience == "GROUP":
            recipients = _student_scope(request.user).filter(group_memberships__group=form.cleaned_data["group"]).distinct()
        else:
            recipients = User.objects.filter(pk=form.cleaned_data["teacher"].pk, role=User.Roles.TEACHER, director=request.user)
        created = notify_many(
            recipients,
            type=Notification.Type.SYSTEM,
            title=form.cleaned_data["title"],
            body=form.cleaned_data["body"],
            dedupe_prefix=f"director:{request.user.pk}:{timezone.now().timestamp()}"
        )
        messages.success(request, f"Bildirishnoma {len(created)} nafar o'quvchiga yuborildi.")
        return redirect("directors:announcements")
    return render(request, "directors/announcements.html", {"form": form})
