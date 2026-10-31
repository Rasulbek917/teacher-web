from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from notifications.models import Notification


@login_required
def notification_list(request):
    qs = request.user.notifications.order_by("-created_at")
    unread_only = request.GET.get("unread") == "1"
    if unread_only:
        qs = qs.filter(is_read=False)
    paginator = Paginator(qs, 20)
    page_obj = paginator.get_page(request.GET.get("page"))
    return render(
        request,
        "notifications/list.html",
        {
            "page_obj": page_obj,
            "notifications": page_obj.object_list,
            "unread_only": unread_only,
            "unread_count": request.user.notifications.filter(is_read=False).count(),
        },
    )


@login_required
@require_POST
def mark_read(request, pk):
    notification = get_object_or_404(
        Notification, pk=pk, user=request.user
    )
    notification.is_read = True
    notification.save(update_fields=["is_read"])
    return redirect(notification.link or "notifications:list")


@login_required
@require_POST
def mark_all_read(request):
    request.user.notifications.filter(is_read=False).update(is_read=True)
    messages.success(request, "Barchasi o'qilgan deb belgilandi.")
    return redirect("notifications:list")


@login_required
def open_notification(request, pk):
    """Bildirishnomani o'qilgan qilib, havolasiga yo'naltiradi."""
    notification = get_object_or_404(Notification, pk=pk, user=request.user)
    if not notification.is_read:
        notification.is_read = True
        notification.save(update_fields=["is_read"])
    return redirect(notification.link or "notifications:list")
