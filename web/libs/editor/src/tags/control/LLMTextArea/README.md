# LLMTextArea Tag

A Label Studio tag that enables LLM-assisted annotation by generating responses based on user input.

## Features

- ✅ Single submission with edit/delete capabilities
- ✅ Generate multiple responses in one call (1-5 responses)
- ✅ Template-based prompt construction with placeholders
- ✅ Loading, success, and error states with retry functionality
- ✅ Stores both user input and LLM responses separately
- ✅ Backend proxy pattern (no API keys exposed to frontend)
- ✅ Per-region support

## Basic Usage

```xml
<View>
  <Text name="article" value="$text"/>
  <LLMTextArea
    name="summary"
    toName="article"
    promptTemplate="Summarize the following text:\n\n{{input}}"
    endpoint="/api/proxy/llm/generate"
  />
</View>
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `name` | string | required | Unique identifier for the tag |
| `toName` | string | required | Name of the object tag to connect to |
| `promptTemplate` | string | required | Template for building prompts. Supports `{{input}}` and `$task.field` |
| `endpoint` | string | required | Backend proxy endpoint for LLM API calls |
| `numResponses` | number | 1 | Number of responses to generate (1-5) |
| `maxSubmissions` | number | 1 | Maximum number of submissions allowed |
| `editable` | boolean | true | Allow editing and regenerating |
| `rows` | number | 3 | Number of rows in the textarea |
| `placeholder` | string | "Enter your input..." | Placeholder text |
| `label` | string | "Your Input" | Label displayed above input |
| `required` | boolean | false | Whether input is required |
| `requiredMessage` | string | - | Custom validation message |

## Prompt Templates

### Using {{input}} placeholder

```xml
<LLMTextArea
  name="llm"
  promptTemplate="Question: {{input}}\n\nAnswer:"
  endpoint="/api/llm"
/>
```

### Using task data

```xml
<LLMTextArea
  name="llm"
  promptTemplate="Document: {{text}}\n\nSummarize: {{input}}"
  endpoint="/api/llm"
/>
```

### Using $config references

```xml
<LLMTextArea
  name="llm"
  promptTemplate="$config.system_prompt"
  endpoint="/api/llm"
/>
```

With task data:
```json
{
  "text": "Article content...",
  "config": {
    "system_prompt": "You are a helpful assistant. {{input}}"
  }
}
```

## Multiple Responses for Ranking

```xml
<View>
  <LLMTextArea
    name="responses"
    promptTemplate="Generate a summary: {{input}}"
    numResponses="3"
    endpoint="/api/llm"
  />

  <Choices name="best_response" toName="responses" choice="single">
    <Choice value="Response 1 is best"/>
    <Choice value="Response 2 is best"/>
    <Choice value="Response 3 is best"/>
  </Choices>

  <Rating name="quality" toName="responses" maxRating="5"/>
</View>
```

## Backend API Contract

### Request Format

The frontend sends:

```json
{
  "prompt": "Summarize: Lorem ipsum dolor sit amet...",
  "num_responses": 1,
  "task_id": "123",
  "annotation_id": "456"
}
```

### Response Format

The backend should return:

```json
{
  "responses": [
    {
      "text": "This is the generated response...",
      "metadata": {
        "model": "gpt-4",
        "tokens": 150
      }
    }
  ]
}
```

Or for a single response (also supported):

```json
{
  "response": "This is the generated response...",
  "model": "gpt-4",
  "tokens": 150
}
```

### Error Response

```json
{
  "error": "Rate limit exceeded"
}
```

## Backend Implementation Example

### Django (Python)

```python
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
import requests
import os

@require_http_methods(["POST"])
def proxy_llm_generate(request):
    """Proxy LLM generation requests to protect API keys"""
    try:
        data = json.loads(request.body)

        prompt = data.get('prompt')
        num_responses = data.get('num_responses', 1)

        # Call your LLM API with authentication
        llm_response = requests.post(
            os.getenv('LLM_API_URL'),
            headers={
                'Authorization': f'Bearer {os.getenv("LLM_API_KEY")}',
                'Content-Type': 'application/json'
            },
            json={
                'prompt': prompt,
                'n': num_responses,
                'temperature': 0.7,
                'max_tokens': 500,
            },
            timeout=60
        )

        if not llm_response.ok:
            return JsonResponse({
                'error': f'LLM API error: {llm_response.status_code}'
            }, status=500)

        llm_data = llm_response.json()

        # Format response
        responses = []
        for choice in llm_data.get('choices', []):
            responses.append({
                'text': choice.get('text') or choice.get('message', {}).get('content'),
                'metadata': {
                    'model': llm_data.get('model'),
                    'tokens': choice.get('usage', {}).get('total_tokens'),
                }
            })

        return JsonResponse({'responses': responses})

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
```

### Express (Node.js)

```javascript
app.post('/api/proxy/llm/generate', async (req, res) => {
  try {
    const { prompt, num_responses = 1, task_id, annotation_id } = req.body;

    const response = await fetch(process.env.LLM_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.LLM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        n: num_responses,
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      return res.status(500).json({
        error: `LLM API error: ${response.status}`
      });
    }

    const data = await response.json();

    const responses = data.choices.map(choice => ({
      text: choice.text || choice.message?.content,
      metadata: {
        model: data.model,
        tokens: choice.usage?.total_tokens,
      },
    }));

    res.json({ responses });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Result Structure

The tag stores results in this format:

```json
{
  "from_name": "llm_annotation",
  "to_name": "text",
  "type": "llmtextarea",
  "value": {
    "user_input": "What is this article about?",
    "prompt": "Article: Lorem ipsum...\n\nQuestion: What is this article about?",
    "responses": [
      {
        "text": "This article discusses...",
        "metadata": {
          "model": "gpt-4",
          "tokens": 150
        }
      }
    ],
    "timestamp": 1698765432000
  }
}
```

## Advanced Examples

### Translation Task

```xml
<View>
  <Text name="source" value="$source_text"/>
  <LLMTextArea
    name="translation"
    promptTemplate="Translate to {{target_lang}}:\n\n{{input}}"
    endpoint="/api/translate"
    label="Text to translate"
  />
  <TextArea name="review" toName="translation" label="Review translation"/>
</View>
```

### Question Answering

```xml
<View>
  <Text name="document" value="$document"/>
  <LLMTextArea
    name="qa"
    toName="document"
    promptTemplate="Document: {{text}}\n\nQuestion: {{input}}\n\nAnswer:"
    endpoint="/api/qa"
    label="Ask a question"
  />
</View>
```

### Content Generation with Evaluation

```xml
<View>
  <LLMTextArea
    name="generation"
    promptTemplate="$config.generation_prompt"
    numResponses="3"
    endpoint="/api/generate"
  />

  <Choices name="best" toName="generation">
    <Choice value="Response 1"/>
    <Choice value="Response 2"/>
    <Choice value="Response 3"/>
  </Choices>

  <Taxonomy name="issues" toName="generation">
    <Choice value="Accuracy">
      <Choice value="Factual Error"/>
      <Choice value="Incomplete"/>
    </Choice>
    <Choice value="Style">
      <Choice value="Too Formal"/>
      <Choice value="Too Casual"/>
    </Choice>
  </Taxonomy>
</View>
```

## UI Features

### States

1. **Input Mode** - User enters text
2. **Loading** - Spinning indicator while generating
3. **Success** - Shows user input and LLM response(s)
4. **Error** - Shows error message with retry button

### Actions

- **Generate** - Submit input and call LLM
- **Edit** - Modify input and regenerate
- **Delete** - Remove submission and start over
- **Retry** - Retry after an error

## Testing

Run tests:
```bash
npm test -- LLMTextArea.test.js
```

## Notes

- The tag automatically includes task_id and annotation_id in requests
- API keys should never be exposed to the frontend - always use a backend proxy
- The tag supports Label Studio's perRegion mode
- Multiple responses are useful for ranking/comparison tasks
- All responses are saved together with the original prompt
