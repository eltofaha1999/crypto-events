export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { message } = req.body || {};

    if (!message) {
      return res.status(400).json({
        error: "Message is required"
      });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token) {
      return res.status(500).json({
        error: "TELEGRAM_BOT_TOKEN is not configured"
      });
    }

    if (!chatId) {
      return res.status(500).json({
        error: "TELEGRAM_CHAT_ID is not configured"
      });
    }

    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: false
        })
      }
    );

    const data = await response.json();

    if (!response.ok || !data.ok) {
      return res.status(500).json({
        error: "Telegram API error",
        details: data
      });
    }

    return res.status(200).json({
      success: true,
      result: data.result
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}