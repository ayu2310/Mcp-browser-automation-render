# Function Usage Guide

## ✅ Working Functions

### 1. `browserbase_session_create`
Creates a new browser session.

```javascript
const result = await client.callTool({
  name: 'browserbase_session_create',
  arguments: {}
});
const sessionId = extractSessionId(result.content);
```

### 2. `browserbase_stagehand_navigate`
Navigates to a URL.

```javascript
await client.callTool({
  name: 'browserbase_stagehand_navigate',
  arguments: { url: 'https://example.com', sessionId }
});
```

### 3. `browserbase_stagehand_observe`
Finds elements on the page. **Returns observations with `method`, `selector`, `xpath`, `arguments`, `description`.**

```javascript
const result = await client.callTool({
  name: 'browserbase_stagehand_observe',
  arguments: {
    instruction: 'Find the login button',
    returnAction: true,  // Set to true to get action objects
    sessionId
  }
});

const observations = extractObservations(result.content);
// observations[0] = { method: "click", selector: "xpath=...", description: "..." }
```

### 4. `browserbase_stagehand_act` (Natural Language)
Performs actions using natural language. **Works for element-based actions only.**

✅ **Works:**
- "Click on the login button"
- "Fill the username field with 'test'"
- "Click the submit button"

❌ **Doesn't Work:**
- "Scroll down" (no element to interact with)
- "Wait 5 seconds" (not an element action)

```javascript
await client.callTool({
  name: 'browserbase_stagehand_act',
  arguments: {
    action: 'Click on the login button',
    sessionId
  }
});
```

### 5. `browserbase_stagehand_act` (Deterministic - Using Observation)
Performs actions using observation objects. **Most reliable method.**

```javascript
// First, observe to get the element
const observeResult = await client.callTool({
  name: 'browserbase_stagehand_observe',
  arguments: {
    instruction: 'Find the login button',
    returnAction: true,
    sessionId
  }
});

const observations = extractObservations(observeResult.content);
if (observations.length > 0) {
  // Use the observation for deterministic action
  await client.callTool({
    name: 'browserbase_stagehand_act',
    arguments: {
      observation: observations[0],  // Pass full observation object
      sessionId
    }
  });
}
```

### 6. `browserbase_stagehand_extract`
Extracts structured data from the page.

```javascript
const result = await client.callTool({
  name: 'browserbase_stagehand_extract',
  arguments: {
    instruction: 'Extract the page title and first paragraph',
    sessionId
  }
});

const data = extractJsonData(result.content);
```

### 7. `browserbase_screenshot`
Takes a screenshot.

```javascript
const result = await client.callTool({
  name: 'browserbase_screenshot',
  arguments: { sessionId }
});
// Screenshot is in result.content as image type
```

### 8. `browserbase_stagehand_get_url`
Gets the current URL.

```javascript
const result = await client.callTool({
  name: 'browserbase_stagehand_get_url',
  arguments: { sessionId }
});
const url = result.content[0]?.text;
```

### 9. `browserbase_session_close`
Closes the session.

```javascript
await client.callTool({
  name: 'browserbase_session_close',
  arguments: { sessionId }
});
```

## ⚠️ Important Notes

### Scroll Actions
**"Scroll down" doesn't work with natural language** because there's no element to interact with.

**Solution: Use observe + act to scroll to an element:**

```javascript
// Find an element below the viewport
const observeResult = await client.callTool({
  name: 'browserbase_stagehand_observe',
  arguments: {
    instruction: 'Find a heading or section that appears below the current viewport',
    returnAction: true,
    sessionId
  }
});

const observations = extractObservations(observeResult.content);
if (observations.length > 0) {
  // This will scroll to the element
  await client.callTool({
    name: 'browserbase_stagehand_act',
    arguments: {
      observation: observations[0],
      sessionId
    }
  });
}
```

### Observation Format
Observations returned by `observe` have this structure:

```json
{
  "method": "click",
  "selector": "xpath=/html/body/div[1]/button[@id='login']",
  "description": "Click the login button",
  "arguments": []
}
```

**Note:** The `method` can be:
- `"click"` - Click action
- `"fill"` - Fill input
- `"innerText"` - Get text
- `"scrollIntoViewIfNeeded"` - Scroll to element
- `"hover"` - Hover over element
- etc.

### Best Practices

1. **Always pass `sessionId`** to every tool call after creating a session
2. **Use `observe` + `act` with observation** for reliable, deterministic actions
3. **Use natural language `act`** only for simple, element-based actions
4. **For scrolling**, use observe to find an element below, then act with that observation
5. **Extract observations properly** using the `extractObservations` helper function

## Helper Functions

Use the shared helpers from `scripts/helpers.js`:

```javascript
const { extractSessionId, extractObservations, extractJsonData } = require('./helpers');

const sessionId = extractSessionId(result.content);
const observations = extractObservations(observeResult.content);
const jsonData = extractJsonData(extractResult.content);
```

