"""Explicit browser-safe settings. Never serialize the process environment."""

import os

DEFAULTS = {
    'VITE_API_BASE_URL': '',
    'VITE_SITE_NAME': 'BBTalk',
    'VITE_SITE_COPYRIGHT': '',
    'VITE_PRIVACY_TIMEOUT_MINUTES': '5',
    'VITE_SHOW_PRIVACY_COUNTDOWN': 'false',
    'VITE_MEDIA_URL_PROTOCOL': '',
}


def public_config():
    return {key: os.getenv(key, default) for key, default in DEFAULTS.items()}
