from django.utils import timezone


MONTHS_UZ = [
    "Yanvar",
    "Fevral",
    "Mart",
    "Aprel",
    "May",
    "Iyun",
    "Iyul",
    "Avgust",
    "Sentabr",
    "Oktabr",
    "Noyabr",
    "Dekabr",
]

WEEKDAYS_UZ = {
    1: "Dushanba",
    2: "Seshanba",
    3: "Chorshanba",
    4: "Payshanba",
    5: "Juma",
    6: "Shanba",
    7: "Yakshanba",
}


def month_name(month: int) -> str:
    if 1 <= month <= 12:
        return MONTHS_UZ[month - 1]
    return ""


def money(value) -> str:
    try:
        number = int(value or 0)
    except (TypeError, ValueError):
        return "0 so'm"
    return f"{number:,}".replace(",", " ") + " so'm"


def lesson_days_label(days) -> str:
    if not days:
        return "—"
    if isinstance(days, str):
        days = [d for d in days.replace(" ", "").split(",") if d]
    return ", ".join(WEEKDAYS_UZ.get(int(d), "") for d in days if str(d).isdigit())


def now_year_month():
    today = timezone.localdate()
    return today.year, today.month


def parse_ym(request, default=None):
    default = default or now_year_month()
    try:
        year = int(request.GET.get("year") or default[0])
    except (TypeError, ValueError):
        year = default[0]
    try:
        month = int(request.GET.get("month") or default[1])
    except (TypeError, ValueError):
        month = default[1]
    if not 1 <= month <= 12:
        month = default[1]
    if not 2000 <= year <= 2100:
        year = default[0]
    return year, month


def year_options(back=4):
    year, _ = now_year_month()
    return list(range(year, year - back, -1))
