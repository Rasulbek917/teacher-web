"""Read-only export from the previous Prisma database into this Django schema.

Dry-run: python manage.py import_legacy_db --source-url "$LEGACY_DATABASE_URL"
Import:   python manage.py import_legacy_db --source-url "$LEGACY_DATABASE_URL" --execute
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from psycopg import connect
from psycopg.rows import dict_row
from accounts.models import StudentProfile, TeacherProfile, User
from academics.models import Attendance, Group, GroupMembership, Homework, Material, MaterialImage, Submission
from assessments.models import AiMaterial, Answer, Attempt, Option, Question, Test, TestCollaborator, TestShare
from chat.models import Conversation, ConversationParticipant, Message, MessageRead
from integrations.models import LegacyUploadedFile, ParentNotificationLog, TelegramNotificationLog, TelegramUpdateLog
from notifications.models import Notification
from payments.models import Payment, PaymentDeadline

TABLES = ["User", "TeacherProfile", "StudentProfile", "Group", "GroupMembership", "Attendance", "Material", "Homework", "Submission", "Payment", "PaymentDeadline", "Notification", "Conversation", "ConversationParticipant", "Message", "MessageRead", "Test", "Question", "QuestionOption", "TestShare", "TestCollaborator", "TestAttempt", "AttemptAnswer", "AiMaterial", "TelegramUpdateLog", "ParentNotificationLog", "UploadedFile"]


def value(row, camel, default=None):
    return row.get(camel, default)


class Command(BaseCommand):
    help = "Imports records from the old Prisma PostgreSQL database (read-only source)."

    def add_arguments(self, parser):
        parser.add_argument("--source-url", default="")
        parser.add_argument("--execute", action="store_true", help="Write imported records to Django DB. Default is a read-only count preview.")

    def handle(self, *args, **options):
        source_url = options["source_url"].strip()
        if not source_url:
            import os
            source_url = os.environ.get("LEGACY_DATABASE_URL", "").strip()
        if not source_url:
            raise CommandError("LEGACY_DATABASE_URL yoki --source-url kerak.")
        try:
            with connect(source_url, row_factory=dict_row) as source:
                source.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
                data = {}
                for table in TABLES:
                    try:
                        data[table] = source.execute(f'SELECT * FROM "{table}"').fetchall()
                    except Exception as exc:
                        if "does not exist" in str(exc):
                            source.rollback()
                            source.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
                            data[table] = []
                        else:
                            raise
        except Exception as exc:
            raise CommandError(f"Eski bazani faqat o'qish rejimida ochib bo'lmadi: {exc}") from exc

        self.stdout.write("Eski baza yozuvlari:")
        for table, rows in data.items():
            if rows:
                self.stdout.write(f"  {table}: {len(rows)}")
        if not options["execute"]:
            self.stdout.write(self.style.WARNING("Faqat ko'rib chiqildi. Import uchun --execute qo'shing."))
            return
        if User.objects.exists() or Group.objects.exists() or Test.objects.exists():
            raise CommandError("Django bazasi bo'sh emas. Import faqat bo'sh maqsad bazaga bajariladi.")

        maps = {name: {} for name in TABLES}
        with transaction.atomic():
            self._users(data, maps)
            self._profiles(data, maps)
            self._groups(data, maps)
            self._academics(data, maps)
            self._payments_notifications(data, maps)
            self._chat(data, maps)
            self._assessments(data, maps)
            self._logs(data, maps)
        self.stdout.write(self.style.SUCCESS("Eski baza yozuvlari Django modellariga ko'chirildi."))

    def _users(self, data, maps):
        for row in data["User"]:
            old_id = row["id"]
            password = row.get("passwordHash") or ""
            user = User.objects.create(
                login=row["login"].strip().lower(), role=row["role"],
                first_name=row.get("firstName") or "", last_name=row.get("lastName") or "",
                phone=row.get("phone") or "", language=row.get("language") or "UZ",
                theme=row.get("theme") or "LIGHT", is_blocked=bool(row.get("isBlocked")),
                token_version=row.get("tokenVersion") or 0,
                external_avatar_url=row.get("avatarUrl") or "",
                telegram_chat_id=row.get("telegramChatId") or None,
                is_active=not bool(row.get("isBlocked")),
                is_staff=row.get("role") == "SUPER_ADMIN",
                is_superuser=row.get("role") == "SUPER_ADMIN",
                date_joined=row.get("createdAt") or timezone.now(),
                password=f"legacy_bcrypt${password}" if password.startswith("$2") else "!",
            )
            maps["User"][old_id] = user.pk

    def _profiles(self, data, maps):
        for row in data["TeacherProfile"]:
            TeacherProfile.objects.create(
                user_id=maps["User"][row["userId"]], center_name=row.get("centerName") or "",
                city=row.get("city") or "", telegram_chat_id=row.get("telegramChatId") or None,
                telegram_link_token=row.get("telegramLinkToken") or None,
                telegram_linked_at=row.get("telegramLinkedAt"),
            )
        for row in data["StudentProfile"]:
            StudentProfile.objects.create(
                user_id=maps["User"][row["userId"]], parent_phone=row.get("parentPhone") or "",
                parent_telegram_chat_id=row.get("parentTelegramChatId") or None,
                telegram_link_token=row.get("telegramLinkToken") or None,
                telegram_linked_at=row.get("telegramLinkedAt"),
            )

    def _groups(self, data, maps):
        for row in data["Group"]:
            obj = Group.objects.create(
                teacher_id=maps["User"][row["teacherId"]], name=row["name"], level=row.get("level") or "",
                lesson_days=row.get("lessonDays") or [], lesson_time=row.get("lessonTime") or "09:00",
                monthly_price=row.get("monthlyPrice") or 0,
            )
            maps["Group"][row["id"]] = obj.pk
        for row in data["GroupMembership"]:
            GroupMembership.objects.create(
                group_id=maps["Group"][row["groupId"]], student_id=maps["User"][row["studentId"]],
                custom_price=row.get("customPrice"), joined_at=row.get("joinedAt") or timezone.now(),
            )

    def _academics(self, data, maps):
        for row in data["Attendance"]:
            Attendance.objects.create(group_id=maps["Group"][row["groupId"]], student_id=maps["User"][row["studentId"]], date=row["date"], present=row["present"])
        for row in data["Material"]:
            obj = Material.objects.create(
                group_id=maps["Group"][row["groupId"]], type=row["type"], title=row["title"],
                description=row.get("description") or "", video_source=row.get("videoSource") or "",
                external_file_url=row.get("fileUrl") or "", youtube_url=row.get("youtubeUrl") or "",
                image_urls=row.get("imageUrls") or [],
            )
            maps["Material"][row["id"]] = obj.pk
        for row in data["Homework"]:
            obj = Homework.objects.create(
                group_id=maps["Group"][row["groupId"]], title=row["title"], description=row.get("description") or "",
                due_at=row.get("dueAt"), attachment_urls=row.get("attachmentUrls") or [],
            )
            maps["Homework"][row["id"]] = obj.pk
        for row in data["Submission"]:
            Submission.objects.create(
                homework_id=maps["Homework"][row["homeworkId"]], student_id=maps["User"][row["studentId"]],
                text=row.get("text") or "", external_file_url=row.get("fileUrl") or "", status=row["status"],
                submitted_at=row.get("submittedAt") or timezone.now(), result=row.get("result") or "",
                grade=row.get("grade"), comment=row.get("comment") or "", reviewed_at=row.get("reviewedAt"),
            )

    def _payments_notifications(self, data, maps):
        for row in data["Payment"]:
            Payment.objects.create(
                teacher_id=maps["User"][row["teacherId"]], student_id=maps["User"].get(row.get("studentId")),
                group_id=maps["Group"].get(row.get("groupId")), student_name=row.get("studentName") or "",
                group_name=row.get("groupName") or "", price_snapshot=row.get("priceSnapshot") or 0,
                period_year=row["periodYear"], period_month=row["periodMonth"], amount=row.get("amount") or 0,
                status=row["status"], paid_at=row.get("paidAt"),
            )
        for row in data["PaymentDeadline"]:
            PaymentDeadline.objects.create(teacher_id=maps["User"][row["teacherId"]], period_year=row["periodYear"], period_month=row["periodMonth"], due_date=row["dueDate"])
        for row in data["Notification"]:
            Notification.objects.create(
                user_id=maps["User"][row["userId"]], type=row["type"], title=row["title"], body=row.get("body") or "",
                link=row.get("link") or "", is_read=bool(row.get("isRead")), dedupe_key=row.get("dedupeKey") or None,
            )

    def _chat(self, data, maps):
        for row in data["Conversation"]:
            group_id = maps["Group"].get(row.get("groupId"))
            obj = Conversation.objects.create(type=row["type"], group_id=group_id, last_message_at=row.get("lastMessageAt") or timezone.now())
            maps["Conversation"][row["id"]] = obj.pk
        for row in data["ConversationParticipant"]:
            ConversationParticipant.objects.create(conversation_id=maps["Conversation"][row["conversationId"]], user_id=maps["User"][row["userId"]])
        for row in data["Message"]:
            obj = Message.objects.create(
                conversation_id=maps["Conversation"][row["conversationId"]], sender_id=maps["User"][row["senderId"]],
                type=row["type"], text=row.get("text") or "", external_file_url=row.get("fileUrl") or "", edited_at=row.get("editedAt"),
            )
            maps["Message"][row["id"]] = obj.pk
        for row in data["MessageRead"]:
            MessageRead.objects.create(message_id=maps["Message"][row["messageId"]], user_id=maps["User"][row["userId"]], read_at=row.get("readAt") or timezone.now())

    def _assessments(self, data, maps):
        for row in data["Test"]:
            obj = Test.objects.create(
                owner_id=maps["User"][row["ownerId"]], group_id=maps["Group"].get(row.get("groupId")),
                title=row["title"], description=row.get("description") or "", subject=row.get("subject") or "",
                topic=row.get("topic") or "", grade_level=row.get("gradeLevel") or "", difficulty=row.get("difficulty") or "MIXED",
                status=row.get("status") or "DRAFT", language=row.get("language") or "uz", ai_generated=bool(row.get("aiGenerated")),
                published_at=row.get("publishedAt"),
            )
            maps["Test"][row["id"]] = obj.pk
        for row in data["Question"]:
            obj = Question.objects.create(test_id=maps["Test"][row["testId"]], order=row["order"], text=row["text"], explanation=row.get("explanation") or "", difficulty=row.get("difficulty") or "MEDIUM", topic=row.get("topic") or "")
            maps["Question"][row["id"]] = obj.pk
        for row in data["QuestionOption"]:
            obj = Option.objects.create(question_id=maps["Question"][row["questionId"]], order=row["order"], text=row["text"], is_correct=bool(row.get("isCorrect")))
            maps["QuestionOption"][row["id"]] = obj.pk
        for row in data["TestShare"]:
            obj = TestShare.objects.create(
                test_id=maps["Test"][row["testId"]], token=row["token"], is_active=bool(row.get("isActive", True)),
                expires_at=row.get("expiresAt"), start_at=row.get("startAt"), end_at=row.get("endAt"),
                time_limit_minutes=row.get("timeLimitMinutes"), allow_retries=bool(row.get("allowRetries")),
                max_attempts=row.get("maxAttempts") or 1, shuffle_questions=bool(row.get("shuffleQuestions")), shuffle_options=bool(row.get("shuffleOptions")),
            )
            maps["TestShare"][row["id"]] = obj.pk
        for row in data["TestCollaborator"]:
            TestCollaborator.objects.create(test_id=maps["Test"][row["testId"]], user_id=maps["User"][row["userId"]], can_edit=bool(row.get("canEdit")))
        for row in data["TestAttempt"]:
            obj = Attempt.objects.create(
                test_id=maps["Test"][row["testId"]], share_id=maps["TestShare"].get(row.get("shareId")), student_id=maps["User"][row["studentId"]],
                attempt_number=row.get("attemptNumber") or 1, status=row.get("status") or "IN_PROGRESS", started_at=row.get("startedAt") or timezone.now(),
                expires_at=row.get("expiresAt"), submitted_at=row.get("submittedAt"), score=row.get("score"), total=row.get("totalPoints"),
                percentage=row.get("percentage"), question_order=row.get("questionOrder"), option_order=row.get("optionOrder"),
            )
            maps["TestAttempt"][row["id"]] = obj.pk
        for row in data["AttemptAnswer"]:
            Answer.objects.create(attempt_id=maps["TestAttempt"][row["attemptId"]], question_id=maps["Question"][row["questionId"]], option_id=maps["QuestionOption"].get(row.get("optionId")), is_correct=bool(row.get("isCorrect")))
        for row in data["AiMaterial"]:
            AiMaterial.objects.create(owner_id=maps["User"][row["ownerId"]], kind=row["type"], title=row["title"], subject=row.get("subject") or "", topic=row.get("topic") or "", grade_level=row.get("gradeLevel") or "", input_text=row.get("inputText") or "", content=row.get("content") or {})

    def _logs(self, data, maps):
        for row in data["TelegramUpdateLog"]:
            TelegramUpdateLog.objects.create(update_id=row["updateId"], created_at=row.get("createdAt") or timezone.now())
        for row in data["ParentNotificationLog"]:
            ParentNotificationLog.objects.create(
                student_id=maps["User"][row["studentId"]], group_id=maps["Group"].get(row.get("groupId")),
                kind=row["kind"], dedupe_key=row["dedupeKey"], period_year=row.get("periodYear"),
                period_month=row.get("periodMonth"), offset_days=row.get("offsetDays"), sent_at=row.get("sentAt") or timezone.now(),
            )
        for row in data["UploadedFile"]:
            LegacyUploadedFile.objects.create(
                path=row["path"], filename=row["filename"], mime_type=row["mimeType"], size=row["size"],
                scope=row["scope"], scope_id=row.get("scopeId") or "", owner_id=maps["User"][row["ownerId"]],
                created_at=row.get("createdAt") or timezone.now(),
            )
        for row in data.get("ParentNotificationLog", []):
            TelegramNotificationLog.objects.get_or_create(dedupe_key=row["dedupeKey"])
