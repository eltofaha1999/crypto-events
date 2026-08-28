const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const SOURCES = [
  {
    platform: "Bybit",
    platformId: 1,
    url: "https://announcements.bybit.com/en/"
  },
  {
    platform: "Binance",
    platformId: 2,
    url: "https://www.binance.com/en/support/announcement/list/93"
  },
  {
    platform: "Bitget",
    platformId: 3,
    url: "https://www.bitget.com/support"
  },
  {
    platform: "OKX",
    platformId: 4,
    url: "https://www.okx.com/campaigns"
  },
  {
    platform: "Gate.io",
    platformId: 5,
    url: "https://www.gate.com/announcements/101035"
  },
  {
    platform: "MEXC",
    platformId: 6,
    url: "https://www.mexc.com/announcements/all"
  },
  {
    platform: "WEEX",
    platformId: 7,
    url: "https://www.weex.com/news"
  },
  {
    platform: "LBank",
    platformId: 8,
    url: "https://www.lbank.com/support"
  },
  {
    platform: "BloFin",
    platformId: 9,
    url: "https://blofin.com/en/support/Announcement/Latest-Promotions"
  },
  {
    platform: "Bitunix Pro",
    platformId: 10,
    url: "https://www.bitunix.com/activity/act-center"
  }
];

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function escapeSqlText(value = "") {
  return String(value).replace(/'/g, "''");
}

function makeSlug(platform, title) {
  return `${platform}-${title}`
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function isLikelyEvent(title, text) {
  const source = `${title} ${text}`.toLowerCase();

  const eventWords = [
    "campaign",
    "event",
    "reward",
    "rewards",
    "bonus",
    "competition",
    "challenge",
    "airdrop",
    "giveaway",
    "trade",
    "trading",
    "usdt",
    "usdc",
    "مكاف",
    "حدث",
    "حملة",
    "تحدي",
    "مسابقة"
  ];

  return eventWords.some((word) =>
    source.includes(word)
  );
}

function extractDateRange(text) {
  const cleaned = cleanText(text);

  const months =
    "(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";

  const englishRange = new RegExp(
    `${months}\\s+\\d{1,2}[^-–—]{0,40}[-–—]\\s*${months}\\s+\\d{1,2}[^\\d]{0,20}\\d{4}`,
    "i"
  );

  const match = cleaned.match(englishRange);

  return match ? match[0] : null;
}

function extractReward(text) {
  const cleaned = cleanText(text);

  const patterns = [
    /(?:up to|share|prize pool|rewards?)[^$]{0,50}\$\s?[\d,.]+\s?(?:USDT|USDC|USD|BTC)?/i,
    /[\d,.]+\s?(?:USDT|USDC|USD)\s+(?:prize pool|rewards?)/i,
    /(?:حتى|مكافآت|جوائز)[^0-9]{0,30}[\d,.]+\s?(?:USDT|USDC|USD|دولار)/i
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);

    if (match) {
      return match[0];
    }
  }

  return null;
}

function extractVolume(text) {
  const cleaned = cleanText(text);

  const patterns = [
    /(?:trading volume|trade volume|volume)[^0-9]{0,25}([\d,.]+)\s?(?:USDT|USDC|USD)/i,
    /(?:حجم التداول)[^0-9]{0,25}([\d,.]+)\s?(?:USDT|USDC|USD)/i
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);

    if (match) {
      return Number(
        match[1].replace(/,/g, "")
      );
    }
  }

  return null;
}

function extractDeposit(text) {
  const cleaned = cleanText(text);

  const patterns = [
    /(?:deposit|deposit at least)[^0-9]{0,25}([\d,.]+)\s?(?:USDT|USDC|USD)/i,
    /(?:إيداع|الإيداع)[^0-9]{0,25}([\d,.]+)\s?(?:USDT|USDC|USD)/i
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);

    if (match) {
      return Number(
        match[1].replace(/,/g, "")
      );
    }
  }

  return null;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 CryptoEventsMonitor/1.0",
      Accept:
        "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} from ${url}`
    );
  }

  return await response.text();
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
        .replace(/&nbsp;/g, " ");

    links.push({
      url: href,
      text: cleanText(text)
    });
  }

  return links;
}

function findImage(html, url) {
  const imagePatterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<img[^>]+src=["']([^"']+)["']/i
  ];

  for (const pattern of imagePatterns) {
    const match = html.match(pattern);

    if (!match) continue;

    try {
      return new URL(
        match[1],
        url
      ).toString();
    } catch {
      continue;
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
      "SUPABASE_SERVICE_ROLE_KEY is not configured"
    );
  }

  const response = await fetch(
    `${SUPABASE_URL}${path}`,
    {
      ...options,
      headers: {
        apikey: SUPABASE_KEY,
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
        data?.details ||
        `Supabase error ${response.status}`
    );
  }

  return data;
}

async function getExistingSlugs() {
  const rows = await supabaseRequest(
    "/rest/v1/events?select=slug"
  );

  return new Set(
    Array.isArray(rows)
      ? rows.map((row) => row.slug)
      : []
  );
}

async function createEvent(event) {
  return supabaseRequest(
    "/rest/v1/events",
    {
      method: "POST",
      headers: {
        Prefer: "return=representation"
      },
      body: JSON.stringify(event)
    }
  );
}

async function scanSource(source) {
  const html =
    await fetchHtml(source.url);

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

  const candidates = [];

  for (const link of links) {
    if (!link.text) continue;

    if (
      link.url === source.url ||
      link.text.length < 8
    ) {
      continue;
    }

    if (
      link.url.includes("/support/") === false &&
      link.url.includes("/article") === false &&
      link.url.includes("/campaign") === false &&
      link.url.includes("/activity") === false &&
      link.url.includes("/announcements/") === false &&
      link.url.includes("/news/") === false
    ) {
      continue;
    }

    if (
      !isLikelyEvent(
        link.text,
        ""
      )
    ) {
      continue;
    }

    candidates.push({
      title: link.text,
      url: link.url,
      imageUrl: sourceImage
    });
  }

  /*
    إزالة التكرار.
  */
  const unique =
    new Map();

  for (const candidate of candidates) {
    unique.set(
      candidate.url,
      candidate
    );
  }

  return [
    ...unique.values()
  ].slice(0, 20);
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

    const results = [];
    const created = [];

    for (const source of SOURCES) {
      try {
        const candidates =
          await scanSource(source);

        let added = 0;

        for (const candidate of candidates) {
          const slug =
            makeSlug(
              source.platform,
              candidate.title
            );

          if (
            !slug ||
            existingSlugs.has(slug)
          ) {
            continue;
          }

          const event = {
            slug,
            platform_id:
              source.platformId,

            title_ar:
              candidate.title,

            title_en:
              candidate.title,

            description_ar:
              "تم اكتشاف هذا الحدث تلقائيًا من المصدر الرسمي. سيتم تحديث التفاصيل تلقائيًا.",

            description_en:
              "This event was automatically discovered from the official source.",

            reward_ar:
              extractReward(candidate.title),

            reward_en:
              extractReward(candidate.title),

            event_type:
              "discovered",

            /*
              نبدأ كـ upcoming حتى يتم
              استخراج المواعيد والتحقق منها.
            */
            status:
              "upcoming",

            start_at:
              new Date().toISOString(),

            end_at:
              new Date(
                Date.now() +
                  24 *
                    60 *
                    60 *
                    1000
              ).toISOString(),

            official_url:
              candidate.url,

            volume_required:
              extractVolume(
                candidate.title
              ),

            deposit_required:
              extractDeposit(
                candidate.title
              ),

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
              candidate.imageUrl,

            source_url:
              source.url,

            last_verified_at:
              new Date().toISOString(),

            priority:
              10
          };

          try {
            const inserted =
              await createEvent(
                event
              );

            created.push({
              platform:
                source.platform,

              slug,
              title:
                candidate.title,

              result:
                inserted
            });

            existingSlugs.add(
              slug
            );

            added++;
          } catch (insertError) {
            console.warn(
              `Failed to add ${slug}:`,
              insertError.message
            );
          }
        }

        results.push({
          platform:
            source.platform,
          candidates:
            candidates.length,
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
      error: error.message
    });
  }
}