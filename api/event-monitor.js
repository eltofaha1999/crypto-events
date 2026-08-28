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

const TIMEOUT_MS = 12000;
const CANDIDATES_PER_SOURCE = 8;

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function htmlDecode(value = "") {
  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(value = "") {
  return htmlDecode(
    String(value)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function slugify(platform, title) {
  return `${platform}-${title}`
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function getAffiliate(platform) {
  return AFFILIATES[
    String(platform).trim().toLowerCase()
  ] || {
    url: null,
    code: null
  };
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
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 CryptoEventsBot/3.0",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    const html = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      html
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
      return cleanText(match[1]);
    }
  }

  return null;
}

function extractTitle(html) {
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

function extractDescription(html) {
  return (
    getMeta(html, "og:description") ||
    getMeta(html, "description") ||
    null
  );
}

function extractImage(html, pageUrl) {
  const image =
    getMeta(html, "og:image") ||
    getMeta(html, "twitter:image");

  if (!image) {
    return null;
  }

  try {
    return new URL(image, pageUrl).toString();
  } catch {
    return null;
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

  return links;
}

function looksLikeEvent(title = "") {
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
    "reward hub",
    "مكاف",
    "حملة",
    "حدث",
    "تحدي",
    "مسابقة"
  ];

  return keywords.some((word) =>
    value.includes(word)
  );
}

function parseMonthDate(value) {
  if (!value) return null;

  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed);
}

function extractDateRange(text) {
  const month =
    "(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";

  const patterns = [
    new RegExp(
      `(${month}\\s+\\d{1,2}(?:,?\\s*\\d{4})(?:[^\\d]{0,20}\\d{1,2}:\\d{2}\\s*(?:AM|PM)?)?)\\s*(?:-|–|—|to|until)\\s*(${month}\\s+\\d{1,2}(?:,?\\s*\\d{4})(?:[^\\d]{0,20}\\d{1,2}:\\d{2}\\s*(?:AM|PM)?)?)`,
      "i"
    ),

    /(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2})?)\s*(?:-|–|—|to|until)\s*(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2})?)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    const start = parseMonthDate(match[1]);
    const end = parseMonthDate(match[2]);

    if (start && end && end > start) {
      return {
        start,
        end,
        startText: match[1],
        endText: match[2]
      };
    }
  }

  return null;
}

function extractReward(text) {
  const patterns = [
    /(?:up to|prize pool|reward pool|total rewards?|rewards?|bonus)[^$]{0,100}\$[\d,.]+\s*(?:USDT|USDC|USD)?/i,
    /\$[\d,.]+\s*(?:USDT|USDC|USD)\b/i,
    /[\d,.]+\s*(?:USDT|USDC)\s*(?:prize pool|reward pool|rewards?)?/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[0]) {
      return cleanText(match[0]);
    }
  }

  return null;
}

function extractVolume(text) {
  const patterns = [
    /(?:trading volume|trade volume|volume)[^0-9]{0,60}([\d,.]+)\s*(?:USDT|USDC|USD)/i,
    /(?:حجم التداول)[^0-9]{0,60}([\d,.]+)\s*(?:USDT|USDC|USD)/i
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
    /(?:minimum deposit|deposit at least|deposit)[^0-9]{0,60}([\d,.]+)\s*(?:USDT|USDC|USD)/i,
    /(?:الإيداع المطلوب|الإيداع|إيداع)[^0-9]{0,60}([\d,.]+)\s*(?:USDT|USDC|USD)/i
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

  if (
    value.includes("existing users only")
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
  const rewards = [];

  const lines = text.split(/[.!?\n]+/);

  for (const line of lines) {
    const clean = cleanText(line);

    if (!clean) continue;

    if (
      /(earn|reward|bonus|receive|get|ربح|مكافأة)/i.test(
        clean
      ) &&
      /\d/.test(clean)
    ) {
      rewards.push(clean.slice(0, 300));
    }
  }

  return [
    ...new Set(rewards)
  ].slice(0, 20);
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

async function getPlatforms() {
  const rows = await supabaseGet(
    "/rest/v1/platforms?select=id,name,is_active&is_active=eq.true&order=id"
  );

  const map = new Map();

  for (const row of rows || []) {
    map.set(
      String(row.name)
        .trim()
       