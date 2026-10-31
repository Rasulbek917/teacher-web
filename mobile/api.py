"""Token-authenticated JSON endpoints for the native TeacherWeb app."""

from __future__ import annotations

import json
from datetime import date, timedelta
from functools import wraps

from django.contrib.auth import authenticate
from django.core import signing
from django.db import transaction
from django.db.models import Avg, Count, Q, Sum
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from accounts.models import LoginAttempt, StudentProfile, TeacherProfile, User
from academics.models import Attendance, Group, GroupMembership, Homework, Material, Submission
from academics.services import average_grade, attendance_pct, create_student, student_homework_rows
from assessments.models import Answer, Attempt, Option, Question, Test, TestShare, AiChatMessage, AiConversation
from chat.models import Conversation, ConversationParticipant, Message
from chat.services import assert_participant, ensure_group_conversation, send_message, user_conversations
from notifications.models import Notification
from notifications.services import notify, notify_many
from payments.models import Payment
from payments.services import mark_paid, month_rows, rows_summary, student_month_rows


TOKEN_SALT = "teacherweb.native.v1"
TOKEN_MAX_AGE = 60 * 60 * 24 * 30


def _json(request):
    try:
        value = json.loads(request.body or b"{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    return value if isinstance(value, dict) else None


def _ok(data=None, **extra):
    return JsonResponse({"ok": True, "data": data, **extra})


def _error(message, status=400):
    return JsonResponse({"ok": False, "error": str(message)}, status=status)


def _user_payload(user):
    return {
        "id": user.pk,
        "login": user.login,
        "name": user.full_name,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": user.role,
        "phone": user.phone,
        "language": user.language,
        "theme": user.theme,
    }


def _current_user(request):
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    try:
        payload = signing.loads(header[7:].strip(), salt=TOKEN_SALT, max_age=TOKEN_MAX_AGE)
        user = User.objects.filter(pk=payload.get("id"), is_active=True, is_blocked=False).first()
        if user and user.token_version == payload.get("v"):
            return user
    except (signing.BadSignature, signing.SignatureExpired, TypeError, ValueError):
        return None
    return None


def _authenticated(view):
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        request.mobile_user = _current_user(request)
        if request.mobile_user is None:
            return _error("Sessiya tugagan. Qayta kiring.", 401)
        return view(request, *args, **kwargs)
    return wrapper


@csrf_exempt
@require_http_methods(["POST"])
def login(request):
    data = _json(request)
    if data is None:
        return _error("So‘rov ma’lumoti noto‘g‘ri.")
    username = str(data.get("login", "")).strip().lower()[:64]
    password = str(data.get("password", ""))
    if not username or not password:
        return _error("Login va parolni kiriting.")

    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    ip = forwarded.split(",", 1)[0].strip() if forwarded else request.META.get("REMOTE_ADDR", "")
    attempt, _ = LoginAttempt.objects.get_or_create(key=f"{ip}:{username}")
    now = timezone.now()
    if attempt.blocked_until and attempt.blocked_until > now:
        return _error("Kirish vaqtincha bloklangan. Keyinroq urinib ko‘ring.", 429)
    user = authenticate(request, username=username, password=password)
    if user is None or not user.can_login():
        attempt.failures += 1
        if attempt.failures >= 5:
            from datetime import timedelta
            attempt.blocked_until = now + timedelta(minutes=5)
            attempt.failures = 0
        attempt.save()
        return _error("Login yoki parol noto‘g‘ri.", 401)
    attempt.delete()
    token = signing.dumps({"id": user.pk, "v": user.token_version}, salt=TOKEN_SALT)
    return _ok({"token": token, "user": _user_payload(user)})


@require_http_methods(["POST"])
@_authenticated
def logout(request):
    return _ok({"message": "Chiqildi."})


def _groups(user):
    if user.role == User.Roles.SUPER_ADMIN:
        return Group.objects.all()
    if user.role == User.Roles.DIRECTOR:
        return Group.objects.filter(teacher__director=user)
    if user.role == User.Roles.TEACHER:
        return Group.objects.filter(teacher=user)
    return Group.objects.filter(memberships__student=user)


def _students(user):
    qs = User.objects.filter(role=User.Roles.STUDENT)
    if user.role == User.Roles.SUPER_ADMIN:
        return qs
    if user.role == User.Roles.DIRECTOR:
        return qs.filter(Q(director=user) | Q(group_memberships__group__teacher__director=user)).distinct()
    if user.role == User.Roles.TEACHER:
        return qs.filter(group_memberships__group__teacher=user).distinct()
    return qs.filter(pk=user.pk)


def _groups_payload(user):
    rows = _groups(user).select_related("teacher").annotate(student_count=Count("memberships", distinct=True)).order_by("name")[:200]
    return [{"id": g.pk, "name": g.name, "level": g.level, "teacher": g.teacher.full_name, "teacher_id": g.teacher_id,
             "students": g.student_count, "days": g.days_label, "time": g.lesson_time, "price": g.monthly_price}
            for g in rows]


def _dashboard(user):
    today = timezone.localdate()
    if user.role == User.Roles.STUDENT:
        rows = student_homework_rows(user)
        payments = student_month_rows(user, today.year, today.month)
        return {"groups": _groups(user).count(), "homework_total": len(rows),
                "homework_done": sum(bool(row.get("submission")) for row in rows),
                "attendance": attendance_pct(user, start=today.replace(day=1)),
                "average_grade": average_grade(user),
                "unpaid": sum(1 for p in payments if p.get("status") != "PAID")}
    if user.role == User.Roles.TEACHER:
        groups = _groups(user)
        rows = month_rows(user, today.year, today.month)
        summary = rows_summary(rows)
        attendance = Attendance.objects.filter(group__teacher=user, date=today)
        return {"groups": groups.count(), "students": _students(user).count(),
                "homeworks": Homework.objects.filter(group__teacher=user).count(),
                "income": summary["income"], "outstanding": summary["outstanding"],
                "attendance_present": attendance.filter(present=True).count(), "attendance_total": attendance.count()}
    if user.role == User.Roles.DIRECTOR:
        teachers = User.objects.filter(role=User.Roles.TEACHER, director=user)
        payments = Payment.objects.filter(teacher__director=user, period_year=today.year, period_month=today.month)
        return {"teachers": teachers.count(), "groups": _groups(user).count(), "students": _students(user).count(),
                "income": payments.aggregate(value=Sum("amount"))["value"] or 0,
                "unchecked": Submission.objects.filter(homework__group__teacher__director=user, reviewed_at__isnull=True).count()}
    return {"directors": User.objects.filter(role=User.Roles.DIRECTOR).count(),
            "teachers": User.objects.filter(role=User.Roles.TEACHER).count(),
            "students": User.objects.filter(role=User.Roles.STUDENT).count(),
            "groups": Group.objects.count()}


def _sections(role):
    sections = {
        "SUPER_ADMIN": ["dashboard", "staff", "groups", "students", "notifications", "settings"],
        "DIRECTOR": ["dashboard", "teachers", "groups", "students", "homework", "payments", "reviews", "announcements", "notifications", "chats", "settings"],
        "TEACHER": ["dashboard", "groups", "students", "homework", "attendance", "grades", "materials", "payments", "tests", "assistant", "chats", "notifications", "settings"],
        "STUDENT": ["dashboard", "groups", "homework", "grades", "materials", "tests", "payments", "chats", "notifications", "settings"],
    }
    return sections.get(role, ["dashboard", "settings"])


@require_http_methods(["GET"])
@_authenticated
def bootstrap(request):
    user = request.mobile_user
    return _ok({"user": _user_payload(user), "sections": _sections(user.role),
                "dashboard": _dashboard(user),
                "unread_notifications": user.notifications.filter(is_read=False).count()})


def _section_payload(user, name):
    today = timezone.localdate()
    if name == "dashboard":
        return {"metrics": _dashboard(user), "groups": _groups_payload(user)[:6]}
    if name in {"groups", "teachers", "staff"}:
        if name == "teachers":
            qs = User.objects.filter(role=User.Roles.TEACHER)
            if user.role == User.Roles.DIRECTOR:
                qs = qs.filter(director=user)
            elif user.role == User.Roles.TEACHER:
                qs = qs.filter(pk=user.pk)
            elif user.role == User.Roles.STUDENT:
                qs = qs.filter(pk__in=_groups(user).values("teacher_id"))
            rows = [{"id": x.pk, "title": x.full_name, "subtitle": x.phone, "login": x.login} for x in qs.order_by("first_name")[:200]]
            return {"items": rows, "title": "O‘qituvchilar"}
        if name == "staff":
            qs = User.objects.filter(role__in=[User.Roles.DIRECTOR, User.Roles.TEACHER])
            rows = [{"id": x.pk, "title": x.full_name, "subtitle": x.get_role_display(), "login": x.login} for x in qs.order_by("role", "first_name")[:300]]
            return {"items": rows, "title": "Direktorlar va o‘qituvchilar", "groups": _groups_payload(user)}
        result = {"items": _groups_payload(user), "title": "Guruhlar"}
        if user.role == User.Roles.DIRECTOR:
            result["teachers"] = [{"id": t.pk, "title": t.full_name} for t in User.objects.filter(role=User.Roles.TEACHER, director=user).order_by("first_name")]
        return result
    if name == "students":
        rows = _students(user).select_related("student_profile").order_by("first_name", "last_name")[:500]
        return {"items": [{"id": s.pk, "title": s.full_name, "subtitle": s.phone,
                            "groups": list(_groups(user).filter(memberships__student=s).values_list("name", flat=True)),
                            "blocked": s.is_blocked} for s in rows], "title": "O‘quvchilar", "groups": _groups_payload(user)}
    if name == "homework":
        if user.role == User.Roles.STUDENT:
            items = []
            for row in student_homework_rows(user):
                hw = row["homework"]
                submission = row.get("submission")
                items.append({"id": hw.pk, "title": hw.title, "subtitle": hw.group.name,
                              "description": hw.description, "due": hw.due_at.isoformat() if hw.due_at else "",
                              "status": submission.status_label if submission else "Kutilmoqda",
                              "submission_id": submission.pk if submission else None,
                              "grade": submission.grade if submission else None})
            return {"items": items, "title": "Uy vazifalari", "groups": _groups_payload(user)}
        qs = Homework.objects.filter(group__in=_groups(user)).select_related("group").annotate(
            submitted=Count("submissions", distinct=True), unchecked=Count("submissions", filter=Q(submissions__reviewed_at__isnull=True), distinct=True)
        )
        return {"items": [{"id": h.pk, "title": h.title, "subtitle": h.group.name, "description": h.description,
                            "due": h.due_at.isoformat() if h.due_at else "", "submitted": h.submitted,
                            "unchecked": h.unchecked, "students": h.group.memberships.count()} for h in qs[:300]],
                "title": "Uy vazifalari", "groups": _groups_payload(user)}
    if name == "attendance":
        return {"items": [], "groups": _groups_payload(user), "date": today.isoformat(), "title": "Davomat"}
    if name == "grades":
        qs = Submission.objects.filter(homework__group__in=_groups(user)).select_related("student", "homework__group").order_by("-submitted_at")
        if user.role == User.Roles.STUDENT:
            qs = qs.filter(student=user)
        return {"items": [{"id": s.pk, "title": s.student.full_name, "subtitle": s.homework.title,
                            "group": s.homework.group.name, "text": s.text, "grade": s.grade,
                            "status": s.status_label, "comment": s.comment,
                            "student_id": s.student_id, "homework_id": s.homework_id} for s in qs[:300]], "title": "Baholar"}
    if name == "materials":
        qs = Material.objects.filter(group__in=_groups(user)).select_related("group").order_by("-created_at")
        return {"items": [{"id": m.pk, "title": m.title, "subtitle": m.group.name,
                            "description": m.description, "type": m.type,
                            "url": m.youtube_url or m.external_file_url or (m.file.url if m.file else "")}
                           for m in qs[:300]], "title": "Dars materiallari", "groups": _groups_payload(user)}
    if name == "payments":
        if user.role == User.Roles.STUDENT:
            rows = student_month_rows(user, today.year, today.month)
            return {"items": [{"id": p.get("payment").pk if p.get("payment") else 0,
                                "title": p["group"].name, "subtitle": p["group"].teacher.full_name,
                                "status": p["status"], "price": p["price"], "amount": p["amount"]} for p in rows], "title": "To‘lovlar"}
        if user.role == User.Roles.TEACHER:
            rows = month_rows(user, today.year, today.month)
            return {"items": [{"id": row["payment_id"] or 0, "title": row["student"].full_name,
                                "subtitle": row["group"].name, "status": row["status"], "price": row["price"],
                                "amount": row["amount"], "student_id": row["student"].pk, "group_id": row["group"].pk}
                               for row in rows], "summary": rows_summary(rows), "groups": _groups_payload(user), "title": "To‘lovlar"}
        qs = Payment.objects.filter(teacher__in=User.objects.filter(pk__in=Group.objects.filter(pk__in=_groups(user)).values("teacher_id"))) if user.role == User.Roles.DIRECTOR else Payment.objects.all()
        return {"items": [{"id": p.pk, "title": p.student_name, "subtitle": p.group_name,
                            "status": p.status, "price": p.price_snapshot, "amount": p.amount} for p in qs.order_by("-period_year", "-period_month")[:300]], "title": "To‘lovlar"}
    if name == "notifications":
        qs = user.notifications.all()[:200]
        return {"items": [{"id": n.pk, "title": n.title, "subtitle": n.body, "read": n.is_read,
                            "created": n.created_at.isoformat(), "link": n.link} for n in qs], "title": "Bildirishnomalar"}
    if name == "chats":
        rows = user_conversations(user)
        from chat.services import contacts_for
        contacts = contacts_for(user)
        return {"items": [{"id": c.pk, "title": c.title, "subtitle": c.last_message().text[:120] if c.last_message() else "Suhbatni boshlang",
                            "unread": c.unread_for(user), "group": c.group_id} for c in rows[:200]],
                "contacts": [{"id": c.pk, "title": c.full_name, "subtitle": c.get_role_display()} for c in contacts[:200]], "title": "Xabarlar"}
    if name == "tests":
        if user.role == User.Roles.STUDENT:
            qs = TestShare.objects.filter(test__group__in=_groups(user), is_active=True, test__status=Test.Status.PUBLISHED).select_related("test", "test__group")
            items = [{"id": s.test_id, "title": s.test.title, "subtitle": s.test.group.name if s.test.group else s.test.subject,
                      "share_id": s.pk, "questions": s.test.questions.count(),
                      "attempted": Attempt.objects.filter(share=s, student=user, submitted_at__isnull=False).exists(),
                      "minutes": s.time_limit_minutes or 0} for s in qs]
        else:
            qs = Test.objects.filter(Q(owner=user) | Q(collaborators__user=user)) if user.role != User.Roles.SUPER_ADMIN else Test.objects.all()
            items = [{"id": t.pk, "title": t.title, "subtitle": t.subject or t.topic, "status": t.status,
                      "questions": t.questions.count(), "group": t.group.name if t.group else ""} for t in qs.distinct()[:200]]
        return {"items": items, "title": "Testlar", "groups": _groups_payload(user)}
    if name == "assistant":
        if user.role not in {User.Roles.TEACHER, User.Roles.SUPER_ADMIN}:
            return {"items": [], "title": "AI yordamchi"}
        return {"items": [{"id": c.pk, "title": c.title, "subtitle": c.selected_student.full_name if c.selected_student else "Umumiy chat",
                            "pinned": c.is_pinned, "messages": c.messages.count()} for c in user.ai_conversations.all()[:100]], "title": "AI yordamchi",
                "students": [{"id": s.pk, "title": s.full_name} for s in _students(user)[:300]]}
    if name == "reviews":
        qs = Homework.objects.filter(group__in=_groups(user)).select_related("group").annotate(unchecked=Count("submissions", filter=Q(submissions__reviewed_at__isnull=True), distinct=True))
        return {"items": [{"id": h.pk, "title": h.title, "subtitle": h.group.name, "unchecked": h.unchecked} for h in qs[:200]], "title": "Tekshiruvlar"}
    if name == "announcements":
        teachers = User.objects.filter(role=User.Roles.TEACHER, director=user).order_by("first_name") if user.role == User.Roles.DIRECTOR else User.objects.none()
        return {"items": [], "title": "E’lonlar", "groups": _groups_payload(user),
                "teachers": [{"id": t.pk, "title": t.full_name} for t in teachers]}
    if name == "settings":
        return {"user": _user_payload(user), "title": "Sozlamalar"}
    return {"items": [], "title": name}


@require_http_methods(["GET"])
@_authenticated
def section(request, name):
    if name not in _sections(request.mobile_user.role):
        return _error("Bu bo‘limga ruxsat yo‘q.", 403)
    data = _section_payload(request.mobile_user, name)
    user = request.mobile_user
    if name == "chats" and request.GET.get("conversation"):
        conv = user_conversations(user).filter(pk=request.GET.get("conversation")).first()
        if not conv or not assert_participant(conv, user):
            return _error("Suhbat topilmadi.", 404)
        from chat.services import mark_read
        mark_read(conv, user)
        data["conversation"] = {"id": conv.pk, "title": conv.title, "pending": bool(conv.pending_action)}
        data["messages"] = [{"id": m.pk, "sender": m.sender.full_name, "mine": m.sender_id == user.pk,
                              "text": m.text, "created": m.created_at.isoformat()} for m in
                             conv.messages.select_related("sender").order_by("id")[-200:]]
    if name == "assistant" and request.GET.get("conversation"):
        conv = user.ai_conversations.filter(pk=request.GET.get("conversation")).first()
        if not conv:
            return _error("AI chat topilmadi.", 404)
        data["conversation"] = {"id": conv.pk, "title": conv.title}
        data["messages"] = [{"id": m.pk, "role": m.role, "content": m.content, "created": m.created_at.isoformat()}
                             for m in conv.messages.order_by("created_at", "id")[-200:]]
    if name == "tests" and user.role == User.Roles.STUDENT and request.GET.get("share"):
        share = TestShare.objects.filter(pk=request.GET.get("share"), test__group__in=_groups(user)).first()
        if not share or not share.available():
            return _error("Test mavjud emas.", 404)
        data["test"] = {"id": share.test_id, "title": share.test.title}
        data["questions"] = [{"id": q.pk, "text": q.text,
                               "options": [{"id": o.pk, "text": o.text} for o in q.options.all()]}
                              for q in share.test.questions.prefetch_related("options")]
    if name == "attendance":
        group_id = request.GET.get("group")
        day = request.GET.get("date") or timezone.localdate().isoformat()
        try:
            selected_date = date.fromisoformat(day)
        except ValueError:
            return _error("Sana formati noto‘g‘ri.")
        group = _groups(request.mobile_user).filter(pk=group_id).first() if group_id else None
        if request.mobile_user.role != User.Roles.STUDENT and group:
            members = GroupMembership.objects.filter(group=group).select_related("student")
            data["items"] = []
            for membership in members:
                record = Attendance.objects.filter(group=group, student=membership.student, date=selected_date).first()
                data["items"].append({"id": membership.student_id, "title": membership.student.full_name,
                                      "present": record.present if record else True, "marked": record is not None})
            data["group_id"] = group.pk
        else:
            qs = Attendance.objects.filter(student=request.mobile_user, date=selected_date) if request.mobile_user.role == User.Roles.STUDENT else Attendance.objects.none()
            data["items"] = [{"id": x.pk, "title": x.group.name, "subtitle": "Keldi" if x.present else "Kelmagan", "present": x.present} for x in qs]
        data["date"] = selected_date.isoformat()
    return _ok(data)


def _can_manage_group(user, group):
    if user.role == User.Roles.SUPER_ADMIN:
        return True
    if user.role == User.Roles.TEACHER:
        return group.teacher_id == user.pk
    if user.role == User.Roles.DIRECTOR:
        return group.teacher.director_id == user.pk
    return False


@csrf_exempt
@require_http_methods(["POST"])
@_authenticated
def action(request):
    data = _json(request)
    if data is None:
        return _error("So‘rov ma’lumoti noto‘g‘ri.")
    user = request.mobile_user
    action_name = str(data.get("action", ""))
    try:
        if action_name == "create_group" and user.role in {User.Roles.TEACHER, User.Roles.DIRECTOR, User.Roles.SUPER_ADMIN}:
            teacher = user
            if user.role == User.Roles.DIRECTOR:
                teacher = User.objects.filter(pk=data.get("teacher_id"), role=User.Roles.TEACHER, director=user).first()
                if teacher is None:
                    return _error("O‘zingizning o‘qituvchingizni tanlang.", 403)
            if user.role == User.Roles.SUPER_ADMIN and data.get("teacher_id"):
                teacher = User.objects.filter(pk=data.get("teacher_id"), role=User.Roles.TEACHER).first() or user
            group = Group.objects.create(teacher=teacher, name=str(data.get("name", "")).strip()[:120],
                                         level=str(data.get("level", ""))[:60],
                                         lesson_time=str(data.get("time", "09:00"))[:5],
                                         monthly_price=max(0, int(data.get("price", 300000))))
            ensure_group_conversation(group)
            return _ok({"id": group.pk, "message": "Guruh yaratildi."})
        if action_name == "create_teacher" and user.role == User.Roles.DIRECTOR:
            login_name = str(data.get("login", "")).strip().lower()[:64]
            password = str(data.get("password", ""))
            if not login_name or not password or not data.get("first_name") or not data.get("last_name"):
                return _error("Ism, familiya, login va parolni kiriting.")
            if User.objects.filter(login=login_name).exists():
                return _error("Bu login band.")
            with transaction.atomic():
                teacher = User.objects.create_user(login=login_name, password=password, role=User.Roles.TEACHER,
                                                   director=user, first_name=str(data["first_name"])[:64],
                                                   last_name=str(data["last_name"])[:64], phone=str(data.get("phone", ""))[:32])
                TeacherProfile.objects.create(user=teacher, center_name=str(data.get("center_name", "O‘quv markazi"))[:120], city=str(data.get("city", ""))[:80])
            return _ok({"id": teacher.pk, "message": "O‘qituvchi qo‘shildi."})
        if action_name == "create_director" and user.role == User.Roles.SUPER_ADMIN:
            login_name = str(data.get("login", "")).strip().lower()[:64]
            password = str(data.get("password", ""))
            if not login_name or not password or not data.get("first_name") or not data.get("last_name"):
                return _error("Ism, familiya, login va parolni kiriting.")
            if User.objects.filter(login=login_name).exists():
                return _error("Bu login band.")
            director = User.objects.create_user(login=login_name, password=password, role=User.Roles.DIRECTOR,
                                                first_name=str(data["first_name"])[:64], last_name=str(data["last_name"])[:64],
                                                phone=str(data.get("phone", ""))[:32])
            return _ok({"id": director.pk, "message": "Direktor qo‘shildi."})
        if action_name == "create_student" and user.role in {User.Roles.TEACHER, User.Roles.DIRECTOR}:
            group = _groups(user).filter(pk=data.get("group_id")).first()
            if not group:
                return _error("Guruh topilmadi yoki ruxsat yo‘q.", 403)
            student = create_student(user, {"first_name": str(data.get("first_name", "")).strip(),
                                            "last_name": str(data.get("last_name", "")).strip(),
                                            "login": data.get("login"), "password": data.get("password"),
                                            "phone": data.get("phone", ""), "parent_phone": data.get("parent_phone", ""), "group": group})
            return _ok({"id": student.pk, "login": student.login, "message": "O‘quvchi qo‘shildi."})
        if action_name == "create_material" and user.role in {User.Roles.TEACHER, User.Roles.SUPER_ADMIN}:
            group = _groups(user).filter(pk=data.get("group_id")).first()
            if not group:
                return _error("Guruh topilmadi.", 403)
            material = Material.objects.create(group=group, type=str(data.get("type", "VIDEO"))[:8],
                                               title=str(data.get("title", "")).strip()[:160],
                                               description=str(data.get("description", ""))[:4000],
                                               youtube_url=str(data.get("youtube_url", ""))[:500])
            return _ok({"id": material.pk, "message": "Material qo‘shildi."})
        if action_name == "create_homework" and user.role in {User.Roles.TEACHER, User.Roles.DIRECTOR, User.Roles.SUPER_ADMIN}:
            group = _groups(user).filter(pk=data.get("group_id")).first()
            if not group:
                return _error("Guruh topilmadi.", 403)
            hw = Homework.objects.create(group=group, title=str(data.get("title", "")).strip()[:160], description=str(data.get("description", ""))[:5000])
            for membership in group.memberships.select_related("student"):
                notify(membership.student, type=Notification.Type.SYSTEM, title="Yangi uy vazifasi", body=hw.title, link=f"/student/homework/{hw.pk}/")
            return _ok({"id": hw.pk, "message": "Uy vazifasi berildi."})
        if action_name == "submit_homework" and user.role == User.Roles.STUDENT:
            hw = Homework.objects.filter(pk=data.get("homework_id"), group__in=_groups(user)).first()
            if not hw:
                return _error("Uy vazifasi topilmadi.", 404)
            sub, _ = Submission.objects.update_or_create(homework=hw, student=user, defaults={"text": str(data.get("text", ""))[:10000], "submitted_at": timezone.now(), "reviewed_at": None, "grade": None, "result": ""})
            notify(hw.group.teacher, type=Notification.Type.HOMEWORK_SUBMITTED, title="Yangi topshiriq", body=f"{user.full_name} — {hw.title}", link=f"/teacher/homework/{hw.pk}/")
            return _ok({"id": sub.pk, "message": "Topshiriq yuborildi."})
        if action_name == "review_submission" and user.role in {User.Roles.TEACHER, User.Roles.DIRECTOR, User.Roles.SUPER_ADMIN}:
            qs = Submission.objects.select_related("homework__group", "student").filter(pk=data.get("submission_id"), homework__group__in=_groups(user))
            sub = qs.first()
            if not sub:
                return _error("Topshiriq topilmadi yoki ruxsat yo‘q.", 403)
            grade = max(0, min(100, int(data.get("grade", 0))))
            sub.grade = grade
            sub.result = Submission.Result.DONE if grade >= 60 else Submission.Result.WRONG
            sub.comment = str(data.get("comment", ""))[:2000]
            sub.reviewed_at = timezone.now()
            sub.save()
            notify(sub.student, type=Notification.Type.HOMEWORK_REVIEWED, title="Uy vazifangiz tekshirildi", body=f"{sub.homework.title}: {grade}/100", link="/student/homework/")
            return _ok({"message": "Baho saqlandi."})
        if action_name == "mark_attendance" and user.role in {User.Roles.TEACHER, User.Roles.DIRECTOR, User.Roles.SUPER_ADMIN}:
            group = _groups(user).filter(pk=data.get("group_id")).first()
            if not group:
                return _error("Guruh topilmadi.", 403)
            day = date.fromisoformat(str(data.get("date") or timezone.localdate().isoformat()))
            marks = data.get("marks") if isinstance(data.get("marks"), list) else []
            with transaction.atomic():
                for row in marks[:500]:
                    student_id = row.get("student_id")
                    member = GroupMembership.objects.filter(group=group, student_id=student_id).exists()
                    if member:
                        Attendance.objects.update_or_create(group=group, student_id=student_id, date=day, defaults={"present": bool(row.get("present"))})
            return _ok({"message": "Davomat saqlandi."})
        if action_name == "mark_paid" and user.role == User.Roles.TEACHER:
            group = _groups(user).filter(pk=data.get("group_id")).first()
            student = _students(user).filter(pk=data.get("student_id")).first()
            if not group or not student:
                return _error("O‘quvchi yoki guruh topilmadi.", 403)
            mark_paid(user, student=student, group=group, year=int(data.get("year", timezone.localdate().year)),
                      month=int(data.get("month", timezone.localdate().month)), amount=int(data.get("amount", 0)))
            return _ok({"message": "To‘lov saqlandi."})
        if action_name == "read_notification":
            Notification.objects.filter(pk=data.get("id"), user=user).update(is_read=True)
            return _ok({"message": "O‘qildi."})
        if action_name == "send_announcement" and user.role == User.Roles.DIRECTOR:
            title = str(data.get("title", "")).strip()[:160]
            body = str(data.get("body", "")).strip()[:5000]
            audience = str(data.get("audience", ""))
            if not title or not body:
                return _error("Sarlavha va matnni kiriting.")
            if audience == "STUDENTS_ALL":
                recipients = _students(user)
            elif audience == "TEACHERS_ALL":
                recipients = User.objects.filter(role=User.Roles.TEACHER, director=user)
            elif audience == "GROUP":
                group = _groups(user).filter(pk=data.get("group_id")).first()
                if not group:
                    return _error("Guruh topilmadi.")
                recipients = _students(user).filter(group_memberships__group=group).distinct()
            elif audience == "TEACHER":
                recipients = User.objects.filter(pk=data.get("teacher_id"), role=User.Roles.TEACHER, director=user)
            else:
                return _error("Qabul qiluvchilarni tanlang.")
            created = notify_many(recipients, type=Notification.Type.SYSTEM, title=title, body=body,
                                  dedupe_prefix=f"mobile-director:{user.pk}:{timezone.now().timestamp()}")
            return _ok({"message": f"Bildirishnoma {len(created)} kishiga yuborildi."})
        if action_name == "update_profile":
            user.first_name = str(data.get("first_name", user.first_name)).strip()[:64]
            user.last_name = str(data.get("last_name", user.last_name)).strip()[:64]
            user.phone = str(data.get("phone", user.phone))[:32]
            if data.get("language") in dict(User.Language.choices):
                user.language = data["language"]
            if data.get("theme") in dict(User.Theme.choices):
                user.theme = data["theme"]
            new_password = str(data.get("new_password", ""))
            if new_password:
                if not user.check_password(str(data.get("current_password", ""))):
                    return _error("Joriy parol noto‘g‘ri.", 403)
                if len(new_password) < 8:
                    return _error("Yangi parol kamida 8 ta belgidan iborat bo‘lsin.")
                user.set_password(new_password)
                user.token_version += 1
            user.save()
            return _ok({"message": "Profil saqlandi. Parol o‘zgargan bo‘lsa, qayta kiring.", "relogin": bool(new_password)})
        if action_name == "send_message":
            conv = user_conversations(user).filter(pk=data.get("conversation_id")).first()
            if not conv or not assert_participant(conv, user):
                return _error("Suhbat topilmadi.", 403)
            msg = send_message(conv, user, text=str(data.get("text", ""))[:8000])
            return _ok({"id": msg.pk, "message": "Xabar yuborildi."})
        if action_name == "start_chat":
            from chat.services import direct_conversation
            contact = User.objects.filter(pk=data.get("user_id"), is_active=True).first()
            if not contact or contact.pk == user.pk:
                return _error("Foydalanuvchi topilmadi.")
            permitted = _groups(user).filter(Q(teacher=contact) | Q(memberships__student=contact)).exists()
            if user.role == User.Roles.DIRECTOR:
                permitted = contact.director_id == user.pk
            if not permitted:
                return _error("Bu foydalanuvchiga yozish huquqi yo‘q.", 403)
            conv = direct_conversation(user, contact)
            return _ok({"id": conv.pk})
        if action_name == "create_ai_chat" and user.role in {User.Roles.TEACHER, User.Roles.SUPER_ADMIN}:
            student = _students(user).filter(pk=data.get("student_id")).first() if data.get("student_id") else None
            chat = AiConversation.objects.create(owner=user, selected_student=student, title=f"{student.full_name} tahlili" if student else "Yangi chat")
            return _ok({"id": chat.pk})
        if action_name in {"rename_ai_chat", "pin_ai_chat", "delete_ai_chat"} and user.role in {User.Roles.TEACHER, User.Roles.SUPER_ADMIN}:
            chat = AiConversation.objects.filter(owner=user, pk=data.get("conversation_id")).first()
            if not chat:
                return _error("AI chat topilmadi.", 404)
            if action_name == "rename_ai_chat":
                title = str(data.get("title", "")).strip()[:100]
                if not title:
                    return _error("Chat nomini kiriting.")
                chat.title = title
                chat.save(update_fields=["title", "updated_at"])
            elif action_name == "pin_ai_chat":
                chat.is_pinned = not chat.is_pinned
                chat.save(update_fields=["is_pinned", "updated_at"])
            else:
                chat.delete()
                return _ok({"message": "Chat o‘chirildi."})
            return _ok({"message": "Chat yangilandi."})
        if action_name == "send_ai_message" and user.role in {User.Roles.TEACHER, User.Roles.SUPER_ADMIN}:
            chat = AiConversation.objects.filter(owner=user, pk=data.get("conversation_id")).first()
            text = str(data.get("text", "")).strip()[:2000]
            if not chat or not text:
                return _error("Chat yoki xabar noto‘g‘ri.")
            AiChatMessage.objects.create(conversation=chat, role="USER", content=text)
            from assessments.services import AiUnavailable, chat_with_teacher
            from assessments.views import _greeting_reply, _teacher_ai_context, _try_grade_action, _try_homework_action
            from types import SimpleNamespace
            fake_request = SimpleNamespace(user=user, session={})
            context, students = _teacher_ai_context(user, chat.selected_student)
            recent = list(chat.messages.order_by("created_at", "id"))[-40:]
            history = [("user" if m.role == "USER" else "assistant", m.content) for m in recent]
            try:
                answer = _greeting_reply(text)
                if answer is None:
                    answer = _try_homework_action(fake_request, text)
                if answer is None:
                    answer = _try_grade_action(fake_request, text, students, chat.selected_student)
                if fake_request.session.get("ai_pending_action"):
                    chat.pending_action = fake_request.session["ai_pending_action"]
                    pending = chat.pending_action
                    if pending.get("type") == "HOMEWORK":
                        answer = f"'{pending.get('title', 'Uy vazifasi')}' vazifasini {next((g.name for g in _groups(user) if g.pk == pending.get('group_id')), 'guruh')} guruhiga beraymi? Tasdiqlash tugmasini bosing."
                    else:
                        submission = Submission.objects.select_related("student", "homework").filter(pk=pending.get("submission_id")).first()
                        answer = f"{submission.student.full_name}ga '{submission.homework.title}' bo‘yicha {pending.get('grade')}/100 baho qo‘yaymi? Tasdiqlash tugmasini bosing." if submission else "Topshiriq topilmadi."
                if answer is None:
                    answer = chat_with_teacher(history=history, site_context=context)
            except AiUnavailable as exc:
                answer = str(exc)
            AiChatMessage.objects.create(conversation=chat, role="ASSISTANT", content=answer[:8000])
            chat.title = text[:96] if chat.title == "Yangi chat" else chat.title
            chat.save(update_fields=["updated_at", "title", "pending_action"])
            return _ok({"reply": answer, "pending": bool(chat.pending_action)})
        if action_name in {"confirm_ai_action", "cancel_ai_action"} and user.role in {User.Roles.TEACHER, User.Roles.SUPER_ADMIN}:
            chat = AiConversation.objects.filter(owner=user, pk=data.get("conversation_id")).first()
            if not chat:
                return _error("AI chat topilmadi.", 404)
            pending = chat.pending_action or {}
            if action_name == "cancel_ai_action":
                answer = "Amal bekor qilindi. Hech narsa o‘zgartirilmadi." if pending else "Tasdiqlashni kutayotgan amal yo‘q."
            elif pending.get("type") == "HOMEWORK":
                group = _groups(user).filter(pk=pending.get("group_id")).first()
                title = str(pending.get("title", "")).strip()[:160]
                description = str(pending.get("description", ""))[:4000]
                if not group or not title:
                    return _error("Guruh yoki vazifa ma’lumoti noto‘g‘ri.")
                homework = Homework.objects.create(group=group, title=title, description=description)
                for membership in group.memberships.select_related("student"):
                    notify(membership.student, type=Notification.Type.SYSTEM, title="Yangi uy vazifasi", body=homework.title, link=f"/student/homework/{homework.pk}/")
                answer = f"'{homework.title}' vazifasi {group.name} guruhiga yuborildi."
            elif pending.get("type") == "GRADE":
                submission = Submission.objects.select_related("homework__group", "student").filter(pk=pending.get("submission_id"), homework__group__in=_groups(user)).first()
                try:
                    grade = int(pending.get("grade"))
                except (TypeError, ValueError):
                    grade = -1
                if not submission or not 0 <= grade <= 100:
                    return _error("Topshiriq topilmadi yoki baho noto‘g‘ri.")
                submission.grade = grade
                submission.result = Submission.Result.DONE if grade >= 60 else Submission.Result.WRONG
                submission.reviewed_at = timezone.now()
                submission.save()
                notify(submission.student, type=Notification.Type.HOMEWORK_REVIEWED, title="Uy vazifangiz tekshirildi", body=f"{submission.homework.title}: {grade}/100 baho.", link="/student/homework/")
                answer = f"{submission.student.full_name}ga {submission.homework.title} bo‘yicha {grade}/100 baho qo‘yildi."
            else:
                return _error("Tasdiqlashni kutayotgan amal yo‘q.")
            chat.pending_action = {}
            chat.save(update_fields=["pending_action", "updated_at"])
            AiChatMessage.objects.create(conversation=chat, role="ASSISTANT", content=answer)
            return _ok({"reply": answer, "pending": False})
        if action_name == "create_ai_test" and user.role in {User.Roles.TEACHER, User.Roles.SUPER_ADMIN}:
            group = _groups(user).filter(pk=data.get("group_id")).first() if data.get("group_id") else None
            from assessments.services import AiUnavailable, generate_questions
            from assessments.views import _create_test
            rows = generate_questions(subject=str(data.get("subject", "Matematika"))[:100], topic=str(data.get("topic", ""))[:180],
                                      grade_level=str(data.get("grade_level", ""))[:60], count=max(3, min(30, int(data.get("count", 10)))),
                                      difficulty=str(data.get("difficulty", "MIXED"))[:12], instructions=str(data.get("instructions", ""))[:500])
            test = _create_test(user, {"group": group, "title": str(data.get("title", ""))[:180] or str(data.get("topic", "AI testi"))[:180],
                                       "subject": str(data.get("subject", ""))[:100], "topic": str(data.get("topic", ""))[:180],
                                       "grade_level": str(data.get("grade_level", ""))[:60], "difficulty": str(data.get("difficulty", "MIXED"))[:12]}, rows, ai=True)
            return _ok({"id": test.pk, "message": "AI test tayyorlandi."})
        if action_name == "publish_test" and user.role in {User.Roles.TEACHER, User.Roles.SUPER_ADMIN}:
            test = Test.objects.filter(pk=data.get("test_id"), owner=user).first()
            if not test and user.role == User.Roles.SUPER_ADMIN:
                test = Test.objects.filter(pk=data.get("test_id")).first()
            if not test:
                return _error("Test topilmadi.", 403)
            questions = list(test.questions.prefetch_related("options"))
            if not questions or any(q.options.filter(is_correct=True).count() != 1 or q.options.count() < 2 for q in questions):
                return _error("Test savollarining javoblarini tekshiring.")
            share = test.shares.filter(is_active=True).first() or TestShare(test=test)
            share.save()
            test.status = Test.Status.PUBLISHED
            test.published_at = timezone.now()
            test.save(update_fields=["status", "published_at"])
            if test.group_id:
                for membership in test.group.memberships.select_related("student"):
                    notify(membership.student, type=Notification.Type.TEST_PUBLISHED, title="Yangi test", body=test.title, link=f"/student/tests/")
            return _ok({"message": "Test o‘quvchilarga yuborildi."})
        if action_name == "start_test" and user.role == User.Roles.STUDENT:
            share = TestShare.objects.filter(pk=data.get("share_id"), test__group__in=_groups(user)).select_related("test").first()
            if not share or not share.available():
                return _error("Test hozir mavjud emas.", 404)
            completed = Attempt.objects.filter(share=share, student=user, submitted_at__isnull=False).count()
            if completed and not share.allow_retries or completed >= share.max_attempts:
                return _error("Urinishlar soni tugagan.", 403)
            attempt = Attempt.objects.create(test=share.test, share=share, student=user,
                                             attempt_number=Attempt.objects.filter(share=share, student=user).count() + 1,
                                             expires_at=timezone.now() + timedelta(minutes=share.time_limit_minutes) if share.time_limit_minutes else None)
            qs = share.test.questions.prefetch_related("options")
            questions = [{"id": q.pk, "text": q.text, "options": [{"id": o.pk, "text": o.text} for o in q.options.all()]} for q in qs]
            return _ok({"attempt_id": attempt.pk, "questions": questions})
        if action_name == "submit_test" and user.role == User.Roles.STUDENT:
            attempt = Attempt.objects.filter(pk=data.get("attempt_id"), student=user, status=Attempt.Status.IN_PROGRESS).first()
            if not attempt:
                return _error("Test urinishi topilmadi.", 404)
            answers = data.get("answers") if isinstance(data.get("answers"), dict) else {}
            correct = total = 0
            with transaction.atomic():
                for question in attempt.test.questions.prefetch_related("options"):
                    total += 1
                    option = question.options.filter(pk=answers.get(str(question.pk))).first()
                    is_correct = bool(option and option.is_correct)
                    correct += int(is_correct)
                    Answer.objects.update_or_create(attempt=attempt, question=question, defaults={"option": option, "is_correct": is_correct})
                attempt.score = correct
                attempt.total = total
                attempt.percentage = round(100 * correct / total, 2) if total else 0
                attempt.status = Attempt.Status.SUBMITTED
                attempt.submitted_at = timezone.now()
                attempt.save()
            return _ok({"score": correct, "total": total, "percentage": attempt.percentage})
    except ValueError as exc:
        return _error(exc)
    except Exception as exc:
        # Keep server errors private while retaining a useful message for normal validation issues.
        return _error("Amal bajarilmadi. Ma’lumotlarni tekshirib qayta urinib ko‘ring.", 400)
    return _error("Bu amal mobil ilovada mavjud emas.", 400)
