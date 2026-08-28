const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

const TELEGRAM_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN;

const TELEGRAM_CHAT_ID =
  process.env.TELEGRAM_CHAT_ID;

const TELEGRAM_CHANNEL_USERNAME =
  "BybitEvents1";

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
  if (!value) {
    return "غير محدد";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "غير محدد";
  }

  const pad = (n) =>
    String(n).padStart(2, "0");

  return `${pad(date.getUTCDate())}/${pad(
    date.getUTCMonth() + 1
  )}/${date.getUTCFullYear()} - ${pad(
    date.getUTCHours()
  )}:${pad(date.getUTCMinutes())}`;
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
        Authorization:
          `Bearer ${SUPABASE_KEY}`,
        "Content-Type":
          "application/json",
        ...(options.headers || {})
      }
    }
  );

  const text =
    await response.text();

  let data = null;

  try {
    data = text
      ? JSON.parse(text)
      : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.hint ||
        data?.details ||
        `Supabase error ${response.status}`
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
        "Content-Type":
          "application/json"
      },
      body:
        JSON.stringify(body)
    }
  );

  const data =
    await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(
      data?.description ||
        `Telegram error ${response.status}`
    );
  }

  return data;
}

/* =========================
   Get today's summary platforms
========================= */

async function getPlatforms() {
  return supabaseRequest(
    "/rest/v1/platforms" +
      "?select=id,name,signup_url,is_active" +
      "&is_active=eq.true" +
      "&order=id"
  );
}

async function getTodaySummaryPlatformIds() {
  const today =
    new Date()
      .toISOString()
      .slice(0, 10);

  const rows =
    await supabaseRequest(
      "/rest/v1/platform_summary_logs" +
        `?select=platform_id` +
        `&publish_date=eq.${today}`
    );

  return new Set(
    Array.isArray(rows)
      ? rows.map((row) =>
          Number(row.platform_id)
        )
      : []
  );
}

/* =========================
   Get active events
========================= */

async function getActiveEvents(
  platformId
) {
  const now =
    new Date().toISOString();

  const data =
    await supabaseRequest(
      "/rest/v1/events" +
        "?select=id,title_ar,title_en,reward_ar,reward_en,start_at,end_at,status,affiliate_url,official_url" +
        `&platform_id=eq.${encodeURIComponent(
          platformId
        )}` +
        "&status=eq.active" +
        `&start_at=lte.${encodeURIComponent(
          now
        )}` +
        `&end_at=gte.${encodeURIComponent(
          now
        )}` +
        "&order=priority.desc,end_at.asc"
    );

  return Array.isArray(data)
    ? data
    : [];
}

/* =========================
   Get today's Telegram posts
========================= */

async function getTodayPostLogs(
  eventIds
) {
  if (!eventIds.length) {
    return [];
  }

  const today =
    new Date()
      .toISOString()
      .slice(0, 10);

  const filter =
    eventIds.join(",");

  return supabaseRequest(
    "/rest/v1/event_post_logs" +
      "?select=event_id,telegram_message_id,telegram_message_url,publish_date,post_type" +
      `&event_id=in.(${filter})` +
      `&publish_date=eq.${today}` +
      "&post_type=eq.daily_event" +
      "&order=published_at.desc"
  );
}

/* =========================
   Build Platform Summary
========================= */

function buildSummary({
  platform,
  events,
  postLogMap
}) {
  const lines = [];

  lines.push(
    `🌙 <b>جرد ${escapeHtml(
      platform.name
    )} — الأحداث المتاحة</b>`,
    "",
    `🏦 المنصة: <b>${escapeHtml(
      platform.name
    )}</b>`,
    ""
  );

  if (platform.signup_url) {
    lines.push(
      "💰 <b>رابط التسجيل والإحالة</b>",
      `<a href="${escapeHtml(
        platform.signup_url
      )}">🚀 سجّل الآن من رابط الإحالة</a>`,
      ""
    );
  }

  lines.push(
    "📋 <b>الأحداث المتاحة</b>",
    ""
  );

  events.forEach(
    (event, index) => {
      const title =
        event.title_ar ||
        event.title_en ||
        "Crypto Event";

      const reward =
        event.reward_ar ||
        event.reward_en ||
        "راجع تفاصيل الحدث";

      const post =
        postLogMap.get(
          Number(event.id)
        );

      lines.push(
        `${index + 1}️⃣ <b>${escapeHtml(
          title
        )}</b>`,
        `🎁 ${escapeHtml(reward)}`,
        `⏰ ينتهي: ${formatDate(
          event.end_at
        )}`
      );

      if (post?.telegram_message_url) {
        lines.push(
          `<a href="${escapeHtml(
            post.telegram_message_url
          )}">🔗 افتح منشور الحدث</a>`
        );
      } else if (event.official_url) {
        lines.push(
          `<a href="${escapeHtml(
            event.official_url
          )}">🎯 افتح الحدث الرسمي</a>`
        );
      }

      lines.push("");
    }
  );

  lines.push(
    `✅ إجمالي الأحداث المتاحة: <b>${events.length}</b>`,
    "",
    "━━━━━━━━━━━━━━",
    "🍎 <b>Crypto Events</b>"
  );

  return lines.join("\n");
}

/* =========================
   Save Summary Log
========================= */

async function saveSummaryLog({
  platformId,
  messageId,
  messageUrl
}) {
  await supabaseRequest(
    "/rest/v1/platform_summary_logs",
    {
      method: "POST",
      headers: {
        Prefer:
          "return=minimal"
      },
      body: JSON.stringify({
        platform_id:
          Number(platformId),

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
          new Date().toISOString()
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
      error:
        "Method not allowed"
    });
  }

  try {
    const platforms =
      await getPlatforms();

    const summarizedIds =
      await getTodaySummaryPlatformIds();

    /*
      نختار أول منصة لم تعمل لها
      جرد اليوم.
    */
    const remainingPlatforms =
      platforms.filter(
        (platform) =>
          !summarizedIds.has(
            Number(platform.id)
          )
      );

    if (
      remainingPlatforms.length === 0
    ) {
      return res.status(200).json({
        success: true,
        published: 0,
        message:
          "تم عمل جرد جميع المنصات اليوم."
      });
    }

    /*
      منصة واحدة فقط في كل تشغيل.
    */
    const platform =
      remainingPlatforms[0];

    const events =
      await getActiveEvents(
        platform.id
      );

    /*
      لو المنصة لا يوجد بها أحداث
      اليوم، نسجل أنها تمت معالجتها
      بدون إرسال منشور.
    */
    if (events.length === 0) {
      await saveSummaryLog({
        platformId:
          platform.id,
        messageId: 0,
        messageUrl: null
      });

      return res.status(200).json({
        success: true,
        published: 0,
        platform:
          platform.name,
        message:
          "لا توجد أحداث متاحة لهذه المنصة."
      });
    }

    const eventIds =
      events.map((event) =>
        Number(event.id)
      );

    const logs =
      await getTodayPostLogs(
        eventIds
      );

    const postLogMap =
      new Map();

    for (const log of logs) {
      const eventId =
        Number(log.event_id);

      if (
        !postLogMap.has(eventId)
      ) {
        postLogMap.set(
          eventId,
          log
        );
      }
    }

    const text =
      buildSummary({
        platform,
        events,
        postLogMap
      });

    const telegramResult =
      await telegramRequest(
        "sendMessage",
        {
          chat_id:
            TELEGRAM_CHAT_ID,

          text,

          parse_mode:
            "HTML",

          disable_web_page_preview:
            false
        }
      );

    const messageId =
      telegramResult.result
        ?.message_id;

    if (!messageId) {
      throw new Error(
        "Telegram did not return message_id"
      );
    }

    const messageUrl =
      `https://t.me/${TELEGRAM_CHANNEL_USERNAME}/${messageId}`;

    await saveSummaryLog({
      platformId:
        platform.id,
      messageId,
      messageUrl
    });

    return res.status(200).json({
      success: true,
      published: 1,
      platform:
        platform.name,
      eventsCount:
        events.length,
      telegramMessageId:
        messageId,
      telegramMessageUrl:
        messageUrl,
      remainingPlatforms:
        remainingPlatforms.length - 1
    });

  } catch (error) {
    console.error(
      "Platform summary error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error.message
    });
  }
}