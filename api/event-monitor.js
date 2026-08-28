const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

const SOURCES = [
  ["Bybit", "https://announcements.bybit.com/en/"],
  ["Binance", "https://www.binance.com/en/support/announcement/list/93"],
  ["Bitget", "https://www.bitget.com/support"],
  ["OKX", "https://www.okx.com/campaigns"],
  ["Gate.io", "https://www.gate.com/announcements"],
  ["MEXC", "https://www.mexc.com/announcements/all"],
  ["WEEX", "https://www.weex.com/news"],
  ["LBank", "https://www.lbank.com/support"],
  ["BloFin", "https://blofin.com/en/support/Announcement/Latest-Promotions"],
  ["Bitunix Pro", "https://www.bitunix.com/activity/act-center"]
];

const TIMEOUT = 8000;

async function supabase(path, options = {}) {
  if (!SUPABASE_URL) {
    throw new Error("SUPABASE_URL is not configured");
  }

  if (!SUPABASE_KEY) {
    throw new Error("SUPABASE_PUBLISHABLE_KEY is not configured");
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

async function fetchWithTimeout(url) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, TIMEOUT);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "CryptoEventsMonitor/1.0",
        Accept: "text/html,application/xhtml+xml"
      }
    });

    return {
      status: response.status,
      ok: response.ok
    };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const platforms = await supabase(
      "/rest/v1/platforms?select=id,name&is_active=eq.true&order=id"
    );

    const platformMap = new Map(
      (platforms || []).map((item) => [
        String(item.name).trim().toLowerCase(),
        item.id
      ])
    );

    const results = [];

    // نفحص المنصات بشكل متوازي وبحد أقصى طلب واحد لكل منصة.
    await Promise.all(
      SOURCES.map(async ([name, url]) => {
        const platformId = platformMap.get(
          name.toLowerCase()
        );

        if (!platformId) {
          results.push({
            platform: name,
            success: false,
            error: "Platform not found"
          });
          return;
        }

        try {
          const result = await fetchWithTimeout(url);

          results.push({
            platform: name,
            platformId,
            success: result.ok,
            status: result.status
          });
        } catch (error) {
          results.push({
            platform: name,
            platformId,
            success: false,
            error:
              error.name === "AbortError"
                ? "Request timeout"
                : error.message
          });
        }
      })
    );

    results.sort(
      (a, b) => Number(a.platformId) - Number(b.platformId)
    );

    return res.status(200).json({
      success: true,
      checked: SOURCES.length,
      reachable: results.filter(
        (item) => item.success
      ).length,
      failed: results.filter(
        (item) => !item.success
      ).length,
      results
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}