# Browserbase MCP Server

Production-ready Model Context Protocol (MCP) server for browser automation. **Fully stateless**—session management handled by Browserbase's SessionManager.

## Status

✅ **Production Ready** - Deployed on Render

**Endpoint:** `https://mcp-browser-automation-render.onrender.com/api/mcp`

## Quick Start

```bash
npm install
npm run dev
```

## Environment Variables

- `BROWSERBASE_API_KEY` - Browserbase API key
- `BROWSERBASE_PROJECT_ID` - Browserbase Project ID
- `GEMINI_API_KEY` / `GOOGLE_API_KEY` / `MODEL_API_KEY` - LLM key for Stagehand
- `MODEL_NAME` (optional) - Override Stagehand model

## Core Concept

**Stateless Architecture:** The server uses original Browserbase MCP tools. Session management is handled automatically by Browserbase's SessionManager when you pass `sessionId` to tool calls.

**Session Reuse:** To reuse a session across multiple tool calls:
1. Capture `sessionId` from `browserbase_session_create` response
2. Pass `sessionId` to all subsequent tool calls
3. Browserbase SessionManager automatically reuses the same browser session

## Usage Example

```javascript
const { Client } = require('@modelcontextprotocol/sdk/dist/cjs/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js');

const transport = new StreamableHTTPClientTransport('https://mcp-browser-automation-render.onrender.com/api/mcp');
const client = new Client({ name: 'my-client', version: '1.0.0' });
await client.connect(transport);

// Create session
const sessionResult = await client.callTool({
  name: 'browserbase_session_create',
  arguments: {}
});
const sessionId = extractSessionId(sessionResult.content);

// Navigate
await client.callTool({
  name: 'browserbase_stagehand_navigate',
  arguments: { url: 'https://example.com', sessionId }
});

// Act (natural language)
await client.callTool({
  name: 'browserbase_stagehand_act',
  arguments: { action: 'Click the login button', sessionId }
});

// Act (deterministic - using observation)
const observeResult = await client.callTool({
  name: 'browserbase_stagehand_observe',
  arguments: { instruction: 'Find the login button', returnAction: true, sessionId }
});
const observations = extractObservations(observeResult.content);
if (observations.length > 0) {
  await client.callTool({
    name: 'browserbase_stagehand_act',
    arguments: { observation: observations[0], sessionId }
  });
}
```

## Documentation

- **[MCP_SERVER_GUIDE.md](./MCP_SERVER_GUIDE.md)** - Complete user guide with all tools and examples
Refer to `MCP_SERVER_GUIDE.md` for full details on each MCP tool and usage patterns.

## Features

✅ Stateless - No server storage  
✅ Session Management - Automatic via Browserbase SessionManager  
✅ Deterministic Actions - Support for XPath/selector-based actions via observations  
✅ Natural Language Actions - Support for prompt-based actions  
✅ Production Tested - Deployed and verified

## Deployment

Deployed on Render using `render.yaml`. The service installs dependencies, runs `npm run build`, and starts with `npm start`. Health checks resolve against `/api/health`.
