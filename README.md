# Sgela AI — Web App (+ installable PWA)

A chat page students open in a browser or add to their home screen. Your OpenAI
key stays safe on the server. No WhatsApp, no Meta, no waiting — deploy and share a link.

## What's inside
- `public/index.html` — the chat page students see (the whole frontend).
- `public/manifest.json` + `public/sw.js` — make it installable ("Add to Home Screen").
- `public/icon-192.png` / `icon-512.png` — the app icon.
- `api/chat.js` — the backend. Holds your OpenAI key, talks to OpenAI, returns answers.
- `api/system_prompt.txt` — Sgela's brain. Edit this to change how it answers.

## Deploy it free on Vercel (about 10 minutes)

You need a free account at **vercel.com** (sign up with GitHub or email) and the
**Vercel CLI**. Easiest path:

### Option A — drag-and-drop (no git needed)
1. Go to **vercel.com**, sign up, click **Add New → Project → Deploy**.
2. When it asks, you can import from a folder — or use Option B which is more reliable.

### Option B — Vercel CLI (recommended)
1. Install the CLI (one time):
   ```
   npm install -g vercel
   ```
2. In this folder, run:
   ```
   vercel
   ```
   - Log in when prompted.
   - Accept the defaults (project name, etc.).
   - It deploys and gives you a URL like `https://sgela-web.vercel.app`.
3. Add your OpenAI key as an environment variable (THIS is what keeps it secret):
   ```
   vercel env add OPENAI_API_KEY
   ```
   Paste your key, choose **Production** (and Preview/Development if asked).
4. Redeploy so the key takes effect:
   ```
   vercel --prod
   ```
5. Open the `.vercel.app` URL. Ask Sgela a question. Done.

## Share with students
Send them the `https://...vercel.app` link on WhatsApp. On their phone:
- **Android (Chrome):** menu → "Add to Home screen"
- **iPhone (Safari):** share icon → "Add to Home Screen"
Now Sgela sits on their phone with an icon and opens full-screen like an app.

## Costs
- Vercel free tier is plenty for a pilot.
- You only pay OpenAI per question (gpt-4o-mini is very cheap). Watch usage at platform.openai.com.

## Later
- Add a free-trial / payment gate before scaling.
- Add a custom domain (e.g. sgela.co.za) in Vercel's dashboard.
