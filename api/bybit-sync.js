const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

const BYBIT_SOURCE =
  "https://announcements.bybit.com/en/?category=latest_activities&page=1";

const PLATFORM_ID = 1;

const AFFILIATE_URL =
  "https://partner.bybit.com/b/165247";

const AFFILIATE_CODE =
  "165247";

const MAX_CANDIDATES = 5;
const TIMEOUT_MS = 10000;

/* =========================
   Helpers
========================= */

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
    "margin trading position tier",
    "fee update",
    "service update",
    "withdrawal service",
    "service discontinuation"
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

  const timer = setTimeout(
    () => controller.abort(),
    TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CryptoEventsBybitSync/2.0)",
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
   Listing Parser
========================= */

function extractListingLinks(html) {
  const links = [];

  const regex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while (
    (match = regex.exec(html)) !== null
  ) {
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

    const title =
      cleanText(
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

  const unique =
    new Map();

  for (const item of links) {
    unique.set(
      item.url,
      item
    );
  }

  return [
    ...unique.values()
  ];
}

/* =========================
   Verifier-like extraction
========================= */

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
    const match =
      html.match(pattern);

    if (
      match?.[1]
    ) {
      return cleanText(
        decodeHtml(
          match[1]
        )
      );
    }
  }

  return null;
}

function extractTitle(
  html,
  fallback
) {
  return (
    getMeta(
      html,
      "og:title"
    ) ||
    cleanText(
      stripHtml(
        html.match(
          /<title[^>]*>([\s\S]*?)<\/title>/i
        )?.[1] ||
          ""
      )
    ) ||
    fallback ||
    null
  );
}

function extractDescription(html) {
  return (
    getMeta(
      html,
      "og:description"
    ) ||
    getMeta(
      html,
      "description"
    ) ||
    null
  );
}

function extractImage(
  html,
  pageUrl
) {
  const value =
    getMeta(
      html,
      "og:image"
    ) ||
    getMeta(
      html,
      "twitter:image"
    );

  if (!value) {
    return null;
  }

  try {
    return new URL(
      value,
      pageUrl
    ).toString();
  } catch {
    return null;
  }
}

function extractReward(text) {
  const patterns = [
    /(?:prize pool|reward pool|total rewards?|total prize|rewards?|bonus|earn up to|up to)[^$]{0,180}\$?\s?[\d,.]+\s*(?:USDT|USDC|USD|BTC|ETH)?/i,

    /\$[\d,.]+\s*(?:USDT|USDC|USD)\b/i,

    /[\d,.]+\s*(?:USDT|USDC)\b/i
  ];

  for (const pattern of patterns) {
    const match =
      text.match(pattern);

    if (
      match?.[0]
    ) {
      return cleanText(
        match[0]
      );
    }
  }

  return null;
}

function extractDates(text) {
  const patterns = [
    /Event period\s*[:：]?\s*([\s\S]{0,180}?)(?:–|-|—|to|until)\s*([\s\S]{0,180})/i,

    /(?:Activity period|Campaign period|Promotion period)\s*[:：]?\s*([\s\S]{0,180}?)(?:–|-|—|to|until)\s*([\s\S]{0,180})/i,

    /([A-Z][a-z]+\s+\d{1,2},?\s+\d{4}[^–—-]{0,80})(?:–|-|—|to|until)([A-Z][a-z]+\s+\d{1,2},?\s+\d{4}[^.]{0,80})/i
  ];

  for (const pattern of patterns) {
    const match =
      text.match(pattern);

    if (!match) {
      continue;
    }

    /*
      نبحث عن أول تاريخ صالح في الجزء
      الأول والثاني بدل افتراض صيغة واحدة.
    */

    const leftMatch =
      match[1].match(
        /[A-Z][a-z]+\s+\d{1,2},?\s+\d{4}(?:[^a-zA-Z0-9]{0,12}\d{1,2}:\d{2}\s*(?:AM|PM)?(?:\s*UTC)?)?/i
      );

    const rightMatch =
      match[2].match(
        /[A-Z][a-z]+\s+\d{1,2},?\s+\d{4}(?:[^a-zA-Z0-9]{0,12}\d{1,2}:\d{2}\s*(?:AM|PM)?(?:\s*UTC)?)?/i
      );

    if (!leftMatch || !rightMatch) {
      continue;
    }

    const start =
      new Date(
        leftMatch[0]
      );

    const end =
      new Date(
        rightMatch[0]
      );

    if (
      !Number.isNaN(
        start.getTime()
      ) &&
      !Number.isNaN(
        end.getTime()
      ) &&
      end > start
    ) {
      return {
        start,
        end,
        startText:
          leftMatch[0],
        endText:
          rightMatch[0]
      };
    }
  }

  return null;
}

function extractVolume(text) {
  const patterns = [
    /(?:minimum trading volume|trading volume|trade volume|minimum volume)[^0-9]{0,100}([\d,.]+)\s*(?:USDT|USDC|USD)/i
  ];

  for (const pattern of patterns) {
    const match =
      text.match(pattern);

    if (!match) {
      continue;
    }

    const value =
      Number(
        match[1].replace(
          /,/g,
          ""
        )
      );

    if (
      Number.isFinite(value)
    ) {
      return value;
    }
  }

  return null;
}

function extractDeposit(text) {
  const patterns = [
    /(?:minimum deposit|deposit at least|deposit requirement|deposit required)[^0-9]{0,100}([\d,.]+)\s*(?:USDT|USDC|USD)/i
  ];

  for (const pattern of patterns) {
    const match =
      text.match(pattern);

    if (!match) {
      continue;
    }

    const value =
      Number(
        match[1].replace(
          /,/g,
          ""
        )
      );

    if (
      Number.isFinite(value)
    ) {
      return value;
    }
  }

  return null;
}

function detectTradeType(text) {
  const value =
    text.toLowerCase();

  if (
    value.includes(
      "copy trading"
    )
  ) {
    return "Copy Trading";
  }

  if (
    value.includes(
      "futures"
    ) ||
    value.includes(
      "perpetual"
    ) ||
    value.includes(
      "derivatives"
    )
  ) {
    return "Derivatives";
  }

  if (
    value.includes(
      "spot"
    )
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

  const results = [];

  for (const line of lines) {
    const value =
      cleanText(line);

    if (!value) {
      continue;
    }

    if (
      /(earn|get|receive|reward|bonus|win|chance)/i.test(
        value
      ) &&
      /\d/.test(value)
    ) {
      results.push(
        value.slice(0, 300)
      );
    }
  }

  return [
    ...new Set(results)
  ].slice(0, 20);
}

function getStatus(
  start,
  end
) {
  const now =
    new Date();

  if (
    now < start
  ) {
    return "upcoming";
  }

  if (
    now > end
  ) {
    return "ended";
  }

  return "active";
}

/* =========================
   Build DB object
========================= */

function buildEvent(data) {
  return {
    slug:
      slugify(
        data.title
      ),

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

    status:
      getStatus(
        data.start,
        data.end
      ),

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

    const candidates =
      extractListingLinks(
        listing.html
      )
      .filter(
        (item) =>
          isCampaign(
            item.title
          )
      )
      .slice(
        0,
        MAX_CANDIDATES
      );

    report.candidates =
      candidates.length;

    const existing =
      await supabaseRequest(
        "/rest/v1/events" +
          "?select=id,slug,official_url" +
          `&platform_id=eq.${PLATFORM_ID}`
      );

    const bySlug =
      new Map();

    const byUrl =
      new Map();

    for (const row of existing || []) {
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

    /*
      الحد الأقصى 5 صفحات فقط
      في كل تشغيل.
    */

    for (
      const candidate of candidates
    ) {
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
          extractTitle(
            page.html,
            candidate.title
          );

        const description =
          extractDescription(
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

        /*
          هنا الشرط الأساسي:
          لا نضيف/نحدث إلا عند وجود
          مكافأة + بداية + نهاية.
        */

        if (
          !reward ||
          !dates?.start ||
          !dates?.end
        ) {
          report.skipped++;

          report.details.push({
            title,
            outcome:
              "skipped",
            reason:
              "Missing verified reward or dates"
          });

          continue;
        }

        const data = {
          title,

          description,

          reward,

          start:
            dates.start,

          end:
            dates.end,

          imageUrl:
            extractImage(
              page.html,
              page.url
            ),

          volumeRequired:
            extractVolume(
              text
            ),

          depositRequired:
            extractDeposit(
              text
            ),

          tradeType:
            detectTradeType(
              text
            ),

          eligibility:
            detectEligibility(
              text
            ),

          kycRequired:
            /\bkyc\b/i.test(
              text
            ),

          taskRewards:
            extractTaskRewards(
              text
            ),

          officialUrl:
            page.url
        };

        const event =
          buildEvent(
            data
          );

        const existingRow =
          byUrl.get(
            event.official_url
          ) ||
          bySlug.get(
            event.slug
          );

        if (existingRow) {
          await supabaseRequest(
            `/rest/v1/events?id=eq.${encodeURIComponent(
              existingRow.id
            )}`,
            {
              method: "PATCH",
              headers: {
                Prefer:
                  "return=minimal"
              },
              body:
                JSON.stringify(
                  event
                )
            }
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
          await supabaseRequest(
            "/rest/v1/events",
            {
              method: "POST",
              headers: {
                Prefer:
                  "return=representation"
              },
              body:
                JSON.stringify(
                  event
                )
            }
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

function getVisibleText(html) {
  return cleanText(
    stripHtml(html)
  );
}