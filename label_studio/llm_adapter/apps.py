"""Django app configuration for LLM Adapter."""

from django.apps import AppConfig


class LLMAdapterConfig(AppConfig):
    """Configuration for the LLM Adapter app."""

    name = 'llm_adapter'
    verbose_name = 'LLM Adapter'

    def ready(self):
        """Initialize the app when Django starts."""
        pass
