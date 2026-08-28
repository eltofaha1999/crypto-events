	const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 CryptoEventsVerifier/1.0";

const TIMEOUT_MS = 15000;

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
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    const html = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      url: response.url,
      html
    };
  } finally {
    clearTimeout(timer);
  }
}

function getMeta(html, name) {
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${name}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${name}["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`,
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

function extractTitle(html) {
  const ogTitle =
    getMeta(html, "og:title");

  if (ogTitle) {
    return ogTitle;
  }

  const titleMatch =
    html.match(
      /<title[^>]*>([\s\S]*?)<\/title>/i
    );

  return titleMatch
    ? cleanText(
        stripHtml(titleMatch[1])
      )
    : null;
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
    return new URL(
      image,
      pageUrl
    ).toString();
  } catch {
    return null;
  }
}

function extractPageText(html) {
  return cleanText(
    stripHtml(html)
  );
}

function extractMoneyMatches(text) {
  const patterns = [
    /(?:up to|prize pool|reward pool|rewards?|bonus)[^$]{0,80}\$?\s?[\d,.]+\s?(?:USDT|USDC|USD|BTC|ETH)?/gi,
    /[\d,.]+\s?(?:USDT|USDC|USD)\b/gi,
    /[\d,.]+\s?(?:دولار|USDT|USDC)/gi
  ];

  const found = new Set();

  for (const pattern of patterns) {
    const matches =
      text.match(pattern) || [];

    for (const item of matches) {
      const value = cleanText(item);

      if (value.length < 3) {
        continue;
      }

      found.add(value);
    }
  }

  return [...found].slice(0, 20);
}

function extractVolume(text) {
  const patterns = [
    /(?:trading volume|trade volume|volume)[^0-9]{0,50}([\d,.]+)\s?(?:USDT|USDC|USD)/i,
    /(?:حجم التداول)[^0-9]{0,50}([\d,.]+)\s?(?:USDT|USDC|USD)/i
  ];

  for (const pattern of patterns) {
    const match =
      text.match(pattern);

    if (!match) {
      continue;
    }

    const number =
      Number(
        match[1].replace(/,/g, "")
      );

    if (
      Number.isFinite(number)
    ) {
      return number;
    }
  }

  return null;
}

function extractDeposit(text) {
  const patterns = [
    /(?:deposit|deposit at least|minimum deposit)[^0-9]{0,50}([\d,.]+)\s?(?:USDT|USDC|USD)/i,
    /(?:إيداع|الإيداع|حد أدنى للإيداع)[^0-9]{0,50}([\d,.]+)\s?(?:USDT|USDC|USD)/i
  ];

  for (const pattern of patterns) {
    const match =
      text.match(pattern);

    if (!match) {
      continue;
    }

    const number =
      Number(
        match[1].replace(/,/g, "")
      );

    if (
      Number.isFinite(number)
    ) {
      return number;
    }
  }

  return null;
}

function extractDates(text) {
  const results = {
    start: null,
    end: null
  };

  const patterns = [
    /(?:from|starting|starts|beginning)\s+([A-Z][a-z]+\s+\d{1,2}(?:,\s*|\s+)\d{4})[^.]{0,60}?(?:to|until|through)\s+([A-Z][a-z]+\s+\d{1,2}(?:,\s*|\s+)\d{4})/i,
    /(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})\s*(?:-|–|—|to|إلى)\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/i
  ];

  for (const pattern of patterns) {
    const match =
      text.match(pattern);

    if (!match) {
      continue;
    }

    results.start = match[1];
    results.end = match[2];

    return results;
  }

  return results;
}

function detectEligibility(text) {
  const value =
    text.toLowerCase();

  if (
    value.includes("new users only") ||
    value.includes("new users")
  ) {
    return "المستخدمون الجدد فقط";
  }

  if (
    value.includes("existing users only")
  ) {
    return "المستخدمون الحاليون فقط";
  }

  if (
    value.includes("all users") ||
    value.includes("all eligible users")
  ) {
    return "جميع المستخدمين المؤهلين";
  }

  if (
    value.includes("مستخدمين جدد") ||
    value.includes("المستخدمين الجدد")
  ) {
    return "المستخدمون الجدد فقط";
  }

  return "يحتاج إلى تحقق";
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
    value.includes("futures") ||
    value.includes("perpetual")
  ) {
    return "Futures";
  }

  if (
    value.includes("spot")
  ) {
    return "Spot";
  }

  return null;
}

function extractTaskRewards(text) {
  const tasks = [];

  const lines =
    text.split(
      /[.!?\n]+/
    );

  for (const line of lines) {
    const clean =
      cleanText(line);

    if (!clean) {
      continue;
    }

    const rewardMatch =
      clean.match(
        /(?:earn|reward|bonus|receive|get|ربح|مكافأة)[^$0-9]{0,40}\$?\s?[\d,.]+\s?(?:USDT|USDC|USD|دولار)?/i
      );

    if (
      rewardMatch
    ) {
      tasks.push(
        clean.slice(0, 300)
      );
    }
  }

  return [
    ...new Set(tasks)
  ].slice(0, 20);
}

function calculateVerification(data) {
  let score = 0;

  if (data.title) score += 20;
  if (data.description) score += 10;
  if (data.imageUrl) score += 10;
  if (data.rewardMatches.length) score += 15;
  if (data.startDateText) score += 10;
  if (data.endDateText) score += 10;
  if (data.volumeRequired !== null) score += 10;
  if (data.depositRequired !== null) score += 5;
  if (data.tradeType) score += 5;
  if (data.taskRewards.length) score += 5;

  return {
    score,
    verified:
      score >= 70
  };
}

async function verifyEvent(url) {
  const page =
    await fetchPage(url);

  if (!page.ok) {
    return {
      success: false,
      error:
        `Source returned HTTP ${page.status}`
    };
  }

  const text =
    extractPageText(
      page.html
    );

  const dates =
    extractDates(text);

  const result = {
    success: true,

    finalUrl:
      page.url,

    title:
      extractTitle(
        page.html
      ),

    description:
      extractDescription(
        page.html
      ),

    imageUrl:
      extractImage(
        page.html,
        page.url
      ),

    rewardMatches:
      extractMoneyMatches(
        text
      ),

    volumeRequired:
      extractVolume(text),

    depositRequired:
      extractDeposit(text),

    tradeType:
      detectTradeType(text),

    eligibility:
      detectEligibility(text),

    startDateText:
      dates.start,

    endDateText:
      dates.end,

    taskRewards:
      extractTaskRewards(
        text
      ),

    sourceUrl:
      page.url,

    verifiedAt:
      new Date().toISOString(),

    textSample:
      text.slice(0, 2000)
  };

  return {
    ...result,
    verification:
      calculateVerification(
        result
      )
  };
}

async function getEvent(eventId) {
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
      `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(
        eventId
      )}&select=*`,
      {
        method: "GET",
        headers: {
          apikey:
            SUPABASE_KEY,
          Authorization:
            `Bearer ${SUPABASE_KEY}`,
          "Content-Type":
            "application/json"
        }
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data?.message ||
      data?.details ||
      `Supabase HTTP ${response.status}`
    );
  }

  return data?.[0] || null;
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
      error:
        "Method not allowed"
    });
  }

  try {
    let url = null;
    let eventId = null;

    if (req.method === "GET") {
      url =
        typeof req.query?.url ===
        "string"
          ? req.query.url
          : null;

      eventId =
        req.query?.eventId
          ? Number(
              req.query.eventId
            )
          : null;
    }

    if (req.method === "POST") {
      const body =
        req.body || {};

      url =
        typeof body.url ===
        "string"
          ? body.url
          : null;

      eventId =
        body.eventId
          ? Number(
              body.eventId
            )
          : null;
    }

    /*
      لو مررنا eventId،
      نجيب رابط الحدث من Supabase.
    */

    if (!url && eventId) {
      const event =
        await getEvent(
          eventId
        );

      if (!event) {
        return res.status(404).json({
          success: false,
          error:
            "Event not found"
        });
      }

      url =
        event.official_url;
    }

    if (!url) {
      return res.status(400).json({
        success: false,
        error:
          "Provide ?url=EVENT_URL or ?eventId=EVENT_ID"
      });
    }

    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        error:
          "Invalid event URL"
      });
    }

    const result =
      await verifyEvent(url);

    return res.status(
      result.success
        ? 200
        : 502
    ).json(result);

  } catch (error) {
    console.error(
      "Event verifier error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error.message
    });
  }
}