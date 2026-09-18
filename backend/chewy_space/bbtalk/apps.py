from django.apps import AppConfig


class BbtalkConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'bbtalk'
    verbose_name = '胡言乱语'

    def ready(self):
        from . import attachment_policy  # noqa: F401
