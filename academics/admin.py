from django.contrib import admin

from academics.models import (
    Attendance,
    Group,
    GroupMembership,
    Homework,
    Material,
    MaterialImage,
    Submission,
)


class GroupMembershipInline(admin.TabularInline):
    model = GroupMembership
    extra = 0


@admin.register(Group)
class GroupAdmin(admin.ModelAdmin):
    list_display = ("name", "teacher", "level", "lesson_time", "monthly_price")
    list_filter = ("teacher",)
    search_fields = ("name", "level")
    inlines = [GroupMembershipInline]


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ("student", "group", "date", "present")
    list_filter = ("present", "group")
    date_hierarchy = "date"


class MaterialImageInline(admin.TabularInline):
    model = MaterialImage
    extra = 0


@admin.register(Material)
class MaterialAdmin(admin.ModelAdmin):
    list_display = ("title", "group", "type", "created_at")
    list_filter = ("type", "group")
    search_fields = ("title",)
    inlines = [MaterialImageInline]


class SubmissionInline(admin.TabularInline):
    model = Submission
    extra = 0


@admin.register(Homework)
class HomeworkAdmin(admin.ModelAdmin):
    list_display = ("title", "group", "due_at", "created_at")
    list_filter = ("group",)
    search_fields = ("title",)
    inlines = [SubmissionInline]


@admin.register(Submission)
class SubmissionAdmin(admin.ModelAdmin):
    list_display = ("student", "homework", "status", "grade", "reviewed_at")
    list_filter = ("status", "result")
