const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

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

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const platforms = await supabaseGet(
      "/rest/v1/platforms?select=id,name,is_active&is_active=eq.true&order=id"
    );

    const events = await supabaseGet(
      "/rest/v1/events?select=id,slug,platform_id,title_ar,status,start_at,end_at,image_url&order=id&limit=20"
    );

    return res.status(200).json({
      success: true,
      platformsCount: Array.isArray(platforms)
        ? platforms.length
        : 0,
      eventsCount: Array.isArray(events)
        ? events.length
        : 0,
      platforms,
      events
    });
  } catch (error) {
    console.error("Event sync test error:", error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}