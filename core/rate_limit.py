from functools import wraps
from django.core.cache import cache
from django.http import HttpResponse
from django.utils import timezone


def user_rate_limit(*, limit=10, window=60):
    """Authenticated per-user request throttle backed by Django's configured cache."""
    def decorate(view):
        @wraps(view)
        def wrapped(request, *args, **kwargs):
            key = f"ratelimit:{view.__module__}.{view.__name__}:{request.user.pk}"
            try:
                if not cache.add(key, 1, timeout=window):
                    count = cache.incr(key)
                    if count > limit:
                        retry_after = max(1, window - int(timezone.now().timestamp()) % window)
                        response = HttpResponse("So'rovlar limiti tugadi. Biroz kutib qayta urinib ko'ring.", status=429)
                        response["Retry-After"] = str(retry_after)
                        return response
            except (ValueError, NotImplementedError):
                cache.set(key, 1, timeout=window)
            return view(request, *args, **kwargs)
        return wrapped
    return decorate
