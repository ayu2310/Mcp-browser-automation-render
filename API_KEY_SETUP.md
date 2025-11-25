# API Key Setup Guide

## Issue Found

Your Gemini API key was reported as **leaked** and is being rejected by Google's API with a 403 error. This is why you're seeing "Failed to parse server response" errors.

## Solution: Generate New API Key

### Step 1: Generate New Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click **"Create API Key"**
3. Select your project or create a new one
4. Copy the new API key

### Step 2: Update Render Environment Variables

1. Go to your Render dashboard: https://dashboard.render.com
2. Select your service (mcp-browser-automation-render)
3. Go to **Environment** tab
4. Find `GEMINI_API_KEY` (or `GOOGLE_API_KEY` or `MODEL_API_KEY`)
5. Click **Edit** and paste your new API key
6. Click **Save Changes**
7. Render will automatically redeploy

### Step 3: Verify

After redeployment, test again:

```bash
MCP_URL="https://mcp-browser-automation-render.onrender.com/api/mcp" node scripts/test-content-rich-page.js
```

## Environment Variables in Render

Make sure these are set in Render:

- `BROWSERBASE_API_KEY` - Your Browserbase API key
- `BROWSERBASE_PROJECT_ID` - Your Browserbase Project ID  
- `GEMINI_API_KEY` - **Your NEW Gemini API key** (or use `GOOGLE_API_KEY` or `MODEL_API_KEY`)

## Why This Happened

API keys can be marked as "leaked" if:
- They were committed to a public GitHub repository
- They were shared in logs or error messages
- They were exposed in client-side code
- Google detected suspicious activity

## Prevention

1. **Never commit API keys to Git** - Use `.env` files (already in `.gitignore`)
2. **Use environment variables** - Always use Render's environment variables, never hardcode
3. **Rotate keys regularly** - Especially if you suspect exposure
4. **Use different keys for dev/prod** - Separate keys for different environments

## After Updating

Once you update the API key in Render:
- ✅ Parsing errors should disappear
- ✅ `observe` and `act` should work correctly
- ✅ Session management will continue working (already working!)

