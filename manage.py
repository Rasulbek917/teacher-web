#!/usr/bin/env python
"""Django management entry point — Teacher Web (Django nashri)."""
import os
import sys


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:  # pragma: no cover
        raise ImportError(
            "Django topilmadi. `pip install -r requirements.txt` bajaring."
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
