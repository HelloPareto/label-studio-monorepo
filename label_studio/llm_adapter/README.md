# LLM Adapter

A Django app that provides adapter endpoints for various LLM providers to be used with Label Studio's `LLMTextArea` tag.

## Architecture

This app acts as an adapter layer between Label Studio's frontend and various LLM providers. It provides a consistent API contract regardless of the underlying LLM service.

### Benefits

- **Consistent API**: All providers follow the same request/response format
- **Security**: API keys and credentials are never exposed to the frontend
- **Flexibility**: Easy to add new providers without frontend changes
- **Development-Friendly**: Echo endpoint for testing without API costs

## API Contract

All LLM adapter endpoints follow this contract:

### Request Format

```json
{
  "prompt": "string (required)",
  "num_responses": 1,
  "task_id": "string (optional)",
  "annotation_id": "string (optional)"
}
```

### Response Format

```json
{
  "responses": [
    {
      "text": "The generated response text",
      "metadata": {
        "model": "model-name",
        "tokens": 150
      }
    }
  ]
}
```

### Error Response

```json
{
  "error": "Error message description"
}
```

## Available Endpoints

### Echo Endpoint

**URL**: `/api/llm/echo/`

**Purpose**: Development and testing endpoint that echoes the input prompt back as the response.

**Example**:
```bash
curl -X POST http://localhost:8080/api/llm/echo/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Token YOUR_TOKEN" \
  -d '{
    "prompt": "Test prompt",
    "num_responses": 2
  }'
```

**Response**:
```json
{
  "responses": [
    {
      "text": "Echo response #1: Test prompt",
      "metadata": {
        "model": "echo-dev",
        "tokens": 2,
        "response_number": 1
      }
    },
    {
      "text": "Echo response #2: Test prompt",
      "metadata": {
        "model": "echo-dev",
        "tokens": 2,
        "response_number": 2
      }
    }
  ]
}
```

## Adding New LLM Providers

To add a new LLM provider (e.g., OpenAI, Anthropic, Cohere):

### 1. Create a new API view in `api.py`

```python
class OpenAIAPIView(APIView):
    """OpenAI GPT endpoint."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        prompt = request.data.get('prompt')
        num_responses = request.data.get('num_responses', 1)

        # Call OpenAI API
        # ... implementation ...

        # Return standardized response
        return Response({'responses': responses})
```

### 2. Add URL pattern in `urls.py`

```python
urlpatterns = [
    path('api/llm/echo/', api.EchoAPIView.as_view(), name='llm-echo'),
    path('api/llm/openai/', api.OpenAIAPIView.as_view(), name='llm-openai'),
]
```

### 3. Configuration

Add provider-specific configuration to Django settings:

```python
# settings.py
LLM_PROVIDERS = {
    'openai': {
        'api_key': os.environ.get('OPENAI_API_KEY'),
        'model': 'gpt-4',
        'temperature': 0.7,
    },
}
```

### 4. Frontend Configuration

Update the LLMTextArea tag to use the new endpoint:

```xml
<LLMTextArea
  name="llm_response"
  promptTemplate="Summarize: {{input}}"
  endpoint="/api/llm/openai/"
/>
```

## Best Practices

### Error Handling

Always return structured error responses:

```python
return Response(
    {'error': 'Descriptive error message'},
    status=status.HTTP_400_BAD_REQUEST
)
```

### Logging

Use Python's logging module for debugging:

```python
import logging
logger = logging.getLogger(__name__)

logger.info(f"LLM request - Task: {task_id}")
logger.error(f"LLM API error: {str(e)}", exc_info=True)
```

### Authentication

All endpoints should require authentication:

```python
permission_classes = [IsAuthenticated]
```

### Rate Limiting

For production LLM endpoints, consider adding rate limiting:

```python
from rest_framework.throttling import UserRateThrottle

class LLMRateThrottle(UserRateThrottle):
    rate = '100/hour'

class OpenAIAPIView(APIView):
    throttle_classes = [LLMRateThrottle]
```

### Timeout Handling

Set appropriate timeouts for external API calls:

```python
import requests

response = requests.post(
    llm_api_url,
    json=payload,
    timeout=60  # 60 seconds
)
```

## Testing

### Manual Testing with curl

```bash
# Get your auth token first
TOKEN=$(curl -X POST http://localhost:8080/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"pass"}' \
  | jq -r .token)

# Test echo endpoint
curl -X POST http://localhost:8080/api/llm/echo/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Token $TOKEN" \
  -d '{
    "prompt": "Hello, world!",
    "num_responses": 1
  }'
```

### Integration Testing

Test with the LLMTextArea frontend:

```xml
<View>
  <Text name="article" value="$text"/>
  <LLMTextArea
    name="test"
    promptTemplate="Echo: {{input}}"
    endpoint="/api/llm/echo/"
    numResponses="2"
  />
</View>
```

## Security Considerations

1. **Never expose API keys**: Keep credentials in environment variables
2. **Validate input**: Always validate and sanitize user input
3. **Rate limiting**: Implement rate limiting for production endpoints
4. **Audit logging**: Log all LLM requests for audit purposes
5. **Error messages**: Don't expose sensitive information in error messages

## Future Enhancements

- [ ] Add OpenAI provider
- [ ] Add Anthropic Claude provider
- [ ] Add Azure OpenAI provider
- [ ] Add request caching
- [ ] Add response streaming support
- [ ] Add cost tracking
- [ ] Add usage analytics
