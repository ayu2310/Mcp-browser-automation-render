# Push to GitHub - Quick Guide

## Option 1: If You Already Have a GitHub Repo (Synced to Render)

If Render is already connected to your GitHub repo, just add it as remote and push:

```bash
# Add your existing GitHub repo as remote
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Push to GitHub
git push -u origin master
```

**Or if your repo uses `main` branch:**
```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

## Option 2: Create New GitHub Repo

1. **Go to GitHub.com** → Click "+" → "New repository"
2. **Name it**: `browserbase-mcp-server` (or any name)
3. **Don't initialize** with README/license (we already have files)
4. **Click "Create repository"**
5. **Copy the repo URL** (e.g., `https://github.com/YOUR_USERNAME/browserbase-mcp-server.git`)

Then run:
```bash
git remote add origin https://github.com/YOUR_USERNAME/browserbase-mcp-server.git
git branch -M main
git push -u origin main
```

## Option 3: Use GitHub CLI (if installed)

```bash
# Create repo and push in one command
gh repo create browserbase-mcp-server --public --source=. --remote=origin --push
```

## After Pushing

Once code is on GitHub:
1. **Render will auto-deploy** (if already connected)
2. **Or connect Render** to the repo:
   - Go to Render dashboard
   - New Web Service → Connect GitHub
   - Select your repo
   - Use `render.yaml` config
   - Deploy!

## Need Help?

If you share your GitHub username/repo name, I can give you the exact commands to run.

