const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://kcbdjytoyrrsnmskxcoo.supabase.co";

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY;

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

function getPlatformName(event) {
  return (
    event.platform_name ||
    event.platform ||
    event.platforms?.name ||
    event.platforms?.title_ar ||
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
    "راجع التفاصيل الرسمية للحدث."
  );
}

function getReward(event) {
  return (
    event.reward_ar ||
    event.reward_en ||
    event.reward ||
    "راجع المكافأة في الصفحة الرسمية."
  );
}

function buildRequirements(event) {
  const requirements = [];

  if (event.registration_required !== false) {
    requirements.push("التسجيل في الحدث");
  }

  if (event.new_users_only === true) {
    requirements.push("للمستخدمين الجدد فقط");
  }

  if (event.existing_users_allowed === false) {
    requirements.push("غير متاح للمستخدمين الحاليين");
  }

  if (event.kyc_required === true) {
    requirements.push("إتمام KYC مطلوب");
  }

  if (event.deposit_required !== null && event.deposit_required !== undefined) {
    requirements.push(`الإيداع المطلوب: ${event.deposit_required} USDT`);
  }

  if (event.volume_required !== null && event.volume_required !== undefined) {
    requirements.push(`حجم التداول المطلوب: ${event.volume_required} USDT`);
  }

  if (event.trade_type) {
    requirements.push(`نوع التداول: ${event.trade_type}`);
  }

  if (event.min_trade !== null && event.min_trade !== undefined) {
    requirements.push(`الحد الأدنى للصفقة: ${event.min_trade} USDT`);
  }

  if (event.region_restrictions) {
    requirements.push(`القيود الجغرافية: ${event.region_restrictions}`);
  }

  return requirements.length
    ? requirements.map((item) => `• ${escapeHtml(item)}`).join("\n")
    : "• راجع شروط الحدث الرسمية";
}

function buildCaption(event, index) {
  const platform = getPlatformName(event);
  const title = getTitle(event);
  const description = getDescription(event);
  const reward = getReward(event);

  return [
    `🔥 <b>${escapeHtml(title)}</b>`,
    `🏦 <b>المنصة:</b> ${escapeHtml(platform)}`,
    "",
    `🎁 <b>المكافأة</b>`,
    escapeHtml(reward),
    "",
    `📝 <b>التفاصيل</b>`,
    escapeHtml(description),
    "",
    `📋 <b>المطلوب</b>`,
    buildRequirements(event),
    "",
    `💰 <b>رابط التسجيل</b>`,
    event.affiliate_url
      ? `<a href="${escapeHtml(event.affiliate_url)}">اضغط هنا للتسجيل</a>`
      : "غير متوفر حاليًا",
    "",
    `🎯 <b>رابط الحدث الرسمي</b>`,
    event.official_url
      ? `<a href="${escapeHtml(event.official_url)}">فتح صفحة الحدث</a>`
      : "غير متوفر حاليًا",
    "",
    `📅 <b>يبدأ:</b> ${formatDate(event.start_at)}`,
    `⏰ <b>ينتهي:</b> ${formatDate(event.end_at)}`,
    `🎁 <b>التوزيع:</b> ${formatDate(event.distribution_date)}`,
    "",
    event.affiliate_code
      ? `🏷️ <b>كود الإحالة:</b> ${escapeHtml(event.affiliate_code)}`
      : "",
    event.source_url
      ? `🔎 <b>المصدر:</b> <a href="${escapeHtml(event.source_url)}">تحقق من المصدر</a>`
      : "",
    "",
    "━━━━━━━━━━━━━━",
    "🍎 <b>Crypto Events</b>",
    `📌 الحدث رقم ${index}`
  ]
    .filter(Boolean)
    .join("\n");
}

async function supabaseGet(path) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      "Supabase environment variables are not configured"
    );
  }

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method: "GET",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json"
    }
  });

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
      data?.description ||
      `Telegram API error: ${response.status}`
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

    const now = new Date().toISOString();

    const events = await supabaseGet(
      `/rest/v1/events?select=*&status=eq.active&start_at=lte.${encodeURIComponent(
        now
      )}&end_at=gte.${encodeURIComponent(now)}&order=priority.desc,start_at.asc`
    );

    if (!Array.isArray(events)) {
      throw new Error("Invalid events response from Supabase");
    }

    if (events.length === 0) {
      const message =
        "📅 <b>Crypto Events — الملخص اليومي</b>\n\n" +
        "ℹ️ لا توجد أحداث متاحة حاليًا.";

      const result = await telegramRequest(
        "sendMessage",
        {
          chat_id: chatId,
          text: message,
          parse_mode: "HTML"
        },
        token
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
          `${index + 1}️⃣ ${escapeHtml(getPlatformName(event))} — ${escapeHtml(
            getTitle(event)
          )}`
      ),
      "",
      "👇 <b>التفاصيل الكاملة:</b>"
    ];

    await telegramRequest(
      "sendMessage",
      {
        chat_id: chatId,
        text: summary.join("\n"),
        parse_mode: "HTML",
        disable_web_page_preview: false
      },
      token
    );

    const results = [];

    for (let index = 0; index < events.length; index++) {
      const event = events[index];
      const caption = buildCaption(event, index + 1);

      let telegramResult;

      try {
        if (event.image_url) {
          telegramResult = await telegramRequest(
            "sendPhoto",
            {
              chat_id: chatId,
              photo: event.image_url,
              caption,
              parse_mode: "HTML"
            },
            token
          );
        } else {
          telegramResult = await telegramRequest(
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
      } catch (imageError) {
        console.warn(
          `Image failed for event ${event.id}:`,
          imageError.message
        );

        telegramResult = await telegramRequest(
          "sendMessage",
          {
            chat_id: chatId,
            text:
              caption +
              "\n\n📷 <i>تعذر تحميل صورة الحدث حاليًا.</i>",
            parse_mode: "HTML",
            disable_web_page_preview: false
          },
          token
        );
      }

      results.push({
        id: event.id,
        title: getTitle(event),
        platform: getPlatformName(event),
        imageSent: Boolean(event.image_url),
        messageId: telegramResult.result?.message_id || null
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