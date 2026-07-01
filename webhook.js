const { kv } = require('@vercel/kv');

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-5';

const DEFAULTS = {
  title: 'Hello, World!',
  content:
    'This site is controlled entirely from Telegram. Send /update to change this text, or /ask to have Claude write something and publish it live.',
  updatedAt: null,
  updatedBy: null,
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method not allowed');
  }

  const update = req.body;
  const msg = update && update.message;

  // Ignore anything that isn't a plain text message (edits, stickers, etc.)
  if (!msg || !msg.text) {
    return res.status(200).send('OK');
  }

  const chatId = msg.chat.id;
  const isAllowed = String(chatId) === String(process.env.ALLOWED_CHAT_ID);

  if (!isAllowed) {
    // Don't reply to strangers — just log and drop the message.
    console.warn(`Blocked message from unauthorized chat ID: ${chatId}`);
    return res.status(200).send('OK');
  }

  const text = msg.text.trim();

  try {
    if (text === '/start' || text === '/help') {
      await reply(chatId, helpText());
    } else if (text === '/update' || text.startsWith('/update ')) {
      await handleUpdate(chatId, text);
    } else if (text === '/title' || text.startsWith('/title ')) {
      await handleTitle(chatId, text);
    } else if (text === '/ask' || text.startsWith('/ask ')) {
      await handleAsk(chatId, text);
    } else if (text === '/improve' || text.startsWith('/improve ')) {
      await handleImprove(chatId, text);
    } else if (text === '/clear') {
      await handleClear(chatId);
    } else if (text === '/status') {
      await handleStatus(chatId);
    } else {
      await reply(chatId, 'Unknown command. Send /help to see what I understand.');
    }
  } catch (err) {
    console.error('webhook error:', err);
    await reply(chatId, `⚠️ Something went wrong: ${err.message}`);
  }

  return res.status(200).send('OK');
};

// ---------- Command handlers ----------

async function handleUpdate(chatId, text) {
  const newContent = text.slice('/update'.length).trim();
  if (!newContent) {
    return reply(chatId, 'Usage: /update <text>\nExample: /update Back online, thanks for your patience!');
  }
  const site = await getSite();
  site.content = newContent;
  site.updatedAt = new Date().toISOString();
  site.updatedBy = 'manual';
  await saveSite(site);
  await reply(chatId, `✅ Content updated:\n\n"${newContent}"`);
}

async function handleTitle(chatId, text) {
  const newTitle = text.slice('/title'.length).trim();
  if (!newTitle) {
    return reply(chatId, 'Usage: /title <text>\nExample: /title Welcome to My Project');
  }
  const site = await getSite();
  site.title = newTitle;
  site.updatedAt = new Date().toISOString();
  site.updatedBy = 'manual';
  await saveSite(site);
  await reply(chatId, `✅ Title updated:\n\n"${newTitle}"`);
}

async function handleAsk(chatId, text) {
  const question = text.slice('/ask'.length).trim();
  if (!question) {
    return reply(chatId, 'Usage: /ask <question>\nExample: /ask Write a short welcome message for first-time visitors');
  }
  await reply(chatId, '🤖 Thinking…');

  const answer = await callClaude(
    [{ role: 'user', content: question }],
    'You are writing text that will be published directly onto a public website. Respond with only the finished text to display — no preamble, no meta-commentary, no surrounding quotation marks.'
  );

  const site = await getSite();
  site.content = answer;
  site.updatedAt = new Date().toISOString();
  site.updatedBy = 'claude';
  await saveSite(site);
  await reply(chatId, `✅ Published Claude's answer:\n\n${answer}`);
}

async function handleImprove(chatId, text) {
  const instructions = text.slice('/improve'.length).trim();
  if (!instructions) {
    return reply(chatId, 'Usage: /improve <instructions>\nExample: /improve make it punchier and add a call to action');
  }
  await reply(chatId, '🤖 Improving current content…');

  const site = await getSite();
  const answer = await callClaude(
    [
      {
        role: 'user',
        content: `Current website text:\n"${site.content}"\n\nInstructions: ${instructions}`,
      },
    ],
    'You are editing text that is published directly onto a public website. Respond with only the finished, improved text to display — no preamble, no meta-commentary, no surrounding quotation marks.'
  );

  site.content = answer;
  site.updatedAt = new Date().toISOString();
  site.updatedBy = 'claude';
  await saveSite(site);
  await reply(chatId, `✅ Improved content:\n\n${answer}`);
}

async function handleClear(chatId) {
  await saveSite({ ...DEFAULTS, updatedAt: new Date().toISOString(), updatedBy: 'manual' });
  await reply(chatId, '✅ Content reset to default.');
}

async function handleStatus(chatId) {
  const site = await getSite();
  const updated = site.updatedAt ? new Date(site.updatedAt).toLocaleString() : 'never';
  await reply(
    chatId,
    `📊 Status\n\nTitle: ${site.title}\nContent length: ${site.content.length} characters\nLast updated: ${updated}\nUpdated by: ${site.updatedBy || 'n/a'}`
  );
}

// ---------- Helpers ----------

async function getSite() {
  const site = await kv.get('site');
  return site || { ...DEFAULTS };
}

async function saveSite(site) {
  await kv.set('site', site);
}

async function reply(chatId, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function callClaude(messages, systemPrompt) {
  const res = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function helpText() {
  return (
    '👋 I control this website. Commands:\n\n' +
    '/update <text> — set the main content\n' +
    '/title <text> — set the page title\n' +
    '/ask <question> — Claude answers and publishes it live\n' +
    '/improve <instructions> — Claude rewrites the current content\n' +
    '/clear — reset to default content\n' +
    '/status — show current content info'
  );
}
