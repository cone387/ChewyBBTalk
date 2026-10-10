"""Uvicorn entry point: chewy_api.main:app."""

from chewy_api.application import create_app

app = create_app()
