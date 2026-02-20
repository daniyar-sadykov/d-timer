'use strict';

const https = require('https');

/**
 * Send a message via Telegram Bot API using native https (no extra deps).
 * @param {string} botToken  - Telegram bot token
 * @param {string} chatId    - Recipient chat ID
 * @param {string} text      - Message text (Markdown)
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
function sendTelegramMessage(botToken, chatId, text) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      chat_id:    chatId,
      text:       text,
      parse_mode: 'Markdown'
    });

    const options = {
      hostname: 'api.telegram.org',
      path:     `/bot${botToken}/sendMessage`,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.ok) {
            resolve({ ok: true });
          } else {
            resolve({ ok: false, error: parsed.description || 'Unknown Telegram error' });
          }
        } catch {
          resolve({ ok: false, error: 'Failed to parse Telegram response' });
        }
      });
    });

    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.setTimeout(10000, () => {
      req.destroy();
      resolve({ ok: false, error: 'Request timeout (10s)' });
    });

    req.write(body);
    req.end();
  });
}

module.exports = { sendTelegramMessage };
