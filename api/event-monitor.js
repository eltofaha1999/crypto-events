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

async function fetchWithTimeout(url, timeoutMs = 12000) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CryptoEventsBot/1.0)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      text
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractLinks(html, baseUrl) {
  const results = [];

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
      match[2]
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
    );

    if (!title || title.length < 8) {
      continue;
    }

    results.push({
      title,
      url: href
    });
  }

  return results;
}

function looksLikeEvent(title) {
  const value = title.toLowerCase();

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
    value.includes(keyword)
  );
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
      return new URL(match[1], pageUrl).toString();
    } catch {
      return null;
    }
  }

  return null;
}

async function supabaseGet(path) {
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
      method: "GET",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json"
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

async function getPlatformMap() {
  const rows = await supabaseGet(
    "/rest/v1/platforms?select=id,name&is_active=eq.true"
  );

  const map = {};

  for (const row of rows || []) {
    map[String(row.name).toLowerCase()] = row.id;
  }

  return map;
}

async function getExistingSlugs() {
  const rows = await supabaseGet(
    "/rest/v1/events?select=slug"
  );

  return new Set(
    (rows || []).map((row) => row.slug)
  );
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  const report = {
    success: true,
    checked: 0,
    reachable: 0,
    failed: 0,
    totalCandidates: 0,
    newCandidates: 0,
    sources: []
  };

  try {
    const platformMap = await getPlatformMap();
    const existingSlugs = await getExistingSlugs();

    for (const source of SOURCES) {
      report.checked++;

      try {
        const platformId =
          platformMap[source.platform.toLowerCase()];

        if (!platformId) {
          report.failed++;

          report.sources.push({
            platform: source.platform,
            success: false,
            error: "Platform not found in Supabase"
          });

          continue;
        }

        const response = await fetchWithTimeout(
          source.url
        );

        if (!response.ok) {
          report.failed++;

          report.sources.push({
            platform: source.platform,
            success: false,
            status: response.status,
            candidates: 0,
            newCandidates: 0
          });

          continue;
        }

        report.reachable++;

        const links = extractLinks(
          response.text,
          source.url
        );

        const candidates = links.filter((item) =>
          looksLikeEvent(item.title)
        );

        let newCandidates = 0;
        const items = [];

        for (const item of candidates.slice(0, 20)) {
          const slug =
            `${source.platform}-${item.title}`
              .toLowerCase()
              .replace(/[^a-z0-9\u0600-\u06ff]+/gi, "-")
              .replace(/^-+|-+$/g, "")
              .slice(0, 180);

          const isNew =
            slug &&
            !existingSlugs.has(slug);

          if (isNew) {
            newCandidates++;
          }

          items.push({
            title: item.title,
            url: item.url,
            slug,
            platformId
          });
        }

        report.totalCandidates +=
          candidates.length;

        report.newCandidates +=
          newCandidates;

        report.sources.push({
          platform: source.platform,
          success: true,
          candidates: candidates.length,
          newCandidates,
          items
        });
      } catch (error) {
        report.failed++;

        report.sources.push({
          platform: source.platform,
          success: false,
          error:
            error.name === "AbortError"
              ? "Request timeout"
              : error.message
        });
      }
    }

    return res.status(200).json(report);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      partialReport: report
    });
  }
}