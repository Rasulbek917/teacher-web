from django.contrib import admin

from chat.models import Conversation, ConversationParticipant, Message, MessageRead


class ParticipantInline(admin.TabularInline):
    model = ConversationParticipant
    extra = 0


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("id", "type", "group", "last_message_at")
    list_filter = ("type",)
    inlines = [ParticipantInline]


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("sender", "conversation", "type", "created_at")
    list_filter = ("type",)
    search_fields = ("text",)


admin.site.register(MessageRead)
