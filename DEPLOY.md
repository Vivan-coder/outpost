# Deploying Outpost

Static site. Build command `npm run build`, publish directory `dist`. No server, no environment variables.

## Permanent link with Netlify (one-time setup)

1. Go to https://app.netlify.com and sign in with GitHub.
2. Click **Add new site** > **Import an existing project** > **GitHub**.
3. Authorise Netlify if asked, and give it access to the `outpost` repository.
4. Pick the `outpost` repo. Branch: `main`.
5. Build settings are read from `netlify.toml` (build command `npm run build`, publish directory `dist`). Leave them as they are.
6. Click **Deploy**. After about a minute you get a link like `https://something.netlify.app`.
7. Optional: **Site configuration** > **Change site name** to get a nicer URL.

## Alternative: Cloudflare Pages

1. Go to https://dash.cloudflare.com > **Workers & Pages** > **Create** > **Pages** > **Connect to Git**.
2. Pick the `outpost` repo, branch `main`.
3. Framework preset: **None**. Build command: `npm run build`. Build output directory: `dist`.
4. Add environment variable `NODE_VERSION` = `22`.
5. Click **Save and Deploy**. The link looks like `https://outpost-xxx.pages.dev`.

## Redeploy after a change

```
git add -A
git commit -m "what changed"
git push
```

Netlify (or Cloudflare Pages) rebuilds on every push to `main`. The new version is live in about a minute, at the same link.

## Quick phone test without deploying

```
npm run dev
npx cloudflared tunnel --url http://localhost:5173
```

Open the printed `https://....trycloudflare.com` link on the phone. The link changes every time the tunnel restarts, and it stops working when the laptop sleeps or either command is closed. Use it for testing only, never for the submission.

## Before submitting

- Run `npm run build` locally and check it passes.
- Open the permanent link on the phone and on a second device.
