import { getActiveEvents } from "../events-data.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const events = getActiveEvents();

    if (events.length === 0) {
      return res.status(200).json({
        success: true,
        message: "لا توجد أحداث متاحة حاليًا",
        events: []
      });
    }

    const lines = [
      "🔥 <b>Crypto Events — الأحداث المتاحة اليوم</b>",
      "",
      `📊 عدد الأحداث: <b>${events.length}</b>`,
      ""
    ];

    events.forEach((event, index) => {
      lines.push(
        `${index + 1}. <b>${event.platform}</b> — ${event.title}`,
        `🎁 المكافأة: ${event.reward}`,
        `📅 ينتهي: ${new Date(event.endDate).toLocaleString("ar-EG")}`,
        `🔗 <a href="${event.eventUrl}">رابط الحدث</a>`,
        `💰 <a href="${event.affiliateUrl}">التسجيل من رابط الأفليت</a>`,
        ""
      );
    });

    lines.push(
      "━━━━━━━━━━━━━━",
      "📢 تابع قناة Crypto Events للأحداث والتحديثات الجديدة."
    );

    const message = lines.join("\n");

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return res.status(500).json({
        error: "Telegram environment variables are not configured"
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
      eventsCount: events.length,
      messageId: data.result.message_id
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}