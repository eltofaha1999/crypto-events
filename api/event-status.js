const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY;

const TELEGRAM_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN;

const TELEGRAM_CHAT_ID =
  process.env.TELEGRAM_CHAT_ID;

const CHANNEL_USERNAME =
  "BybitEvents1";

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

  const pad = (n) =>
    String(n).padStart(2, "0");

  return `${pad(date.getUTCDate())}/${pad(
    date.getUTCMonth() + 1
  )}/${date.getUTCFullYear()} - ${pad(
    date.getUTCHours()
  )}:${pad(date.getUTCMinutes())}`;
}

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

/*
  آخر منشور يومي لكل حدث.
*/
async function getLatestPost(eventId) {
  const rows =
    await supabaseRequest(
      `/rest/v1/event_post_logs` +
        `?select=id,event_id,telegram_message_id,telegram_message_url,post_type,published_at,ended_reply_sent,distribution_reply_sent` +
        `&event_id=eq.${encodeURIComponent(eventId)}` +
        `&post_type=eq.daily_event` +
        `&order=published_at.desc` +
        `&limit=1`
    );

  return Array.isArray(rows)
    ? rows[0] || null
    : null;
}

/*
  هل تم إرسال Reply معين؟
*/
async function getReplyLog(
  eventId,
  postType
) {
  const rows =
    await supabaseRequest(
      `/rest/v1/event_post_logs` +
        `?select=id,telegram_message_id,telegram_message_url` +
        `&event_id=eq.${encodeURIComponent(eventId)}` +
        `&post_type=eq.${postType}` +
        `&limit=1`
    );

  return Array.isArray(rows)
    ? rows[0] || null
    : null;
}

/*
  تسجيل Reply جديد.
*/
async function saveReplyLog({
  eventId,
  messageId,
  messageUrl,
  postType
}) {
  await supabaseRequest(
    "/rest/v1/event_post_logs",
    {
      method: "POST",
      headers: {
        Prefer:
          "resolution=ignore-duplicates,return=minimal"
      },
      body: JSON.stringify({
        event_id:
          Number(eventId),

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
          postType
      })
    }
  );
}

/*
  الأحداث التي انتهت بالفعل.
*/
async function getExpiredEvents() {
  const now =
    new Date().toISOString();

  return supabaseRequest(
    `/rest/v1/events` +
      `?select=id,title_ar,title_en,end_at,distribution_confirmed,distribution_verified_at` +
      `&end_at=lt.${encodeURIComponent(now)}` +
      `&status=neq.ended` +
      `&order=end_at.asc`
  );
}

/*
  الأحداث التي يوجد لها توزيع مؤكد
*/
async function getDistributionConfirmedEvents() {
  return supabaseRequest(
    `/rest/v1/events` +
      `?select=id,title_ar,title_en,end_at,distribution_date,distribution_confirmed,distribution_verified_at,distribution_method` +
      `&distribution_confirmed=eq.true` +
      `&order=distribution_verified_at.asc`
  );
}

/*
  إرسال Reply للانتهاء.
*/
async function processEnding(event) {
  const existingReply =
    await getReplyLog(
      event.id,
      "ending"
    );

  if (existingReply) {
    return {
      processed: false,
      reason:
        "Ending reply already sent"
    };
  }

  const originalPost =
    await getLatestPost(
      event.id
    );

  if (!originalPost) {
    return {
      processed: false,
      reason:
        "No original Telegram post found"
    };
  }

  const text = [
    "🔴 <b>انتهى الحدث</b>",
    "",
    `🏦 <b>${escapeHtml(
      event.title_ar ||
        event.title_en ||
        "Crypto Event"
    )}</b>`,
    "",
    `⏰ انتهى بتاريخ: ${formatDate(
      event.end_at
    )}`,
    "",
    "❌ لم يعد الحدث متاحًا للمشاركة.",
    "",
    "🍎 <b>Crypto Events</b>"
  ].join("\n");

  const result =
    await telegramRequest(
      "sendMessage",
      {
        chat_id:
          TELEGRAM_CHAT_ID,

        text,

        parse_mode:
          "HTML",

        reply_parameters: {
          message_id:
            Number(
              originalPost.telegram_message_id
            )
        }
      }
    );

  const messageId =
    result.result?.message_id;

  if (!messageId) {
    throw new Error(
      "Telegram did not return ending reply message_id"
    );
  }

  const messageUrl =
    `https://t.me/${CHANNEL_USERNAME}/${messageId}`;

  await saveReplyLog({
    eventId:
      event.id,
    messageId,
    messageUrl,
    postType:
      "ending"
  });

  return {
    processed: true,
    eventId:
      event.id,
    telegramMessageId:
      messageId,
    originalMessageId:
      originalPost.telegram_message_id
  };
}

/*
  إرسال Reply للتوزيع المؤكد.
*/
async function processDistribution(
  event
) {
  const existingReply =
    await getReplyLog(
      event.id,
      "distribution"
    );

  if (existingReply) {
    return {
      processed: false,
      reason:
        "Distribution reply already sent"
    };
  }

  const originalPost =
    await getLatestPost(
      event.id
    );

  if (!originalPost) {
    return {
      processed: false,
      reason:
        "No original Telegram post found"
    };
  }

  const text = [
    "🎁 <b>تم توزيع المكافآت</b>",
    "",
    `🏦 <b>${escapeHtml(
      event.title_ar ||
        event.title_en ||
        "Crypto Event"
    )}</b>`,
    "",
    "✅ تم تأكيد توزيع مكافآت الحدث.",
    event.distribution_method
      ? `📦 طريقة التوزيع: ${escapeHtml(
          event.distribution_method
        )}`
      : "",
    event.distribution_verified_at
      ? `📅 تاريخ التأكيد: ${formatDate(
          event.distribution_verified_at
        )}`
      : "",
    "",
    "🍎 <b>Crypto Events</b>"
  ]
    .filter(Boolean)
    .join("\n");

  const result =
    await telegramRequest(
      "sendMessage",
      {
        chat_id:
          TELEGRAM_CHAT_ID,

        text,

        parse_mode:
          "HTML",

        reply_parameters: {
          message_id:
            Number(
              originalPost.telegram_message_id
            )
        }
      }
    );

  const messageId =
    result.result?.message_id;

  if (!messageId) {
    throw new Error(
      "Telegram did not return distribution reply message_id"
    );
  }

  const messageUrl =
    `https://t.me/${CHANNEL_USERNAME}/${messageId}`;

  await saveReplyLog({
    eventId:
      event.id,
    messageId,
    messageUrl,
    postType:
      "distribution"
  });

  return {
    processed: true,
    eventId:
      event.id,
    telegramMessageId:
      messageId,
    originalMessageId:
      originalPost.telegram_message_id
  };
}

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
    const report = {
      success: true,
      expiredChecked: 0,
      endingRepliesSent: 0,
      distributionsChecked: 0,
      distributionRepliesSent: 0,
      skipped: [],
      errors: []
    };

    /*
      1. انتهاء الأحداث
    */
    const expired =
      await getExpiredEvents();

    report.expiredChecked =
      expired.length;

    for (const event of expired) {
      try {
        const result =
          await processEnding(
            event
          );

        if (result.processed) {
          report.endingRepliesSent++;
        } else {
          report.skipped.push({
            type: "ending",
            eventId: event.id,
            reason:
              result.reason
          });
        }
      } catch (error) {
        report.errors.push({
          type: "ending",
          eventId: event.id,
          error:
            error.message
        });
      }
    }

    /*
      2. التوزيعات المؤكدة
    */
    const distributions =
      await getDistributionConfirmedEvents();

    report.distributionsChecked =
      distributions.length;

    for (
      const event of distributions
    ) {
      try {
        const result =
          await processDistribution(
            event
          );

        if (result.processed) {
          report.distributionRepliesSent++;
        } else {
          report.skipped.push({
            type: "distribution",
            eventId: event.id,
            reason:
              result.reason
          });
        }
      } catch (error) {
        report.errors.push({
          type:
            "distribution",
          eventId:
            event.id,
          error:
            error.message
        });
      }
    }

    return res.status(200).json(
      report
    );
  } catch (error) {
    console.error(
      "Event status error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error.message
    });
  }
}