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

const TIMEOUT_MS = 12000;

function cleanText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function slugify(platform, title) {
  return `${platform}-${title}`
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
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
          "Mozilla/5.0 (compatible; CryptoEventsMonitor/2.0)",
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
      match[2]
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
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

    if (!match) continue;

    try {
      return new URL(match[1], pageUrl).toString();
    } catch {
      return null;
    }
  }

  return null;
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

async function getPlatforms() {
  const rows = await supabaseRequest(
    "/rest/v1/platforms?select=id,name,is_active&is_active=eq.true&order=id"
  );

  const map = new Map();

  for (const row of rows || []) {
    map.set(
      String(row.name).trim().toLowerCase(),
      Number(row.id)
    );
  }

  return map;
}

async function getExistingSlugs() {
  const rows = await supabaseRequest(
    "/rest/v1/events?select=slug"
  );

  return new Set(
    (rows || []).map((row) => row.slug)
  );
}

async function updateSync({
  platformId,
  status,
  candidatesFound,
  newEventsFound,
  lastError
}) {
  const now = new Date().toISOString();

  const payload = {
    platform_id: platformId,
    last_checked_at: now,
    status,
    candidates_found: candidatesFound || 0,
    new_events_found: newEventsFound || 0,
    last_error: lastError || null,
    updated_at: now
  };

  if (status === "success") {
    payload.last_success_at = now;
  }

  await supabaseRequest(
    "/rest/v1/event_source_sync?on_conflict=platform_id",
    {
      method: "POST",
      headers: {
        Prefer:
          "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(payload)
    }
  );
}

async function verifyEvent(url) {
  const response = await fetchPage(url);

  if (!response.ok) {
    return {
      success: false,
      error:
        `HTTP ${response.status}`
    };
  }

  const html = response.text;

  const title =
    cleanText(
      html.match(
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
      )?.[1] ||
      html.match(
        /<title[^>]*>([\s\S]*?)<\/title>/i
      )?.[1] ||
      ""
    );

  const description =
    cleanText(
      html.match(
        /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i
      )?.[1] || ""
    );

  const imageUrl =
    findImage(
      html,
      response.url
    );

  const visibleText =
    cleanText(
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

  const rewardMatches =
    visibleText.match(
      /(?:up to|prize pool|reward pool|rewards?|bonus|حتى|جوائز|مكافآت?)[^$0-9]{0,80}\$?\s?[\d,.]+\s?(?:USDT|USDC|USD|دولار)?/gi
    ) || [];

  const volumeMatch =
    visibleText.match(
      /(?:trading volume|trade volume|volume|حجم التداول)[^0-9]{0,50}([\d,.]+)\s?(?:USDT|USDC|USD)/i
    );

  const depositMatch =
    visibleText.match(
      /(?:deposit|minimum deposit|إيداع|الإيداع)[^0-9]{0,50}([\d,.]+)\s?(?:USDT|USDC|USD)/i
    );

  const tradeType =
    /copy trading/i.test(visibleText)
      ? "Copy Trading"
      : /futures|perpetual/i.test(visibleText)
      ? "Futures"
      : /spot/i.test(visibleText)
      ? "Spot"
      : null;

  let score = 0;

  if (title) score += 25;
  if (description) score += 10;
  if (imageUrl) score += 10;
  if (rewardMatches.length) score += 20;
  if (volumeMatch) score += 15;
  if (depositMatch) score += 10;
  if (tradeType) score += 10;

  return {
    success: true,
    title: title || null,
    description: description || null,
    imageUrl,
    rewards: [
      ...new Set(rewardMatches)
    ].slice(0, 10),
    volumeRequired:
      volumeMatch
        ? Number(
            volumeMatch[1].replace(/,/g, "")
          )
        : null,
    depositRequired:
      depositMatch
        ? Number(
            depositMatch[1].replace(/,/g, "")
          )
        : null,
    tradeType,
    score,
    verified: score >= 70
  };
}

async function updateEvent(eventId, data) {
  const payload = {
    title_ar:
      data.title || undefined,

    title_en:
      data.title || undefined,

    description_ar:
      data.description || undefined,

    description_en:
      data.description || undefined,

    reward_ar:
      data.rewards?.[0] || undefined,

    reward_en:
      data.rewards?.[0] || undefined,

    image_url:
      data.imageUrl || null,

    volume_required:
      data.volumeRequired,

    deposit_required:
      data.depositRequired,

    trade_type:
      data.tradeType,

    last_verified_at:
      new Date().toISOString()
  };

  Object.keys(payload).forEach(
    (key) => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    }
  );

  await supabaseRequest(
    `/rest/v1/events?id=eq.${eventId}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=minimal"
      },
      body: JSON.stringify(payload)
    }
  );
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const platforms =
      await getPlatforms();

    const existingSlugs =
      await getExistingSlugs();

    const report = {
      success: true,
      checked: 0,
      reachable: 0,
      verified: 0,
      newEvents: 0,
      failed: 0,
      sources: []
    };

    for (const source of SOURCES) {
      report.checked++;

      const platformId =
        platforms.get(
          source.platform.toLowerCase()
        );

      if (!platformId) {
        report.failed++;

        report.sources.push({
          platform:
            source.platform,
          success: false,
          error:
            "Platform not found"
        });

        continue;
      }

      try {
        const page =
          await fetchPage(
            source.url
          );

        if (!page.ok) {
          const errorMessage =
            `HTTP ${page.status}`;

          report.failed++;

          await updateSync({
            platformId,
            status: "error",
            candidatesFound: 0,
            newEventsFound: 0,
            lastError: errorMessage
          });

          report.sources.push({
            platform:
              source.platform,
            success: false,
            error:
              errorMessage
          });

          continue;
        }

        report.reachable++;

        const links =
          extractLinks(
            page.text,
            source.url
          );

        const candidates =
          links.filter((item) =>
            looksLikeEvent(
              item.title
            )
          );

        let verifiedCount = 0;
        let newCount = 0;

        const verifiedEvents = [];

        /*
          نفحص عددًا محدودًا
          حتى لا تتجاوز الوظيفة المهلة.
        */
        for (
          const candidate of candidates.slice(0, 5)
        ) {
          try {
            const verified =
              await verifyEvent(
                candidate.url
              );

            if (
              !verified.success ||
              !verified.verified
            ) {
              continue;
            }

            verifiedCount++;

            const slug =
              slugify(
                source.platform,
                candidate.title
              );

            const existing =
              existingSlugs.has(slug);

            verifiedEvents.push({
              title:
                candidate.title,
              url:
                candidate.url,
              slug,
              score:
                verified.score,
              imageUrl:
                verified.imageUrl,
              rewards:
                verified.rewards,
              volumeRequired:
                verified.volumeRequired,
              depositRequired:
                verified.depositRequired,
              tradeType:
                verified.tradeType,
              existing
            });

            if (existing) {
              /*
                تحديث الحدث الموجود
                يحتاج event id، لذلك نبحث عنه.
              */
              const rows =
                await supabaseRequest(
                  `/rest/v1/events?slug=eq.${encodeURIComponent(
                    slug
                  )}&select=id&limit=1`
                );

              if (
                Array.isArray(rows) &&
                rows[0]
              ) {
                await updateEvent(
                  rows[0].id,
                  verified
                );
              }
            } else {
              /*
                لا نضيفه تلقائيًا هنا.
                فقط نعلّمه كـNew Verified Candidate.
              */
              newCount++;
            }
          } catch (verifyError) {
            console.warn(
              `${source.platform} verification failed:`,
              verifyError.message
            );
          }
        }

        report.verified +=
          verifiedCount;

        report.newEvents +=
          newCount;

        await updateSync({
          platformId,
          status: "success",
          candidatesFound:
            candidates.length,
          newEventsFound:
            newCount,
          lastError: null
        });

        report.sources.push({
          platform:
            source.platform,
          success: true,
          candidates:
            candidates.length,
          checkedCandidates:
            Math.min(
              candidates.length,
              5
            ),
          verified:
            verifiedCount,
          newVerified:
            newCount,
          events:
            verifiedEvents
        });
      } catch (sourceError) {
        report.failed++;

        const message =
          sourceError.name === "AbortError"
            ? "Request timeout"
            : sourceError.message;

        await updateSync({
          platformId,
          status: "error",
          candidatesFound: 0,
          newEventsFound: 0,
          lastError: message
        });

        report.sources.push({
          platform:
            source.platform,
          success: false,
          error:
            message
        });
      }
    }

    return res.status(200).json(report);
  } catch (error) {
    console.error(
      "Monitor error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error.message
    });
  }
}