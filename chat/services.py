from django.db.models import Q
from django.utils import timezone

from chat.models import Conversation, ConversationParticipant, Message, MessageRead


def ensure_group_conversation(group):
    conversation, _ = Conversation.objects.get_or_create(
        group=group, defaults={"type": Conversation.Type.GROUP}
    )
    sync_group_participants(conversation)
    return conversation


def sync_group_participants(conversation):
    if not conversation.group_id:
        return conversation
    group = conversation.group
    user_ids = set(group.memberships.values_list("student_id", flat=True))
    user_ids.add(group.teacher_id)
    current = set(conversation.participants.values_list("user_id", flat=True))
    ConversationParticipant.objects.filter(
        conversation=conversation, user_id__in=current - user_ids
    ).delete()
    for user_id in user_ids - current:
        ConversationParticipant.objects.get_or_create(
            conversation=conversation, user_id=user_id
        )
    return conversation


def direct_conversation(user_a, user_b):
    conversation = (
        Conversation.objects.filter(type=Conversation.Type.DIRECT)
        .filter(participants__user=user_a)
        .filter(participants__user=user_b)
        .distinct()
        .first()
    )
    if conversation:
        return conversation
    conversation = Conversation.objects.create(type=Conversation.Type.DIRECT)
    ConversationParticipant.objects.bulk_create(
        [
            ConversationParticipant(conversation=conversation, user=user_a),
            ConversationParticipant(conversation=conversation, user=user_b),
        ]
    )
    return conversation


def user_conversations(user):
    return (
        Conversation.objects.filter(participants__user=user)
        .select_related("group")
        .prefetch_related("participants__user")
        .order_by("-last_message_at")
    )


def contacts_for(user):
    from accounts.models import User

    if user.role == User.Roles.TEACHER:
        return (
            User.objects.filter(
                role=User.Roles.STUDENT,
                group_memberships__group__teacher=user,
            )
            .distinct()
            .order_by("first_name", "last_name")
        )
    if user.role == User.Roles.STUDENT:
        teacher_ids = user.group_memberships.values_list("group__teacher_id", flat=True)
        peer_ids = (
            User.objects.filter(
                role=User.Roles.STUDENT,
                group_memberships__group__memberships__student=user,
            )
            .exclude(pk=user.pk)
            .values_list("pk", flat=True)
        )
        return (
            User.objects.filter(Q(pk__in=teacher_ids) | Q(pk__in=peer_ids))
            .distinct()
            .order_by("first_name", "last_name")
        )
    return User.objects.none()


def assert_participant(conversation, user):
    return conversation.participants.filter(user=user).exists()


def send_message(conversation, sender, text="", file=None):
    text = (text or "").strip()
    if not text and not file:
        raise ValueError("Bo'sh xabar yuborilmaydi.")
    message_type = Message.Type.TEXT
    if file is not None:
        content_type = getattr(file, "content_type", "") or ""
        if content_type.startswith("image/"):
            message_type = Message.Type.IMAGE
        elif content_type.startswith("video/"):
            message_type = Message.Type.VIDEO
        elif content_type.startswith("audio/"):
            message_type = Message.Type.VOICE
        else:
            message_type = Message.Type.FILE
    message = Message.objects.create(
        conversation=conversation,
        sender=sender,
        type=message_type,
        text=text,
        file=file,
    )
    conversation.last_message_at = timezone.now()
    conversation.save(update_fields=["last_message_at"])
    MessageRead.objects.get_or_create(message=message, user=sender)
    return message


def mark_read(conversation, user):
    unread = conversation.messages.exclude(sender=user).exclude(reads__user=user)
    for message in unread:
        MessageRead.objects.get_or_create(message=message, user=user)


def total_unread(user) -> int:
    return (
        Message.objects.filter(conversation__participants__user=user)
        .exclude(sender=user)
        .exclude(reads__user=user)
        .count()
    )


def delete_message(message):
    if message.file:
        message.file.delete(save=False)
    message.delete()
