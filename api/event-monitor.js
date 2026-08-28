const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

const SOURCES = [
  {
    platform: "Bybit",
    url: "https://announcements.bybit.com/en/"
  },
  {
    platform: "Binance",
    url: "https://www.binance.com/en/support/announcement/list/93"
  },
  {
    platform: "Bitget",
    url: "https://www.bitget.com/support"
  },
  {
    platform: "OKX",
    url: "https://www.okx.com/campaigns"
  },
  {
    platform: "Gate.io",
    url: "https://www.gate.com/announcements"
  },
  {
    platform: "MEXC",
    url: "https://www.mexc.com/announcements/all"
  },
  {
    platform: "WEEX",
    url: "https://www.weex.com/news"
  },
  {
    platform: "LBank",
    url: "https://www.lbank.com/support"
  },
  {
    platform: "BloFin",
    url: "https://blofin.com/en/support/Announcement/Latest-Promotions"
  },
  {
    platform: "Bitunix Pro",
    url: "https://www.bitunix.com/activity/act-center"
  }
];

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

function isLikelyEvent(text) {
  const source = text.toLowerCase();

  const words = [
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
    "مكاف",
    "حملة",
    "حدث",
    "تحدي",
    "مسابقة"
  ];

  return words.some((word) =>
    source.includes(word)
  );
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; CryptoEventsMonitor/1.0)",
      Accept:
        "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}`
    );
  }

  return response.text();
}

function extractLinks(html, baseUrl) {
  const links = [];

  const regex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = regex.exec(html)) !== null) {
    let href = match[1];

    if (
      href.startsWith("#") ||
      href.startsWith("javascript:")
    ) {
      continue;
    }

    try {
      href = new URL(
        href,
        baseUrl
      ).toString();
    } catch {
      continue;
    }

    const text =
      match[2]
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ");

    const title =
      cleanText(text);

    if (!title) continue;

    links.push({
      title,
      url: href
    });
  }

  return links;
}

function findImage(html, pageUrl) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (!match) continue;

    try {
      return new URL(
        match[1],
        pageUrl
      ).toString();
    } catch {
      return null;
    }
  }

  return null;
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

async function getExistingSlugs() {
  const rows =
    await supabaseRequest(
      "/rest/v1/events?select=slug"
    );

  return new Set(
    Array.isArray(rows)
      ? rows.map((row) => row.slug)
      : []
  );
}

async function getPlatformMap() {
  const rows =
    await supabaseRequest(
      "/rest/v1/platforms?select=id,name&is_active=eq.true"
    );

  const map = new Map();

  if (Array.isArray(rows)) {
    for (const row of rows) {
      map.set(
        String(row.name).toLowerCase(),
        row.id
      );
    }
  }

  return map;
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

export default async function handler(
  req,
  res
) {
  if (
    req.method !== "GET" &&
    req.method !== "POST"
  ) {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const existingSlugs =
      await getExistingSlugs();

    const platformMap =
      await getPlatformMap();

    const results = [];
    const created = [];

    for (const source of SOURCES) {
      try {
        const platformId =
          platformMap.get(
            source.platform.toLowerCase()
          );

        if (!platformId) {
          results.push({
            platform:
              source.platform,
            error:
              "Platform not found in Supabase"
          });

          continue;
        }

        const html =
          await fetchHtml(
            source.url
          );

        const links =
          extractLinks(
            html,
            source.url
          );

        const sourceImage =
          findImage(
            html,
            source.url
          );

        let added = 0;

        for (const link of links.slice(
          0,
          30
        )) {
          if (
            !isLikelyEvent(
              link.title
            )
          ) {
            continue;
          }

          const slug =
            makeSlug(
              source.platform,
              link.title
            );

          if (
            !slug ||
            existingSlugs.has(slug)
          ) {
            continue;
          }

          /*
            مهم:
            لا نخمن موعد بداية أو نهاية
            للحدث المكتشف.
            نخليه upcoming لحد ما تتم
            مرحلة التحقق المتقدمة.
          */

          const event = {
            slug,

            platform_id:
              platformId,

            title_ar:
              link.title,

            title_en:
              link.title,

            description_ar:
              "تم اكتشاف الحدث من المصدر الرسمي. سيتم تحديث تفاصيله بعد التحقق.",

            description_en:
              "Event discovered from the official source and awaiting detailed verification.",

            reward_ar:
              "راجع تفاصيل الحدث الرسمية.",

            reward_en:
              "Check the official event details.",

            event_type:
              "discovered",

            status:
              "upcoming",

            start_at:
              new Date().toISOString(),

            end_at:
              new Date(
                Date.now() +
                  24 * 60 * 60 * 1000
              ).toISOString(),

            official_url:
              link.url,

            volume_required:
              null,

            deposit_required:
              null,

            trade_type:
              null,

            min_trade:
              null,

            new_users_only:
              false,

            existing_users_allowed:
              true,

            kyc_required:
              false,

            region_restrictions:
              null,

            registration_required:
              true,

            distribution_date:
              null,

            distribution_method:
              null,

            affiliate_url:
              null,

            affiliate_code:
              null,

            image_url:
              sourceImage,

            source_url:
              source.url,

            last_verified_at:
              new Date().toISOString(),

            priority:
              10,

            task_rewards:
              null
          };

          try {
            await insertEvent(
              event
            );

            existingSlugs.add(
              slug
            );

            created.push({
              platform:
                source.platform,
              title:
                link.title,
              slug
            });

            added++;

          } catch (insertError) {
            console.warn(
              `Insert failed for ${slug}:`,
              insertError.message
            );
          }
        }

        results.push({
          platform:
            source.platform,
          candidates:
            links.length,
          added
        });

      } catch (sourceError) {
        results.push({
          platform:
            source.platform,
          candidates: 0,
          added: 0,
          error:
            sourceError.message
        });
      }
    }

    return res.status(200).json({
      success: true,
      scanned:
        SOURCES.length,
      created:
        created.length,
      results
    });

  } catch (error) {
    console.error(
      "Event monitor error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error.message
    });
  }
}