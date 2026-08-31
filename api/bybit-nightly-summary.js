@'
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const BYBIT_PLATFORM_ID = 1;
const CHANNEL_USERNAME = "BybitEvents1";

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(value) {
  if (!value) return "غير محدد";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "غير محدد";
  }

  const pad = (n) => String(n).padStart(2, "0");

  return `${pad(date.getUTCDate())}/${pad(
    date.getUTCMonth() + 1
  )}/${date.getUTCFullYear()} - ${pad(
    date.getUTCHours()
  )}:${pad(date.getUTCMinutes())}`;
}

async function supabaseRequest(path, options = {}) {
  if (!SUPABASE_URL) {
    throw new Error("SUPABASE_URL is not configured");
  }

  if (!SUPABASE_KEY) {
    throw new Error(
      "SUPABASE_PUBLISHABLE_KEY is not configured"
    );
  }

  const response = await fetch(
    `${SUPABASE_URL}${path}`,
    {
      ...options,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    }
  );

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.hint ||
        data?.details ||
        `Supabase HTTP ${response.status}`
    );
  }

  return data;
}

async function telegramRequest(method, body) {
  if (!TELEGRAM_TOKEN) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN is not configured"
    );
  }

  if (!TELEGRAM_CHAT_ID) {
    throw new Error(
      "TELEGRAM_CHAT_ID is not configured"
    );
  }

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`,
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
      data?.description ||
        `Telegram error ${response.status}`
    );
  }

  return data;
}

async function alreadyPublishedTonight() {
  const today = new Date()
    .toISOString()
    .slice(0, 10);

  const rows = await supabaseRequest(
    `/rest/v1/platform_summary_logs?select=id&platform_id=eq.${BYBIT_PLATFORM_ID}&publish_date=eq.${today}&limit=1`
  );

  return Array.isArray(rows) && rows.length > 0;
}

async function getActiveBybitEvents() {
  const now = new Date().toISOString();

  const rows = await supabaseRequest(
    `/rest/v1/events?select=id,title_ar,title_en,reward_ar,reward_en,end_at,official_url&platform_id=eq.${BYBIT_PLATFORM_ID}&status=eq.active&start_at=lte.${encodeURIComponent(now)}&end_at=gte.${encodeURIComponent(now)}&order=end_at.asc`
  );

  return Array.isArray(rows) ? rows : [];
}

async function getPublishedEventLogs(eventIds) {
  if (!eventIds.length) {
    return [];
  }

  return supabaseRequest(
    `/rest/v1/event_post_logs?select=event_id,telegram_message_id,telegram_message_url,published_at&event_id=in.(${eventIds.join(",")})&post_type=eq.daily_event&order=published_at.desc`
  );
}

function buildSummary(events, logsMap) {
  const lines = [
    "🌙 <b>جرد Bybit الليلي</b>",
    "",
    "🏦 <b>المنصة: Bybit</b>",
    "",
    "📋 <b>الأحداث المتاحة حاليًا</b>",
    ""
  ];

  events.forEach((event, index) => {
    const title =
      event.title_ar ||
      event.title_en ||
      "حدث Bybit";

    const reward =
      event.reward_ar ||
      event.reward_en ||
      "راجع تفاصيل الحدث";

    lines.push(
      `${index + 1}️⃣ <b>${escapeHtml(title)}</b>`,
      `🎁 ${escapeHtml(reward)}`,
      `⏰ ينتهي: ${formatDate(event.end_at)}`
    );

    const log = logsMap.get(Number(event.id));

    if (log?.telegram_message_url) {
      lines.push(
        `<a href="${escapeHtml(log.telegram_message_url)}">🔗 افتح منشور الحدث</a>`
      );
    } else if (event.official_url) {
      lines.push(
        `<a href="${escapeHtml(event.official_url)}">🎯 افتح الحدث الرسمي</a>`
      );
    }

    lines.push("");
  });

  lines.push(
    `✅ إجمالي الأحداث المتاحة: <b>${events.length}</b>`,
    "",
    "💰 <a href=\"https://partner.bybit.com/b/165247\">🚀 سجّل الآن من رابط الإحالة</a>",
    "",
    "━━━━━━━━━━━━━━",
    "🍎 <b>Crypto Events</b>"
  );

  return lines.join("\n");
}

async function saveSummaryLog(messageId, messageUrl) {
  const today = new Date()
    .toISOString()
    .slice(0, 10);

  await supabaseRequest(
    "/rest/v1/platform_summary_logs",
    {
      method: "POST",
      headers: {
        Prefer:
          "resolution=ignore-duplicates,return=minimal"
      },
      body: JSON.stringify({
        platform_id: BYBIT_PLATFORM_ID,
        telegram_chat_id: String(TELEGRAM_CHAT_ID),
        telegram_message_id: Number(messageId),
        telegram_message_url: messageUrl,
        publish_date: today,
        published_at: new Date().toISOString()
      })
    }
  );
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    if (await alreadyPublishedTonight()) {
      return res.status(200).json({
        success: true,
        published: 0,
        message:
          "تم نشر جرد Bybit اليوم بالفعل."
      });
    }

    const events =
      await getActiveBybitEvents();

    if (!events.length) {
      return res.status(200).json({
        success: true,
        published: 0,
        message:
          "لا توجد أحداث Bybit نشطة ومتاحة حاليًا."
      });
    }

    const eventIds = events.map((event) =>
      Number(event.id)
    );

    const logs =
      await getPublishedEventLogs(eventIds);

    const logsMap = new Map();

    for (const log of logs) {
      const id = Number(log.event_id);

      if (!logsMap.has(id)) {
        logsMap.set(id, log);
      }
    }

    /*
      لا يظهر في الجرد إلا الحدث
      الذي له منشور رئيسي بالفعل.
    */
    const publishedEvents =
      events.filter((event) =>
        logsMap.has(Number(event.id))
      );

    if (!publishedEvents.length) {
      return res.status(200).json({
        success: true,
        published: 0,
        message:
          "لا توجد أحداث منشورة سابقًا ومتاحة حاليًا."
      });
    }

    const text = buildSummary(
      publishedEvents,
      logsMap
    );

    const result =
      await telegramRequest(
        "sendMessage",
        {
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: false
        }
      );

    const messageId =
      result.result?.message_id;

    if (!messageId) {
      throw new Error(
        "Telegram did not return message_id"
      );
    }

    const messageUrl =
      `https://t.me/${CHANNEL_USERNAME}/${messageId}`;

    await saveSummaryLog(
      messageId,
      messageUrl
    );

    return res.status(200).json({
      success: true,
      published: 1,
      platform: "Bybit",
      eventsCount:
        publishedEvents.length,
      telegramMessageId:
        messageId,
      telegramMessageUrl:
        messageUrl
    });
  } catch (error) {
    console.error(
      "Bybit nightly summary error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
}