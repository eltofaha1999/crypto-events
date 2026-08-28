const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // تم التعديل لاستخدام Service Role Key

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

  return date.toLocaleString("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function getPlatformName(event) {
  return (
    event.platform_name ||
    event.platform ||
    event.platforms?.name ||
    `Platform #${event.platform_id ?? "غير محدد"}`
  );
}

function getTitle(event) {
  return (
    event.title_ar ||
    event.title_en ||
    event.title ||
    "Crypto Event"
  );
}

function getDescription(event) {
  return (
    event.description_ar ||
    event.description_en ||
    event.description ||
    "راجع الشروط الرسمية للحدث."
  );
}

function getReward(event) {
  return (
    event.reward_ar ||
    event.reward_en ||
    event.reward ||
    "راجع تفاصيل المكافأة الرسمية."
  );
}

function buildRequirements(event) {
  const items = [];

  if (event.registration_required !== false) {
    items.push("التسجيل في الحدث");
  }

  if (event.new_users_only === true) {
    items.push("للمستخدمين الجدد فقط");
  }

  if (event.existing_users_allowed === false) {
    items.push("غير متاح للمستخدمين الحاليين");
  }

  if (event.kyc_required === true) {
    items.push("إتمام KYC مطلوب");
  }

  if (
    event.deposit_required !== null &&
    event.deposit_required !== undefined
  ) {
    items.push(`الإيداع المطلوب: ${event.deposit_required} USDT`);
  }

  if (
    event.volume_required !== null &&
    event.volume_required !== undefined
  ) {
    items.push(`حجم التداول المطلوب: ${event.volume_required} USDT`);
  }

  if (event.trade_type) {
    items.push(`نوع التداول: ${event.trade_type}`);
  }

  if (
    event.min_trade !== null &&
    event.min_trade !== undefined
  ) {
    items.push(`الحد الأدنى للصفقة: ${event.min_trade} USDT`);
  }

  if (event.region_restrictions) {
    items.push(
      `القيود الجغرافية: ${event.region_restrictions}`
    );
  }

  return items.length
    ? items.map((item) => `• ${escapeHtml(item)}`).join("\n")
    : "• راجع شروط الحدث الرسمية";
}

function buildCaption(event, index) {
  const lines = [
    `🔥 <b>${escapeHtml(getTitle(event))}</b>`,
    `🏦 <b>المنصة:</b> ${escapeHtml(getPlatformName(event))}`,
    "",
    "🎁 <b>المكافأة</b>",
    escapeHtml(getReward(event)),
    "",
    "📝 <b>التفاصيل</b>",
    escapeHtml(getDescription(event)),
    "",
    "📋 <b>المطلوب</b>",
    buildRequirements(event),
    "",
    "💰 <b>رابط التسجيل</b>",
    event.affiliate_url
      ? `<a href="${escapeHtml(
          event.affiliate_url
        )}">🚀 سجّل من رابط الإحالة</a>`
      : "غير متوفر حاليًا",
    "",
    "🎯 <b>رابط الحدث الرسمي</b>",
    event.official_url
      ? `<a href="${escapeHtml(
          event.official_url
        )}">🔗 افتح الحدث</a>`
      : "غير متوفر حاليًا",
    "",
    `📅 <b>يبدأ:</b> ${formatDate(event.start_at)}`,
    `⏰ <b>ينتهي:</b> ${formatDate(event.end_at)}`,
    `🎁 <b>التوزيع:</b> ${
      event.distribution_date
        ? formatDate(event.distribution_date)
        : "سيتم الإعلان عنه"
    }`
  ];

  if (event.distribution_method) {
    lines.push(
      `📦 <b>طريقة التوزيع:</b> ${escapeHtml(
        event.distribution_method
      )}`
    );
  }

  if (event.affiliate_code) {
    lines.push(
      "",
      `🏷️ <b>كود الإحالة:</b> ${escapeHtml(
        event.affiliate_code
      )}`
    );
  }

  if (event.source_url) {
    lines.push(
      "",
      `🔎 <b>المصدر:</b> <a href="${escapeHtml(
        event.source_url
      )}">تحقق من المصدر</a>`
    );
  }

  if (event.last_verified_at) {
    lines.push(
      `✅ <b>آخر تحقق:</b> ${formatDate(
        event.last_verified_at
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

async function supabaseGet(path) {
  if (!SUPABASE_URL) {
    throw new Error("SUPABASE_URL is not configured");
  }

  if (!SUPABASE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured"
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

async function telegramRequest(
  method,
  body,
  token
) {
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
      data?.description ||
        `Telegram API error: ${response.status}`
    );
  }

  return data;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;

    if (!telegramToken) {
      return res.status(500).json({
        success: false,
        error: "TELEGRAM_BOT_TOKEN is not configured"
      });
    }

    if (!telegramChatId) {
      return res.status(500).json({
        success: false,
        error: "TELEGRAM_CHAT_ID is not configured"
      });
    }

    const now = new Date().toISOString();

    const query =
      `/rest/v1/events` +
      `?select=*` +
      `&status=eq.active` +
      `&start_at=lte.${encodeURIComponent(now)}` +
      `&end_at=gte.${encodeURIComponent(now)}` +
      `&order=priority.desc,start_at.asc`;

    const events = await supabaseGet(query);

    if (!Array.isArray(events)) {
      throw new Error(
        "Supabase returned invalid events data"
      );
    }

    if (events.length === 0) {
      const message = [
        "📅 <b>Crypto Events — الأحداث المتاحة الآن</b>",
        "",
        "ℹ️ لا توجد أحداث متاحة حاليًا.",
        "",
        "🍎 <b>Crypto Events</b>"
      ].join("\n");

      const result = await telegramRequest(
        "sendMessage",
        {
          chat_id: telegramChatId,
          text: message,
          parse_mode: "HTML"
        },
        telegramToken
      );

      return res.status(200).json({
        success: true,
        eventsCount: 0,
        messageId: result.result?.message_id || null
      });
    }

    const summary = [
      "🔥 <b>Crypto Events — الأحداث المتاحة الآن</b>",
      "",
      `📊 <b>${events.length}</b> حدث متاح حاليًا`,
      "",
      ...events.map(
        (event, index) =>
          `${index + 1}️⃣ <b>${escapeHtml(
            getPlatformName(event)
          )}</b> — ${escapeHtml(getTitle(event))}`
      ),
      "",
      "👇 <b>تفاصيل الأحداث بالأسفل</b>"
    ];

    await telegramRequest(
      "sendMessage",
      {
        chat_id: telegramChatId,
        text: summary.join("\n"),
        parse_mode: "HTML"
      },
      telegramToken
    );

    const results = [];

    for (let index = 0; index < events.length; index++) {
      const event = events[index];

      const caption = buildCaption(event, index + 1);

      let result = null;
      let imageSent = false;

      if (event.image_url) {
        try {
          result = await telegramRequest(
            "sendPhoto",
            {
              chat_id: telegramChatId,
              photo: event.image_url,
              caption,
              parse_mode: "HTML"
            },
            telegramToken
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
            chat_id: telegramChatId,
            text:
              caption +
              "\n\n📷 <i>صورة الحدث غير متاحة حاليًا.</i>",
            parse_mode: "HTML",
            disable_web_page_preview: false
          },
          telegramToken
        );
      }

      results.push({
        id: event.id,
        platform: getPlatformName(event),
        title: getTitle(event),
        imageSent,
        messageId: result.result?.message_id || null
      });
    }

    return res.status(200).json({
      success: true,
      eventsCount: events.length,
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