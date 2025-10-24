"""LLM Adapter app for Label Studio.

This app provides adapter endpoints for various LLM providers to be used
with the LLMTextArea tag. It follows a consistent API contract regardless
of the underlying LLM provider.
"""

default_app_config = 'llm_adapter.apps.LLMAdapterConfig'
