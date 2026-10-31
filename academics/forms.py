from django import forms
from django.core.exceptions import ValidationError

from academics.models import Group, Homework, Material, Submission
from accounts.models import User
from core.forms import StyledForm, StyledModelForm
from core.utils import WEEKDAYS_UZ


class MultipleFileInput(forms.ClearableFileInput):
    allow_multiple_selected = True


class MultipleFileField(forms.FileField):
    def __init__(self, *args, **kwargs):
        kwargs.setdefault("widget", MultipleFileInput(attrs={"multiple": True}))
        super().__init__(*args, **kwargs)

    def clean(self, data, initial=None):
        single = super().clean
        if isinstance(data, (list, tuple)):
            return [single(item, initial) for item in data]
        if data:
            return [single(data, initial)]
        return []


class GroupForm(StyledModelForm):
    lesson_days = forms.MultipleChoiceField(
        label="Dars kunlari",
        choices=[(str(num), name) for num, name in WEEKDAYS_UZ.items()],
        widget=forms.CheckboxSelectMultiple,
        required=False,
    )

    class Meta:
        model = Group
        fields = ["name", "level", "lesson_days", "lesson_time", "monthly_price"]
        widgets = {
            "lesson_time": forms.TimeInput(attrs={"type": "time"}, format="%H:%M"),
            "monthly_price": forms.NumberInput(attrs={"min": 0, "step": 10000}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk:
            self.fields["lesson_days"].initial = [str(d) for d in self.instance.days_list]

    def clean_lesson_days(self):
        return [int(d) for d in self.cleaned_data.get("lesson_days") or []]


class StudentCreateForm(StyledForm):
    first_name = forms.CharField(label="Ism", max_length=64)
    last_name = forms.CharField(label="Familiya", max_length=64)
    phone = forms.CharField(label="Telefon", max_length=32, required=False)
    parent_phone = forms.CharField(label="Ota-ona telefoni", max_length=32, required=False)
    group = forms.ModelChoiceField(label="Guruh", queryset=Group.objects.none())
    custom_price = forms.IntegerField(
        label="Individual oylik narx",
        required=False,
        min_value=0,
        help_text="Bo'sh qoldirilsa, guruh narxi ishlatiladi.",
    )
    login = forms.CharField(
        label="Login",
        max_length=64,
        required=False,
        help_text="Bo'sh qoldirilsa avtomatik yaratiladi.",
    )
    password = forms.CharField(
        label="Parol",
        required=False,
        widget=forms.PasswordInput,
        help_text="Bo'sh qoldirilsa: student123",
    )

    def __init__(self, *args, teacher=None, **kwargs):
        super().__init__(*args, **kwargs)
        if teacher is not None:
            self.fields["group"].queryset = Group.objects.filter(teacher=teacher).order_by("name")

    def clean_login(self):
        login = (self.cleaned_data.get("login") or "").strip().lower()
        if login and User.objects.filter(login=login).exists():
            raise ValidationError("Bu login band.")
        return login


class StudentEditForm(StyledForm):
    first_name = forms.CharField(label="Ism", max_length=64)
    last_name = forms.CharField(label="Familiya", max_length=64)
    phone = forms.CharField(label="Telefon", max_length=32, required=False)
    parent_phone = forms.CharField(label="Ota-ona telefoni", max_length=32, required=False)
    login = forms.CharField(label="Login", max_length=64)

    def __init__(self, *args, student=None, **kwargs):
        self.student = student
        if student is not None:
            kwargs.setdefault(
                "initial",
                {
                    "first_name": student.first_name,
                    "last_name": student.last_name,
                    "phone": student.phone,
                    "login": student.login,
                    "parent_phone": getattr(student.student_profile, "parent_phone", ""),
                },
            )
        super().__init__(*args, **kwargs)

    def clean_login(self):
        login = (self.cleaned_data.get("login") or "").strip().lower()
        qs = User.objects.filter(login=login)
        if self.student is not None:
            qs = qs.exclude(pk=self.student.pk)
        if qs.exists():
            raise ValidationError("Bu login band.")
        return login


class MembershipForm(StyledForm):
    group = forms.ModelChoiceField(label="Guruh", queryset=Group.objects.none())
    custom_price = forms.IntegerField(
        label="Individual narx", required=False, min_value=0
    )

    def __init__(self, *args, teacher=None, **kwargs):
        super().__init__(*args, **kwargs)
        if teacher is not None:
            self.fields["group"].queryset = Group.objects.filter(teacher=teacher).order_by("name")


class MaterialForm(StyledModelForm):
    images = MultipleFileField(label="Rasmlar", required=False)

    class Meta:
        model = Material
        fields = ["group", "type", "title", "description", "video_source", "youtube_url", "file"]
        widgets = {
            "description": forms.Textarea(attrs={"rows": 3}),
            "youtube_url": forms.URLInput(attrs={"placeholder": "https://youtube.com/watch?v=..."}),
            "file": forms.FileInput(),
        }

    def __init__(self, *args, teacher=None, **kwargs):
        super().__init__(*args, **kwargs)
        if teacher is not None:
            self.fields["group"].queryset = Group.objects.filter(teacher=teacher).order_by("name")
        self.fields["images"].widget.attrs["multiple"] = "multiple"


class HomeworkForm(StyledModelForm):
    class Meta:
        model = Homework
        fields = ["group", "title", "description", "due_at", "attachment"]
        widgets = {
            "description": forms.Textarea(attrs={"rows": 3}),
            "due_at": forms.DateTimeInput(attrs={"type": "datetime-local"}, format="%Y-%m-%dT%H:%M"),
            "attachment": forms.FileInput(),
        }

    def __init__(self, *args, teacher=None, **kwargs):
        super().__init__(*args, **kwargs)
        if teacher is not None:
            self.fields["group"].queryset = Group.objects.filter(teacher=teacher).order_by("name")
        self.fields["due_at"].input_formats = ["%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M", "%Y-%m-%d"]


class SubmissionReviewForm(StyledForm):
    grade = forms.IntegerField(label="Baho (0–100)", min_value=0, max_value=100)
    comment = forms.CharField(
        label="Izoh", required=False, widget=forms.Textarea(attrs={"rows": 2})
    )


class StudentSubmitForm(StyledForm):
    text = forms.CharField(
        label="Javob matni", required=False, widget=forms.Textarea(attrs={"rows": 4})
    )
    file = forms.FileField(label="Fayl", required=False)

    def clean(self):
        data = super().clean()
        if not data.get("text") and not data.get("file"):
            raise ValidationError("Matn yoki fayl yuboring.")
        return data


class AttendanceMarkForm(forms.Form):
    student = forms.IntegerField()
    present = forms.BooleanField(required=False)
