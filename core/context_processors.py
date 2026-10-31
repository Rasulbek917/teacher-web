from django.utils import timezone


def ui(request):
    user = getattr(request, "user", None)
    data = {
        "current_year": timezone.localdate().year,
        "current_month": timezone.localdate().month,
        "unread_notifications": 0,
        "chat_unread": 0,
        "theme": "LIGHT",
        "is_teacher": False,
        "is_student": False,
        "is_super_admin": False,
        "is_director": False,
    }
    if user is not None and user.is_authenticated:
        data.update(
            {
                "theme": user.theme,
                "is_teacher": user.role == "TEACHER",
                "is_student": user.role == "STUDENT",
                "is_super_admin": user.role == "SUPER_ADMIN",
                "is_director": user.role == "DIRECTOR",
            }
        )
        data["unread_notifications"] = user.notifications.filter(is_read=False).count()
        from chat.services import total_unread

        data["chat_unread"] = total_unread(user)
    return data
