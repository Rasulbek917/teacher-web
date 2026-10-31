import json
from django import forms
from academics.models import Group


class TestForm(forms.Form):
    group = forms.ModelChoiceField(queryset=Group.objects.none(), required=False, label="Guruh (ixtiyoriy)")
    title = forms.CharField(max_length=180, label="Test nomi")
    description = forms.CharField(max_length=1000, required=False, widget=forms.Textarea(attrs={"rows": 2}), label="Tavsif")
    subject = forms.CharField(max_length=100, label="Fan")
    topic = forms.CharField(max_length=180, label="Mavzu")
    grade_level = forms.CharField(max_length=60, required=False, label="Sinf yoki daraja")
    difficulty = forms.ChoiceField(choices=[("EASY", "Oson"), ("MEDIUM", "O'rtacha"), ("HARD", "Qiyin"), ("MIXED", "Aralash")], initial="MEDIUM", label="Qiyinlik")
    questions = forms.CharField(widget=forms.HiddenInput(), label="Savollar")

    def __init__(self, *args, teacher=None, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            field.widget.attrs.setdefault("class", "form-control w-full")
        if teacher is not None:
            self.fields["group"].queryset = Group.objects.filter(teacher=teacher).order_by("name")

    def clean_questions(self):
        raw = self.cleaned_data["questions"]
        try:
            questions = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            raise forms.ValidationError("Savollar formatini tekshiring.")
        if not isinstance(questions, list) or not 1 <= len(questions) <= 30:
            raise forms.ValidationError("1 dan 30 gacha savol kiriting.")
        seen = set()
        normalized = []
        for question in questions:
            if not isinstance(question, dict):
                raise forms.ValidationError("Savol formati noto'g'ri.")
            text = str(question.get("text", "")).strip()
            key = " ".join(text.casefold().split())
            options = question.get("options")
            correct = question.get("correctIndex")
            if not 3 <= len(text) <= 2000 or key in seen:
                raise forms.ValidationError("Savol matni bo'sh, juda qisqa yoki takrorlangan.")
            seen.add(key)
            if not isinstance(options, list) or len(options) != 4:
                raise forms.ValidationError("Har bir savolda aynan 4 ta javob varianti bo'lsin.")
            options = [str(x).strip() for x in options]
            option_keys = [x.casefold() for x in options]
            if any(not 1 <= len(x) <= 600 for x in options) or len(set(option_keys)) != 4:
                raise forms.ValidationError("Variantlar bo'sh yoki takrorlangan.")
            if not isinstance(correct, int) or isinstance(correct, bool) or not 0 <= correct < 4:
                raise forms.ValidationError("To'g'ri javobni belgilang.")
            normalized.append({
                "text": text,
                "options": [{"text": value, "correct": i == correct} for i, value in enumerate(options)],
                "explanation": str(question.get("explanation", ""))[:2000],
                "difficulty": question.get("difficulty", "MEDIUM") if question.get("difficulty") in {"EASY", "MEDIUM", "HARD"} else "MEDIUM",
                "topic": str(question.get("topic", ""))[:120],
            })
        return normalized


class GenerateForm(forms.Form):
    group = forms.ModelChoiceField(queryset=Group.objects.none(), label="O'quvchilar guruhi")
    subject = forms.ChoiceField(choices=[("Matematika", "Matematika"), ("Ingliz tili", "Ingliz tili"), ("Kimyo", "Kimyo"), ("Fizika", "Fizika")], label="Fan")
    topic = forms.CharField(max_length=180, label="Mavzu", help_text="Masalan: kasrlar, zamonlar, atom tuzilishi, Nyuton qonunlari")
    grade_level = forms.CharField(max_length=60, required=False, initial="5–7-sinf", label="Sinf yoki daraja")
    count = forms.IntegerField(min_value=5, max_value=30, initial=10, label="Savollar soni")
    difficulty = forms.ChoiceField(choices=[("EASY", "Oson"), ("MEDIUM", "O'rtacha"), ("HARD", "Qiyin"), ("MIXED", "Aralash")], initial="MEDIUM", label="Qiyinlik")
    instructions = forms.CharField(max_length=500, required=False, label="Qo'shimcha ko'rsatma")

    def __init__(self, *args, teacher=None, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            field.widget.attrs.setdefault("class", "form-control w-full")
        if teacher is not None:
            groups = Group.objects.all() if teacher.role == "SUPER_ADMIN" else Group.objects.filter(teacher=teacher)
            self.fields["group"].queryset = groups.order_by("name")


class AssistantForm(forms.Form):
    TOOL_CHOICES = [
        ("LESSON_PLAN", "Dars rejasi"), ("EXPLAIN", "Mavzuni tushuntirish"),
        ("HOMEWORK", "Uy vazifasi"), ("FLASHCARDS", "Kartochkalar"),
        ("SUMMARY", "Konspekt"), ("LEVELED_TASKS", "Darajali topshiriqlar"),
        ("WORKSHEET", "Ish varaqasi"),
    ]
    type = forms.ChoiceField(choices=TOOL_CHOICES, label="Yordam turi")
    subject = forms.CharField(max_length=120, label="Fan")
    topic = forms.CharField(max_length=160, label="Mavzu")
    grade_level = forms.CharField(max_length=40, required=False, label="Sinf yoki daraja")
    item_count = forms.IntegerField(min_value=3, max_value=20, initial=8, label="Topshiriqlar soni")
    difficulty = forms.CharField(max_length=40, required=False, label="Qiyinlik")
    instructions = forms.CharField(max_length=1000, required=False, label="Qo'shimcha ko'rsatma")
    text = forms.CharField(max_length=20000, widget=forms.Textarea(attrs={"rows": 7}), required=False, label="Manba matni")

class AssistantMaterialForm(forms.Form):
    title = forms.CharField(max_length=200, label="Sarlavha")
    content_json = forms.CharField(widget=forms.Textarea(attrs={"rows": 22}), label="Material JSON")

    def __init__(self, *args, kind="", **kwargs):
        self.kind = kind
        super().__init__(*args, **kwargs)

    def clean_content_json(self):
        try:
            value = json.loads(self.cleaned_data["content_json"])
            from .services import validate_assistant_content
            return validate_assistant_content(self.kind, value)
        except (json.JSONDecodeError, TypeError, ValueError) as exc:
            raise forms.ValidationError(f"JSON yoki material sxemasi noto'g'ri: {exc}")
