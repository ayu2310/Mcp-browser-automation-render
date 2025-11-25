# Migration to Render - Quick Guide

## Why Render Solves Our Problem

**The Issue**: Vercel is serverless - each request creates a new process, so SessionManager's Map is empty.

**The Solution**: Render runs **persistent Node.js processes** - the SessionManager's Map persists between requests, so sessions are automatically maintained!

## Migration Steps

### 1. Create Render Account
1. Go to https://render.com
2. Sign up (free tier available)
3. Connect your GitHub repo

### 2. Create New Web Service
1. Click "New +" → "Web Service"
2. Connect your GitHub repository
3. Use these settings:
   - **Name**: `browserbase-mcp-server`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Starter (free) or Standard ($7/month)

### 3. Environment Variables
Add these in Render dashboard:
- `BROWSERBASE_API_KEY`
- `BROWSERBASE_PROJECT_ID`
- `GEMINI_API_KEY` (or `GOOGLE_API_KEY` or `MODEL_API_KEY`)
- `NODE_ENV=production`
- `PORT=10000` (Render sets this automatically, but good to have)

### 4. Deploy
1. Click "Create Web Service"
2. Render will build and deploy automatically
3. Your service will be available at: `https://browserbase-mcp-server.onrender.com/api/mcp`

### 5. Update Code (Optional - Simplify)
Since Render has persistent state, we can **remove the session resume logic**! The SessionManager will automatically maintain sessions.

## Benefits

✅ **Persistent State** - SessionManager Map persists between requests  
✅ **No Session Resume Logic Needed** - Browserbase tools work as designed  
✅ **Simpler Code** - Can remove all the serverless workarounds  
✅ **Better Reliability** - Sessions are maintained automatically  
✅ **Free Tier Available** - Good for testing  

## Code Simplification (After Migration)

Once on Render, we can simplify `app/api/mcp/route.ts` by removing:
- Session resume logic (lines 165-204)
- Session validation checks
- All the serverless workarounds

The tools will just work because SessionManager maintains state!

## Testing After Migration

```bash
# Update test script with new URL
MCP_URL=https://browserbase-mcp-server.onrender.com/api/mcp npm test
```

## Alternative Platforms

If Render doesn't work for you, these also offer persistent processes:
- **Railway** - Similar to Render, easy deployment
- **Fly.io** - Good for global distribution
- **DigitalOcean App Platform** - More control
- **Heroku** - Classic option (paid)

## Cost Comparison

- **Vercel**: Free (serverless, but has limitations)
- **Render**: Free tier (spins down after inactivity) or $7/month (always on)
- **Railway**: $5/month minimum
- **Fly.io**: Pay-as-you-go

For a production MCP server, Render's $7/month plan is worth it for the reliability.

