const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const TELEGRAM_CHANNEL_USERNAME = "BybitEvents1";

/* =========================
   Helpers
========================= */

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

function getPlatformName(event) {
  return (
    event.platforms?.name ||
    event.platform_name ||
    event.platform ||
    "Unknown Platform"
  );
}

function getTitle(event) {
  return (
    event.title_ar ||
    event.title_en ||
    "Crypto Event"
  );
}

function getDescription(event) {
  return (
    event.description_ar ||
    event.description_en ||
    "راجع تفاصيل وشروط الحدث الرسمية."
  );
}

function getReward(event) {
  return (
    event.reward_ar ||
    event.reward_en ||
    "راجع تفاصيل المكافأة الرسمية."
  );
}

function getEligibility(event) {
  if (event.new_users_only === true) {
    return "المستخدمون الجدد فقط";
  }

  if (event.existing_users_allowed === false) {
    return "المستخدمون الجدد فقط";
  }

  return "جميع المستخدمين المؤهلين";
}

/* =========================
   Requirements
========================= */

function buildRequirements(event) {
  const lines = [];

  if (event.registration_required !== false) {
    lines.push("• التسجيل في الحدث");
  }

  if (event.kyc_required === true) {
    lines.push("• KYC مطلوب");
  }

  if (
    event.volume_required !== null &&
    event.volume_required !== undefined
  ) {
    lines.push(
      `• حجم التداول المطلوب: ${escapeHtml(
        event.volume_required
      )} USDT`
    );
  }

  if (
    event.deposit_required !== null &&
    event.deposit_required !== undefined
  ) {
    lines.push(
      `• الإيداع المطلوب: ${escapeHtml(
        event.deposit_required
      )} USDT`
    );
  }

  if (event.trade_type) {
    lines.push(
      `• نوع التداول: ${escapeHtml(
        event.trade_type
      )}`
    );
  }

  if (
    event.min_trade !== null &&
    event.min_trade !== undefined
  ) {
    lines.push(
      `• الحد الأدنى للصفقة: ${escapeHtml(
        event.min_trade
      )} USDT`
    );
  }

  /*
    إذا أضفنا task_rewards مستقبلًا في قاعدة البيانات،
    سيظهر ربح كل مهمة هنا تلقائيًا.
  */
  if (Array.isArray(event.task_rewards)) {
    for (const task of event.task_rewards) {
      if (!task) continue;

      if (typeof task === "string") {
        lines.push(`• ${escapeHtml(task)}`);
        continue;
      }

      const taskName =
        task.name ||
        task.title ||
        "مهمة";

      const taskReward =
        task.reward ||
        task.amount ||
        "";

      if (taskReward) {
        lines.push(
          `• ${escapeHtml(taskName)}: ${escapeHtml(
            taskReward
          )}`
        );
      } else {
        lines.push(
          `• ${escapeHtml(taskName)}`
        );
      }
    }
  }

  if (lines.length === 0) {
    return "• راجع شروط الحدث الرسمية";
  }

  return lines.join("\n");
}

/* =========================
   Telegram Caption
========================= */

function buildCaption(event) {
  const lines = [
    `🏦 المنصة: <b>${escapeHtml(
      getPlatformName(event)
    )}</b>`,

    "",

    `🔥 <b>${escapeHtml(
      getTitle(event)
    )}</b>`,

    "",

    "🎁 <b>المكافأة</b>",
    escapeHtml(getReward(event)),

    "",

    "📝 <b>تفاصيل الحدث</b>",
    escapeHtml(getDescription(event)),

    "",

    "👤 <b>المؤهلون</b>",
    `• ${escapeHtml(
      getEligibility(event)
    )}`,

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

    `📅 يبدأ: ${formatDate(
      event.start_at
    )}`,

    `⏰ ينتهي: ${formatDate(
      event.end_at
    )}`,

    `🎁 التوزيع: ${
      event.distribution_date
        ? formatDate(event.distribution_date)
        : "سيتم الإعلان عنه"
    }`
  ];

  if (event.distribution_method) {
    lines.push(
      `📦 طريقة التوزيع: ${escapeHtml(
        event.distribution_method
      )}`
    );
  }

  if (event.affiliate_code) {
    lines.push(
      "",
      `🏷 كود الإحالة: ${escapeHtml(
        event.affiliate_code
      )}`
    );
  }

  lines.push(
    "",
    "━━━━━━━━━━━━━━",
    "🍎 <b>Crypto Events</b>"
  );

  return lines.join("\n");
}

/* =========================
   Supabase
========================= */

async function supabaseRequest(
  path,
  options = {}
) {
  if (!SUPABASE_URL) {
    throw new Error(
      "SUPABASE_URL is not configured"
    );
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
        `Supabase error: ${response.status}`
    );
  }

  return data;
}

/* =========================
   Telegram
========================= */

async function telegramRequest(
  method,
  body
) {
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

/* =========================
   Active Events
========================= */

async function getActiveEvents() {
  const now =
    new Date().toISOString();

  const path =
    `/rest/v1/events` +
    `?select=*,platforms(name)` +
    `&status=eq.active` +
    `&start_at=lte.${encodeURIComponent(
      now
    )}` +
    `&end_at=gte.${encodeURIComponent(
      now
    )}` +
    `&order=priority.desc,start_at.asc`;

  const data =
    await supabaseRequest(path);

  return Array.isArray(data)
    ? data
    : [];
}

/* =========================
   Published Today
========================= */

async function getPublishedTodayIds() {
  const today =
    new Date()
      .toISOString()
      .slice(0, 10);

  const rows =
    await supabaseRequest(
      `/rest/v1/event_post_logs` +
        `?select=event_id` +
        `&publish_date=eq.${today}` +
        `&post_type=eq.daily_event`
    );

  return new Set(
    Array.isArray(rows)
      ? rows.map((row) =>
          Number(row.event_id)
        )
      : []
  );
}

/* =========================
   Save Post Log
========================= */

async function savePostLog({
  eventId,
  messageId,
  messageUrl
}) {
  await supabaseRequest(
    "/rest/v1/event_post_logs",
    {
      method: "POST",
      headers: {
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        event_id: Number(eventId),
        telegram_chat_id:
          String(TELEGRAM_CHAT_ID),
        telegram_message_id:
          Number(messageId),
        telegram_message_url:
          messageUrl,
        publish_date:
          new Date()
            .toISOString()
            .slice(0, 10),
        published_at:
          new Date().toISOString(),
        post_type:
          "daily_event"
      })
    }
  );
}

/* =========================
   Main
========================= */

export default async function handler(
  req,
  res
) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const events =
      await getActiveEvents();

    if (events.length === 0) {
      return res.status(200).json({
        success: true,
        published: 0,
        message:
          "لا توجد أحداث نشطة حاليًا."
      });
    }

    const publishedToday =
      await getPublishedTodayIds();

    const available =
      events.filter(
        (event) =>
          !publishedToday.has(
            Number(event.id)
          )
      );

    if (available.length === 0) {
      return res.status(200).json({
        success: true,
        published: 0,
        eventsAvailable:
          events.length,
        message:
          "كل الأحداث النشطة تم نشرها اليوم."
      });
    }

    /*
      حدث واحد فقط في كل تشغيل.
    */
    const event = available[0];

    const caption =
      buildCaption(event);

    let telegramResult = null;

    let imageSent = false;

    /*
      إرسال الصورة أولًا
    */
    if (event.image_url) {
      try {
        telegramResult =
          await telegramRequest(
            "sendPhoto",
            {
              chat_id:
                TELEGRAM_CHAT_ID,
              photo:
                event.image_url,
              caption,
              parse_mode:
                "HTML"
            }
          );

        imageSent = true;
      } catch (imageError) {
        console.warn(
          "Image failed:",
          imageError.message
        );
      }
    }

    /*
      لو الصورة غير موجودة أو فشلت،
      نرسل النص بدلًا منها.
    */
    if (!telegramResult) {
      telegramResult =
        await telegramRequest(
          "sendMessage",
          {
            chat_id:
              TELEGRAM_CHAT_ID,
            text: caption,
            parse_mode:
              "HTML",
            disable_web_page_preview:
              false
          }
        );
    }

    const messageId =
      telegramResult.result?.message_id;

    if (!messageId) {
      throw new Error(
        "Telegram did not return message_id"
      );
    }

    const messageUrl =
      `https://t.me/${TELEGRAM_CHANNEL_USERNAME}/${messageId}`;

    /*
      حفظ رقم ورابط المنشور
    */
    await savePostLog({
      eventId: event.id,
      messageId,
      messageUrl
    });

    return res.status(200).json({
      success: true,
      published: 1,
      eventId: event.id,
      title: getTitle(event),
      platform:
        getPlatformName(event),
      imageSent,
      telegramMessageId:
        messageId,
      telegramMessageUrl:
        messageUrl,
      remainingToday:
        available.length - 1
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