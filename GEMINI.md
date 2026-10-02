# Google Gemini API Standards & Invariants

When implementing or modifying Google Gemini API calls in this project:

### 1. Mandatory Endpoint: Interactions API
- **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/interactions`
- **Do NOT use**: Legacy `.../models/{model}:generateContent`
- **Authentication**: Pass API Key via header `x-goog-api-key: <API_KEY>` or query parameter `?key=<API_KEY>`.

### 2. Request Body Schema
Always use the Interactions API input structure:
```json
{
  "model": "gemini-3.8-flash",
  "store": false,
  "input": [
    {
      "type": "user_input",
      "content": "<prompt text>"
    }
  ]
}
```

### 3. Response Parsing
Responses return a list of execution `steps`:
- Model answer text is found in: `response.steps.find(s => s.type === 'model_output')?.content?.[0]?.text`
- Thinking / reasoning steps are found in: `response.steps.filter(s => s.type === 'thought')`
- Token usage (including thought tokens): `response.usage.total_thought_tokens`

### 4. Active Models & Fallback Rules
- **Primary Model**: `gemini-3.8-flash` (latest flash reasoning)
- **Active Fallback Models**: `gemini-3.5-flash` or `gemini-3.6-flash` (consistently available and fast)
- **Forbidden Models**: Never use `gemini-2.5-flash` or `gemini-2.5-pro` (they return HTTP 404 deprecated for new users).
