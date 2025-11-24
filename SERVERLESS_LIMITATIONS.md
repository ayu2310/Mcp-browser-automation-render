# Serverless Limitations & Session Management

## The Core Problem

In serverless environments (like Vercel), each HTTP request creates a **new process** with a **new Context** and **new SessionManager**. This means:

1. **No in-memory state** between requests
2. **SessionManager's Map is empty** on every request
3. **Browserbase sessions exist** but we need to reconnect to them

## Why flowState Didn't Solve It

Even with `flowState.browserbaseSessionId`, the problem persisted because:

1. Client passes `sessionId` to tool
2. Server creates new Context/SessionManager (empty Map)
3. Server tries to resume session via `createNewBrowserSession(..., resumeSessionId)`
4. **BUT**: The page state might be blank/unexpected when resumed
5. Tools call `context.getStagehand()` which uses active session
6. If page is blank, actions fail with "Failed to parse server response"

## Current Solution

We now:
1. Accept `sessionId` parameter on all tools
2. Before calling tool, check if session exists in SessionManager
3. If not, resume it via `createNewBrowserSession(..., resumeSessionId)`
4. Set it as active session
5. Then call the tool

**This works for basic operations** (navigate, screenshot, get_url) but **may still fail for complex actions** if the page state is unexpected.

## Known Issues

- **"Failed to parse server response"**: Usually means page is blank or LLM can't parse the response
- **Session ID not preserved**: Navigation doesn't return sessionId in response (but session is still reused)
- **Page state uncertainty**: When resuming, we don't know what state the page is in

## Recommendations

1. **Always pass `sessionId`** to every tool call after `browserbase_session_create`
2. **Navigate first** if you're unsure about page state
3. **Handle errors gracefully** - if action fails, try navigating to a known URL first
4. **Consider using Browserbase's session persistence** features if available

## Alternative Approaches

1. **Use Browserbase's session context persistence** (if available)
2. **Store page state in external cache** (Redis, etc.) - but this adds complexity
3. **Accept that some actions may fail** and implement retry logic
4. **Use deterministic actions** (observations/XPath) instead of natural language when possible

