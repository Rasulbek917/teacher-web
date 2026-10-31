import json

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_POST

from accounts.models import User
from chat.models import Conversation, ConversationParticipant, Message
from chat.services import (
    assert_participant,
    contacts_for,
    direct_conversation,
    ensure_group_conversation,
    mark_read,
    send_message,
    user_conversations,
)


def _ensure_my_group_chats(user):
    if user.role == User.Roles.TEACHER:
        groups = user.teacher_groups.all()
    elif user.role == User.Roles.STUDENT:
        from academics.models import Group

        groups = Group.objects.filter(memberships__student=user)
    else:
        groups = []
    for group in groups:
        ensure_group_conversation(group)


@login_required
def chat_list(request):
    _ensure_my_group_chats(request.user)
    conversations = user_conversations(request.user)
    items = []
    for conversation in conversations:
        items.append(
            {
                "conversation": conversation,
                "last": conversation.last_message(),
                "unread": conversation.unread_for(request.user),
                "title": conversation.group.name
                if conversation.group_id
                else _direct_title(conversation, request.user),
            }
        )
    return render(
        request,
        "chat/list.html",
        {"items": items, "contacts": contacts_for(request.user)},
    )


def _direct_title(conversation, user):
    others = [
        p.user for p in conversation.participants.select_related("user") if p.user_id != user.id
    ]
    if len(others) == 1:
        return others[0].full_name
    return "Shaxsiy suhbat"


@login_required
@require_POST
def start_direct(request):
    other = get_object_or_404(
        User, pk=request.POST.get("user_id"), is_active=True
    )
    if other.pk == request.user.pk:
        messages.error(request, "O'zingiz bilan suhbat boshlab bo'lmaydi.")
        return redirect("chat:list")
    conversation = direct_conversation(request.user, other)
    return redirect("chat:room", pk=conversation.pk)


@login_required
def chat_room(request, pk):
    conversation = get_object_or_404(
        Conversation.objects.select_related("group").prefetch_related(
            "participants__user"
        ),
        pk=pk,
    )
    if not assert_participant(conversation, request.user):
        messages.error(request, "Bu suhbatga ruxsat yo'q.")
        return redirect("chat:list")

    if request.method == "POST":
        action = request.POST.get("action") or "send"
        if action == "send":
            text = request.POST.get("text") or ""
            file = request.FILES.get("file")
            if not text.strip() and not file:
                messages.error(request, "Xabar bo'sh.")
            else:
                send_message(conversation, request.user, text=text, file=file)
            return redirect("chat:room", pk=conversation.pk)
        if action == "edit":
            message = get_object_or_404(
                Message, pk=request.POST.get("message_id"), conversation=conversation, sender=request.user
            )
            message.text = (request.POST.get("text") or "").strip()
            message.edited_at = timezone.now()
            message.save()
            return redirect("chat:room", pk=conversation.pk)
        if action == "delete":
            message = get_object_or_404(
                Message, pk=request.POST.get("message_id"), conversation=conversation, sender=request.user
            )
            if message.file:
                message.file.delete(save=False)
            message.delete()
            return redirect("chat:room", pk=conversation.pk)

    mark_read(conversation, request.user)
    messages_qs = conversation.messages.select_related("sender").prefetch_related("reads")
    paginator = Paginator(messages_qs, 100)
    first_page = paginator.get_page(1)
    context = {
        "conversation": conversation,
        "chat_messages": first_page.object_list,
        "title": conversation.group.name
        if conversation.group_id
        else _direct_title(conversation, request.user),
        "participants": conversation.participants.select_related("user"),
        "last_message_id": messages_qs.order_by("-id").values_list("id", flat=True).first()
        or 0,
    }
    return render(request, "chat/room.html", context)


def _message_payload(message, user):
    return {
        "id": message.id,
        "sender_id": message.sender_id,
        "sender_name": message.sender.full_name,
        "initials": message.sender.short_name,
        "text": message.text,
        "type": message.type,
        "file_url": reverse("core:file", args=["chat", message.id])
        if message.file
        else None,
        "file_name": message.file.name.rsplit("/", 1)[-1] if message.file else None,
        "created_at": timezone.localtime(message.created_at).strftime("%H:%M"),
        "is_mine": message.sender_id == user.id,
        "edited": message.is_edited,
        "read_count": message.reads.exclude(user=user).count(),
    }


@login_required
def messages_json(request, pk):
    conversation = get_object_or_404(Conversation, pk=pk)
    if not assert_participant(conversation, request.user):
        return JsonResponse({"error": "forbidden"}, status=403)
    try:
        after = int(request.GET.get("after") or 0)
    except ValueError:
        after = 0
    qs = (
        conversation.messages.filter(id__gt=after)
        .select_related("sender")
        .prefetch_related("reads")
        .order_by("id")[:200]
    )
    if after:
        mark_read(conversation, request.user)
    return JsonResponse(
        {"messages": [_message_payload(m, request.user) for m in qs]}
    )


@login_required
@require_POST
def send_json(request, pk):
    conversation = get_object_or_404(Conversation, pk=pk)
    if not assert_participant(conversation, request.user):
        return JsonResponse({"error": "forbidden"}, status=403)
    text = request.POST.get("text") or ""
    file = request.FILES.get("file")
    if not text.strip() and not file:
        return JsonResponse({"error": "empty"}, status=400)
    message = send_message(conversation, request.user, text=text, file=file)
    return JsonResponse({"message": _message_payload(message, request.user)})
