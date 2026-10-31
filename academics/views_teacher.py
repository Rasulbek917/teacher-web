from datetime import date, datetime, time, timedelta

from django.contrib import messages
from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_POST

from academics.forms import (
    GroupForm,
    HomeworkForm,
    MaterialForm,
    MembershipForm,
    StudentCreateForm,
    StudentEditForm,
    SubmissionReviewForm,
)
from academics.models import (
    Attendance,
    Group,
    GroupMembership,
    Homework,
    Material,
    MaterialImage,
    Submission,
)
from academics.services import (
    attendance_pct,
    create_student,
    due_lessons_soon,
    group_grade_summary,
    group_stats_bundle,
    student_homework_rows,
)
from accounts.models import StudentProfile, User
from chat.services import ensure_group_conversation, sync_group_participants
from core.decorators import teacher_required
from core.utils import month_name, now_year_month, parse_ym, year_options
from notifications.models import Notification
from notifications.services import notify
from payments.services import month_rows, rows_summary
from integrations.services import bot_link


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------


@teacher_required
def dashboard(request):
    year, month = parse_ym(request)
    rows = month_rows(request.user, year, month)
    summary = rows_summary(rows)
    paid_rows = [r for r in rows if r["status"] == "PAID"]
    partial_rows = [r for r in rows if r["status"] == "PARTIAL"]
    unpaid_rows = [r for r in rows if r["status"] == "UNPAID"]

    groups = (
        request.user.teacher_groups.annotate(
            students_count=Count("memberships", distinct=True)
        )
        .order_by("name")
    )
    students_count = (
        User.objects.filter(
            role=User.Roles.STUDENT,
            group_memberships__group__teacher=request.user,
        )
        .distinct()
        .count()
    )
    today = timezone.localdate()
    today_attendance = Attendance.objects.filter(
        group__teacher=request.user, date=today
    )
    expected = summary["income"] + summary["outstanding"]
    collection_rate = round(100 * summary["income"] / expected) if expected else 0

    context = {
        "year": year,
        "month": month,
        "month_label": month_name(month),
        "years": year_options(),
        "summary": summary,
        "paid_rows": paid_rows,
        "partial_rows": partial_rows,
        "unpaid_rows": unpaid_rows,
        "groups": groups,
        "groups_count": groups.count(),
        "students_count": students_count,
        "recent_homeworks": Homework.objects.filter(group__teacher=request.user)
        .select_related("group")
        .order_by("-created_at")[:5],
        "lessons": due_lessons_soon(request.user, within_minutes=180),
        "today_attendance": today_attendance,
        "attendance_today_present": today_attendance.filter(present=True).count(),
        "attendance_today_total": today_attendance.count(),
        "collection_rate": collection_rate,
    }
    return render(request, "academics/dashboard.html", context)


# ---------------------------------------------------------------------------
# Guruhlar
# ---------------------------------------------------------------------------


@teacher_required
def group_list(request):
    query = (request.GET.get("q") or "").strip()
    groups = (
        request.user.teacher_groups.annotate(
            students_count=Count("memberships", distinct=True),
            materials_count=Count("materials", distinct=True),
            homeworks_count=Count("homeworks", distinct=True),
        )
        .order_by("name")
    )
    if query:
        groups = groups.filter(
            Q(name__icontains=query) | Q(level__icontains=query)
        )
    return render(
        request,
        "academics/group_list.html",
        {"groups": groups, "query": query},
    )


@teacher_required
def group_create(request):
    form = GroupForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        group = form.save(commit=False)
        group.teacher = request.user
        group.save()
        ensure_group_conversation(group)
        messages.success(request, "Guruh qo'shildi.")
        return redirect("academics:group_detail", pk=group.pk)
    return render(
        request,
        "academics/group_form.html",
        {"form": form, "title": "Yangi guruh"},
    )


@teacher_required
def group_detail(request, pk):
    group = get_object_or_404(
        Group.objects.select_related("teacher"), pk=pk, teacher=request.user
    )
    memberships = group.memberships.select_related("student").order_by(
        "student__first_name"
    )
    available_students = (
        User.objects.filter(
            role=User.Roles.STUDENT,
            group_memberships__group__teacher=request.user,
        )
        .exclude(group_memberships__group=group)
        .distinct()
        .order_by("first_name", "last_name")
    )
    context = {
        "group": group,
        "memberships": memberships,
        "available_students": available_students,
        "materials_count": group.materials.count(),
        "homeworks_count": group.homeworks.count(),
        "attendance_count": group.attendance_records.count(),
        "conversation": getattr(group, "conversation", None),
    }
    return render(request, "academics/group_detail.html", context)


@teacher_required
def group_edit(request, pk):
    group = get_object_or_404(Group, pk=pk, teacher=request.user)
    form = GroupForm(request.POST or None, instance=group)
    if request.method == "POST" and form.is_valid():
        form.save()
        ensure_group_conversation(group)
        messages.success(request, "Guruh yangilandi.")
        return redirect("academics:group_detail", pk=group.pk)
    return render(
        request,
        "academics/group_form.html",
        {"form": form, "title": "Guruhni tahrirlash", "group": group},
    )


@teacher_required
@require_POST
def group_delete(request, pk):
    group = get_object_or_404(Group, pk=pk, teacher=request.user)
    name = group.name
    group.delete()
    messages.success(request, f"«{name}» guruhi o'chirildi.")
    return redirect("academics:group_list")


@teacher_required
@require_POST
def group_member_add(request, pk):
    group = get_object_or_404(Group, pk=pk, teacher=request.user)
    student_id = request.POST.get("student_id")
    custom_price = request.POST.get("custom_price") or None
    student = User.objects.filter(
        pk=student_id, role=User.Roles.STUDENT
    ).first()
    if not student:
        messages.error(request, "O'quvchi topilmadi.")
        return redirect("academics:group_detail", pk=pk)
    if GroupMembership.objects.filter(group=group, student=student).exists():
        messages.info(request, "Bu o'quvchi allaqachon guruhda.")
        return redirect("academics:group_detail", pk=pk)
    try:
        price = int(custom_price) if custom_price else None
    except (TypeError, ValueError):
        price = None
    GroupMembership.objects.create(
        group=group, student=student, custom_price=price
    )
    ensure_group_conversation(group)
    messages.success(request, f"{student.full_name} guruhga qo'shildi.")
    return redirect("academics:group_detail", pk=pk)


@teacher_required
@require_POST
def group_member_remove(request, pk, membership_id):
    group = get_object_or_404(Group, pk=pk, teacher=request.user)
    membership = get_object_or_404(GroupMembership, pk=membership_id, group=group)
    student = membership.student
    membership.delete()
    if group.conversation_id:
        sync_group_participants(group.conversation)
    messages.success(request, f"{student.full_name} guruhdan chiqarildi.")
    return redirect("academics:group_detail", pk=pk)


# ---------------------------------------------------------------------------
# O'quvchilar
# ---------------------------------------------------------------------------


@teacher_required
def student_list(request):
    query = (request.GET.get("q") or "").strip()
    group_id = request.GET.get("group") or ""
    students = (
        User.objects.filter(
            role=User.Roles.STUDENT,
            group_memberships__group__teacher=request.user,
        )
        .distinct()
        .annotate(
            groups_count=Count(
                "group_memberships",
                filter=Q(group_memberships__group__teacher=request.user),
                distinct=True,
            )
        )
        .prefetch_related("group_memberships__group")
        .order_by("first_name", "last_name")
    )
    if query:
        students = students.filter(
            Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
            | Q(phone__icontains=query)
            | Q(login__icontains=query)
        )
    if group_id:
        students = students.filter(group_memberships__group_id=group_id)

    paginator = Paginator(students, 20)
    page_obj = paginator.get_page(request.GET.get("page"))

    return render(
        request,
        "academics/student_list.html",
        {
            "page_obj": page_obj,
            "students": page_obj.object_list,
            "query": query,
            "group_id": group_id,
            "groups": request.user.teacher_groups.order_by("name"),
            "total": paginator.count,
        },
    )


@teacher_required
def student_create(request):
    form = StudentCreateForm(request.POST or None, teacher=request.user)
    if not request.user.teacher_groups.exists():
        messages.info(request, "Avval guruh yarating.")
        return redirect("academics:group_create")
    if request.method == "POST" and form.is_valid():
        student = create_student(request.user, form.cleaned_data)
        ensure_group_conversation(form.cleaned_data["group"])
        messages.success(
            request,
            f"O'quvchi qo'shildi. Login: {student.login} · Parol: "
            f"{form.cleaned_data.get('password') or 'student123'}",
        )
        return redirect("academics:student_detail", pk=student.pk)
    return render(
        request,
        "academics/student_form.html",
        {"form": form, "title": "Yangi o'quvchi"},
    )


def _teacher_student_or_404(user, pk):
    return get_object_or_404(
        User.objects.filter(
            role=User.Roles.STUDENT,
            group_memberships__group__teacher=user,
        ).distinct(),
        pk=pk,
    )


@teacher_required
def student_detail(request, pk):
    student = _teacher_student_or_404(request.user, pk)
    memberships = GroupMembership.objects.filter(
        student=student, group__teacher=request.user
    ).select_related("group")
    other_groups = GroupMembership.objects.filter(student=student).exclude(
        group__teacher=request.user
    )
    payments_count = student.student_payments.filter(teacher=request.user).count()
    available_groups = request.user.teacher_groups.exclude(
        memberships__student=student
    )
    student_profile = StudentProfile.objects.filter(user=student).first()
    context = {
        "student": student,
        "telegram_parent_link": bot_link(student_profile.telegram_link_token) if student_profile and student_profile.telegram_link_token else "",
        "memberships": memberships,
        "other_groups_count": other_groups.count(),
        "payments_count": payments_count,
        "available_groups": available_groups,
        "attendance": attendance_pct(student, start=timezone.localdate() - timedelta(days=30)),
        "rows": student_homework_rows(student)[:8],
        "membership_form": MembershipForm(teacher=request.user),
    }
    return render(request, "academics/student_detail.html", context)


@teacher_required
def student_edit(request, pk):
    student = _teacher_student_or_404(request.user, pk)
    form = StudentEditForm(request.POST or None, student=student)
    if request.method == "POST" and form.is_valid():
        data = form.cleaned_data
        with transaction.atomic():
            student.first_name = data["first_name"]
            student.last_name = data["last_name"]
            student.phone = data.get("phone") or ""
            student.login = data["login"]
            student.save()
            profile, _ = StudentProfile.objects.get_or_create(user=student)
            profile.parent_phone = data.get("parent_phone") or ""
            profile.save()
        messages.success(request, "O'quvchi ma'lumotlari yangilandi.")
        return redirect("academics:student_detail", pk=student.pk)
    return render(
        request,
        "academics/student_form.html",
        {"form": form, "title": "O'quvchini tahrirlash", "student": student},
    )


@teacher_required
@require_POST
def student_delete(request, pk):
    student = _teacher_student_or_404(request.user, pk)
    name = student.full_name
    memberships = GroupMembership.objects.filter(
        student=student, group__teacher=request.user
    ).select_related("group")
    group_ids = [m.group_id for m in memberships]
    memberships.delete()
    for group in Group.objects.filter(pk__in=group_ids):
        if hasattr(group, "conversation"):
            sync_group_participants(group.conversation)
    if not student.group_memberships.exists():
        if student.avatar:
            student.avatar.delete(save=False)
        student.delete()
        messages.success(request, f"{name} butunlay o'chirildi.")
    else:
        messages.success(
            request, f"{name} sizning guruhlaringizdan chiqarildi."
        )
    return redirect("academics:student_list")


@teacher_required
@require_POST
def student_block(request, pk):
    student = _teacher_student_or_404(request.user, pk)
    student.is_blocked = not student.is_blocked
    student.save(update_fields=["is_blocked"])
    messages.success(
        request,
        "O'quvchi bloklandi." if student.is_blocked else "Blokdan chiqarildi.",
    )
    return redirect("academics:student_detail", pk=student.pk)


@teacher_required
@require_POST
def student_reset_password(request, pk):
    student = _teacher_student_or_404(request.user, pk)
    new_password = request.POST.get("password") or "student123"
    student.set_password(new_password)
    student.token_version += 1
    student.save(update_fields=["password", "token_version"])
    messages.success(request, f"Yangi parol: {new_password}")
    return redirect("academics:student_detail", pk=student.pk)


@teacher_required
@require_POST
def student_membership_add(request, pk):
    student = _teacher_student_or_404(request.user, pk)
    group_id = request.POST.get("group_id")
    group = request.user.teacher_groups.filter(pk=group_id).first()
    if not group:
        messages.error(request, "Guruh topilmadi.")
        return redirect("academics:student_detail", pk=student.pk)
    if GroupMembership.objects.filter(group=group, student=student).exists():
        messages.info(request, "O'quvchi allaqachon bu guruhda.")
    else:
        try:
            price = int(request.POST.get("custom_price") or 0) or None
        except (TypeError, ValueError):
            price = None
        GroupMembership.objects.create(
            group=group, student=student, custom_price=price
        )
        ensure_group_conversation(group)
        messages.success(request, f"{student.full_name} «{group.name}» guruhiga qo'shildi.")
    return redirect("academics:student_detail", pk=student.pk)


@teacher_required
@require_POST
def student_membership_remove(request, pk, membership_id):
    student = _teacher_student_or_404(request.user, pk)
    membership = get_object_or_404(
        GroupMembership, pk=membership_id, student=student, group__teacher=request.user
    )
    group = membership.group
    membership.delete()
    if hasattr(group, "conversation"):
        sync_group_participants(group.conversation)
    messages.success(request, f"O'quvchi «{group.name}» guruhidan chiqarildi.")
    return redirect("academics:student_detail", pk=student.pk)


# ---------------------------------------------------------------------------
# Materiallar
# ---------------------------------------------------------------------------


@teacher_required
def material_list(request):
    query = (request.GET.get("q") or "").strip()
    group_id = request.GET.get("group") or ""
    type_filter = request.GET.get("type") or ""
    materials = (
        Material.objects.filter(group__teacher=request.user)
        .select_related("group")
        .prefetch_related("images")
        .order_by("-created_at")
    )
    if query:
        materials = materials.filter(
            Q(title__icontains=query) | Q(description__icontains=query)
        )
    if group_id:
        materials = materials.filter(group_id=group_id)
    if type_filter in ("VIDEO", "IMAGE"):
        materials = materials.filter(type=type_filter)
    paginator = Paginator(materials, 12)
    page_obj = paginator.get_page(request.GET.get("page"))
    return render(
        request,
        "academics/material_list.html",
        {
            "page_obj": page_obj,
            "materials": page_obj.object_list,
            "groups": request.user.teacher_groups.order_by("name"),
            "query": query,
            "group_id": group_id,
            "type_filter": type_filter,
            "total": paginator.count,
        },
    )


@teacher_required
def material_create(request):
    form = MaterialForm(request.POST or None, request.FILES or None, teacher=request.user)
    if request.method == "POST" and form.is_valid():
        material = form.save()
        for image in request.FILES.getlist("images"):
            MaterialImage.objects.create(material=material, file=image)
        messages.success(request, "Material qo'shildi.")
        return redirect("academics:material_list")
    return render(
        request,
        "academics/material_form.html",
        {"form": form, "title": "Yangi material"},
    )


@teacher_required
def material_edit(request, pk):
    material = get_object_or_404(
        Material.objects.select_related("group"), pk=pk, group__teacher=request.user
    )
    form = MaterialForm(
        request.POST or None, request.FILES or None, instance=material, teacher=request.user
    )
    if request.method == "POST" and form.is_valid():
        material = form.save()
        for image in request.FILES.getlist("images"):
            MaterialImage.objects.create(material=material, file=image)
        messages.success(request, "Material yangilandi.")
        return redirect("academics:material_list")
    return render(
        request,
        "academics/material_form.html",
        {"form": form, "title": "Materialni tahrirlash", "material": material},
    )


@teacher_required
@require_POST
def material_delete(request, pk):
    material = get_object_or_404(Material, pk=pk, group__teacher=request.user)
    if material.file:
        material.file.delete(save=False)
    for image in material.images.all():
        image.file.delete(save=False)
    material.delete()
    messages.success(request, "Material o'chirildi.")
    return redirect("academics:material_list")


@teacher_required
@require_POST
def material_image_delete(request, pk, image_id):
    material = get_object_or_404(Material, pk=pk, group__teacher=request.user)
    image = get_object_or_404(MaterialImage, pk=image_id, material=material)
    image.file.delete(save=False)
    image.delete()
    messages.success(request, "Rasm o'chirildi.")
    return redirect("academics:material_edit", pk=material.pk)


# ---------------------------------------------------------------------------
# Uy vazifalari
# ---------------------------------------------------------------------------


@teacher_required
def homework_list(request):
    query = (request.GET.get("q") or "").strip()
    group_id = request.GET.get("group") or ""
    homeworks = (
        Homework.objects.filter(group__teacher=request.user)
        .select_related("group")
        .order_by("-created_at")
    )
    if query:
        homeworks = homeworks.filter(
            Q(title__icontains=query) | Q(description__icontains=query)
        )
    if group_id:
        homeworks = homeworks.filter(group_id=group_id)
    paginator = Paginator(homeworks, 15)
    page_obj = paginator.get_page(request.GET.get("page"))
    return render(
        request,
        "academics/homework_list.html",
        {
            "page_obj": page_obj,
            "homeworks": page_obj.object_list,
            "groups": request.user.teacher_groups.order_by("name"),
            "query": query,
            "group_id": group_id,
            "total": paginator.count,
        },
    )


@teacher_required
def homework_create(request):
    form = HomeworkForm(request.POST or None, request.FILES or None, teacher=request.user)
    if not request.user.teacher_groups.exists():
        messages.info(request, "Avval guruh yarating.")
        return redirect("academics:group_create")
    if request.method == "POST" and form.is_valid():
        homework = form.save()
        messages.success(request, "Uy vazifasi qo'shildi.")
        return redirect("academics:homework_detail", pk=homework.pk)
    return render(
        request,
        "academics/homework_form.html",
        {"form": form, "title": "Yangi uy vazifasi"},
    )


@teacher_required
def homework_edit(request, pk):
    homework = get_object_or_404(
        Homework.objects.select_related("group"), pk=pk, group__teacher=request.user
    )
    form = HomeworkForm(
        request.POST or None, request.FILES or None, instance=homework, teacher=request.user
    )
    if request.method == "POST" and form.is_valid():
        form.save()
        messages.success(request, "Uy vazifasi yangilandi.")
        return redirect("academics:homework_detail", pk=homework.pk)
    return render(
        request,
        "academics/homework_form.html",
        {"form": form, "title": "Uy vazifasini tahrirlash", "homework": homework},
    )


@teacher_required
@require_POST
def homework_delete(request, pk):
    homework = get_object_or_404(Homework, pk=pk, group__teacher=request.user)
    if homework.attachment:
        homework.attachment.delete(save=False)
    for submission in homework.submissions.all():
        if submission.file:
            submission.file.delete(save=False)
    homework.delete()
    messages.success(request, "Uy vazifasi o'chirildi.")
    return redirect("academics:homework_list")


@teacher_required
def homework_detail(request, pk):
    homework = get_object_or_404(
        Homework.objects.select_related("group"), pk=pk, group__teacher=request.user
    )
    submissions = {
        s.student_id: s for s in homework.submissions.select_related("student")
    }
    rows = []
    for membership in homework.group.memberships.select_related("student").order_by(
        "student__first_name"
    ):
        rows.append(
            {
                "student": membership.student,
                "submission": submissions.get(membership.student_id),
            }
        )
    context = {
        "homework": homework,
        "rows": rows,
        "submitted_count": len(submissions),
        "reviewed_count": sum(1 for s in submissions.values() if s.is_reviewed),
        "review_form": SubmissionReviewForm(),
    }
    return render(request, "academics/homework_detail.html", context)


@teacher_required
@require_POST
def submission_review(request, pk):
    submission = get_object_or_404(
        Submission.objects.select_related("homework__group", "student"),
        pk=pk,
        homework__group__teacher=request.user,
    )
    form = SubmissionReviewForm(request.POST)
    next_url = request.POST.get("next") or reverse(
        "academics:homework_detail", args=[submission.homework_id]
    )
    if form.is_valid():
        submission.grade = form.cleaned_data["grade"]
        submission.comment = form.cleaned_data.get("comment") or ""
        submission.result = (
            Submission.Result.DONE
            if submission.grade >= 60
            else Submission.Result.WRONG
        )
        submission.reviewed_at = timezone.now()
        submission.save()
        notify(
            submission.student,
            type=Notification.Type.HOMEWORK_REVIEWED,
            title="Uy vazifangiz tekshirildi",
            body=f"{submission.homework.title}: {submission.grade}/100 baho.",
            link="/student/homework/",
        )
        messages.success(request, "Baho saqlandi.")
    else:
        messages.error(request, "Baho 0–100 oralig'ida bo'lishi kerak.")
    return redirect(next_url)


# ---------------------------------------------------------------------------
# Davomat
# ---------------------------------------------------------------------------


@teacher_required
def attendance(request):
    groups = request.user.teacher_groups.order_by("name")
    group_id = request.GET.get("group") or None
    group = groups.filter(pk=group_id).first() if group_id else groups.first()
    try:
        day = date.fromisoformat(request.GET.get("date") or str(timezone.localdate()))
    except ValueError:
        day = timezone.localdate()

    rows = []
    if group:
        existing = {
            a.student_id: a
            for a in Attendance.objects.filter(group=group, date=day)
        }
        for membership in group.memberships.select_related("student").order_by(
            "student__first_name"
        ):
            record = existing.get(membership.student_id)
            rows.append(
                {
                    "student": membership.student,
                    "record": record,
                    "present": record.present if record else None,
                }
            )

    return render(
        request,
        "academics/attendance.html",
        {
            "groups": groups,
            "group": group,
            "day": day,
            "rows": rows,
            "present_count": sum(1 for r in rows if r["present"] is True),
            "absent_count": sum(1 for r in rows if r["present"] is False),
        },
    )


@teacher_required
@require_POST
def attendance_mark(request):
    group = get_object_or_404(
        Group, pk=request.POST.get("group"), teacher=request.user
    )
    try:
        day = date.fromisoformat(request.POST.get("date") or str(timezone.localdate()))
    except ValueError:
        day = timezone.localdate()

    if request.POST.get("action") == "all_present":
        for membership in group.memberships.select_related("student"):
            Attendance.objects.update_or_create(
                group=group,
                student=membership.student,
                date=day,
                defaults={"present": True},
            )
        messages.success(request, "Barcha o'quvchilar «keldi» deb belgilandi.")
        return redirect(
            f"{reverse('academics:attendance')}?group={group.pk}&date={day}"
        )

    student = get_object_or_404(
        User, pk=request.POST.get("student_id"), role=User.Roles.STUDENT
    )
    if not group.memberships.filter(student=student).exists():
        messages.error(request, "O'quvchi bu guruhda emas.")
        return redirect(f"{reverse('academics:attendance')}?group={group.pk}&date={day}")

    present = request.POST.get("present") == "1"
    old = Attendance.objects.filter(group=group, student=student, date=day).first()
    Attendance.objects.update_or_create(
        group=group,
        student=student,
        date=day,
        defaults={"present": present},
    )
    if not present and (old is None or old.present):
        try:
            profile = student.student_profile
            if profile.parent_telegram_chat_id:
                from integrations.services import telegram_send
                telegram_send(profile.parent_telegram_chat_id, f"{student.full_name} bugun {group.name} darsiga kelmadi ({day.strftime('%d.%m.%Y')}).")
        except Exception:
            pass
    return redirect(f"{reverse('academics:attendance')}?group={group.pk}&date={day}")


# ---------------------------------------------------------------------------
# Baholar
# ---------------------------------------------------------------------------


@teacher_required
def grades(request):
    group_id = request.GET.get("group") or None
    groups = request.user.teacher_groups.order_by("name")
    group = groups.filter(pk=group_id).first() if group_id else groups.first()
    only_unchecked = request.GET.get("unchecked") == "1"
    summary = group_grade_summary(group) if group else []
    if only_unchecked:
        summary = [row for row in summary if row["unchecked_count"] > 0]
    context = {
        "groups": groups,
        "group": group,
        "summary": summary,
        "only_unchecked": only_unchecked,
    }
    return render(request, "academics/grades.html", context)


@teacher_required
def grade_student(request, pk):
    student = _teacher_student_or_404(request.user, pk)
    group_id = request.GET.get("group") or None
    group = request.user.teacher_groups.filter(pk=group_id).first() if group_id else None
    rows = student_homework_rows(student, group=group)
    return render(
        request,
        "academics/grade_student.html",
        {
            "student": student,
            "group": group,
            "rows": rows,
            "review_form": SubmissionReviewForm(),
        },
    )


# ---------------------------------------------------------------------------
# Statistika
# ---------------------------------------------------------------------------


@teacher_required
def statistics(request):
    groups = request.user.teacher_groups.order_by("name")
    group_id = request.GET.get("group") or None
    group = groups.filter(pk=group_id).first() if group_id else groups.first()
    try:
        anchor = date.fromisoformat(
            request.GET.get("date") or str(timezone.localdate())
        )
    except ValueError:
        anchor = timezone.localdate()
    unit = request.GET.get("unit") if request.GET.get("unit") in ("week", "month") else "week"
    bundle = group_stats_bundle(group, anchor) if group else None
    return render(
        request,
        "academics/statistics.html",
        {
            "groups": groups,
            "group": group,
            "anchor": anchor,
            "unit": unit,
            "bundle": bundle,
            "data": bundle[unit] if bundle else None,
        },
    )
