from django import forms
from django.contrib.auth import password_validation

from accounts.models import User
from core.forms import StyledForm, StyledModelForm


class LoginForm(StyledForm):
    login = forms.CharField(
        label="Login",
        max_length=64,
        widget=forms.TextInput(attrs={"placeholder": "Loginingiz", "autofocus": True}),
    )
    password = forms.CharField(
        label="Parol",
        widget=forms.PasswordInput(attrs={"placeholder": "••••••••"}),
    )

    def clean_login(self):
        return (self.cleaned_data["login"] or "").strip().lower()


class TeacherRegisterForm(StyledForm):
    first_name = forms.CharField(label="Ism", max_length=64)
    last_name = forms.CharField(label="Familiya", max_length=64)
    phone = forms.CharField(
        label="Telefon", max_length=32, widget=forms.TextInput(attrs={"placeholder": "+998 90 123 45 67"})
    )
    center_name = forms.CharField(label="O'quv markazi nomi", max_length=120)
    city = forms.CharField(label="Shahar", max_length=80)
    login = forms.CharField(
        label="Login", max_length=64, widget=forms.TextInput(attrs={"placeholder": "masalan: oqituvchi"})
    )
    password1 = forms.CharField(label="Parol", widget=forms.PasswordInput)
    password2 = forms.CharField(label="Parolni tasdiqlang", widget=forms.PasswordInput)

    def clean_login(self):
        login = (self.cleaned_data["login"] or "").strip().lower()
        if User.objects.filter(login=login).exists():
            raise forms.ValidationError("Bu login allaqachon band.")
        return login

    def clean(self):
        data = super().clean()
        p1, p2 = data.get("password1"), data.get("password2")
        if p1 and p2 and p1 != p2:
            self.add_error("password2", "Parollar mos kelmadi.")
        if p1:
            try:
                password_validation.validate_password(p1)
            except forms.ValidationError as exc:
                self.add_error("password1", exc)
        return data


class ProfileForm(StyledModelForm):
    class Meta:
        model = User
        fields = ["first_name", "last_name", "phone", "avatar"]
        widgets = {"avatar": forms.FileInput(attrs={"accept": "image/*"})}


class PreferencesForm(StyledModelForm):
    class Meta:
        model = User
        fields = ["language", "theme"]


class StaffTeacherForm(StyledForm):
    first_name = forms.CharField(label="Ism", max_length=64)
    last_name = forms.CharField(label="Familiya", max_length=64)
    phone = forms.CharField(label="Telefon", max_length=32, required=False)
    center_name = forms.CharField(label="O'quv markazi", max_length=120)
    city = forms.CharField(label="Shahar", max_length=80)
    login = forms.CharField(label="Login", max_length=64)
    password = forms.CharField(
        label="Parol",
        required=False,
        widget=forms.PasswordInput,
        help_text="Yangi o'qituvchi uchun majburiy; tahrirlashda bo'sh qoldirsangiz o'zgarmaydi.",
    )

    def __init__(self, *args, instance=None, **kwargs):
        self.instance = instance
        if instance is not None:
            kwargs.setdefault(
                "initial",
                {
                    "first_name": instance.first_name,
                    "last_name": instance.last_name,
                    "phone": instance.phone,
                    "login": instance.login,
                    "center_name": getattr(instance.teacher_profile, "center_name", ""),
                    "city": getattr(instance.teacher_profile, "city", ""),
                },
            )
        super().__init__(*args, **kwargs)
        if instance is None:
            self.fields["password"].required = True

    def clean_login(self):
        login = (self.cleaned_data["login"] or "").strip().lower()
        qs = User.objects.filter(login=login)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise forms.ValidationError("Bu login band.")
        return login

    def clean(self):
        data = super().clean()
        password = data.get("password")
        if password:
            try:
                password_validation.validate_password(password)
            except forms.ValidationError as exc:
                self.add_error("password", exc)
        return data
