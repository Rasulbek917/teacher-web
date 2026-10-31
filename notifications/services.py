from notifications.models import Notification


def notify(user, *, type, title, body="", link="", dedupe_key=None):
    """Bildirishnoma yaratadi. dedupe_key berilsa takroriy yaratilmaydi."""
    if dedupe_key:
        existing = Notification.objects.filter(dedupe_key=dedupe_key).first()
        if existing:
            return existing
    return Notification.objects.create(
        user=user,
        type=type,
        title=title,
        body=body,
        link=link,
        dedupe_key=dedupe_key,
    )


def notify_many(users, *, type, title, body="", link="", dedupe_prefix=None):
    created = []
    for user in users:
        key = f"{dedupe_prefix}:{user.pk}" if dedupe_prefix else None
        n = notify(
            user,
            type=type,
            title=title,
            body=body,
            link=link,
            dedupe_key=key,
        )
        if n:
            created.append(n)
    return created
