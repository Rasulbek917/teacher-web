from functools import wraps

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseForbidden
from django.shortcuts import redirect


def role_required(*roles):
    """Faqat ko'rsatilgan rollarga ruxsat beruvchi decorator."""

    def decorator(view):
        @wraps(view)
        @login_required
        def wrapper(request, *args, **kwargs):
            if request.user.role not in roles:
                messages.error(request, "Bu sahifaga ruxsat yo'q.")
                return redirect("core:home")
            if getattr(request.user, "is_blocked", False):
                messages.error(request, "Akkauntingiz bloklangan. Administratorga murojaat qiling.")
                return redirect("accounts:logout")
            return view(request, *args, **kwargs)

        return wrapper

    return decorator


teacher_required = role_required("TEACHER")
student_required = role_required("STUDENT")
staff_required = role_required("SUPER_ADMIN")
director_required = role_required("DIRECTOR")


def user_can_access_group(user, group) -> bool:
    if user.role == "SUPER_ADMIN":
        return True
    if user.role == "TEACHER":
        return group.teacher_id == user.id
    if user.role == "DIRECTOR":
        return group.teacher.director_id == user.id
    return group.memberships.filter(student=user).exists()


def forbidden(request):
    return HttpResponseForbidden("Ruxsat yo'q")
