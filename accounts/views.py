from datetime import timedelta

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.forms import PasswordChangeForm
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.db.models import Count, Sum
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_POST

from accounts.forms import (
    LoginForm,
    PreferencesForm,
    ProfileForm,
    StaffTeacherForm,
    TeacherRegisterForm,
)
from accounts.models import LoginAttempt, TeacherProfile, User
from core.decorators import staff_required, teacher_required
from core.utils import money, now_year_month


def _client_ip(request) -> str:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def login_view(request):
    if request.user.is_authenticated:
        return redirect("core:home")

    form = LoginForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        login_name = form.cleaned_data["login"]
        password = form.cleaned_data["password"]
        key = f"{_client_ip(request)}:{login_name}"

        attempt, _ = LoginAttempt.objects.get_or_create(key=key)
        now = timezone.now()
        if attempt.blocked_until and attempt.blocked_until > now:
            minutes = max(1, int((attempt.blocked_until - now).total_seconds() // 60) + 1)
            messages.error(request, f"Juda ko'p urinish. {minutes} daqiqadan keyin qayta urinib ko'ring.")
            return render(request, "accounts/login.html", {"form": form})

        user = authenticate(request, username=login_name, password=password)
        if user is None:
            attempt.failures += 1
            if attempt.failures >= settings.LOGIN_MAX_ATTEMPTS:
                attempt.blocked_until = now + timedelta(minutes=settings.LOGIN_BLOCK_MINUTES)
                attempt.failures = 0
            attempt.save()
            messages.error(request, "Login yoki parol noto'g'ri.")
            return render(request, "accounts/login.html", {"form": form})

        if not user.can_login():
            messages.error(request, "Akkaunt bloklangan yoki faol emas.")
            return render(request, "accounts/login.html", {"form": form})

        attempt.delete()
        login(request, user)
        messages.success(request, f"Xush kelibsiz, {user.first_name}!")
        return redirect("core:home")

    return render(request, "accounts/login.html", {"form": form})


def logout_view(request):
    logout(request)
    return redirect("accounts:login")


@require_POST
def logout_post(request):
    logout(request)
    return redirect("accounts:login")


def register_view(request):
    if request.user.is_authenticated:
        return redirect("core:home")

    form = TeacherRegisterForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        data = form.cleaned_data
        with transaction.atomic():
            user = User.objects.create_user(
                login=data["login"],
                password=data["password1"],
                role=User.Roles.TEACHER,
                first_name=data["first_name"],
                last_name=data["last_name"],
                phone=data["phone"],
            )
            TeacherProfile.objects.create(
                user=user,
                center_name=data["center_name"],
                city=data["city"],
            )
        login(request, user)
        messages.success(request, "Ro'yxatdan o'tdingiz. O'quv markazingizga xush kelibsiz!")
        return redirect("core:home")

    return render(request, "accounts/register.html", {"form": form})


@login_required
def settings_view(request):
    profile_form = ProfileForm(instance=request.user)
    prefs_form = PreferencesForm(instance=request.user)
    password_form = PasswordChangeForm(user=request.user)
    from core.forms import style_form

    style_form(password_form)
    active_tab = request.GET.get("tab", "profile")

    if request.method == "POST":
        action = request.POST.get("action")
        if action == "profile":
            profile_form = ProfileForm(request.POST, request.FILES, instance=request.user)
            if profile_form.is_valid():
                profile_form.save()
                messages.success(request, "Profil yangilandi.")
                return redirect("accounts:settings")
            active_tab = "profile"
        elif action == "preferences":
            prefs_form = PreferencesForm(request.POST, instance=request.user)
            if prefs_form.is_valid():
                prefs_form.save()
                messages.success(request, "Sozlamalar saqlandi.")
                return redirect("accounts:settings")
            active_tab = "preferences"
        elif action == "password":
            password_form = PasswordChangeForm(user=request.user, data=request.POST)
            style_form(password_form)
            if password_form.is_valid():
                user = password_form.save()
                user.token_version += 1
                user.save(update_fields=["token_version"])
                update_session_auth_hash(request, user)
                messages.success(request, "Parol o'zgartirildi.")
                return redirect("accounts:settings")
            active_tab = "password"

    return render(
        request,
        "accounts/settings.html",
        {
            "profile_form": profile_form,
            "prefs_form": prefs_form,
            "password_form": password_form,
            "active_tab": active_tab,
        },
    )


# ---------------------------------------------------------------------------
# Super Admin — o'qituvchilar boshqaruvi
# ---------------------------------------------------------------------------


@login_required
@require_POST
def toggle_theme(request):
    from django.http import JsonResponse

    request.user.theme = (
        User.Theme.DARK if request.user.theme == User.Theme.LIGHT else User.Theme.LIGHT
    )
    request.user.save(update_fields=["theme"])
    return JsonResponse({"theme": request.user.theme})


@staff_required
def staff_dashboard(request):
    year, month = now_year_month()
    teachers = User.objects.filter(role=User.Roles.TEACHER)
    directors = User.objects.filter(role=User.Roles.DIRECTOR)
    groups_count = sum(t.teacher_groups.count() for t in teachers)
    students_count = User.objects.filter(role=User.Roles.STUDENT).count()
    income = (
        User.objects.filter(role=User.Roles.TEACHER)
        .aggregate(total=Sum("teacher_payments__amount"))
        .get("total")
        or 0
    )
    context = {
        "teachers_count": teachers.count(),
        "directors_count": directors.count(),
        "groups_count": groups_count,
        "students_count": students_count,
        "income": money(income),
        "recent_teachers": teachers.order_by("-date_joined")[:6],
        "recent_directors": directors.order_by("-date_joined")[:6],
        "year": year,
        "month": month,
    }
    return render(request, "staff/dashboard.html", context)


@staff_required
def teacher_list(request):
    query = (request.GET.get("q") or "").strip()
    teachers = (
        User.objects.filter(role=User.Roles.TEACHER)
        .select_related("teacher_profile")
        .annotate(groups_count=Count("teacher_groups", distinct=True))
        .order_by("first_name", "last_name")
    )
    if query:
        from django.db.models import Q

        teachers = teachers.filter(
            Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
            | Q(login__icontains=query)
            | Q(phone__icontains=query)
            | Q(teacher_profile__center_name__icontains=query)
        )
    return render(
        request,
        "staff/teacher_list.html",
        {"teachers": teachers, "query": query},
    )


@staff_required
def teacher_create(request):
    form = StaffTeacherForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        data = form.cleaned_data
        with transaction.atomic():
            user = User.objects.create_user(
                login=data["login"],
                password=data["password"],
                role=User.Roles.TEACHER,
                first_name=data["first_name"],
                last_name=data["last_name"],
                phone=data.get("phone") or "",
            )
            TeacherProfile.objects.create(
                user=user, center_name=data["center_name"], city=data["city"]
            )
        messages.success(request, "O'qituvchi qo'shildi.")
        return redirect("staff:staff_teachers")
    return render(
        request,
        "staff/teacher_form.html",
        {"form": form, "title": "Yangi o'qituvchi", "is_create": True},
    )


@staff_required
def teacher_detail(request, pk):
    teacher = get_object_or_404(
        User.objects.select_related("teacher_profile"),
        pk=pk,
        role=User.Roles.TEACHER,
    )
    groups = teacher.teacher_groups.annotate(students_count=Count("memberships"))
    return render(
        request,
        "staff/teacher_detail.html",
        {"teacher": teacher, "groups": groups},
    )


@staff_required
def teacher_edit(request, pk):
    teacher = get_object_or_404(User, pk=pk, role=User.Roles.TEACHER)
    form = StaffTeacherForm(request.POST or None, instance=teacher)
    if request.method == "POST" and form.is_valid():
        data = form.cleaned_data
        with transaction.atomic():
            teacher.first_name = data["first_name"]
            teacher.last_name = data["last_name"]
            teacher.phone = data.get("phone") or ""
            teacher.login = data["login"]
            if data.get("password"):
                teacher.set_password(data["password"])
                teacher.token_version += 1
            teacher.save()
            TeacherProfile.objects.update_or_create(
                user=teacher,
                defaults={"center_name": data["center_name"], "city": data["city"]},
            )
        messages.success(request, "O'qituvchi yangilandi.")
        return redirect("staff:staff_teacher_detail", pk=teacher.pk)
    return render(
        request,
        "staff/teacher_form.html",
        {"form": form, "title": "O'qituvchini tahrirlash", "is_create": False, "teacher": teacher},
    )


@staff_required
@require_POST
def teacher_delete(request, pk):
    teacher = get_object_or_404(User, pk=pk, role=User.Roles.TEACHER)
    name = teacher.full_name
    teacher.delete()
    messages.success(request, f"{name} o'chirildi.")
    return redirect("staff:staff_teachers")


@staff_required
@require_POST
def teacher_toggle_block(request, pk):
    teacher = get_object_or_404(User, pk=pk, role=User.Roles.TEACHER)
    teacher.is_blocked = not teacher.is_blocked
    teacher.save(update_fields=["is_blocked"])
    messages.success(
        request,
        "O'qituvchi bloklandi." if teacher.is_blocked else "Blokdan chiqarildi.",
    )
    return redirect("staff:staff_teacher_detail", pk=teacher.pk)
