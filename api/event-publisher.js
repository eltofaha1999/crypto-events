const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

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

  const pad = (number) => String(number).padStart(2, "0");

  return `${pad(date.getUTCDate())}/${pad(
    date.getUTCMonth() + 1
  )}/${date.getUTCFullYear()} - ${pad(
    date.getUTCHours()
  )}:${pad(date.getUTCMinutes())}`;
}

function platformName(event) {
  return (
    event.platform_name ||
    event.platform ||
    event.platforms?.name ||
    `Platform #${event.platform_id ?? "Unknown"}`
  );
}

function title(event) {
  return (
    event.title_ar ||
    event.title_en ||
    event.title ||
    "Crypto Event"
  );
}

function description(event) {
  return (
    event.description_ar ||
    event.description_en ||
    event.description ||
    "راجع شروط الحدث الرسمية."
  );
}

function reward(event) {
  return (
    event.reward_ar ||
    event.reward_en ||
    event.reward ||
    "راجع تفاصيل المكافأة الرسمية."
  );
}

function eligibility(event) {
  if (event.new_users_only === true) {
    return "للمستخدمين الجدد فقط";
  }

  if (event.existing_users_allowed === false) {
    return "للمستخدمين الجدد فقط";
  }

  return "جميع المستخدمين المؤهلين";
}

function buildRequirements(event) {
  const lines = [];

  if (event.registration_required !== false) {
    lines.push("• التسجيل في الحدث");
  }

  lines.push(`• المؤهلون: ${eligibility(event)}`);

  if (event.kyc_required === true) {
    lines.push("• KYC مطلوب");
  }

  if (
    event.volume_required !== null &&
    event.volume_required !== undefined
  ) {
    lines.push(
      `• حجم التداول المطلوب: ${event.volume_required} USDT`
    );
  }

  if (
    event.deposit_required !== null &&
    event.deposit_required !== undefined
  ) {
    lines.push(
      `• الإيداع المطلوب: ${event.deposit_required} USDT`
    );
  }

  if (event.trade_type) {
    lines.push(
      `• نوع التداول: ${escapeHtml(event.trade_type)}`
    );
  }

  if (
    event.min_trade !== null &&
    event.min_trade !== undefined
  ) {
    lines.push(
      `• الحد الأدنى للصفقة: ${event.min_trade} USDT`
    );
  }

  if (event.region_restrictions) {
    lines.push(
      `• ملاحظة الأهلية: ${escapeHtml(
        event.region_restrictions
      )}`
    );
  }

  return lines.join("\n");
}

function buildCaption(event) {
  const parts = [
    `🔥 <b>${escapeHtml(title(event))}</b>`,
    `🏦 المنصة: <b>${escapeHtml(platformName(event))}</b>`,
    "",
    "🎁 <b>المكافأة</b>",
    escapeHtml(reward(event)),
    "",
    "📝 <b>تفاصيل الحدث</b>",
    escapeHtml(description(event)),
    "",
    "👤 <b>المؤهلون</b>",
    `• ${escapeHtml(eligibility(event))}`,
    "",
    "📋 <b>المطلوب</b>",
    buildRequirements(event),
    "",
    "💰 <b>رابط التسجيل</b>",
    event.affiliate_url
      ? `<a href="${escapeHtml(
          event.affiliate_url
        )}">🚀 سجّل الآن من رابط الإحالة</a>`
      : "غير متوفر حاليًا",
    "",
    "🎯 <b>رابط الحدث</b>",
    event.official_url
      ? `<a href="${escapeHtml(
          event.official_url
        )}">🔗 افتح الحدث وشارك</a>`
      : "غير متوفر حاليًا",
    "",
    `📅 يبدأ: ${formatDate(event.start_at)}`,
    `⏰ ينتهي: ${formatDate(event.end_at)}`,
    `🎁 التوزيع: ${
      event.distribution_date
        ? formatDate(event.distribution_date)
        : "سيتم الإعلان عنه"
    }`
  ];

  if (event.distribution_method) {
    parts.push(
      `📦 طريقة التوزيع: ${escapeHtml(
        event.distribution_method
      )}`
    );
  }

  if (event.affiliate_code) {
    parts.push(
      "",
      `🏷 كود الإحالة: ${escapeHtml(
        event.affiliate_code
      )}`
    );
  }

  parts.push(
    "",
    "━━━━━━━━━━━━━━",
    "🍎 <b>Crypto Events</b>"
  );

  return parts.join("\n");
}

async function supabaseGet(path) {
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
      method: "GET",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.hint ||
        data?.details ||
        `Supabase error: ${response.status}`
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
        `Telegram error: ${response.status}`
    );
  }

  return data;
}

async function insertPostLog({
  eventId,
  telegramMessageId,
  telegramMessageUrl,
  postType
}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase credentials are missing");
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/event_post_logs`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        event_id: eventId,
        telegram_chat_id: String(TELEGRAM_CHAT_ID),
        telegram_message_id: telegramMessageId,
        telegram_message_url:
          telegramMessageUrl || null,
        publish_date: new Date()
          .toISOString()
          .slice(0, 10),
        published_at: new Date().toISOString(),
        post_type: postType
      })
    }
  );

  const data = await response.text();

  if (!response.ok) {
    throw new Error(
      data || `Failed to save Telegram post log`
    );
  }
}

async function getTodayPostedEventIds() {
  const today = new Date().toISOString().slice(0, 10);

  const data = await supabaseGet(
    `/rest/v1/event_post_logs?select=event_id&publish_date=eq.${today}&post_type=eq.daily_event`
  );

  return new Set(
    Array.isArray(data)
      ? data.map((row) => Number(row.event_id))
      : []
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
    const now = new Date().toISOString();

    const events = await supabaseGet(
      `/rest/v1/events?select=*&status=eq.active&start_at=lte.${encodeURIComponent(
        now
      )}&end_at=gte.${encodeURIComponent(
        now
      )}&order=priority.desc,start_at.asc`
    );

    if (!Array.isArray(events)) {
      throw new Error("Invalid events response");
    }

    const postedToday = await getTodayPostedEventIds();

    const availableEvents = events.filter(
      (event) => !postedToday.has(Number(event.id))
    );

    if (availableEvents.length === 0) {
      return res.status(200).json({
        success: true,
        message:
          "لا توجد أحداث جديدة مستحقة للنشر اليوم.",
        eventsAvailable: events.length,
        published: 0
      });
    }

    // ننشر حدثًا واحدًا فقط في كل تشغيل.
    // الـCron/المجدول يستدعي هذه الوظيفة دوريًا.
    const event = availableEvents[0];

    const caption = buildCaption(event);

    let result;
    let imageSent = false;

    if (event.image_url) {
      try {
        result = await telegramRequest(
          "sendPhoto",
          {
            chat_id: TELEGRAM_CHAT_ID,
            photo: event.image_url,
            caption,
            parse_mode: "HTML"
          }
        );

        imageSent = true;
      } catch (imageError) {
        console.warn(
          `Image failed for event ${event.id}:`,
          imageError.message
        );
      }
    }

    if (!result) {
      result = await telegramRequest(
        "sendMessage",
        {
          chat_id: TELEGRAM_CHAT_ID,
          text: caption,
          parse_mode: "HTML",
          disable_web_page_preview: false
        }
      );
    }

    const messageId = result.result?.message_id;

    if (!messageId) {
      throw new Error(
        "Telegram did not return a message ID"
      );
    }

    /*
      رابط المنشور للقناة العامة.
      نستخدم username المعروف للقناة.
    */
    const messageUrl =
      `https://t.me/BybitEvents1/${messageId}`;

    await insertPostLog({
      eventId: Number(event.id),
      telegramMessageId: Number(messageId),
      telegramMessageUrl: messageUrl,
      postType: "daily_event"
    });

    return res.status(200).json({
      success: true,
      published: 1,
      eventId: event.id,
      title: title(event),
      platform: platformName(event),
      imageSent,
      telegramMessageId: messageId,
      telegramMessageUrl: messageUrl,
      remainingToday:
        availableEvents.length - 1
    });

  } catch (error) {
    console.error(
      "Event publisher error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}