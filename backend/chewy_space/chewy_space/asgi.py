"""Production FastAPI ASGI entrypoint: chewy_space.asgi:application."""

import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'chewy_space.settings')

from .api import app as application
