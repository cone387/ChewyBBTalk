from django.urls import path
from . import views


urlpatterns = [
    path('user/', views.get_current_user, name='get_current_user'),
]