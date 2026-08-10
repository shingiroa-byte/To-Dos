import dotenv from "dotenv";
dotenv.config();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/**
 * Sends a message via the Telegram Bot API.
 * @param {string} chatId - Telegram chat ID to message.
 * @param {string} text - Message body.
 */
export async function sendTelegramMessage(chatId, text) {
  if (!TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set in the environment.");
  }
  if (!chatId) {
    throw new Error("No chat_id provided for this task and no TELEGRAM_CHAT_ID fallback is set.");
  }

  const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.description || "Telegram API rejected the message.");
  }
  return data;
}
