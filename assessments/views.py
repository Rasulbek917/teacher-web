from datetime import timedelta
import json
import re
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.db.models import Q
from django.core.paginator import Paginator
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_POST
from accounts.models import User
from core.decorators import role_required, student_required
from core.rate_limit import user_rate_limit
from .forms import AssistantForm, AssistantMaterialForm, GenerateForm, TestForm
from .models import Answer, Attempt, Option, Question, Test, TestCollaborator, TestShare
from .services import AiUnavailable, ask_assistant, chat_with_teacher, draft_chat_homework, generate_questions, generate_recommendations

teacher_or_admin_required = role_required("TEACHER", "SUPER_ADMIN")


def _create_test(owner, data, rows, ai=False):
    test = Test.objects.create(owner=owner, group=data.get("group"), title=data.get("title") or f"{data.get('topic', 'AI')} testi", description=data.get("description", ""), subject=data.get("subject", ""), topic=data.get("topic", ""), grade_level=data.get("grade_level", ""), difficulty=data.get("difficulty", "MIXED"), ai_generated=ai)
    for index, row in enumerate(rows, 1):
        question = Question.objects.create(test=test, order=index, text=row["text"], explanation=row.get("explanation", ""), difficulty=row.get("difficulty", data.get("difficulty", "MEDIUM")))
        for order, option in enumerate(row["options"], 1):
            Option.objects.create(question=question, order=order, text=option["text"], is_correct=bool(option.get("correct")))
    return test


def _test_access(test, user, *, edit=False):
    if user.role == User.Roles.SUPER_ADMIN or test.owner_id == user.pk:
        return True
    collaborator = TestCollaborator.objects.filter(test=test, user=user).first()
    return bool(collaborator and (not edit or collaborator.can_edit))


def _owned_test(user, pk, *, edit=False):
    test = get_object_or_404(Test.objects.prefetch_related("collaborators"), pk=pk)
    if not _test_access(test, user, edit=edit):
        from django.http import Http404
        raise Http404
    return test


@teacher_or_admin_required
def test_list(request):
    scope = Q() if request.user.role == User.Roles.SUPER_ADMIN else (Q(owner=request.user) | Q(collaborators__user=request.user))
    tests = Test.objects.filter(scope).distinct().prefetch_related("questions")
    query = (request.GET.get("q") or "").strip()
    status = request.GET.get("status", "")
    if query:
        tests = tests.filter(Q(title__icontains=query) | Q(subject__icontains=query) | Q(topic__icontains=query))
    if status in dict(Test.Status.choices):
        tests = tests.filter(status=status)
    paginator = Paginator(tests.order_by("-created_at"), 10)
    page_obj = paginator.get_page(request.GET.get("page"))
    return render(request, "assessments/list.html", {"page_obj": page_obj, "query": query, "status": status})


@teacher_or_admin_required
def test_create(request):
    form = TestForm(request.POST or None, teacher=request.user)
    if request.method == "POST" and form.is_valid():
        rows = form.cleaned_data["questions"]
        with transaction.atomic():
            test = _create_test(request.user, form.cleaned_data, rows)
        messages.success(request, "Test saqlandi.")
        return redirect("assessments:detail", pk=test.pk)
    try:
        questions_data = json.loads(request.POST.get("questions", "[]")) if request.method == "POST" else []
    except json.JSONDecodeError:
        questions_data = []
    return render(request, "assessments/form.html", {"form": form, "questions_data": questions_data})


@teacher_or_admin_required
@user_rate_limit(limit=10, window=60)
def test_generate(request):
    form = GenerateForm(request.POST or None, request.FILES or None, teacher=request.user)
    if request.method == "POST" and form.is_valid():
        try:
            data = form.cleaned_data.copy()
            group = data.pop("group", None)
            ai_data = data.copy()
            rows = generate_questions(**ai_data)
            if data["difficulty"] != "MIXED":
                for row in rows:
                    row["difficulty"] = data["difficulty"]
            data["group"] = group
            with transaction.atomic():
                test = _create_test(request.user, data, rows, ai=True)
            messages.success(request, "AI yaratgan savollar qoralama sifatida saqlandi. Nashrdan oldin ko'rib chiqing.")
            return redirect("assessments:detail", pk=test.pk)
        except AiUnavailable as exc:
            messages.error(request, str(exc))
    return render(request, "assessments/generate.html", {"form": form})


@teacher_or_admin_required
def test_detail(request, pk):
    test = get_object_or_404(Test.objects.prefetch_related("questions__options", "shares", "attempts__student", "group__memberships__student", "collaborators__user"), pk=pk)
    if not _test_access(test, request.user):
        from django.http import Http404
        raise Http404
    owner = test.owner_id == request.user.pk or request.user.role == User.Roles.SUPER_ADMIN
    recipients = test.group.memberships.select_related("student", "student__student_profile") if owner and test.group_id else []
    return render(request, "assessments/detail.html", {"test": test, "recipients": recipients, "is_owner": owner, "can_edit": _test_access(test, request.user, edit=True)})


@teacher_or_admin_required
@require_POST
def test_publish(request, pk):
    test = _owned_test(request.user, pk, edit=True)
    if not test.questions.exists() or any(q.options.filter(is_correct=True).count() != 1 or q.options.count() < 2 for q in test.questions.all()):
        messages.error(request, "Har bir savolda kamida 2 ta variant va bitta to'g'ri javob bo'lishi kerak.")
        return redirect("assessments:detail", pk=pk)
    share = test.shares.filter(is_active=True).first()
    if not share:
        share = TestShare(test=test)
    try:
        share.max_attempts = max(1, min(10, int(request.POST.get("max_attempts", "1"))))
        share.time_limit_minutes = max(1, min(600, int(request.POST.get("time_limit_minutes")))) if request.POST.get("time_limit_minutes") else None
        from datetime import datetime
        for field in ("start_at", "end_at", "expires_at"):
            value = request.POST.get(field) or ""
            parsed = datetime.fromisoformat(value) if value else None
            if parsed and timezone.is_naive(parsed):
                parsed = timezone.make_aware(parsed)
            setattr(share, field, parsed)
        if share.start_at and share.end_at and share.start_at >= share.end_at:
            raise ValueError("Boshlanish va tugash vaqti noto'g'ri")
    except (ValueError, TypeError):
        messages.error(request, "Urinishlar soni yoki vaqt limiti noto'g'ri.")
        return redirect("assessments:detail", pk=pk)
    share.allow_retries = request.POST.get("allow_retries") == "1"
    share.shuffle_questions = request.POST.get("shuffle_questions") == "1"
    share.shuffle_options = request.POST.get("shuffle_options") == "1"
    share.save()
    test.status = Test.Status.PUBLISHED
    test.published_at = timezone.now()
    test.save(update_fields=["status", "published_at"])
    from notifications.models import Notification
    from notifications.services import notify
    recipients = test.group.memberships.select_related("student") if test.group_id else []
    for membership in recipients:
        notify(membership.student, type=Notification.Type.TEST_PUBLISHED, title="Yangi test", body=test.title, link=f"/t/{share.token}/", dedupe_key=f"test:{test.pk}:published:{membership.student_id}")
    messages.success(request, f"Test nashr qilindi. Havola: /t/{share.token}/")
    return redirect("assessments:detail", pk=pk)


@teacher_or_admin_required
def test_edit(request, pk):
    test = _owned_test(request.user, pk, edit=True)
    if test.attempts.exists():
        messages.error(request, "Testda urinishlar mavjud. Savollar tarixni buzmasligi uchun nusxa yaratib tahrirlang.")
        return redirect("assessments:detail", pk=pk)
    initial_questions = [{"text": q.text, "options": [o.text for o in q.options.all()], "correctIndex": next((i for i, o in enumerate(q.options.all()) if o.is_correct), 0), "explanation": q.explanation, "difficulty": q.difficulty, "topic": q.topic or ""} for q in test.questions.prefetch_related("options")]
    initial = {"title": test.title, "description": test.description, "subject": test.subject, "topic": test.topic, "grade_level": test.grade_level, "difficulty": test.difficulty, "questions": json.dumps(initial_questions, ensure_ascii=False)}
    initial["group"] = test.group_id
    form = TestForm(request.POST or None, initial=initial, teacher=request.user)
    if request.method == "POST" and form.is_valid():
        with transaction.atomic():
            test.title = form.cleaned_data["title"]
            test.description = form.cleaned_data["description"]
            test.group = form.cleaned_data["group"]
            test.subject = form.cleaned_data["subject"]
            test.topic = form.cleaned_data["topic"]
            test.grade_level = form.cleaned_data["grade_level"]
            test.difficulty = form.cleaned_data["difficulty"]
            test.save()
            test.questions.all().delete()
            for index, row in enumerate(form.cleaned_data["questions"], 1):
                q = Question.objects.create(test=test, order=index, text=row["text"], explanation=row["explanation"], difficulty=row["difficulty"], topic=row["topic"])
                for order, option in enumerate(row["options"], 1):
                    Option.objects.create(question=q, order=order, text=option["text"], is_correct=option["correct"])
        messages.success(request, "Test yangilandi.")
        return redirect("assessments:detail", pk=pk)
    try:
        questions_data = json.loads(request.POST.get("questions", "[]")) if request.method == "POST" else initial_questions
    except json.JSONDecodeError:
        questions_data = initial_questions
    return render(request, "assessments/form.html", {"form": form, "editing": True, "questions_data": questions_data})


@teacher_or_admin_required
@require_POST
def test_delete(request, pk):
    test = get_object_or_404(Test, pk=pk)
    if test.owner_id != request.user.pk and request.user.role != User.Roles.SUPER_ADMIN:
        from django.http import Http404
        raise Http404
    title = test.title
    test.delete()
    messages.success(request, f"{title} testi o'chirildi.")
    return redirect("assessments:list")


@teacher_or_admin_required
@require_POST
def test_duplicate(request, pk):
    source = _owned_test(request.user, pk)
    source = Test.objects.prefetch_related("questions__options").get(pk=source.pk)
    clone = Test.objects.create(owner=request.user, group=source.group, title=f"{source.title} (nusxa)", description=source.description, subject=source.subject, topic=source.topic, grade_level=source.grade_level, difficulty=source.difficulty, language=source.language, ai_generated=source.ai_generated)
    for question in source.questions.all():
        copied = Question.objects.create(test=clone, order=question.order, text=question.text, explanation=question.explanation, difficulty=question.difficulty)
        for option in question.options.all():
            Option.objects.create(question=copied, order=option.order, text=option.text, is_correct=option.is_correct)
    messages.success(request, "Test nusxalandi.")
    return redirect("assessments:detail", pk=clone.pk)


@teacher_or_admin_required
def test_analytics(request, pk):
    test = _owned_test(request.user, pk)
    attempts = test.attempts.filter(submitted_at__isnull=False)
    summary = {"count": attempts.count(), "average": round(sum(x.percentage or 0 for x in attempts) / attempts.count(), 1) if attempts.exists() else 0}
    rows = []
    for question in test.questions.all():
        answers = question.answers.filter(attempt__in=attempts)
        total = answers.count()
        correct = answers.filter(is_correct=True).count()
        rows.append({"question": question, "total": total, "correct": correct, "percent": round(correct * 100 / total) if total else 0})
    return render(request, "assessments/analytics.html", {"test": test, "summary": summary, "rows": rows, "attempts": attempts.select_related("student")})


@teacher_or_admin_required
@user_rate_limit(limit=5, window=60)
def test_recommendations(request, pk):
    test = _owned_test(request.user, pk)
    attempts = list(test.attempts.filter(submitted_at__isnull=False).select_related("student"))
    question_rows = []
    topic_map = {}
    for question in test.questions.all():
        answers = question.answers.filter(attempt__in=attempts)
        count = answers.count()
        correct = answers.filter(is_correct=True).count()
        topic = question.topic or test.topic or "Umumiy"
        info = topic_map.setdefault(topic, {"questions": 0, "responses": 0, "correct": 0})
        info["questions"] += 1
        info["responses"] += count
        info["correct"] += correct
        question_rows.append({"topic": topic, "correct": correct, "responses": count})
    students = []
    for index, attempt in enumerate(sorted(attempts, key=lambda x: (x.percentage or 0))[:5], 1):
        students.append({"label": f"O'quvchi {index}", "score": attempt.score or 0, "total": attempt.total or 0, "percentage": round(attempt.percentage or 0)})
    compact = {"test": {"subject": test.subject, "topic": test.topic, "questionCount": test.questions.count(), "attemptCount": len(attempts), "averagePercent": round(sum(x.percentage or 0 for x in attempts) / len(attempts), 1) if attempts else 0}, "topics": [{"topic": name, "questionCount": item["questions"], "responses": item["responses"], "correctPercent": round(100*item["correct"]/item["responses"]) if item["responses"] else None} for name,item in topic_map.items()], "lowestResults": students}
    recommendations = generate_recommendations(compact)
    if not recommendations:
        weak_topics = [item for item in compact["topics"] if item["correctPercent"] is not None and item["correctPercent"] < 60]
        recommendations = {"summary": "AI kaliti ulanmagan yoki ma'lumot yetarli emas. Quyidagi tavsiyalar test natijalaridan hisoblandi.", "focusTopics": [{"topic": x["topic"], "reason": f"To'g'ri javoblar {x['correctPercent']}%", "priority": "HIGH" if x["correctPercent"] < 40 else "MEDIUM"} for x in weak_topics], "strugglingStudents": students, "skills": ["Xato qilingan savollarni qayta ko'rib chiqish"], "assignments": [], "nextLesson": {"title": f"{test.topic} mavzusini mustahkamlash", "objectives": ["Testdagi eng ko'p xato qilingan bilimni qayta tushuntirish"], "activities": ["Qisqa takrorlash va juftlik mashqlari"], "assessment": ["3-5 savolli chiqish testi"]}}
    return render(request, "assessments/recommendations.html", {"test": test, "recommendations": recommendations, "stats": compact["test"]})


@teacher_or_admin_required
@require_POST
def test_archive(request, pk):
    test = _owned_test(request.user, pk)
    if test.owner_id != request.user.pk and request.user.role != User.Roles.SUPER_ADMIN:
        from django.http import Http404
        raise Http404
    test.status = Test.Status.ARCHIVED
    test.save(update_fields=["status", "updated_at"])
    test.shares.update(is_active=False)
    messages.success(request, "Test arxivlandi, ulashish havolalari yopildi.")
    return redirect("assessments:list")


@teacher_or_admin_required
@require_POST
def collaborator_add(request, pk):
    test = get_object_or_404(Test, pk=pk, owner=request.user)
    login_name = (request.POST.get("login") or "").strip().lower()
    target = get_object_or_404(User, login=login_name)
    if target.role not in (User.Roles.TEACHER, User.Roles.SUPER_ADMIN) or target.pk == request.user.pk:
        messages.error(request, "Faqat boshqa o'qituvchini hamkor qilib qo'shish mumkin.")
    else:
        TestCollaborator.objects.update_or_create(test=test, user=target, defaults={"can_edit": request.POST.get("can_edit") == "1"})
        messages.success(request, f"{target.full_name} testga hamkor qilib qo'shildi.")
    return redirect("assessments:detail", pk=pk)


@teacher_or_admin_required
@require_POST
def collaborator_remove(request, pk, collaborator_id):
    test = get_object_or_404(Test, pk=pk, owner=request.user)
    TestCollaborator.objects.filter(test=test, pk=collaborator_id).delete()
    messages.success(request, "Test hamkori olib tashlandi.")
    return redirect("assessments:detail", pk=pk)


@login_required
def public_test(request, token):
    share = get_object_or_404(TestShare.objects.select_related("test").prefetch_related("test__questions__options"), token=token, is_active=True)
    test = share.test
    if not share.available() or test.status != Test.Status.PUBLISHED:
        return render(request, "assessments/unavailable.html", status=404)
    if request.user.role != User.Roles.STUDENT:
        messages.error(request, "Testni faqat o'quvchi topshira oladi.")
        return redirect("core:home")
    attempts = Attempt.objects.filter(share=share, student=request.user)
    completed_count = attempts.filter(submitted_at__isnull=False).count()
    max_attempts = share.max_attempts if share.allow_retries else 1
    attempt = attempts.filter(submitted_at__isnull=True).order_by("-started_at").first()
    if not attempt and completed_count >= max_attempts:
        last = attempts.filter(submitted_at__isnull=False).order_by("-submitted_at").first()
        return render(request, "assessments/result.html", {"attempt": last, "closed": True})
    if not attempt and request.method == "GET":
        questions_for_attempt = list(test.questions.all())
        attempt = Attempt.objects.create(
            test=test,
            share=share,
            student=request.user,
            attempt_number=completed_count + 1,
            total=len(questions_for_attempt),
            expires_at=(timezone.now() + timedelta(minutes=share.time_limit_minutes)) if share.time_limit_minutes else None,
        )
    if not attempt:
        return render(request, "assessments/unavailable.html", status=400)
    if attempt.expires_at and timezone.now() > attempt.expires_at:
        attempt.submitted_at = attempt.expires_at
        attempt.status = Attempt.Status.EXPIRED
        attempt.score = 0
        attempt.total = attempt.total or test.questions.count()
        attempt.percentage = 0
        attempt.save(update_fields=["submitted_at", "status", "score", "total", "percentage"])
        return render(request, "assessments/result.html", {"attempt": attempt, "expired": True})
    if request.method == "POST":
        questions = list(test.questions.prefetch_related("options").all())
        score = 0
        with transaction.atomic():
            for question in questions:
                option_id = request.POST.get(f"q_{question.pk}")
                option = question.options.filter(pk=option_id).first() if option_id else None
                correct = bool(option and option.is_correct)
                score += int(correct)
                Answer.objects.update_or_create(attempt=attempt, question=question, defaults={"option": option, "is_correct": correct})
            attempt.score = score
            attempt.total = len(questions)
            attempt.percentage = (score / len(questions) * 100) if questions else 0
            attempt.submitted_at = timezone.now()
            attempt.status = Attempt.Status.SUBMITTED
            attempt.save(update_fields=["score", "total", "percentage", "submitted_at", "status"])
        from notifications.models import Notification
        from notifications.services import notify
        notify(request.user, type=Notification.Type.TEST_RESULT, title="Test natijasi", body=f"{test.title}: {score}/{len(questions)}", link="/student/tests/results/", dedupe_key=f"attempt:{attempt.pk}:result")
        if test.owner_id != request.user.pk:
            notify(test.owner, type=Notification.Type.TEST_RESULT, title="Yangi test natijasi", body=f"{request.user.full_name}: {test.title} — {score}/{len(questions)}", link=f"/teacher/tests/{test.pk}/analytics/", dedupe_key=f"attempt:{attempt.pk}:owner-result")
        try:
            profile = request.user.student_profile
            if profile.parent_telegram_chat_id:
                from integrations.services import telegram_send
                telegram_send(profile.parent_telegram_chat_id, f"{request.user.full_name} testni yakunladi: {test.title} — {score}/{len(questions)} ({attempt.percentage:.0f}%).")
        except Exception:
            pass
        return render(request, "assessments/result.html", {"attempt": attempt})
    questions = list(test.questions.prefetch_related("options").all())
    if attempt.question_order:
        by_id = {str(question.pk): question for question in questions}
        questions = [by_id[key] for key in attempt.question_order if key in by_id]
    else:
        import random
        if share.shuffle_questions:
            random.shuffle(questions)
        attempt.question_order = [str(question.pk) for question in questions]
        attempt.option_order = {}
        for question in questions:
            options = list(question.options.all())
            if share.shuffle_options:
                random.shuffle(options)
            attempt.option_order[str(question.pk)] = [option.pk for option in options]
        attempt.save(update_fields=["question_order", "option_order"])
    for question in questions:
        option_ids = (attempt.option_order or {}).get(str(question.pk), [])
        option_map = {option.pk: option for option in question.options.all()}
        question.presented_options = [option_map[value] for value in option_ids if value in option_map] or list(question.options.all())
    return render(request, "assessments/take.html", {"test": test, "share": share, "questions": questions, "attempt": attempt})


@teacher_or_admin_required
def assistant_materials(request):
    query = (request.GET.get("q") or "").strip()
    items = request.user.ai_materials.all()
    if query:
        items = items.filter(Q(title__icontains=query) | Q(subject__icontains=query) | Q(topic__icontains=query))
    paginator = Paginator(items.order_by("-created_at"), 20)
    page_obj = paginator.get_page(request.GET.get("page"))
    return render(request, "assessments/materials.html", {"page_obj": page_obj, "query": query})


@teacher_or_admin_required
def assistant_material_detail(request, pk):
    item = get_object_or_404(request.user.ai_materials, pk=pk)
    return render(request, "assessments/material_detail.html", {"item": item, "content_json": json.dumps(item.content, ensure_ascii=False, indent=2)})


@teacher_or_admin_required
def assistant_material_edit(request, pk):
    item = get_object_or_404(request.user.ai_materials, pk=pk)
    initial = {"title": item.title, "content_json": json.dumps(item.content, ensure_ascii=False, indent=2)}
    form = AssistantMaterialForm(request.POST or None, kind=item.kind, initial=initial)
    if request.method == "POST" and form.is_valid():
        item.title = form.cleaned_data["title"].strip()
        item.content = form.cleaned_data["content_json"]
        item.content["title"] = item.title
        item.save(update_fields=["title", "content", "updated_at"])
        messages.success(request, "AI materiali yangilandi.")
        return redirect("assessments:material_detail", pk=item.pk)
    return render(request, "assessments/material_edit.html", {"item": item, "form": form})


@teacher_or_admin_required
@require_POST
def assistant_material_delete(request, pk):
    item = get_object_or_404(request.user.ai_materials, pk=pk)
    item.delete()
    messages.success(request, "AI materiali o'chirildi.")
    return redirect("assessments:materials")


@student_required
def student_tests(request):
    from academics.models import GroupMembership
    group_ids = GroupMembership.objects.filter(student=request.user).values_list("group_id", flat=True)
    tests = Test.objects.filter(status=Test.Status.PUBLISHED, group_id__in=group_ids).prefetch_related("shares", "questions").distinct()
    tests = list(tests)
    for test in tests:
        test.active_share = test.shares.filter(is_active=True).first()
    return render(request, "assessments/student_tests.html", {"tests": tests})


@student_required
def my_results(request):
    attempts = Attempt.objects.filter(student=request.user, submitted_at__isnull=False).select_related("test")
    return render(request, "assessments/results.html", {"attempts": attempts})


def _ai_student_for_user(user, student_id):
    if not student_id:
        return None
    try:
        student_id = int(student_id)
    except (TypeError, ValueError):
        return None
    students = User.objects.filter(pk=student_id, role=User.Roles.STUDENT)
    if user.role == User.Roles.TEACHER:
        students = students.filter(group_memberships__group__teacher=user)
    return students.distinct().first()


@teacher_or_admin_required
@user_rate_limit(limit=20, window=60)
def assistant(request, pk=None):
    from .models import AiChatMessage, AiConversation

    if request.GET.get("clear_student") == "1":
        chat_id = pk or request.session.get("ai_active_chat")
        if chat_id:
            request.user.ai_conversations.filter(pk=chat_id).update(selected_student=None)
        request.session.pop("ai_selected_student_id", None)
        if pk:
            return redirect("assessments:assistant_conversation", pk=pk)
        return redirect("assessments:assistant")
    if request.GET.get("student"):
        requested_student = _ai_student_for_user(request.user, request.GET["student"])
        if requested_student:
            request.session["ai_selected_student_id"] = requested_student.pk
            conversation = request.user.ai_conversations.filter(selected_student=requested_student).first()
            if conversation is None:
                conversation = AiConversation.objects.create(
                    owner=request.user,
                    selected_student=requested_student,
                    title=f"{requested_student.full_name} tahlili"[:100],
                )
            request.session["ai_active_chat"] = conversation.pk
            return redirect("assessments:assistant_conversation", pk=conversation.pk)
        else:
            messages.error(request, "Bu o'quvchining ma'lumotlariga ruxsatingiz yo'q.")
            return redirect("assessments:assistant")
    session_student = _ai_student_for_user(request.user, request.session.get("ai_selected_student_id"))
    if request.session.get("ai_selected_student_id") and not session_student:
        request.session.pop("ai_selected_student_id", None)
    old_chat = request.session.pop("ai_teacher_chat", [])
    if old_chat and not request.user.ai_conversations.exists():
        old_conversation = AiConversation.objects.create(owner=request.user, title="Oldingi suhbat")
        AiChatMessage.objects.bulk_create([
            AiChatMessage(conversation=old_conversation, role="USER" if role == "user" else "ASSISTANT", content=body[:8000])
            for role, body in old_chat if role in {"user", "assistant"}
        ])
        request.session["ai_active_chat"] = old_conversation.pk
    conversations = request.user.ai_conversations.all()
    conversation = None
    requested_chat = pk or request.GET.get("chat") or request.session.get("ai_active_chat")
    if requested_chat:
        conversation = conversations.filter(pk=requested_chat).first()
    if not conversation:
        conversation = conversations.first()
    if conversation:
        selected_student = _ai_student_for_user(request.user, conversation.selected_student_id)
        if conversation.selected_student_id and not selected_student:
            conversation.selected_student = None
            conversation.save(update_fields=["selected_student"])
        request.session["ai_active_chat"] = conversation.pk
    else:
        selected_student = session_student
        request.session.pop("ai_active_chat", None)
    form = AssistantForm(request.POST or None)
    answer = ""
    if request.method == "POST" and form.is_valid():
        data = form.cleaned_data
        try:
            answer = ask_assistant(**data)
            from .models import AiMaterial
            AiMaterial.objects.create(owner=request.user, kind=data["type"], title=answer["title"], subject=data["subject"], topic=data["topic"], grade_level=data["grade_level"], input_text=data["text"][:5000], content=answer)
        except AiUnavailable as exc:
            messages.error(request, str(exc))
    history = request.user.ai_materials.order_by("-created_at")[:12]
    answer_text = json.dumps(answer, ensure_ascii=False, indent=2) if answer else ""
    chat_messages = conversation.messages.all() if conversation else []
    return render(request, "assessments/assistant.html", {"form": form, "answer": answer_text, "history": history, "selected_student": selected_student, "conversations": conversations, "active_conversation": conversation, "chat_messages": chat_messages})


def _teacher_ai_context(user, selected_student=None):
    from django.db.models import Avg
    from academics.models import Attendance, GroupMembership, Submission

    groups = user.teacher_groups.all() if user.role == User.Roles.TEACHER else __import__("academics.models", fromlist=["Group"]).Group.objects.all()
    if selected_student:
        group_ids_for_student = GroupMembership.objects.filter(
            student=selected_student, group__in=groups
        ).values_list("group_id", flat=True)
        groups = groups.filter(pk__in=group_ids_for_student).distinct()
    group_ids = list(groups.values_list("id", flat=True))
    memberships = GroupMembership.objects.filter(group_id__in=group_ids).select_related("student", "group")
    students = [selected_student] if selected_student else list({m.student_id: m.student for m in memberships}.values())
    rows = [f"Guruhlar: {', '.join(groups.values_list('name', flat=True)[:30]) or 'yo‘q'}"]
    if selected_student:
        from academics.services import homework_completion
        rows.append(f"Bu chat faqat {selected_student.full_name} o'quvchisi haqida. 'Shu bola' va 'shu o'quvchi' shu bolani anglatadi; boshqa o'quvchilarni tahlil qilma.")
        attendance_rows = Attendance.objects.filter(student=selected_student, group_id__in=group_ids)
        attendance_total = attendance_rows.count()
        attendance = round(100 * attendance_rows.filter(present=True).count() / attendance_total) if attendance_total else None
        grade_value = Submission.objects.filter(student=selected_student, homework__group_id__in=group_ids, reviewed_at__isnull=False, grade__isnull=False).aggregate(value=Avg("grade"))["value"]
        grade = round(grade_value) if grade_value is not None else None
        from academics.models import Group
        homework_counts = [homework_completion(selected_student, group=group, as_of=timezone.localdate()) for group in Group.objects.filter(pk__in=group_ids)]
        homework_total = sum(item["total"] for item in homework_counts)
        homework_submitted = sum(item["submitted"] for item in homework_counts)
        homework_percent = round(100 * homework_submitted / homework_total) if homework_total else None
        rows.append(f"Davomat: {attendance}%" if attendance is not None else "Davomat: hozircha yozuv yo'q")
        rows.append(f"Tekshirilgan vazifalarning o'rtacha bahosi: {grade}" if grade is not None else "Tekshirilgan vazifalar bahosi: hozircha yo'q")
        rows.append(f"Uy vazifalari: {homework_submitted}/{homework_total} topshirilgan, bajarilish {homework_percent}%" if homework_percent is not None else "Uy vazifalari: hozircha topshirish muddati yetgan vazifa yo'q")
    else:
        rows.append("O'quvchilar: " + ("; ".join(f"{s.full_name} (id={s.pk})" for s in students[:80]) or "yo'q"))
    submissions = Submission.objects.filter(homework__group_id__in=group_ids).select_related("student", "homework").order_by("-submitted_at")
    if selected_student:
        submissions = submissions.filter(student=selected_student)
    submissions = submissions[:50]
    rows.append("So'nggi topshiriqlar: " + ("; ".join(f"{x.student.full_name} — {x.homework.title}: {x.grade if x.grade is not None else 'baholanmagan'}/100" for x in submissions) or "yo'q"))
    from .models import Attempt
    attempts = Attempt.objects.filter(test__group_id__in=group_ids, submitted_at__isnull=False).select_related("student", "test").order_by("-submitted_at")
    if selected_student:
        attempts = attempts.filter(student=selected_student)
    attempts = attempts[:50]
    rows.append("So'nggi test natijalari: " + ("; ".join(f"{x.student.full_name} — {x.test.title}: {x.score}/{x.total} ({x.percentage or 0:.0f}%)" for x in attempts) or "yo'q"))
    return "\n".join(rows), students


def _try_grade_action(request, text, students, selected_student=None):
    """Recognize a narrow grade request; never write until the teacher confirms."""
    if not re.search(r"\b(baho|ball|bahola|qo['’]?y\w*|qoy\w*)\b", text, re.I):
        return None
    grade_match = (
        re.search(r"(?<!\d)(100|[1-9]?\d|0)\s*(?:ball(?:i)?|baho(?:si)?)\b", text, re.I)
        or re.search(r"\b(?:baho|ball)(?:ni|ga|si)?\s*(?:=|:)?\s*(100|\d{1,2})\b", text, re.I)
        or re.search(r"(?<!\d)(100|[1-9]?\d|0)\s*(?:qo['’]?y|qoy|ber)\b", text, re.I)
        or re.search(r"\b(?:qo['’]?y\w*|qoy\w*)\s*(?:baho|ball)?\s*(100|\d{1,2})\b", text, re.I)
    )
    if not grade_match:
        return "Qaysi bahoni qo'yishim kerak? 0 dan 100 gacha sonni yozing."
    grade = int(grade_match.group(1))
    normalized = " ".join(re.sub(r"[^\w\s]", " ", text.casefold()).split())
    matches = [student for student in students if " ".join(student.full_name.casefold().split()) in normalized]
    if not matches and selected_student and re.search(r"\b(shu\s+bol\w*|shu\s+o['’]?quvchi\w*|mana\s+shu(?:\s+bol\w*)?|ushbu\s+o['’]?quvchi\w*|unga)\b", text, re.I):
        matches = [selected_student]
    if not matches:
        return "Qaysi o'quvchi ekanini ism-familiyasi bilan yozing. Men faqat sizning guruhlaringizdagi o'quvchilarni topa olaman."
    if len(matches) > 1:
        return "Bir nechta o'quvchi mos keldi. Iltimos, to'liq ism-familiyani yozing."
    student = matches[0]
    from academics.models import Submission
    submissions = Submission.objects.filter(student=student, homework__group__in=request.user.teacher_groups.all()) if request.user.role == User.Roles.TEACHER else Submission.objects.filter(student=student)
    titles = [x.homework.title.casefold() for x in submissions.select_related("homework")]
    named = [title for title in titles if title in normalized]
    if named:
        submissions = submissions.filter(homework__title__iexact=next(iter(named)))
    submissions = submissions.select_related("homework").order_by("-submitted_at")
    if submissions.count() != 1:
        if not submissions.exists():
            return f"{student.full_name} uchun baholanadigan yuborilgan uy vazifasi topilmadi. Avval o'quvchi topshiriq yuborgan bo'lishi kerak."
        choices = ", ".join(dict.fromkeys(submissions.values_list("homework__title", flat=True)[:8]))
        return f"{student.full_name}da bir nechta topshiriq bor. Qaysi biriga baho qo'yay? Nomi: {choices}."
    submission = submissions.first()
    request.session["ai_pending_action"] = {"type": "GRADE", "submission_id": submission.pk, "grade": grade}
    return None


def _try_homework_action(request, text):
    if not re.search(r"\b(uy\s*vazifa|topshiriq)\b", text, re.I) or not re.search(r"\b(ber\w*|yarat\w*|tuz\w*|topshir\w*)\b", text, re.I):
        return None
    groups = request.user.teacher_groups.all() if request.user.role == User.Roles.TEACHER else __import__("academics.models", fromlist=["Group"]).Group.objects.all()
    normalized = " ".join(re.sub(r"[^\w\s]", " ", text.casefold()).split())
    matches = [group for group in groups if " ".join(group.name.casefold().split()) in normalized]
    if len(matches) != 1:
        names = ", ".join(groups.values_list("name", flat=True)[:12])
        if not names:
            return "Avval guruh yarating, keyin AI orqali unga uy vazifasi bering."
        return f"Vazifani qaysi guruhga beray? Guruh nomini yozing: {names}."
    group = matches[0]
    try:
        draft = draft_chat_homework(request_text=text, group_name=group.name)
    except AiUnavailable as exc:
        return str(exc)
    request.session["ai_pending_action"] = {"type": "HOMEWORK", "group_id": group.pk, **draft}
    return None


def _greeting_reply(text):
    normalized = re.sub(r"[^\w\s]", "", (text or "").casefold()).strip()
    greetings = {"salom", "assalomu alaykum", "assalom alaykum", "assalom", "hello", "hi", "hey", "va alaykum assalom", "yaxshimisiz"}
    if normalized in greetings:
        return "Salom! Men TeacherWeb AI yordamchisiman. O'quvchilar natijasini tahlil qilish, uy vazifasi tuzish yoki sayt bo'yicha savollaringizga yordam beraman. Nima qilamiz?"
    return None


@teacher_or_admin_required
@require_POST
def assistant_new_chat(request):
    from .models import AiConversation
    selected_student = _ai_student_for_user(request.user, request.session.get("ai_selected_student_id"))
    if request.session.get("ai_selected_student_id") and not selected_student:
        request.session.pop("ai_selected_student_id", None)
    conversation = AiConversation.objects.create(owner=request.user, selected_student=selected_student)
    request.session["ai_active_chat"] = conversation.pk
    request.session.pop("ai_pending_action", None)
    return redirect("assessments:assistant_conversation", pk=conversation.pk)


@teacher_or_admin_required
@require_POST
def assistant_rename_chat(request, pk):
    conversation = get_object_or_404(request.user.ai_conversations, pk=pk)
    title = (request.POST.get("title") or "").strip()[:100]
    if title:
        conversation.title = title
        conversation.save(update_fields=["title", "updated_at"])
        messages.success(request, "Chat nomi o'zgartirildi.")
    else:
        messages.error(request, "Chat nomini bo'sh qoldirmang.")
    return redirect("assessments:assistant_conversation", pk=pk)


@teacher_or_admin_required
@require_POST
def assistant_pin_chat(request, pk):
    conversation = get_object_or_404(request.user.ai_conversations, pk=pk)
    conversation.is_pinned = not conversation.is_pinned
    conversation.save(update_fields=["is_pinned", "updated_at"])
    return redirect("assessments:assistant_conversation", pk=pk)


@teacher_or_admin_required
@require_POST
def assistant_delete_chat(request, pk):
    conversation = get_object_or_404(request.user.ai_conversations, pk=pk)
    conversation.delete()
    request.session.pop("ai_pending_action", None)
    if request.session.get("ai_active_chat") == pk:
        request.session.pop("ai_active_chat", None)
    return redirect("assessments:assistant")


@teacher_or_admin_required
@user_rate_limit(limit=20, window=60)
@require_POST
def assistant_chat(request):
    from .models import AiChatMessage
    conversation = get_object_or_404(request.user.ai_conversations, pk=request.POST.get("conversation_id"))
    request.session["ai_active_chat"] = conversation.pk
    pending = request.session.get("ai_pending_action")
    action = request.POST.get("action", "send")
    if action == "cancel":
        if pending and int(pending.get("conversation_id", 0)) == conversation.pk:
            request.session.pop("ai_pending_action", None)
            cancel_text = "Amal bekor qilindi. Hech narsa o'zgartirilmadi."
        else:
            cancel_text = "Bu chat uchun kutayotgan amal topilmadi."
        AiChatMessage.objects.create(conversation=conversation, role="ASSISTANT", content=cancel_text)
    elif action == "confirm":
        from academics.models import Submission
        from notifications.models import Notification
        from notifications.services import notify

        if pending and int(pending.get("conversation_id", 0)) == conversation.pk and pending.get("type") == "HOMEWORK":
            from academics.models import Group, Homework, GroupMembership
            group_qs = Group.objects.filter(pk=pending.get("group_id"))
            if request.user.role == User.Roles.TEACHER:
                group_qs = group_qs.filter(teacher=request.user)
            group = group_qs.first()
            if group and len(pending.get("title", "")) <= 180 and len(pending.get("description", "")) <= 4000:
                with transaction.atomic():
                    homework = Homework.objects.create(group=group, title=pending["title"], description=pending["description"])
                    for membership in GroupMembership.objects.filter(group=group).select_related("student"):
                        notify(membership.student, type=Notification.Type.SYSTEM, title="Yangi uy vazifasi", body=homework.title, link=f"/student/homework/{homework.pk}/")
                response = f"Tayyor. '{homework.title}' vazifasi {group.name} guruhiga berildi."
            else:
                response = "Guruh topilmadi yoki ma'lumot noto'g'ri. Vazifa saqlanmadi."
        else:
            submission = None
        if pending and int(pending.get("conversation_id", 0)) == conversation.pk and pending.get("type") == "GRADE":
            qs = Submission.objects.select_related("homework__group", "student").filter(pk=pending["submission_id"])
            if request.user.role == User.Roles.TEACHER:
                qs = qs.filter(homework__group__teacher=request.user)
            submission = qs.first()
            if not submission or not 0 <= int(pending["grade"]) <= 100:
                response = "Topshiriq topilmadi yoki unga ruxsatingiz yo'q. Baho qo'yilmadi."
            else:
                with transaction.atomic():
                    submission.grade = int(pending["grade"])
                    submission.result = Submission.Result.DONE if submission.grade >= 60 else Submission.Result.WRONG
                    submission.reviewed_at = timezone.now()
                    submission.save()
                    notify(submission.student, type=Notification.Type.HOMEWORK_REVIEWED, title="Uy vazifangiz tekshirildi", body=f"{submission.homework.title}: {submission.grade}/100 baho.", link="/student/homework/")
                response = f"Tayyor. {submission.student.full_name}ga '{submission.homework.title}' bo'yicha {submission.grade}/100 baho qo'yildi."
        elif not pending or int(pending.get("conversation_id", 0)) != conversation.pk:
            response = "Kutilayotgan tasdiq topilmadi. Hech narsa o'zgartirilmadi."
        request.session.pop("ai_pending_action", None)
        AiChatMessage.objects.create(conversation=conversation, role="ASSISTANT", content=response)
    elif action == "send":
        text = (request.POST.get("message") or "").strip()[:2000]
        if text:
            request.session.pop("ai_pending_action", None)
            AiChatMessage.objects.create(conversation=conversation, role="USER", content=text)
            if conversation.title == "Yangi chat":
                conversation.title = text[:96] or "Yangi chat"
            conversation.save(update_fields=["title", "updated_at"])
            from academics.models import GroupMembership
            selected_student = _ai_student_for_user(request.user, conversation.selected_student_id)
            if conversation.selected_student_id and not selected_student:
                conversation.selected_student = None
                conversation.save(update_fields=["selected_student"])
            context, students = _teacher_ai_context(request.user, selected_student)
            response = _greeting_reply(text)
            if response is None:
                response = _try_homework_action(request, text)
            if response is None and not request.session.get("ai_pending_action"):
                response = _try_grade_action(request, text, students, selected_student)
            if response is None and request.session.get("ai_pending_action"):
                pending = request.session["ai_pending_action"]
                pending["conversation_id"] = conversation.pk
                request.session["ai_pending_action"] = pending
                if pending["type"] == "GRADE":
                    from academics.models import Submission
                    item = Submission.objects.select_related("student", "homework").get(pk=pending["submission_id"])
                    response = f"{item.student.full_name}ga '{item.homework.title}' topshirig'i uchun {pending['grade']}/100 baho qo'yishni tasdiqlaysizmi?"
                else:
                    from academics.models import Group
                    group = Group.objects.filter(pk=pending["group_id"]).first()
                    response = f"{group.name} guruhiga quyidagi vazifani berishni tasdiqlaysizmi?\n\n{pending['title']}\n{pending['description']}"
            elif response is None:
                # Keep enough of this saved conversation for follow-up questions.
                # Use a stable secondary key because several messages may share a timestamp.
                recent_messages = list(conversation.messages.order_by("-created_at", "-id")[:40])
                history = [("user" if item.role == "USER" else "assistant", item.content) for item in reversed(recent_messages)]
                try:
                    response = chat_with_teacher(history=history, site_context=context)
                except AiUnavailable as exc:
                    response = str(exc)
            AiChatMessage.objects.create(conversation=conversation, role="ASSISTANT", content=response)
    conversation.save(update_fields=["updated_at"])
    return redirect("assessments:assistant_conversation", pk=conversation.pk)
