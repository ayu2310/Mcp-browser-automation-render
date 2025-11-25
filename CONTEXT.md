# Project Context

## Current Status

🟢 **Production Ready** - Simplified stateless MCP server using original Browserbase MCP tools

## Overview

Stateless MCP server for browser automation. Uses original Browserbase MCP tools with session management handled by Browserbase's SessionManager.

## Architecture

- **Framework**: Next.js 14 (Vercel)
- **MCP Handler**: `mcp-handler` package
- **Browserbase**: `@browserbasehq/mcp-server-browserbase` package
- **Runtime**: Serverless functions (maxDuration: 60s)

## Key Features

1. **Stateless**: Server stores NO data - all session management client-side
2. **Original Tools**: Uses Browserbase MCP tools directly without flowState wrapper
3. **Session Management**: Handled by Browserbase SessionManager via `sessionId` parameter
4. **Enhanced Act**: Supports both natural language actions and observation-based (XPath) actions
5. **Simple**: Clean, minimal codebase (~200 lines)

## Environment Variables

- `BROWSERBASE_API_KEY` - Browserbase API key
- `BROWSERBASE_PROJECT_ID` - Browserbase Project ID
- `GEMINI_API_KEY` / `GOOGLE_API_KEY` / `MODEL_API_KEY` - LLM key for Stagehand
- `MODEL_NAME` (optional) - Override Stagehand model

## Deployment

- **Production URL**: `https://browserbase-mcp-server-iub9cl6kc-ayus-projects-56bd70c3.vercel.app/api/mcp`
- **Health Endpoint**: `/api/health`
- **Status**: 🟢 All tools working

## Current Implementation Status

### ✅ Working Tools
- `browserbase_session_create` - Creates browser sessions
- `browserbase_stagehand_navigate` - Navigation
- `browserbase_stagehand_act` - Actions (natural language + observation/XPath)
- `browserbase_stagehand_observe` - Find elements with deterministic selectors
- `browserbase_screenshot` - Screenshot capture
- `browserbase_stagehand_get_url` - Get current URL
- `browserbase_session_close` - Session cleanup
- `browserbase_stagehand_extract` - Extract structured data

## Recent Simplification (2024-01-XX)

### Removed flowState Complexity
**Changes**:
- Removed all flowState logic and helpers
- Using original Browserbase MCP tools directly
- Session management via `sessionId` parameter (handled by Browserbase SessionManager)
- Enhanced `act` to support both `action` and `observation` parameters
- Code reduced from ~600 lines to ~200 lines

**Status**: ✅ Simplified and working

## Code Structure

### Key Files
- `app/api/mcp/route.ts` - Main MCP handler (simplified, no flowState)
- `app/api/health/route.ts` - Health check endpoint
- `MCP_SERVER_GUIDE.md` - User guide for the MCP server

## Usage Pattern

```javascript
// 1. Create session
const sessionResult = await client.callTool({
  name: 'browserbase_session_create',
  arguments: {}
});
const sessionId = extractSessionId(sessionResult.content);

// 2. Use sessionId for all subsequent calls
await client.callTool({
  name: 'browserbase_stagehand_navigate',
  arguments: { url: 'https://example.com', sessionId }
});

await client.callTool({
  name: 'browserbase_stagehand_act',
  arguments: { action: 'Click button', sessionId }
});
```

## Notes

- No flowState needed - just pass `sessionId` to each call
- Browserbase SessionManager handles session reuse automatically
- Much simpler than previous flowState-based implementation
