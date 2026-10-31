import hmac
import json
import os
import secrets
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.http import HttpResponse, JsonResponse
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from accounts.models import StudentProfile, TeacherProfile, User
from assessments.models import Attempt, Test
from core.decorators import teacher_required
from .models import TelegramUpdateLog
from .services import bot_link, telegram_send


@login_required
def telegram_settings(request):
    if request.user.role == User.Roles.TEACHER:
        profile, _ = TeacherProfile.objects.get_or_create(user=request.user, defaults={"center_name": "", "city": ""})
        profile = TeacherProfile.objects.get(user=request.user)
    elif request.user.role == User.Roles.STUDENT:
        profile, _ = StudentProfile.objects.get_or_create(user=request.user)
    else:
        messages.info(request, "Telegram ulanishi o'qituvchi yoki o'quvchi akkaunti uchun mavjud.")
        return redirect("core:home")
    if request.method == "POST":
        if not bot_link():
            messages.error(request, "Bot nomi sozlanmagan. Administrator TELEGRAM_BOT_USERNAME ni sozlashi kerak.")
        else:
            profile.telegram_link_token = secrets.token_urlsafe(18)
            profile.save(update_fields=["telegram_link_token"])
            messages.success(request, "Havola tayyor. Telegram botda Start tugmasini bosing.")
    return render(request, "integrations/telegram.html", {"profile": profile, "link": bot_link(profile.telegram_link_token) if profile.telegram_link_token else "", "bot_url": bot_link()})


@login_required
def telegram_open(request):
    if request.user.role == User.Roles.TEACHER:
        profile, _ = TeacherProfile.objects.get_or_create(user=request.user, defaults={"center_name": "", "city": ""})
    elif request.user.role == User.Roles.STUDENT:
        profile, _ = StudentProfile.objects.get_or_create(user=request.user)
    else:
        messages.info(request, "Telegram bot faqat o'qituvchi va o'quvchi akkauntlari uchun mavjud.")
        return redirect("core:home")
    if profile.telegram_linked_at:
        link = bot_link()
    else:
        link = bot_link(profile.telegram_link_token) if profile.telegram_link_token else ""
        if not link:
            profile.telegram_link_token = secrets.token_urlsafe(18)
            profile.save(update_fields=["telegram_link_token"])
            link = bot_link(profile.telegram_link_token)
    if not link:
        messages.error(request, "Telegram bot manzili sozlanmagan. Administrator TELEGRAM_BOT_USERNAME ni .env faylida sozlashi kerak.")
        return redirect("integrations:telegram")
    return redirect(link)


def _parent_command(student, command):
    from academics.models import Attendance, GroupMembership, Homework, Submission
    from assessments.models import Attempt, Test, TestShare
    from payments.models import Payment, PaymentDeadline
    from django.utils import timezone
    from django.urls import reverse

    memberships = list(GroupMembership.objects.filter(student=student).select_related("group", "group__teacher"))
    groups = [row.group for row in memberships]
    if command == "/testlar":
        tests = Test.objects.filter(status=Test.Status.PUBLISHED, group__in=groups).distinct().order_by("-published_at")[:10]
        lines = []
        base = os.environ.get("PUBLIC_APP_URL", "").rstrip("/")
        for test in tests:
            share = test.shares.filter(is_active=True).first()
            if share:
                lines.append(f"• {test.title}: {base}/t/{share.token}/" if base else f"• {test.title}: /t/{share.token}/")
        return "Nashr qilingan testlar:\n" + ("\n".join(lines) if lines else "Guruhlaringizda test yo'q.")
    if command == "/natijalar":
        attempts = Attempt.objects.filter(student=student, submitted_at__isnull=False).select_related("test").order_by("-submitted_at")[:10]
        return "Oxirgi natijalar:\n" + ("\n".join(f"• {x.test.title}: {x.score}/{x.total} ({x.percentage:.0f}%)" for x in attempts) if attempts else "Hozircha natija yo'q.")
    if command == "/testlar":
        return "Testlar mavjud emas."
    if command == "/homework":
        today_groups = [g for g in groups if day.isoweekday() in g.days_list]
        target_groups = today_groups or groups
        items = []
        for group in target_groups:
            rows = Homework.objects.filter(group=group).order_by("-created_at")[:3]
            if rows:
                items.append(group.name + ":\n" + "\n".join(f"• {h.title} (muddat: {h.due_at:%d.%m.%Y})" if h.due_at else f"• {h.title}" for h in rows))
        return "Uy vazifalari:\n" + ("\n\n".join(items) if items else "Hozircha vazifa yo'q.")
    if command == "/grade":
        rows = Submission.objects.filter(student=student, grade__isnull=False).select_related("homework").order_by("-reviewed_at")[:10]
        return "Baholar:\n" + ("\n".join(f"• {row.homework.title}: {row.grade}/100" for row in rows) if rows else "Hozircha baho yo'q.")
    now = timezone.localtime()
    day = now.date()
    year, month = now.year, now.month
    if command == "/oylik":
        lines = []
        for membership in memberships:
            payment = Payment.objects.filter(student=student, group=membership.group, period_year=year, period_month=month).first()
            paid = payment.amount if payment else 0
            due = membership.effective_price - paid
            deadline = PaymentDeadline.objects.filter(teacher=membership.group.teacher, period_year=year, period_month=month).first()
            text = f"• {membership.group.name}: {paid:,}/{membership.effective_price:,} so'm; qarz {max(0,due):,}".replace(",", " ")
            if deadline:
                text += f"; muddat {deadline.due_date:%d.%m.%Y}"
            lines.append(text)
        return "Joriy oy to'lovlari:\n" + ("\n".join(lines) if lines else "Guruh biriktirilmagan.")
    if command == "/davomat":
        lines = []
        for group in groups:
            if day.isoweekday() not in group.days_list:
                continue
            present = Attendance.objects.filter(group=group, date=day, present=True).count()
            absent = Attendance.objects.filter(group=group, date=day, present=False).count()
            marked = Attendance.objects.filter(group=group, date=day).count()
            total = group.memberships.count()
            lines.append(f"• {group.name}: keldi {present}, kelmadi {absent}, belgilanmagan {max(0,total-marked)}")
        return "Bugungi davomat:\n" + ("\n".join(lines) if lines else "Bugun dars yo'q.")
    return "Buyruq topilmadi."


def _teacher_command(teacher, command):
    from academics.models import Attendance, GroupMembership
    from payments.models import Payment, PaymentDeadline
    from django.utils import timezone
    now = timezone.localtime()
    groups = teacher.teacher_groups.all()
    if command == "/davomat":
        rows = []
        for group in groups:
            if now.isoweekday() not in group.days_list:
                continue
            total = group.memberships.count()
            present = group.attendance_records.filter(date=now.date(), present=True).count()
            absent = group.attendance_records.filter(date=now.date(), present=False).count()
            rows.append(f"• {group.name} ({group.lesson_time}): keldi {present}, kelmadi {absent}, belgilanmagan {max(0,total-present-absent)}")
        return "Bugungi davomat:\n" + ("\n".join(rows) if rows else "Bugun dars yo'q.")
    year, month = now.year, now.month
    memberships = GroupMembership.objects.filter(group__teacher=teacher).select_related("group", "student")
    expected = sum(m.effective_price for m in memberships)
    payments = Payment.objects.filter(teacher=teacher, period_year=year, period_month=month)
    collected = sum(p.amount for p in payments)
    debt = max(0, expected-collected)
    deadline = PaymentDeadline.objects.filter(teacher=teacher, period_year=year, period_month=month).first()
    due = f"\nMuddat: {deadline.due_date:%d.%m.%Y}" if deadline else "\nMuddat belgilanmagan"
    return f"Oylik tushum ({month:02d}.{year})\nGuruhlar: {groups.count()}\nO'quvchilar: {memberships.values('student_id').distinct().count()}\nYig'ildi: {collected:,} so'm\nKutilgan: {expected:,} so'm\nQarz: {debt:,} so'm".replace(",", " ") + due


@csrf_exempt
@require_POST
def telegram_webhook(request):
    expected = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "").strip()
    received = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if not expected or not hmac.compare_digest(expected, received):
        return HttpResponse(status=403)
    try:
        update = json.loads(request.body)
        update_id = int(update["update_id"])
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        return JsonResponse({"ok": False}, status=400)
    with transaction.atomic():
        _, created = TelegramUpdateLog.objects.get_or_create(update_id=update_id)
        if not created:
            return JsonResponse({"ok": True})
    message = update.get("message") or update.get("edited_message") or {}
    chat_id = str((message.get("chat") or {}).get("id", ""))
    text = (message.get("text") or "").strip()
    if not chat_id or not text:
        return JsonResponse({"ok": True})
    parts = text.split(maxsplit=1)
    command = parts[0].split("@", 1)[0].lower()
    argument = parts[1].strip() if len(parts) > 1 else ""
    if command == "/start" and argument:
        teacher = TeacherProfile.objects.filter(telegram_link_token=argument).select_related("user").first()
        if teacher:
            teacher.telegram_chat_id = chat_id
            teacher.telegram_link_token = None
            teacher.telegram_linked_at = timezone.now()
            teacher.save(update_fields=["telegram_chat_id", "telegram_link_token", "telegram_linked_at"])
            telegram_send(chat_id, "Teacher Web akkauntingiz ulandi. Buyruqlar: /oylik, /davomat")
        else:
            student = StudentProfile.objects.filter(telegram_link_token=argument).select_related("user").first()
            if student:
                student.parent_telegram_chat_id = chat_id
                student.telegram_link_token = None
                student.telegram_linked_at = timezone.now()
                student.save(update_fields=["parent_telegram_chat_id", "telegram_link_token", "telegram_linked_at"])
                telegram_send(chat_id, "O'quvchi bildirishnomalari ulandi. Buyruqlar: /testlar, /natijalar, /homework, /grade, /oylik, /davomat")
            else:
                telegram_send(chat_id, "Havola yaroqsiz yoki oldin ishlatilgan. Teacher Web'dan yangi havola oling.")
    elif command in ("/start", "/help"):
        telegram_send(chat_id, "Teacher Web botiga xush kelibsiz. Saytdagi Telegram bo'limidan bir martalik havola oling. Buyruqlar: /testlar, /natijalar, /homework, /grade, /oylik, /davomat, /stop")
    elif command == "/stop":
        parent = StudentProfile.objects.filter(parent_telegram_chat_id=chat_id).first()
        teacher = TeacherProfile.objects.filter(telegram_chat_id=chat_id).first()
        if parent:
            parent.parent_telegram_chat_id = None
            parent.telegram_linked_at = None
            parent.save(update_fields=["parent_telegram_chat_id", "telegram_linked_at"])
        if teacher:
            teacher.telegram_chat_id = None
            teacher.telegram_linked_at = None
            teacher.save(update_fields=["telegram_chat_id", "telegram_linked_at"])
        telegram_send(chat_id, "Telegram ulanish bekor qilindi.")
    elif command == "/test" and argument:
        from django.conf import settings
        from assessments.models import TestShare
        share = TestShare.objects.select_related("test").filter(token=argument, is_active=True, test__status="PUBLISHED").first()
        if not share or not share.available():
            telegram_send(chat_id, "Test havolasi mavjud emas yoki muddati tugagan.")
        else:
            base = os.environ.get("PUBLIC_APP_URL", "").rstrip("/")
            telegram_send(chat_id, f"{share.test.title}\n{base}/t/{share.token}/" if base else f"{share.test.title}\n/t/{share.token}/")
    elif command in ("/testlar", "/natijalar", "/homework", "/grade", "/oylik", "/davomat"):
        student_profile = StudentProfile.objects.filter(parent_telegram_chat_id=chat_id).select_related("user").first()
        teacher_profile = TeacherProfile.objects.filter(telegram_chat_id=chat_id).select_related("user").first()
        if teacher_profile and command in ("/oylik", "/davomat"):
            telegram_send(chat_id, _teacher_command(teacher_profile.user, command))
        elif student_profile:
            telegram_send(chat_id, _parent_command(student_profile.user, command))
        elif command in ("/oylik", "/davomat"):
            telegram_send(chat_id, "Telegram bo'limidan akkauntingizni ulang.")
        else:
            telegram_send(chat_id, "Avval Telegram havolasi orqali akkauntni ulang.")
    else:
        telegram_send(chat_id, "Buyruqlar: /testlar, /natijalar, /homework, /grade, /oylik, /davomat, /stop")
    return JsonResponse({"ok": True})


@teacher_required
@require_POST
def student_parent_link(request, student_id):
    from django.shortcuts import get_object_or_404
    from academics.models import GroupMembership
    student = get_object_or_404(User.objects.filter(role=User.Roles.STUDENT, group_memberships__group__teacher=request.user).distinct(), pk=student_id)
    profile, _ = StudentProfile.objects.get_or_create(user=student)
    profile.telegram_link_token = secrets.token_urlsafe(18)
    profile.save(update_fields=["telegram_link_token"])
    link = bot_link(profile.telegram_link_token)
    if not link:
        messages.error(request, "TELEGRAM_BOT_USERNAME sozlanmagan.")
    else:
        messages.success(request, "Ota-onaga berish uchun yangi Telegram havolasi tayyor.")
    return redirect("academics:student_detail", pk=student.pk)


@teacher_required
@require_POST
def send_test_telegram(request, test_id):
    from django.shortcuts import get_object_or_404
    from assessments.models import Test, TestShare
    test = get_object_or_404(Test, pk=test_id, owner=request.user, status=Test.Status.PUBLISHED)
    share = test.shares.filter(is_active=True).first()
    if not share:
        messages.error(request, "Avval testni nashr qiling.")
        return redirect("assessments:detail", pk=test.pk)
    student = get_object_or_404(User.objects.filter(role=User.Roles.STUDENT, group_memberships__group__teacher=request.user).distinct(), pk=request.POST.get("student_id"))
    if test.group_id and not student.group_memberships.filter(group_id=test.group_id).exists():
        messages.error(request, "Tanlangan o'quvchi test guruhida emas.")
        return redirect("assessments:detail", pk=test.pk)
    profile = StudentProfile.objects.filter(user=student).first()
    if not profile or not profile.parent_telegram_chat_id:
        messages.error(request, "Ota-ona Telegrami ulanmagan.")
        return redirect("assessments:detail", pk=test.pk)
    base = os.environ.get("PUBLIC_APP_URL", "").rstrip("/")
    if not base:
        messages.error(request, "Telegram orqali havola yuborish uchun PUBLIC_APP_URL sozlang.")
        return redirect("assessments:detail", pk=test.pk)
    sent = telegram_send(profile.parent_telegram_chat_id, f"{test.title} testi\n{base}/t/{share.token}/")
    messages.success(request, "Test havolasi Telegramga yuborildi." if sent else "Telegram xabari yuborilmadi. Bot tokenini tekshiring.")
    return redirect("assessments:detail", pk=test.pk)


@csrf_exempt
@require_POST
def cron_reminders(request):
    expected = os.environ.get("CRON_SECRET", "").strip()
    received = request.headers.get("X-Cron-Secret", "") or request.headers.get("Authorization", "").removeprefix("Bearer ")
    if not expected or not hmac.compare_digest(expected, received):
        return HttpResponse(status=403)
    from .tasks import send_scheduled_reminders
    return JsonResponse(send_scheduled_reminders())
