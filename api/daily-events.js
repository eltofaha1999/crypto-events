import { getActiveEvents } from "../events-data.js";

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(dateValue) {
  if (!dateValue) return "غير محدد";

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "غير محدد";
  }

  return date.toLocaleString("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function buildEventCaption(event, index) {
  const requirements = Array.isArray(event.requirements)
    ? event.requirements
        .map((item) => `• ${escapeHtml(item)}`)
        .join("\n")
    : "• راجع شروط الحدث الرسمية";

  return [
    `${index}. <b>${escapeHtml(event.platform)}</b>`,
    "",
    `🔥 <b>${escapeHtml(event.title)}</b>`,
    "",
    `🎁 <b>المكافأة:</b> ${escapeHtml(event.reward)}`,
    "",
    `📝 <b>التفاصيل:</b>`,
    `${escapeHtml(event.description)}`,
    "",
    `📋 <b>الشروط:</b>`,
    requirements,
    "",
    `🟢 <b>البداية:</b> ${formatDate(event.startDate)}`,
    `⏰ <b>النهاية:</b> ${formatDate(event.endDate)}`,
    `🎁 <b>التوزيع:</b> ${escapeHtml(event.distributionDate || "سيتم الإعلان عنه")}`,
    "",
    `🔗 <a href="${event.eventUrl}">الدخول إلى الحدث الرسمي</a>`,
    `💰 <a href="${event.affiliateUrl}">التسجيل من رابط الأفليت</a>`,
    ""
  ].join("\n");
}

async function telegramRequest(method, body, token) {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(
      data?.description || `Telegram API error: ${response.status}`
    );
  }

  return data;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
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

    const activeEvents = getActiveEvents();

    if (activeEvents.length === 0) {
      await telegramRequest(
        "sendMessage",
        {
          chat_id: chatId,
          text:
            "📅 <b>Crypto Events — الملخص اليومي</b>\n\n" +
            "لا توجد أحداث متاحة حاليًا.",
          parse_mode: "HTML",
          disable_web_page_preview: false
        },
        token
      );

      return res.status(200).json({
        success: true,
        eventsCount: 0
      });
    }

    // 1) إرسال عنوان الملخص اليومي
    const summaryLines = [
      "🔥 <b>Crypto Events — الأحداث المتاحة اليوم</b>",
      "",
      `📊 إجمالي الأحداث المتاحة: <b>${activeEvents.length}</b>`,
      "",
      "👇 تفاصيل الأحداث:"
    ];

    activeEvents.forEach((event, index) => {
      summaryLines.push(
        `${index + 1}. <b>${escapeHtml(event.platform)}</b> — ${escapeHtml(event.title)}`
      );
    });

    await telegramRequest(
      "sendMessage",
      {
        chat_id: chatId,
        text: summaryLines.join("\n"),
        parse_mode: "HTML",
        disable_web_page_preview: false
      },
      token
    );

    // 2) إرسال كل حدث، ومعه الصورة إذا كانت متاحة
    const results = [];

    for (let index = 0; index < activeEvents.length; index++) {
      const event = activeEvents[index];

      const caption = buildEventCaption(event, index + 1);

      let result;

      if (event.imageUrl) {
        result = await telegramRequest(
          "sendPhoto",
          {
            chat_id: chatId,
            photo: event.imageUrl,
            caption,
            parse_mode: "HTML"
          },
          token
        );
      } else {
        result = await telegramRequest(
          "sendMessage",
          {
            chat_id: chatId,
            text: caption,
            parse_mode: "HTML",
            disable_web_page_preview: false
          },
          token
        );
      }

      results.push({
        id: event.id,
        platform: event.platform,
        title: event.title,
        imageSent: Boolean(event.imageUrl),
        messageId: result.result?.message_id || null
      });
    }

    return res.status(200).json({
      success: true,
      eventsCount: activeEvents.length,
      results
    });

  } catch (error) {
    console.error("Daily events error:", error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}