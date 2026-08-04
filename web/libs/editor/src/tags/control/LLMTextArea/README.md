# LLMTextArea Tag

A Label Studio control tag that lets annotators generate LLM responses to a prompt built from task data and user input.

## How auth and config work

The tag never reads auth details from XML — that would bake secrets into per-batch Forte config. Instead, the host application (`front/LabelStudioFrontend`) sets a runtime bag on `window` before constructing the Label Studio instance:

```js
window.ForteRuntime = {
  baseUrl: "https://forte-backend.example.com",
  token: "<knox-token>",   // copied from the Authorization cookie by the host
  assignmentId: "123",
};
```

Every generate call posts to Forte's active-assignment LLM endpoint:

```
POST {baseUrl}/api/v1/active-assignments/{assignmentId}/llm/generate/
Authorization: Token <token>
```

The Knox token comes from the session cookie the same way all other Forte API calls work (`getCookie('Authorization')`). The tag forwards it as an `Authorization` header because that is what production `backend-ai` requires — session/cookie auth is not available on `ActiveAssignmentViewSet` in production.

## Basic usage

```xml
<View>
  <Text name="article" value="$text"/>
  <LLMTextArea
    name="summary"
    toName="article"
    promptTemplate="Summarize the following text:\n\n{{input}}"
  />
</View>
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `name` | string | required | Unique identifier for the tag |
| `toName` | string | — | Name of the object tag to connect to (optional) |
| `promptTemplate` | string | required | Template for the prompt. Supports `{{input}}` and task-data field references via `{{fieldName}}` or `$field` |
| `numResponses` | number | 1 | Number of LLM responses to generate (1–5) |
| `maxSubmissions` | number | 1 | Maximum number of times the user can generate (≥ 2 allows re-generation) |
| `editable` | boolean | true | Show Edit button after submission |
| `rows` | number | 3 | Rows in the input textarea |
| `placeholder` | string | "Enter your input..." | Placeholder text |
| `label` | string | "Your Input" | Label shown above the input |
| `required` | boolean | false | Whether input is required for submission |
| `requiredMessage` | string | — | Custom validation message |

## Prompt templates

### `{{input}}` placeholder

Replaced with whatever the annotator typed in the text area:

```xml
<LLMTextArea
  name="summary"
  promptTemplate="Summarize: {{input}}"
/>
```

### Task data fields

Fields from the task's data object can be embedded alongside user input:

```xml
<LLMTextArea
  name="qa"
  promptTemplate="Context: {{article}}\n\nQuestion: {{input}}"
/>
```

Or resolved from a task-data field at the top level (value is the full template string):

```xml
<LLMTextArea
  name="prompt_runner"
  promptTemplate="$prompt_config"
/>
```

## Multiple responses

```xml
<View>
  <LLMTextArea
    name="candidates"
    promptTemplate="Write a subject line for: {{input}}"
    numResponses="3"
    maxSubmissions="2"
  />
</View>
```

## Result structure

Results are stored as:

```json
{
  "from_name": "summary",
  "to_name": "article",
  "type": "llmtextarea",
  "value": {
    "user_input": "The article text the annotator typed",
    "prompt": "Full resolved prompt sent to the backend",
    "responses": [
      {
        "text": "Generated response text",
        "metadata": {
          "model": "gemini-2.5-flash",
          "response_number": 1
        }
      }
    ],
    "timestamp": 1698765432000
  }
}
```

## Backend contract

Forte's `LLMGenerationMixin` handles the generate endpoint. Expected request body:

```json
{
  "prompt": "string",
  "num_responses": 1
}
```

Expected response body:

```json
{
  "responses": [
    { "text": "string", "metadata": { "model": "string", "response_number": 1 } }
  ]
}
```

A single-response format (`{ "response": "...", "model": "..." }`) is also accepted by the tag for backward compatibility.
