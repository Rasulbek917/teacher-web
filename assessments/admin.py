from django.contrib import admin
from .models import Answer, Attempt, Option, Question, Test, TestShare

admin.site.register([Test, Question, Option, TestShare, Attempt, Answer])
