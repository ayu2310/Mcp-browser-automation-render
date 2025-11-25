# Browserbase MCP Server - User Guide

Production-ready Model Context Protocol (MCP) server for browser automation. **Fully stateless**—session management handled by Browserbase's SessionManager.

**Production Endpoint:** `https://mcp-browser-automation-render.onrender.com/api/mcp`

## Connecting to the MCP Server

To connect to the MCP server, use the MCP SDK with `StreamableHTTPClientTransport`:

```javascript
const { Client } = require('@modelcontextprotocol/sdk/dist/cjs/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js');

// Connect to the MCP server
const transport = new StreamableHTTPClientTransport('https://mcp-browser-automation-render.onrender.com/api/mcp');
const client = new Client({ name: 'my-client', version: '1.0.0' });

// Handle connection errors
client.onerror = (error) => {
  console.error('MCP Client Error:', error.message || error);
};

// Connect
await client.connect(transport);
console.log('✅ Connected to MCP server');

// Now you can call tools
const result = await client.callTool({
  name: 'browserbase_session_create',
  arguments: {}
});

// Close when done
await client.close();
```

**Installation:**
```bash
npm install @modelcontextprotocol/sdk
```

## Core Concept

**Stateless Architecture:** The server uses the original Browserbase MCP tools. Session management is handled automatically by Browserbase's SessionManager when you pass `sessionId` to tool calls.

**Session Reuse:** To reuse a session across multiple tool calls:
1. **Capture** `sessionId` from `browserbase_session_create` response
2. **Pass** `sessionId` to all subsequent tool calls (navigate, act, observe, etc.)
3. **SessionManager** automatically reuses the same browser session

## Key Tools

### `browserbase_session_create`
Creates a new Browserbase session **or reopens** an existing Browserbase session when you pass a known `sessionId`. Always capture the returned session ID and reuse it.

**Parameters:**
- `sessionId` (optional): Provide a previously issued Browserbase session ID to resume the same browser (handy for client-side replay). When omitted, a brand-new session is created.

**Returns:** Session ID in the response (extract from `https://www.browserbase.com/sessions/{id}` text)

**Examples:**
```javascript
// Create a new session
const createResult = await client.callTool({
  name: 'browserbase_session_create',
  arguments: {}
});
const sessionId = extractSessionId(createResult.content);

// Resume the exact same Browserbase session later
const resumeResult = await client.callTool({
  name: 'browserbase_session_create',
  arguments: { sessionId }
});
const resumedId = extractSessionId(resumeResult.content); // matches sessionId
```

### `browserbase_stagehand_navigate`
Navigates to a URL.

**Parameters:** 
- `url` (required): URL to navigate to
- `sessionId` (optional): Browserbase session ID to reuse

**Example:**
```javascript
await client.callTool({
  name: 'browserbase_stagehand_navigate',
  arguments: {
    url: 'https://example.com',
    sessionId: sessionId  // Pass sessionId to reuse session
  }
});
```

### `browserbase_stagehand_act`
Performs actions on the page. Supports two modes:

**Mode 1: Natural Language Action**
- Parameters: `action` (required), `variables` (optional), `sessionId` (optional)
- Uses Stagehand's LLM (Gemini 2.5 Flash) to interpret and execute the action

**Mode 2: Deterministic Action (using observation)**
- Parameters: `observation` (required), `sessionId` (optional)
- Uses XPath/selector from `browserbase_stagehand_observe` for deterministic execution

**Example - Natural Language:**
```javascript
await client.callTool({
  name: 'browserbase_stagehand_act',
  arguments: {
    action: 'Click the login button',
    sessionId: sessionId
  }
});
```

**Example - Deterministic (using observation):**
```javascript
// First, observe to get deterministic selectors
const observeResult = await client.callTool({
  name: 'browserbase_stagehand_observe',
  arguments: {
    instruction: 'Find the login button',
    returnAction: true,
    sessionId: sessionId
  }
});

// Parse observations from response
const observations = extractObservations(observeResult.content);
if (observations && observations.length > 0) {
  // Use observation for deterministic action
  await client.callTool({
    name: 'browserbase_stagehand_act',
    arguments: {
      observation: observations[0],  // Pass full observation object
      sessionId: sessionId
    }
  });
}
```

### `browserbase_stagehand_observe`
Finds elements with deterministic selectors (XPath/CSS selectors).

**Parameters:**
- `instruction` (required): Description of elements to find
- `returnAction` (optional, default: false): Whether to return action objects
- `sessionId` (optional): Browserbase session ID to reuse

**Returns:** Array of observation objects with `method`, `selector`, `xpath`, `arguments`, and `description` fields.

**Example:**
```javascript
const result = await client.callTool({
  name: 'browserbase_stagehand_observe',
  arguments: {
    instruction: 'Find the login button',
    returnAction: true,
    sessionId: sessionId
  }
});

// Parse observations array from response
const observations = extractObservations(result.content);
// observations[0] can be passed to browserbase_stagehand_act
```

### Other Tools
- `browserbase_screenshot`: Capture screenshots (returns image format)
- `browserbase_stagehand_get_url`: Get current URL
- `browserbase_stagehand_extract`: Extract structured data
- `browserbase_session_close`: Close session

**All tools accept optional `sessionId` parameter for session reuse (`session_create` additionally accepts it to reopen an existing Browserbase session).**

## Usage Pattern

```javascript
// 1. Create or resume
const sessionResult = await client.callTool({
  name: 'browserbase_session_create',
  arguments: {} // or { sessionId } to reopen a prior browser
});
const sessionId = extractSessionId(sessionResult.content);

// 2. Navigate
await client.callTool({
  name: 'browserbase_stagehand_navigate',
  arguments: {
    url: 'https://example.com',
    sessionId
  }
});

// 3. Act (Natural Language)
await client.callTool({
  name: 'browserbase_stagehand_act',
  arguments: {
    action: 'Click login button',
    sessionId
  }
});

// 3b. Deterministic action
const observeResult = await client.callTool({
  name: 'browserbase_stagehand_observe',
  arguments: {
    instruction: 'Find the login button',
    returnAction: true,
    sessionId
  }
});
const observations = extractObservations(observeResult.content);
if (observations?.length) {
  await client.callTool({
    name: 'browserbase_stagehand_act',
    arguments: {
      observation: observations[0],
      sessionId
    }
  });
}

// 4. Close session when done
await client.callTool({
  name: 'browserbase_session_close',
  arguments: { sessionId }
});
```

## ⚠️ Critical: Session Reuse

**You MUST pass `sessionId` on EVERY call within a session, or a new session will be created each time.**

```javascript
// ❌ WRONG - Creates new session on each call
await client.callTool({ name: 'browserbase_session_create', arguments: {} });
await client.callTool({ name: 'browserbase_stagehand_navigate', arguments: { url: 'https://example.com' } }); // New session!
await client.callTool({ name: 'browserbase_stagehand_act', arguments: { action: 'Click button' } }); // New session!

// ✅ CORRECT - Reuses same session
const sessionResult = await client.callTool({ name: 'browserbase_session_create', arguments: {} });
const sessionId = extractSessionId(sessionResult.content);
await client.callTool({ 
  name: 'browserbase_stagehand_navigate', 
  arguments: { 
    url: 'https://example.com', 
    sessionId: sessionId  // ← Required!
  }
});
await client.callTool({ 
  name: 'browserbase_stagehand_act', 
  arguments: { 
    action: 'Click button',
    sessionId: sessionId  // ← Required!
  }
});
```

**Why?** The Browserbase SessionManager uses `sessionId` to track and reuse browser sessions. Without `sessionId`, each call creates a new session.

## Helper Functions

Use the shared helpers in `scripts/helpers.js` inside this repo to keep parsing logic consistent (handles escaped JSON, screenshot payloads, etc.):

```javascript
const {
  extractSessionId,
  extractObservations,
  extractJsonData,
} = require('./scripts/helpers');
```

## Best Practices

1. **Always pass `sessionId`**: Every tool call within a session MUST include `sessionId` to reuse the session
2. **Extract after session create**: Always extract `sessionId` from `browserbase_session_create` response
3. **Use deterministic actions**: Use `observation` parameter for reliable, repeatable actions
4. **Close sessions**: Always call `browserbase_session_close` when done to free resources
5. **Handle errors gracefully**: Check for errors in responses and handle them appropriately

## Observation Object Structure

When using `browserbase_stagehand_observe` with `returnAction: true`, you get observation objects like:

```json
{
  "method": "click",
  "selector": "button#login",
  "xpath": "/html/body/div[1]/button[@id='login']",
  "arguments": [],
  "description": "Click the login button"
}
```

**Fields:**
- `method`: Action method (e.g., "click", "fill", "select")
- `selector`: CSS selector for the element
- `xpath`: XPath expression for the element
- `arguments`: Array of arguments for the action (e.g., text to fill)
- `description`: Human-readable description of the action

Pass the entire observation object to `browserbase_stagehand_act` for deterministic execution.

## Model Configuration

The server uses **Gemini 2.5 Flash** by default for all Stagehand actions. This can be overridden by setting the `MODEL_NAME` environment variable in Render.

Default model: `google/gemini-2.5-flash`

## Status

✅ **Production Ready**: Deployed and tested on Render  
✅ **Session Management**: Automatic via Browserbase SessionManager  
✅ **Deterministic Actions**: Support for XPath/selector-based actions via observations  
✅ **Natural Language Actions**: Support for prompt-based actions with Gemini 2.5 Flash  
✅ **Stateless**: No server-side state - all session management client-side
