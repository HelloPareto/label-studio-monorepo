"""URL configuration for LLM Adapter app."""

from django.urls import path

from . import api

app_name = 'llm_adapter'

urlpatterns = [
    path('api/llm/echo/', api.EchoAPIView.as_view(), name='llm-echo'),
]
