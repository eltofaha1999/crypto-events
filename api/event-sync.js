const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

const TIMEOUT_MS = 8000;
const MAX_LINKS = 20;

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function makeSlug(platform, title) {
  return `${platform}-${title}`
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
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
          "Mozilla/5.0 (compatible; CryptoEventsSync/1.0)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
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

function extractLinks(html, baseUrl) {
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
      href = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }

    const title = cleanText(
      match[2].replace(/<[^>]+>/g, " ")
    );

    if (title.length < 8) {
      continue;
    }

    links.push({
      title,
      url: href
    });
  }

  return links;
}

function isEventCandidate(title = "") {
  const text = title.toLowerCase();

  const keywords = [
    "campaign",
    "event",
    "reward",
    "rewards",
    "bonus",
    "competition",
    "challenge",
    "airdrop",
    "giveaway",
    "trading",
    "trade",
    "usdt",
    "usdc",
    "mystery box",
    "مكاف",
    "حملة",
    "حدث",
    "تحدي",
    "مسابقة"
  ];

  return keywords.some((keyword) =>
    text.includes(keyword)
  );
}

function getMeta(html, property) {
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`,
      "i"
    )
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return cleanText(
        match[1]
          .replace(/&amp;/gi, "&")
          .replace(/&quot;/gi, '"')
      );
    }
  }

  return null;
}

function getTitle(html) {
  return (
    getMeta(html, "og:title") ||
    cleanText(
      html
        .match(
          /<title[^>]*>([\s\S]*?)<\/title>/i
        )?.[1]
        ?.replace(/<[^>]+>/g, " ") || ""
    ) ||
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
    html
      .replace(
        /<script[\s\S]*?<\/script>/gi,
        " "
      )
      .replace(
        /<style[\s\S]*?<\/style>/gi,
        " "
      )
      .replace(
        /<[^>]+>/g,
        " "
      )
  );
}

function extractReward(text) {
  const patterns = [
    /(?:prize pool|reward pool|total rewards?|rewards?|bonus|up to)[^$]{0,100}\$?\s?[\d,.]+\s?(?:USDT|USDC|USD|BTC|ETH)?/i,
    /\$[\d,.]+\s?(?:USDT|USDC|USD)\b/i,
    /[\d,.]+\s?(?:USDT|USDC)\b/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[0]) {
      return cleanText(match[0]);
    }
  }

  return null;
}

function extractDates(text) {
  const patterns = [
    /([A-Z][a-z]+\s+\d{1,2},?\s+\d{4}(?:[^a-zA-Z0-9]{1,10}\d{1,2}:\d{2}\s*(?:AM|PM)?)?)\s*(?:-|–|—|to|until|through)\s*([A-Z][a-z]+\s+\d{1,2},?\s+\d{4}(?:[^a-zA-Z0-9]{1,10}\d{1,2}:\d{2}\s*(?:AM|PM)?)?)/i,

    /(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2})?)\s*(?:-|–|—|to|until)\s*(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2})?)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) continue;

    const start = new Date(match[1]);
    const end = new Date(match[2]);

    if (
      !Number.isNaN(start.getTime()) &&
      !Number.isNaN(end.getTime()) &&
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
    /(?:trading volume|trade volume|volume|حجم التداول)[^0-9]{0,60}([\d,.]+)\s*(?:USDT|USDC|USD)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) continue;

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
    /(?:minimum deposit|deposit at least|deposit|الإيداع|إيداع)[^0-9]{0,60}([\d,.]+)\s*(?:USDT|USDC|USD)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) continue;

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
  const value = text.toLowerCase();

  if (value.includes("copy trading")) {
    return "Copy Trading";
  }

  if (
    value.includes("futures") ||
    value.includes("perpetual")
  ) {
    return "Futures";
  }

  if (value.includes("spot")) {
    return "Spot";
  }

  return null;
}

function detectEligibility(text) {
  const value = text.toLowerCase();

  if (
    value.includes("new users only") ||
    value.includes("new users")
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
  const lines = text.split(/[.!?\n]+/);
  const tasks = [];

  for (const line of lines) {
    const value = cleanText(line);

    if (!value) continue;

    if (
      /(earn|reward|bonus|receive|get|ربح|مكافأة)/i.test(
        value
      ) &&
      /\d/.test(value)
    ) {
      tasks.push(value.slice(0, 300));
    }
  }

  return [
    ...new Set(tasks)
  ].slice(0, 20);
}

function getAffiliate(platformName) {
  const key = String(platformName)
    .trim()
    .toLowerCase();

  const affiliates = {
    bybit: [
      "https://partner.bybit.com/b/165247",
      "165247"
    ],

    binance: [
      "https://www.binance.com/ar/activity/referral-entry/CPA?ref=CPA_00971H3C6O",
      "CPA_00971H3C6O"
    ],

    bitget: [
      "https://partner.bitget.com/bg/HUPJG5",
      "HUPJG5"
    ],

    okx: [
      "https://okx.com/join/42167890",
      "42167890"
    ],

    "gate.io": [
      "https://www.gate.com/share/awcxxqhx",
      "awcxxqhx"
    ],

    mexc: [
      "https://www.mexc.com/register?inviteCode=1Z93d",
      "1Z93d"
    ],

    weex: [
      "https://weex.com/register?vipCode=kqjq",
      "kqjq"
    ],

    lbank: [
      "https://www.lbank.com/ref/59YQY",
      "59YQY"
    ],

    blofin: [
      "https://partner.blofin.com/d/Elkateba",
      "Elkateba"
    ],

    "bitunix pro": [
      "https://www.bitunix.com/register?vipCode=uGre",
      "uGre"
    ]
  };

  const result = affiliates[key];

  return {
    url: result?.[0] || null,
    code: result?.[1] || null
  };
}

async function getPlatforms() {
  return supabaseRequest(
    "/rest/v1/platforms" +
      "?select=id,name,events_source_url,is_active" +
      "&is_active=eq.true" +
      "&order=id"
  );
}

async function getExistingEvents(
  platformId
) {
  return supabaseRequest(
    "/rest/v1/events" +
      "?select=id,slug,official_url" +
      `&platform_id=eq.${encodeURIComponent(
        platformId
      )}`
  );
}

async function updateSync({
  platformId,
  status,
  candidates,
  newEvents,
  error
}) {
  const now =
    new Date().toISOString();

  const payload = {
    platform_id:
      Number(platformId),

    last_checked_at:
      now,

    status,

    candidates_found:
      Number(candidates || 0),

    new_events_found:
      Number(newEvents || 0),

    last_error:
      error || null,

    updated_at:
      now
  };

  if (status === "success") {
    payload.last_success_at =
      now;
  }

  await supabaseRequest(
    "/rest/v1/event_source_sync?on_conflict=platform_id",
    {
      method: "POST",
      headers: {
        Prefer:
          "resolution=merge-duplicates,return=minimal"
      },
      body:
        JSON.stringify(payload)
    }
  );
}

async function createEvent(
  event
) {
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
  id,
  event
) {
  return supabaseRequest(
    `/rest/v1/events?id=eq.${encodeURIComponent(
      id
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
    const platforms =
      await getPlatforms();

    if (!platforms.length) {
      return res.status(200).json({
        success: true,
        message:
          "No active platforms found.",
        processed: null
      });
    }

    /*
      اختيار المنصة:
      ?platform_id=1
      أو أول منصة نشطة.
    */

    const requestedId =
      req.query?.platform_id
        ? Number(
            req.query.platform_id
          )
        : null;

    const platform =
      requestedId
        ? platforms.find(
            (item) =>
              Number(item.id) ===
              requestedId
          )
        : platforms[0];

    if (!platform) {
      return res.status(404).json({
        success: false,
        error:
          "Platform not found"
      });
    }

    if (!platform.events_source_url) {
      return res.status(200).json({
        success: true,
        platform:
          platform.name,
        skipped: true,
        reason:
          "events_source_url is empty"
      });
    }

    const existing =
      await getExistingEvents(
        platform.id
      );

    const existingBySlug =
      new Map();

    const existingByUrl =
      new Map();

    for (const row of existing) {
      if (row.slug) {
        existingBySlug.set(
          row.slug,
          row
        );
      }

      if (row.official_url) {
        existingByUrl.set(
          row.official_url,
          row
        );
      }
    }

    const listing =
      await fetchPage(
        platform.events_source_url
      );

    if (!listing.ok) {
      await updateSync({
        platformId:
          platform.id,
        status: "error",
        candidates: 0,
        newEvents: 0,
        error:
          `HTTP ${listing.status}`
      });

      return res.status(200).json({
        success: true,
        platform:
          platform.name,
        reachable: false,
        status:
          listing.status,
        created: 0,
        updated: 0
      });
    }

    const links =
      extractLinks(
        listing.html,
        platform.events_source_url
      );

    const candidates =
      links
        .filter((item) =>
          isEventCandidate(
            item.title
          )
        )
        .slice(
          0,
          MAX_LINKS
        );

    const created = [];
    const updated = [];
    const skipped = [];

    /*
      نفحص عددًا محدودًا من صفحات الأحداث
      في كل تشغيل.
    */

    for (const candidate of candidates.slice(
      0,
      3
    )) {
      try {
        const page =
          await fetchPage(
            candidate.url
          );

        if (!page.ok) {
          skipped.push({
            title:
              candidate.title,
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
            page.html
          ) ||
          candidate.title;

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

        /*
          لا ندخل حدثًا جديدًا
          إذا كانت البيانات الأساسية
          غير مؤكدة.
        */
        if (
          !reward ||
          !dates?.start ||
          !dates?.end
        ) {
          skipped.push({
            title,
            url:
              page.url,
            reason:
              "Missing reward or event dates"
          });

          continue;
        }

        const affiliate =
          getAffiliate(
            platform.name
          );

        const eligibility =
          detectEligibility(
            text
          );

        const event = {
          slug:
            makeSlug(
              platform.name,
              title
            ),

          platform_id:
            Number(platform.id),

          title_ar:
            title,

          title_en:
            title,

          description_ar:
            description ||
            "تم التحقق من الحدث من المصدر الرسمي.",

          description_en:
            description ||
            "Event verified from the official source.",

          reward_ar:
            reward,

          reward_en:
            reward,

          event_type:
            detectTradeType(
              text
            ) || "campaign",

          status:
            new Date() <
            dates.start
              ? "upcoming"
              : new Date() >
                dates.end
              ? "ended"
              : "active",

          start_at:
            dates.start.toISOString(),

          end_at:
            dates.end.toISOString(),

          official_url:
            page.url,

          volume_required:
            extractVolume(
              text
            ),

          deposit_required:
            extractDeposit(
              text
            ),

          trade_type:
            detectTradeType(
              text
            ),

          min_trade:
            null,

          new_users_only:
            eligibility.newUsersOnly,

          existing_users_allowed:
            eligibility.existingUsersAllowed,

          kyc_required:
            /\bkyc\b/i.test(text),

          region_restrictions:
            null,

          registration_required:
            true,

          distribution_date:
            null,

          distribution_method:
            null,

          affiliate_url:
            affiliate.url,

          affiliate_code:
            affiliate.code,

          image_url:
            getImage(
              page.html,
              page.url
            ),

          source_url:
            page.url,

          last_verified_at:
            new Date().toISOString(),

          priority:
            50,

          task_rewards:
            extractTaskRewards(
              text
            )
        };

        const existingRow =
          existingByUrl.get(
            event.official_url
          ) ||
          existingBySlug.get(
            event.slug
          );

        if (existingRow) {
          await updateEvent(
            existingRow.id,
            event
          );

          updated.push({
            eventId:
              existingRow.id,
            title,
            image:
              Boolean(
                event.image_url
              )
          });
        } else {
          await createEvent(
            event
          );

          created.push({
            title,
            url:
              event.official_url,
            image:
              Boolean(
                event.image_url
              )
          });
        }
      } catch (error) {
        skipped.push({
          title:
            candidate.title,
          url:
            candidate.url,
          reason:
            error.message
        });
      }
    }

    await updateSync({
      platformId:
        platform.id,
      status: "success",
      candidates:
        candidates.length,
      newEvents:
        created.length,
      error: null
    });

    return res.status(200).json({
      success: true,
      platform:
        platform.name,
      platformId:
        platform.id,
      source:
        platform.events_source_url,
      candidates:
        candidates.length,
      checked:
        Math.min(
          candidates.length,
          3
        ),
      created:
        created.length,
      updated:
        updated.length,
      skipped:
        skipped.length,
      createdEvents:
        created,
      updatedEvents:
        updated,
      skippedEvents:
        skipped
    });
  } catch (error) {
    console.error(
      "Event sync error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error.message
    });
  }
}