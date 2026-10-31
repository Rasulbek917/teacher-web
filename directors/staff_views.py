from django.contrib import messages
from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import redirect, render

from accounts.models import TeacherProfile, User
from core.decorators import staff_required
from directors.forms import DirectorCreateForm


@staff_required
def director_list(request):
    directors = User.objects.filter(role=User.Roles.DIRECTOR).annotate(
        teacher_count=Count("managed_users", filter=Q(managed_users__role=User.Roles.TEACHER), distinct=True)
    ).order_by("first_name", "last_name")
    return render(request, "staff/directors.html", {"directors": directors})


@staff_required
def director_create(request):
    form = DirectorCreateForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        data = form.cleaned_data
        with transaction.atomic():
            director = User.objects.create_user(
                login=data["login"],
                password=data["password"],
                role=User.Roles.DIRECTOR,
                first_name=data["first_name"],
                last_name=data["last_name"],
                phone=data.get("phone") or "",
            )
            TeacherProfile.objects.create(user=director, center_name=data["center_name"], city=data["city"])
        messages.success(request, f"{director.full_name} direktor sifatida yaratildi.")
        return redirect("staff:staff_directors")
    return render(request, "staff/director_form.html", {"form": form, "title": "Direktor qo'shish"})
