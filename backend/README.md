# Design Listening Lab — Qwen online explanation (optional)

The app keeps its offline transcript, audio, handwriting and Noema backup. Its **在线 AI 解释** button needs a backend URL and a private access token; the backend is **not automatically deployed with GitHub Pages**.

## Setup with Alibaba Bailian Qwen (no OpenAI API required)

1. Create an Alibaba Cloud / 百炼 account: https://bailian.console.aliyun.com/ . Choose the **华北2（北京）** model region if you want to use the applicable Mainland China newcomer model free quota. Confirm the model's eligibility and remaining quota in your actual dashboard. Newcomer free quotas can expire after 90 days. **Enable 免费额度用完即停** before testing, or overage may be billed.
2. Generate a 百炼 API key in the **same region**. **Do not paste it in GitHub, the PWA frontend or ChatGPT.** It belongs in the Cloudflare Worker server secret.
3. Create a Cloudflare account: https://dash.cloudflare.com/ . On your Mac install Node.js; use the terminal:
   ```sh
   cd backend
   npx wrangler login
   npx wrangler deploy
   npx wrangler secret put DASHSCOPE_API_KEY
   npx wrangler secret put APP_ACCESS_TOKEN
   ```
   At the first secret prompt, paste the 百炼 key; at the second, create a separate long random access passphrase. Don't reuse provider credentials.
4. In `backend/wrangler.toml`, `QWEN_REGION = "beijing"` is the default, and `QWEN_MODEL = "qwen-turbo"`. Make sure the selected model is available and has applicable quota in your region. If you change variables, redeploy the Worker.
5. Copy your **HTTPS Worker URL** and append `/explain`, for example `https://your-worker.your-subdomain.workers.dev/explain`.
6. Open https://jamleung122.github.io/design-listening-lab/ on the iPad. Tap **在线 AI 设置**. Enter the Worker URL and **APP_ACCESS_TOKEN** (not your 百炼 key), save, select some English, and tap **在线 AI 解释**.

**No deployment is currently provisioned by the repository alone.** The required credentials and Cloudflare permissions must be configured by the account owner. This backend uses Qwen if `DASHSCOPE_API_KEY` is present; OpenAI remains an optional alternative only if you configure `OPENAI_API_KEY` instead.

## Security and billing safeguards

- The provider key is a server-only Cloudflare Worker secret; never put it in the browser or public repository.
- The frontend saves the Worker URL only. The app access passphrase stays in page memory until reload.
- Worker accepts just explicitly selected English (maximum 1200 characters), never entire transcripts, audio or handwritten notes. The Worker does not persist requests or responses.
- CORS/origin check is *not* authentication; an access token is required. Use a strong one, rate limiting, and provider-side usage alerts or caps. Cloudflare/free quotas and model provider quotas are independent.
- Sending text to the online API sends selected text to the third-party model provider; do not send sensitive or confidential materials.
- When offline or before setup, **基础释义**, writing, and **复制到 Noema** remain usable.

Official docs: https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope and https://docs.bailian.console.aliyun.com/zh/model-studio/new-free-quota .
