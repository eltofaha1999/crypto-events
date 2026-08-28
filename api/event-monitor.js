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

function isLikelyEvent(text = "") {
  const source = text.toLowerCase();

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
    "مكاف",
    "حملة",
    "حدث",
    "تحدي",
    "مسابقة"
  ];

  return keywords.some((keyword) =>
    source.includes(keyword)
  );
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CryptoEventsMonitor/1.0",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Source returned HTTP ${response.status}`
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
      href.startsWith("javascript:") ||
      href.startsWith("mailto:")
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

    const text = cleanText(
      match[2]
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
    );

    if (!text || text.length < 8) {
      continue;
    }

    links.push({
      title: text,
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

    if (!match) {
      continue;
    }

    try {
      return new URL(
        match[1],
        pageUrl
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
      `Supabase error ${response.status}`
    );
  }

  return data;
}

async function getPlatformMap() {
  const rows = await supabaseRequest(
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

async function insertEvent(event) {
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

function buildCandidate(source, platformId, candidate) {
  const slug = makeSlug(
    source.platform,
    candidate.title
  );

  return {
    slug,

    platform_id: platformId,

    title_ar: candidate.title,
    title_en: candidate.title,

    description_ar:
      "تم اكتشاف هذا الحدث من المصدر الرسمي. سيتم التحقق من تفاصيل المكافأة والشروط والمواعيد قبل اعتماده للنشر.",

    description_en:
      "This event was discovered from the official source and will be verified before publication.",

    reward_ar:
      "سيتم التحقق من المكافأة من المصدر الرسمي.",
    reward_en:
      "Reward will be verified from the official source.",

    event_type: "discovered",

    /*
      لا نعتبر الحدث نشطًا بمجرد العثور على عنوانه.
      يبقى upcoming إلى أن يتم التحقق من تفاصيله.
    */
    status: "upcoming",

    start_at: new Date().toISOString(),

    end_at:
      new Date(
        Date.now() +
          24 * 60 * 60 * 1000
      ).toISOString(),

    official_url: candidate.url,

    volume_required: null,
    deposit_required: null,
    trade_type: null,
    min_trade: null,

    new_users_only: false,
    existing_users_allowed: true,
    kyc_required: false,

    region_restrictions: null,

    registration_required: true,

    distribution_date: null,
    distribution_method: null,

    affiliate_url: null,
    affiliate_code: null,

    image_url:
      candidate.imageUrl || null,

    source_url: source.url,

    last_verified_at:
      new Date().toISOString(),

    priority: 10,

    task_rewards: null
  };
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
    const platformMap =
      await getPlatformMap();

    const existingSlugs =
      await getExistingSlugs();

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
            platform: source.platform,
            candidates: 0,
            added: 0,
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

        const imageUrl =
          findImage(
            html,
            source.url
          );

        const candidates =
          links.filter((link) =>
            isLikelyEvent(
              link.title
            )
          );

        let added = 0;

        for (const candidate of candidates.slice(
          0,
          20
        )) {
          const