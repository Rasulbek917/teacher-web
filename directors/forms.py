from django import forms
from django.contrib.auth import password_validation

from accounts.models import User
from academics.models import Group
from core.forms import StyledForm, StyledModelForm
from core.utils import WEEKDAYS_UZ


class DirectorCreateForm(StyledForm):
    first_name = forms.CharField(label="Ism", max_length=64)
    last_name = forms.CharField(label="Familiya", max_length=64)
    phone = forms.CharField(label="Telefon", max_length=32, required=False)
    center_name = forms.CharField(label="Markaz nomi", max_length=120)
    city = forms.CharField(label="Shahar", max_length=80)
    login = forms.CharField(label="Login", max_length=64)
    password = forms.CharField(label="Parol", widget=forms.PasswordInput)

    def clean_login(self):
        login = self.cleaned_data["login"].strip().lower()
        if User.objects.filter(login=login).exists():
            raise forms.ValidationError("Bu login allaqachon ishlatilgan.")
        return login

    def clean_password(self):
        password = self.cleaned_data["password"]
        try:
            password_validation.validate_password(password)
        except forms.ValidationError as exc:
            raise forms.ValidationError(exc.messages) from exc
        return password


class DirectorStudentForm(StyledForm):
    first_name = forms.CharField(label="Ism", max_length=64)
    last_name = forms.CharField(label="Familiya", max_length=64)
    phone = forms.CharField(label="Telefon", max_length=32, required=False)
    parent_phone = forms.CharField(label="Ota-ona telefoni", max_length=32, required=False)
    group = forms.ModelChoiceField(label="Guruh", queryset=Group.objects.none())
    custom_price = forms.IntegerField(label="Individual oylik narx", required=False, min_value=0)
    login = forms.CharField(label="Login", max_length=64, required=False)
    password = forms.CharField(label="Parol", required=False, widget=forms.PasswordInput, help_text="Bo'sh qoldirilsa vaqtinchalik standart parol beriladi.")

    def __init__(self, *args, director=None, **kwargs):
        super().__init__(*args, **kwargs)
        if director:
            self.fields["group"].queryset = Group.objects.filter(teacher__director=director).select_related("teacher").order_by("name")

    def clean_login(self):
        login = (self.cleaned_data.get("login") or "").strip().lower()
        if login and User.objects.filter(login=login).exists():
            raise forms.ValidationError("Bu login allaqachon ishlatilgan.")
        return login


class DirectorGroupForm(StyledModelForm):
    lesson_days = forms.MultipleChoiceField(
        label="Dars kunlari",
        choices=[(str(number), name) for number, name in WEEKDAYS_UZ.items()],
        widget=forms.CheckboxSelectMultiple,
        required=False,
    )

    class Meta:
        model = Group
        fields = ["teacher", "name", "level", "lesson_days", "lesson_time", "monthly_price"]
        widgets = {"lesson_time": forms.TimeInput(attrs={"type": "time"}, format="%H:%M")}

    def __init__(self, *args, director=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["teacher"].queryset = User.objects.filter(role=User.Roles.TEACHER, director=director).order_by("first_name", "last_name") if director else User.objects.none()
        if self.instance and self.instance.pk:
            self.fields["lesson_days"].initial = [str(day) for day in self.instance.days_list]

    def clean_lesson_days(self):
        return [int(day) for day in self.cleaned_data.get("lesson_days") or []]


class AnnouncementForm(StyledForm):
    AUDIENCE_CHOICES = [
        ("STUDENTS_ALL", "Barcha o'quvchilar"),
        ("TEACHERS_ALL", "Barcha o'qituvchilar"),
        ("GROUP", "Bitta guruh"),
        ("TEACHER", "Bitta o'qituvchi"),
    ]
    audience = forms.ChoiceField(label="Kimga yuboriladi", choices=AUDIENCE_CHOICES, initial="STUDENTS_ALL")
    group = forms.ModelChoiceField(label="Guruh", queryset=Group.objects.none(), required=False)
    teacher = forms.ModelChoiceField(label="O'qituvchi", queryset=User.objects.none(), required=False)
    title = forms.CharField(label="Sarlavha", max_length=160)
    body = forms.CharField(label="Xabar", max_length=3000, widget=forms.Textarea(attrs={"rows": 5}))

    def __init__(self, *args, director=None, **kwargs):
        super().__init__(*args, **kwargs)
        if director:
            self.fields["group"].queryset = Group.objects.filter(teacher__director=director).order_by("name")
            self.fields["teacher"].queryset = User.objects.filter(role=User.Roles.TEACHER, director=director).order_by("first_name", "last_name")

    def clean(self):
        data = super().clean()
        audience = data.get("audience")
        if audience == "GROUP" and not data.get("group"):
            self.add_error("group", "Guruhni tanlang.")
        if audience == "TEACHER" and not data.get("teacher"):
            self.add_error("teacher", "O'qituvchini tanlang.")
        return data
