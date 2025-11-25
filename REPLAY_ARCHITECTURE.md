# Replay Architecture Decision

## Current Situation

- ✅ **Session management working** - No extra sessions being created
- ✅ **On Render** - Persistent process (not serverless), so server-side state IS possible
- ✅ **Simplified codebase** - Removed flowState complexity
- ❓ **Replay needed?** - For deterministic action replay

## Two Approaches

### Option 1: Client-Side Replay (Recommended) ⭐

**How it works:**
- Client stores: `sessionId`, `url`, `actions[]` (array of action objects)
- Client replays by calling tools in sequence:
  1. `browserbase_session_create` (or reuse existing sessionId)
  2. `browserbase_stagehand_navigate` with stored URL
  3. `browserbase_stagehand_act` with each stored action (using `observation` for deterministic actions)

**Pros:**
- ✅ **Simpler server** - Server stays stateless, no complexity
- ✅ **Client has full control** - Can modify replay, add delays, handle errors
- ✅ **Works everywhere** - Works on serverless (Vercel) and persistent (Render)
- ✅ **No server storage** - No database/cache needed
- ✅ **Easier debugging** - Client can log/store replay state
- ✅ **Flexible** - Client can replay partial flows, skip steps, etc.

**Cons:**
- ❌ **Client responsibility** - Client must manage state
- ❌ **More client code** - Need to store and replay actions

**Example:**
```javascript
// Client stores replay state
const replayState = {
  sessionId: "abc-123",
  url: "https://example.com",
  actions: [
    { type: "observe", instruction: "Find login button" },
    { type: "act", observation: { method: "click", xpath: "/html/body/button[1]" } },
    { type: "act", action: "Fill username field with 'test'" }
  ]
};

// Replay
await navigate(replayState.url, replayState.sessionId);
for (const action of replayState.actions) {
  if (action.type === "observe") {
    await observe(action.instruction, replayState.sessionId);
  } else if (action.type === "act") {
    if (action.observation) {
      await act({ observation: action.observation }, replayState.sessionId);
    } else {
      await act({ action: action.action }, replayState.sessionId);
    }
  }
}
```

---

### Option 2: Server-Side flowState (Possible but Complex)

**How it works:**
- Server stores flowState in memory (or Redis/database)
- Client sends `replayState` parameter
- Server replays actions internally

**Pros:**
- ✅ **Centralized** - Server manages replay logic
- ✅ **Less client code** - Client just sends replayState
- ✅ **Server can optimize** - Batch actions, add retries, etc.

**Cons:**
- ❌ **Server complexity** - Need to store state, handle replay logic
- ❌ **Storage needed** - In-memory (lost on restart) or Redis/database
- ❌ **Tight coupling** - Client depends on server replay format
- ❌ **Harder to debug** - Replay happens on server, less visibility
- ❌ **Not portable** - Won't work on serverless (Vercel) without external storage

**Example:**
```javascript
// Client sends replayState
await client.callTool({
  name: 'browserbase_stagehand_replay',
  arguments: {
    replayState: {
      sessionId: "abc-123",
      url: "https://example.com",
      actions: [...]
    }
  }
});
```

---

## Recommendation: **Client-Side Replay** ⭐

### Why?

1. **You're already storing actions** - Your client likely tracks what it does
2. **Simpler architecture** - Server stays clean and stateless
3. **More flexible** - Client can modify replay, add error handling, etc.
4. **Works everywhere** - Same code works on Vercel and Render
5. **Better debugging** - Full visibility into replay process
6. **No dependencies** - No need for Redis/database

### Implementation

Create a simple client-side replay helper:

```javascript
class ReplayManager {
  constructor() {
    this.replayState = {
      sessionId: null,
      url: null,
      actions: []
    };
  }
  
  // Track actions as you execute them
  trackAction(type, params) {
    this.replayState.actions.push({ type, ...params, timestamp: Date.now() });
  }
  
  // Save replay state
  save() {
    return JSON.stringify(this.replayState);
  }
  
  // Load replay state
  load(json) {
    this.replayState = JSON.parse(json);
  }
  
  // Replay stored actions
  async replay(client) {
    const { sessionId, url, actions } = this.replayState;
    
    // Navigate to starting URL
    await client.callTool({
      name: 'browserbase_stagehand_navigate',
      arguments: { url, sessionId }
    });
    
    // Replay each action
    for (const action of actions) {
      if (action.type === 'observe') {
        await client.callTool({
          name: 'browserbase_stagehand_observe',
          arguments: {
            instruction: action.instruction,
            returnAction: action.returnAction,
            sessionId
          }
        });
      } else if (action.type === 'act') {
        await client.callTool({
          name: 'browserbase_stagehand_act',
          arguments: {
            ...(action.observation ? { observation: action.observation } : {}),
            ...(action.action ? { action: action.action } : {}),
            sessionId
          }
        });
      }
      
      // Small delay between actions
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}
```

---

## When to Use Server-Side?

Only if:
- You need **centralized replay** across multiple clients
- You want **server-side optimization** (batching, retries, etc.)
- You have **persistent storage** (Redis, database) already set up
- You're **only deploying to Render** (not Vercel)

---

## Decision Matrix

| Factor | Client-Side | Server-Side |
|--------|-------------|-------------|
| **Simplicity** | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **Flexibility** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Portability** | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **Server Complexity** | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **Storage Needed** | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **Debugging** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

**Winner: Client-Side Replay** 🏆

