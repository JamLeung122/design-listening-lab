# Design Listening Lab — optional online AI backend

This backend is optional. The iPad PWA remains offline-first and works without any API subscription or server.

## Why a backend?

GitHub Pages is a static host. Never embed an OpenAI API key in app.js, frontend forms, GitHub secrets exposed to Pages, or a URL. This Cloudflare Worker forwards a selected English phrase to the OpenAI Responses API, holding the provider key in a **server secret**.

## One-time deployment (requires your own Cloudflare account and OpenAI API billing)

1. On a Mac, install Node.js and run `cd backend && npx wrangler login`.
2. Deploy with `npx wrangler deploy` from the `backend` folder.
3. Set two Worker secrets (same folder):
   - `npx wrangler secret put OPENAI_API_KEY` — paste your **OpenAI API** key at the secure prompt.
   - `npx wrangler secret put APP_ACCESS_TOKEN` — choose a long, random private application passphrase distinct from your OpenAI key.
4. Find the resulting HTTPS Worker address in Cloudflare (usually `https://<worker>.<account>.workers.dev`); add `/explain`.
5. On iPad, open Design Listening Lab and choose **在线 AI 设置**. Enter that address and the **APP_ACCESS_TOKEN**, **not** the OpenAI API key. Then select a word/phrase and press **在线 AI 解释**.

### Privacy and safeguards

- Only selected text is sent when the online-explain button is tapped. No audio, handwriting, transcript collection, or note history is uploaded.
- Frontend stores only the Worker URL, not the token. Reloading the page requires re-entering the application token.
- Worker checks the site origin, requires the application token, limits input to 1,200 characters and output tokens, disables response storage where supported by the provider, and times out upstream requests.
- The application passphrase is **not** full user authentication. A public Worker endpoint can still be probed. Use a strong passphrase, Cloudflare rate limiting, per-project OpenAI budget limits and key rotation. Origin/CORS checks alone do not protect backend credentials.
- Usage of OpenAI API is **separately billed from ChatGPT subscriptions**. Server setup must be completed before the UI's online AI button can work.
- Offline features, including writing and cached transcripts, remain available without this server.

## Validation

Run `node --check backend/worker.js` and `node --check app.js` (from repository root). Never commit `.dev.vars` or API credentials.
