# Deploying Outpost

**Current live site:** https://novessa-outpost.pages.dev, built by **Cloudflare Pages** from the `main` branch of `Vivan-coder/outpost` (framework preset None, build command `npm run build`, output directory `dist`, environment variable `NODE_VERSION` = `22`). Every push to `main` redeploys. Netlify was used first but is no longer updated: its deploys were skipped when the account ran out of credits.

Static site. Build command `npm run build`, publish directory `dist`. No server, no environment variables.

## Alternative: Netlify (one-time setup; needs credits on the account)

1. Go to https://app.netlify.com and sign in with GitHub.
2. Click **Add new site** > **Import an existing project** > **GitHub**.
3. Authorise Netlify if asked, and give it access to the `outpost` repository.
4. Pick the `outpost` repo. Branch: `main`.
5. Build settings are read from `netlify.toml` (build command `npm run build`, publish directory `dist`). Leave them as they are.
6. Click **Deploy**. After about a minute you get a link under the `netlify.app` domain.
7. Optional: **Site configuration** > **Change site name** to get a nicer URL.

## Alternative: Cloudflare Pages

1. Go to https://dash.cloudflare.com > **Workers & Pages** > **Create** > **Pages** > **Connect to Git**.
2. Pick the `outpost` repo, branch `main`.
3. Framework preset: **None**. Build command: `npm run build`. Build output directory: `dist`.
4. Add environment variable `NODE_VERSION` = `22`.
5. Click **Save and Deploy**. The link looks like `https://<project-name>.pages.dev` (ours is `novessa-outpost`).

## Redeploy after a change

```
git add -A
git commit -m "what changed"
git push
```

Cloudflare Pages (or Netlify, if it is connected and has credits) rebuilds on every push to `main`. The new version is live in about a minute, at the same link. Do not commit video, audio or large files: the trailer outputs are git-ignored on purpose.

## Quick phone test without deploying

```
npm run dev
npx cloudflared tunnel --url http://localhost:5173
```

Open the printed `https://....trycloudflare.com` link on the phone. The link changes every time the tunnel restarts, and it stops working when the laptop sleeps or either command is closed. Use it for testing only, never for the submission.

## Before submitting

- Run `npm run build` locally and check it passes.
- Open the permanent link on the phone and on a second device.
