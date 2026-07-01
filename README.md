# Telegram + Claude Controlled Website

A website you run entirely from Telegram. Text your bot a command, the site updates. `/ask` and `/improve` hand the writing to Claude.

```
public/index.html   → website frontend (polls for content every 5 minutes)
api/webhook.js       → Telegram webhook: parses commands, calls Claude, saves content
api/content.js        → GET endpoint the frontend polls for the current content
vercel.json            → serverless function + static file routing
package.json             → dependencies
```

Content is stored in **Vercel KV** (a key-value store), so `api/webhook.js` (which runs per-message) and `api/content.js` (which the browser polls) share state without a full database.

---

## 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

## 2. Import into Vercel

In your Vercel dashboard: **Add New → Project → Import** your repo. Framework preset: **Other**. Deploy — it'll build successfully and show the default "Hello, World!" text (KV isn't connected yet, so it falls back to defaults).

## 3. Add a KV store

Project → **Storage** tab → **Create Database → KV** (also listed as Upstash Redis) → connect it to this project. Vercel automatically adds `KV_REST_API_URL` / `KV_REST_API_TOKEN` env vars — you don't set these by hand.

## 4. Create your Telegram bot

1. Message **@BotFather** → `/newbot` → follow the prompts → copy the token it gives you.
2. Message **@userinfobot** to get your own numeric Telegram chat ID (in a private chat, this is the same as your user ID).

## 5. Get a Claude API key

Create one at [console.anthropic.com](https://console.anthropic.com) if you don't have one already.

## 6. Set environment variables in Vercel

Project → **Settings → Environment Variables**:

| Name | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | token from BotFather |
| `CLAUDE_API_KEY` | your Anthropic API key |
| `ALLOWED_CHAT_ID` | your numeric Telegram chat ID |

Then **redeploy** (Deployments tab → ⋯ on the latest deployment → Redeploy) so the functions pick up the new variables.

## 7. Register the Telegram webhook

Once deployed, your webhook URL is:
```
https://YOUR-PROJECT.vercel.app/api/webhook
```

Register it with Telegram by visiting this exact URL format in a browser (fill in your own values):
```
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://YOUR-PROJECT.vercel.app/api/webhook
```

A successful response looks like:
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

You can confirm it any time at:
```
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo
```

## 8. Try it

Message your bot on Telegram:

| Command | What it does |
|---|---|
| `/start` or `/help` | Lists all commands |
| `/update <text>` | Sets the main content directly |
| `/title <text>` | Sets the page title |
| `/ask <question>` | Claude answers and publishes it live |
| `/improve <instructions>` | Claude rewrites the current content |
| `/clear` | Resets content to the default |
| `/status` | Shows current title, content length, and last-updated time |

Visit your site — it polls `/api/content` every 5 minutes automatically, so changes appear without anyone refreshing.

---

## Security

`api/webhook.js` checks every incoming message's chat ID against `ALLOWED_CHAT_ID`. Messages from anyone else are silently dropped (no reply sent, so an unauthorized sender can't even confirm the bot exists). Only you can change the site.

## Notes

- The Claude model used is `claude-sonnet-5`. Model names change over time — check [docs.claude.com](https://docs.claude.com) if API calls start failing with a model-not-found error, and update `CLAUDE_MODEL` in `api/webhook.js`.
- If `/api/content` can't reach KV for any reason, it fails soft and returns the built-in default text rather than erroring out — the site stays up either way.
- Want a faster or slower refresh? Change `REFRESH_MS` near the top of the `<script>` block in `public/index.html`.
