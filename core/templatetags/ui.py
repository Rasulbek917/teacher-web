from django import template

from core.utils import lesson_days_label, money, month_name

register = template.Library()


@register.filter
def som(value):
    return money(value)


@register.filter
def uz_month(value):
    try:
        return month_name(int(value))
    except (TypeError, ValueError):
        return ""


@register.filter
def lesson_days(value):
    return lesson_days_label(value)


@register.filter
def pct(value):
    try:
        return f"{round(float(value))}%"
    except (TypeError, ValueError):
        return "—"


TONE_CLASSES = {
    "indigo": "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300",
    "emerald": "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
    "rose": "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300",
    "amber": "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300",
    "cyan": "bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-300",
    "violet": "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300",
    "sky": "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300",
    "slate": "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
}


@register.filter
def tone_classes(value):
    return TONE_CLASSES.get(value or "indigo", TONE_CLASSES["indigo"])


@register.filter
def initials(user):
    if not user:
        return "?"
    return getattr(user, "short_name", "?")
