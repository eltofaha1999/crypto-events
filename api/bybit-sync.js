const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

const BYBIT_SOURCE =
  "https://announcements.bybit.com/en/?category=latest_activities&page=1";

const AFFILIATE_URL =
  "https://partner.bybit.com/b/165247";

const AFFILIATE_CODE =
  "165247";

const PLATFORM_ID = 1;

const TIMEOUT_MS = 10000;
const MAX_CANDIDATES = 5;

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value = "") {
  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(value = "") {
  return decodeHtml(
    String(value)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function slugify(title) {
  return `bybit-${title}`
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function isCampaign(title = "") {
  const value = title.toLowerCase();

  const positive = [
    "earn",
    "reward",
    "rewards",
    "prize",
    "campaign",
    "challenge",
    "competition",
    "bonus",
    "win",
    "share",
    "trade",
    "trading",
    "usdt",
    "usdc"
  ];

  const negative = [
    "listing",
    "new listing",
    "maintenance",
    "delist",
    "suspend",
    "suspension",
    "position tier",
    "fee update",
    "service discontinuation",
    "withdrawal service"
  ];

  if (
    negative.some((word) =>
      value.includes(word)
    )
  ) {
    return false;
  }

  return positive.some((word) =>
    value.includes(word)
  );
}

async function fetchPage(url) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 CryptoEventsBybit/1.0",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language":
          "en-US,en;q=0.9"
      }
    });

    return {
      ok: response.ok,
      status: response.status,
      url: response.url,
      html: await response.text()
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractLinks(html) {
  const links = [];

  const regex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = regex.exec(html)) !== null) {
    let href = match[1];

    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("javascript:") ||
      href.startsWith("mailto:")
    ) {
      continue;
    }

    try {
      href = new URL(
        href,
        BYBIT_SOURCE
      ).toString();
    } catch {
      continue;
    }

    if (
      !href.includes(
        "announcements.bybit.com/en/article/"
      )
    ) {
      continue;
    }

    const title = cleanText(
      stripHtml(match[2])
    );

    if (title.length < 8) {
      continue;
    }

    links.push({
      title,
      url: href
    });
  }

  const unique = new Map();

  for (const item of links) {
    unique.set(item.url, item);
  }

  return [...unique.values()];
}

function getMeta(html, key) {
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${key}["']`,
      "i"
    )
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return cleanText(
        decodeHtml(match[1])
      );
    }
  }

  return null;
}

function getTitle(html, fallback) {
  return (
    getMeta(html, "og:title") ||
    cleanText(
      stripHtml(
        html.match(
          /<title[^>]*>([\s\S]*?)<\/title>/i
        )?.[1] || ""
      )
    ) ||
    fallback ||
    null
  );
}

function getDescription(html) {
  return (
    getMeta(html, "og:description") ||
    getMeta(html, "description") ||
    null
  );
}

function getImage(html, pageUrl) {
  const image =
    getMeta(html, "og:image") ||
    getMeta(html, "twitter:image");

  if (!image) {
    return null;
  }

  try {
    return new URL(
      image,
      pageUrl
    ).toString();
  } catch {
    return null;
  }
}

function getVisibleText(html) {
  return cleanText(
    stripHtml(html)
  );
}

function extractReward(text) {
  const patterns = [
    /(?:prize pool|reward pool|total rewards?|rewards?|bonus|earn up to|up to)[^$]{0,140}\$?\s?[\d,.]+\s*(?:USDT|USDC|USD|BTC|ETH)?/i,
    /\$[\d,.]+\s*(?:USDT|USDC|USD)\b/i,
    /[\d,.]+\s*(?:USDT|USDC)\b/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[0]) {
      return cleanText(match[0]);
    }
  }

  return null;
}

function parseDateValue(value) {
  if (!value) {
    return null;
  }

  const normalized = cleanText(value)
    .replace(/\s+UTC\b/i, " UTC")
    .replace(/\bUTC\b/i, " UTC");

  const direct = new Date(normalized);

  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  return null;
}

function extractDates(text) {
  const patterns = [
    /Event period\s*:\s*([A-Z][a-z]+\s+\d{1,2},\s+\d{4},?\s*\d{1,2}:\d{2}\s*(?:AM|PM)?\s*UTC?)\s*(?:–|-|—|to)\s*([A-Z][a-z]+\s+\d{1,2},\s+\d{4},?\s*\d{1,2}:\d{2}\s*(?:AM|PM)?\s*UTC?)/i,

    /(?:Activity period|Campaign period|Promotion period)\s*:\s*([A-Z][a-z]+\s+\d{1,2},\s+\d{4}[^–—-]{0,50})\s*(?:–|-|—|to)\s*([A-Z][a-z]+\s+\d{1,2},\s+\d{4}[^.]{0,50})/i,

    /([A-Z][a-z]+\s+\d{1,2},\s+\d{4}\s*,?\s*\d{1,2}:\d{2}\s*(?:AM|PM)?(?:\s*UTC)?)\s*(?:–|-|—|to)\s*([A-Z][a-z]+\s+\d{1,2},\s+\d{4}\s*,?\s*\d{1,2}:\d{2}\s*(?:AM|PM)?(?:\s*UTC)?)/i,

    /(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2})?)\s*(?:–|-|—|to)\s*(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2})?)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    const start =
      parseDateValue(match[1]);

    const end =
      parseDateValue(match[2]);

    if (
      start &&
      end &&
      end > start
    ) {
      return {
        start,
        end
      };
    }
  }

  return null;
}

function extractVolume(text) {
  const patterns = [
    /minimum trading volume[^0-9]{0,80}([\d,.]+)\s*(?:USDT|USDC|USD)/i,
    /trading volume[^0-9]{0,80}([\d,.]+)\s*(?:USDT|USDC|USD)/i,
    /trade volume[^0-9]{0,80}([\d,.]+)\s*(?:USDT|USDC|USD)/i,
    /minimum volume[^0-9]{0,80}([\d,.]+)\s*(?:USDT|USDC|USD)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    const value = Number(
      match[1].replace(/,/g, "")
    );

    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function extractDeposit(text) {
  const patterns = [
    /minimum deposit[^0-9]{0,80}([\d,.]+)\s*(?:USDT|USDC|USD)/i,
    /deposit at least[^0-9]{0,80}([\d,.]+)\s*(?:USDT|USDC|USD)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    const value = Number(
      match[1].replace(/,/g, "")
    );

    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function detectTradeType(text) {
  const value =
    text.toLowerCase();

  if (
    value.includes("copy trading")
  ) {
    return "Copy Trading";
  }

  if (
    value.includes("derivatives") ||
    value.includes("futures") ||
    value.includes("perpetual")
  ) {
    return "Derivatives";
  }

  if (
    value.includes("spot")
  ) {
    return "Spot";
  }

  return null;
}

function detectEligibility(text) {
  const value =
    text.toLowerCase();

  if (
    value.includes(
      "new users only"
    ) ||
    value.includes(
      "new users"
    )
  ) {
    return {
      newUsersOnly: true,
      existingUsersAllowed: false
    };
  }

  if (
    value.includes(
      "existing users only"
    )
  ) {
    return {
      newUsersOnly: false,
      existingUsersAllowed: true
    };
  }

  return {
    newUsersOnly: false,
    existingUsersAllowed: true
  };
}

function extractTaskRewards(text) {
  const lines =
    text.split(
      /[\n.!?]+/
    );

  const tasks = [];

  for (const line of lines) {
    const value =
      cleanText(line);

    if (!value) {
      continue;
    }

    if (
      /(earn|get|receive|reward|bonus|win|lucky draw)/i.test(
        value
      ) &&
      /\d/.test(value)
    ) {
      tasks.push(
        value.slice(0, 300)
      );
    }
  }

  return [
    ...new Set(tasks)
  ].slice(0, 20);
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

  const response =
    await fetch(
      `${SUPABASE_URL}${path}`,
      {
        ...options,
        headers: {
          apikey:
            SUPABASE_KEY,
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
      `Supabase HTTP ${response.status}`
    );
  }

  return data;
}

async function getExistingEvents() {
  return supabaseRequest(
    `/rest/v1/events?select=id,slug,official_url&platform_id=eq.${PLATFORM_ID}`
  );
}

async function insertEvent(event) {
  return supabaseRequest(
    "/rest/v1/events",
    {
      method: "POST",
      headers: {
        Prefer:
          "return=representation"
      },
      body:
        JSON.stringify(event)
    }
  );
}

async function updateEvent(
  eventId,
  event
) {
  return supabaseRequest(
    `/rest/v1/events?id=eq.${encodeURIComponent(
      eventId
    )}`,
    {
      method: "PATCH",
      headers: {
        Prefer:
          "return=minimal"
      },
      body:
        JSON.stringify(event)
    }
  );
}

function buildEvent(data) {
  const now =
    new Date();

  let status =
    "active";

  if (now < data.start) {
    status = "upcoming";
  } else if (now > data.end) {
    status = "ended";
  }

  return {
    slug:
      slugify(data.title),

    platform_id:
      PLATFORM_ID,

    title_ar:
      data.title,

    title_en:
      data.title,

    description_ar:
      data.description ||
      "تم التحقق من الحدث من المصدر الرسمي.",

    description_en:
      data.description ||
      "Event verified from the official source.",

    reward_ar:
      data.reward,

    reward_en:
      data.reward,

    event_type:
      data.tradeType ||
      "campaign",

    status,

    start_at:
      data.start.toISOString(),

    end_at:
      data.end.toISOString(),

    official_url:
      data.officialUrl,

    volume_required:
      data.volumeRequired,

    deposit_required:
      data.depositRequired,

    trade_type:
      data.tradeType,

    min_trade:
      null,

    new_users_only:
      data.eligibility
        .newUsersOnly,

    existing_users_allowed:
      data.eligibility
        .existingUsersAllowed,

    kyc_required:
      data.kycRequired,

    region_restrictions:
      null,

    registration_required:
      true,

    distribution_date:
      null,

    distribution_method:
      null,

    affiliate_url:
      AFFILIATE_URL,

    affiliate_code:
      AFFILIATE_CODE,

    image_url:
      data.imageUrl,

    source_url:
      data.officialUrl,

    last_verified_at:
      new Date().toISOString(),

    priority:
      80,

    task_rewards:
      data.taskRewards
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

  const report = {
    success: true,
    platform: "Bybit",
    candidates: 0,
    checked: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    details: []
  };

  try {
    const listing =
      await fetchPage(
        BYBIT_SOURCE
      );

    if (!listing.ok) {
      return res.status(502).json({
        success: false,
        error:
          `Bybit returned HTTP ${listing.status}`
      });
    }

    const links =
      extractLinks(
        listing.html
      )
      .filter((item) =>
        isCampaign(
          item.title
        )
      )
      .slice(
        0,
        MAX_CANDIDATES
      );

    report.candidates =
      links.length;

    const existing =
      await getExistingEvents();

    const bySlug =
      new Map();

    const byUrl =
      new Map();

    for (const row of existing) {
      if (row.slug) {
        bySlug.set(
          row.slug,
          row
        );
      }

      if (row.official_url) {
        byUrl.set(
          row.official_url,
          row
        );
      }
    }

    for (const candidate of links) {
      report.checked++;

      try {
        const page =
          await fetchPage(
            candidate.url
          );

        if (!page.ok) {
          report.skipped++;

          report.details.push({
            title:
              candidate.title,
            url:
              candidate.url,
            outcome:
              "skipped",
            reason:
              `HTTP ${page.status}`
          });

          continue;
        }

        const text =
          getVisibleText(
            page.html
          );

        const title =
          getTitle(
            page.html,
            candidate.title
          );

        const description =
          getDescription(
            page.html
          );

        const reward =
          extractReward(
            text
          );

        const dates =
          extractDates(
            text
          );

        const imageUrl =
          getImage(
            page.html,
            page.url
          );

        const volumeRequired =
          extractVolume(
            text
          );

        const depositRequired =
          extractDeposit(
            text
          );

        const tradeType =
          detectTradeType(
            text
          );

        const eligibility =
          detectEligibility(
            text
          );

        const taskRewards =
          extractTaskRewards(
            text
          );

        if (
          !reward ||
          !dates?.start ||
          !dates?.end
        ) {
          report.skipped++;

          report.details.push({
            title,
            url:
              page.url,
            outcome:
              "skipped",
            reason:
              "Missing verified reward or dates"
          });

          continue;
        }

        const event =
          buildEvent({
            title,
            description,
            reward,
            imageUrl,
            start:
              dates.start,
            end:
              dates.end,
            volumeRequired,
            depositRequired,
            tradeType,
            eligibility,
            taskRewards,
            kycRequired:
              /\bkyc\b/i.test(
                text
              ),
            officialUrl:
              page.url
          });

        const existingRow =
          byUrl.get(
            event.official_url
          ) ||
          bySlug.get(
            event.slug
          );

        if (existingRow) {
          await updateEvent(
            existingRow.id,
            event
          );

          report.updated++;

          report.details.push({
            title:
              event.title_ar,
            outcome:
              "updated",
            eventId:
              existingRow.id,
            image:
              Boolean(
                event.image_url
              )
          });
        } else {
          await insertEvent(
            event
          );

          report.created++;

          report.details.push({
            title:
              event.title_ar,
            outcome:
              "created",
            image:
              Boolean(
                event.image_url
              ),
            url:
              event.official_url
          });
        }
      } catch (error) {
        report.skipped++;

        report.details.push({
          title:
            candidate.title,
          outcome:
            "error",
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
      "Bybit sync error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error.message
    });
  }
}