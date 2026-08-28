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

const AFFILIATES = {
  bybit: {
    url: "https://partner.bybit.com/b/165247",
    code: "165247"
  },
  binance: {
    url: "https://www.binance.com/ar/activity/referral-entry/CPA?ref=CPA_00971H3C6O",
    code: "CPA_00971H3C6O"
  },
  bitget: {
    url: "https://partner.bitget.com/bg/HUPJG5",
    code: "HUPJG5"
  },
  okx: {
    url: "https://okx.com/join/42167890",
    code: "42167890"
  },
  "gate.io": {
    url: "https://www.gate.com/share/awcxxqhx",
    code: "awcxxqhx"
  },
  mexc: {
    url: "https://www.mexc.com/register?inviteCode=1Z93d",
    code: "1Z93d"
  },
  weex: {
    url: "https://weex.com/register?vipCode=kqjq",
    code: "kqjq"
  },
  lbank: {
    url: "https://www.lbank.com/ref/59YQY",
    code: "59YQY"
  },
  blofin: {
    url: "https://partner.blofin.com/d/Elkateba",
    code: "Elkateba"
  },
  "bitunix pro": {
    url: "https://www.bitunix.com/register?vipCode=uGre",
    code: "uGre"
  }
};

const TIMEOUT_MS = 10000;
const MAX_CANDIDATES_PER_PLATFORM = 5;

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

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(platform, title) {
  return `${platform}-${title}`
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function getAffiliate(platform) {
  return (
    AFFILIATES[
      String(platform).trim().toLowerCase()
    ] || {
      url: null,
      code: null
    }
  );
}

function getStatus(start, end) {
  const now = new Date();

  if (now < start) {
    return "upcoming";
  }

  if (now > end) {
    return "ended";
  }

  return "active";
}

async function fetchWithTimeout(url) {
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
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CryptoEventsSync/1.0",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      url: response.url,
      text
    };
  } finally {
    clearTimeout(timer);
  }
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
        decodeHtml(match[1])
      );
    }
  }

  return null;
}

function getTitle(html) {
  return (
    getMeta(html, "og:title") ||
    cleanText(
      stripHtml(
        html.match(
          /<title[^>]*>([\s\S]*?)<\/title>/i
        )?.[1] || ""
      )
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

function get