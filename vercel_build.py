"""Apply Django schema changes to the deployment database during Vercel builds."""

import os
import subprocess
import sys


def main() -> None:
    # Use Neon's direct connection for schema work when available; otherwise
    # fall back to the regular DATABASE_URL configured for the deployment.
    database_url = os.environ.get("DATABASE_URL_UNPOOLED") or os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("Set DATABASE_URL for the Vercel deployment before building.")

    environment = os.environ.copy()
    environment["DATABASE_URL"] = database_url
    subprocess.run(
        [sys.executable, "manage.py", "migrate", "--noinput"],
        check=True,
        env=environment,
    )
    subprocess.run(
        [sys.executable, "manage.py", "ensure_superadmin"],
        check=True,
        env=environment,
    )


if __name__ == "__main__":
    main()
