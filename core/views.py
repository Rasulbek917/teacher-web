from django.contrib.auth.decorators import login_required
from django.http import FileResponse, Http404
from django.shortcuts import redirect
from django.views.decorators.http import require_GET

from core.decorators import user_can_access_group


@login_required
def home(request):
    user = request.user
    if user.role == "SUPER_ADMIN":
        return redirect("staff:staff_dashboard")
    if user.role == "DIRECTOR":
        return redirect("directors:dashboard")
    if user.role == "TEACHER":
        return redirect("academics:teacher_dashboard")
    return redirect("student:student_home")


@require_GET
@login_required
def serve_file(request, scope: str, pk: int):
    """Fayllarni avtorizatsiya bilan berish (media to'g'ridan-to'g'ri ochilmaydi)."""
    from academics.models import Homework, Material, MaterialImage, Submission
    from accounts.models import User
    from chat.models import Message

    user = request.user
    file_field = None

    if scope == "avatar":
        target = User.objects.filter(pk=pk).first()
        if not target:
            raise Http404
        if not target.avatar:
            return _external_file(target.external_avatar_url)
        file_field = target.avatar

    elif scope == "material":
        material = Material.objects.select_related("group").filter(pk=pk).first()
        if not material:
            raise Http404
        if not user_can_access_group(user, material.group):
            raise Http404
        if not material.file:
            return _external_file(material.external_file_url)
        file_field = material.file

    elif scope == "material-image":
        image = (
            MaterialImage.objects.select_related("material__group").filter(pk=pk).first()
        )
        if not image or not user_can_access_group(user, image.material.group):
            raise Http404
        file_field = image.file

    elif scope == "homework":
        homework = Homework.objects.select_related("group").filter(pk=pk).first()
        if not homework:
            raise Http404
        if not user_can_access_group(user, homework.group):
            raise Http404
        if not homework.attachment:
            raise Http404
        file_field = homework.attachment

    elif scope == "submission":
        submission = (
            Submission.objects.select_related("homework__group")
            .filter(pk=pk)
            .first()
        )
        if not submission:
            raise Http404
        group = submission.homework.group
        if not (
            submission.student_id == user.id
            or group.teacher_id == user.id
            or (user.role == "DIRECTOR" and group.teacher.director_id == user.id)
            or user.role == "SUPER_ADMIN"
        ):
            raise Http404
        if not submission.file:
            return _external_file(submission.external_file_url)
        file_field = submission.file

    elif scope == "chat":
        message = Message.objects.filter(pk=pk).first()
        if not message:
            raise Http404
        if not message.conversation.participants.filter(user=user).exists():
            raise Http404
        if not message.file:
            return _external_file(message.external_file_url)
        file_field = message.file

    else:
        raise Http404

    try:
        return FileResponse(
            file_field.open("rb"),
            as_attachment=False,
            filename=file_field.name.rsplit("/", 1)[-1],
        )
    except FileNotFoundError as exc:
        raise Http404 from exc


def _external_file(url):
    """Serve old imported external links only when they use HTTP(S)."""
    from urllib.parse import urlparse

    parsed = urlparse(url or "")
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise Http404
    return redirect(url)
