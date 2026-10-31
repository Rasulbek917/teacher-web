"""Demo ma'lumotlar: superadmin, o'qituvchi, guruhlar, o'quvchilar, davomat,
uy vazifalari va to'lovlar. Idempotent — qayta ishga tushirish xavfsiz.

    python manage.py seed_demo
"""
import os
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from academics.models import Attendance, Group, GroupMembership, Homework, Submission
from accounts.models import StudentProfile, TeacherProfile, User
from chat.services import ensure_group_conversation
from payments.models import Payment
from payments.services import mark_paid


class Command(BaseCommand):
    help = "Demo ma'lumotlarni yaratadi (superadmin, o'qituvchi, o'quvchilar)."

    def handle(self, *args, **options):
        superadmin_login = os.environ.get("SUPERADMIN_LOGIN", "superadmin")
        superadmin_password = os.environ.get("SUPERADMIN_PASSWORD", "superadmin123")

        superadmin, created = User.objects.get_or_create(
            login=superadmin_login,
            defaults={
                "role": User.Roles.SUPER_ADMIN,
                "first_name": "Super",
                "last_name": "Admin",
                "phone": "+998 90 000 00 00",
                "is_staff": True,
                "is_superuser": True,
            },
        )
        if created:
            superadmin.set_password(superadmin_password)
            superadmin.save()
            self.stdout.write(
                self.style.SUCCESS(
                    f"Super Admin: {superadmin_login} / {superadmin_password}"
                )
            )

        teacher, created = User.objects.get_or_create(
            login="oqituvchi",
            defaults={
                "role": User.Roles.TEACHER,
                "first_name": "Dilnoza",
                "last_name": "Karimova",
                "phone": "+998 90 111 22 33",
            },
        )
        if created:
            teacher.set_password("teacher123")
            teacher.save()
        TeacherProfile.objects.get_or_create(
            user=teacher,
            defaults={
                "center_name": "English Speaking Center",
                "city": "Toshkent",
            },
        )

        group1, _ = Group.objects.get_or_create(
            teacher=teacher,
            name="Beginner A1",
            defaults={
                "level": "A1",
                "lesson_days": [1, 3, 5],
                "lesson_time": "09:00",
                "monthly_price": 300000,
            },
        )
        group2, _ = Group.objects.get_or_create(
            teacher=teacher,
            name="IELTS 6.5",
            defaults={
                "level": "B2",
                "lesson_days": [2, 4, 6],
                "lesson_time": "15:00",
                "monthly_price": 450000,
            },
        )
        ensure_group_conversation(group1)
        ensure_group_conversation(group2)

        demo_students = [
            ("Aziza", "Karimova", group1, "+998 90 123 45 67", "+998 91 000 11 22"),
            ("Jasur", "Toshmatov", group1, "+998 91 234 56 78", "+998 91 000 33 44"),
            ("Madina", "Ergasheva", group2, "+998 93 345 67 89", "+998 93 000 55 66"),
        ]
        students = []
        for index, (first, last, group, phone, parent_phone) in enumerate(
            demo_students, start=1
        ):
            login = f"student{index}"
            student, created = User.objects.get_or_create(
                login=login,
                defaults={
                    "role": User.Roles.STUDENT,
                    "first_name": first,
                    "last_name": last,
                    "phone": phone,
                },
            )
            if created:
                student.set_password("student123")
                student.save()
            StudentProfile.objects.get_or_create(
                user=student, defaults={"parent_phone": parent_phone}
            )
            GroupMembership.objects.get_or_create(group=group, student=student)
            students.append(student)

        # Davomat: oxirgi 14 kun ichida dars kunlari
        today = timezone.localdate()
        for group in (group1, group2):
            for offset in range(14):
                day = today - timedelta(days=offset)
                if day.isoweekday() not in group.days_list:
                    continue
                for membership in group.memberships.all():
                    present = (day.toordinal() + membership.student_id) % 5 != 0
                    Attendance.objects.get_or_create(
                        group=group,
                        student=membership.student,
                        date=day,
                        defaults={"present": present},
                    )

        # Uy vazifalari
        hw1, _ = Homework.objects.get_or_create(
            group=group1,
            title="Unit 3: Present Simple",
            defaults={
                "description": "Workbook 3-bob, 1–5 mashqlar. Present Simple zamoni.",
                "due_at": timezone.now() + timedelta(days=2),
            },
        )
        hw2, _ = Homework.objects.get_or_create(
            group=group1,
            title="Writing: My daily routine",
            defaults={
                "description": "Write 10 sentences about your daily routine.",
                "due_at": timezone.now() - timedelta(days=1),
            },
        )
        hw3, _ = Homework.objects.get_or_create(
            group=group2,
            title="IELTS Writing Task 1 — Chart",
            defaults={
                "description": "Bar chart: 150 words minimum.",
                "due_at": timezone.now() + timedelta(days=4),
            },
        )

        aziza, jasur, madina = students
        submission1, created = Submission.objects.get_or_create(
            homework=hw1,
            student=aziza,
            defaults={"text": "Present Simple: I go to school every day...", "submitted_at": timezone.now() - timedelta(hours=5)},
        )
        if created:
            submission1.grade = 85
            submission1.result = Submission.Result.DONE
            submission1.comment = "Yaxshi bajarilgan."
            submission1.reviewed_at = timezone.now() - timedelta(hours=2)
            submission1.save()
        Submission.objects.get_or_create(
            homework=hw1,
            student=jasur,
            defaults={"text": "My homework is attached.", "submitted_at": timezone.now() - timedelta(hours=1)},
        )
        Submission.objects.get_or_create(
            homework=hw2,
            student=aziza,
            defaults={"text": "My daily routine...", "submitted_at": timezone.now() - timedelta(days=1)},
        )
        Submission.objects.get_or_create(
            homework=hw3,
            student=madina,
            defaults={"text": "The chart shows...", "submitted_at": timezone.now() - timedelta(hours=3)},
        )

        # Joriy oy to'lovlari
        year, month = timezone.localdate().year, timezone.localdate().month
        mark_paid(
            teacher,
            student=aziza,
            group=group1,
            year=year,
            month=month,
            amount=300000,
        )
        mark_paid(
            teacher,
            student=jasur,
            group=group1,
            year=year,
            month=month,
            amount=150000,
        )

        self.stdout.write(self.style.SUCCESS("Demo ma'lumotlar tayyor."))
        self.stdout.write("  O'qituvchi: oqituvchi / teacher123")
        self.stdout.write("  O'quvchi:   student1 / student123")
        self.stdout.write(f"  Superadmin: {superadmin_login} / {superadmin_password}")
