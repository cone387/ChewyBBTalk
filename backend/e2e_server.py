"""Loopback-only Django server with disposable data for browser regression tests."""
import os
from pathlib import Path
import signal
import sys
import tempfile


def main():
    with tempfile.TemporaryDirectory(prefix="chewybbtalk-e2e-") as directory:
        root = Path(directory)
        os.environ.update({
            "DJANGO_SETTINGS_MODULE": "chewy_space.settings",
            "DATABASE_URL": "sqlite:///" + str(root / "db.sqlite3"),
            "DATA_DIR": directory,
            "MEDIA_ROOT": str(root / "media"),
            "STATIC_ROOT": str(root / "static"),
            "SECRET_KEY": "isolated-browser-tests-only-not-a-production-key",
            "DEBUG": "false",
            "ALLOWED_HOSTS": "127.0.0.1,localhost",
        })
        sys.path.insert(0, str(Path(__file__).resolve().parent / "chewy_space"))
        import django
        from django.conf import settings
        from django.core.management import call_command

        # Explicit absolute path also handles Windows drive letters.
        settings.DATABASES["default"]["NAME"] = str(root / "db.sqlite3")
        django.setup()
        call_command("migrate", interactive=False, verbosity=0)
        signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
        try:
            call_command("runserver", "127.0.0.1:18020", use_reloader=False)
        finally:
            from django.db import connections
            connections.close_all()


if __name__ == "__main__":
    main()
