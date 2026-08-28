const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

function getSupabaseHeaders() {
  if (!SUPABASE_KEY) {
    throw new Error("SUPABASE_PUBLISHABLE_KEY is not configured");
  }

  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json"
  };
}

async function supabaseGet(path) {
  if (!SUPABASE_URL) {
    throw new Error("SUPABASE_URL is not configured");
  }

  const response = await fetch(
    `${SUPABASE_URL}${path}`,
    {
      method: "GET",
      headers: getSupabaseHeaders()
    }
  );

  const text = await response.text();

  let data;

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

  const result = {
    success: true,
    supabase: {
      connected: false
    },
    platforms: {
      connected: false,
      count: 0,
      data: []
    },
    events: {
      connected: false,
      count: 0,
      data: []
    }
  };

  try {
    // 1) اختبار الاتصال بـ Supabase
    const platforms = await supabaseGet(
      "/rest/v1/platforms?select=id,name,is_active&order=id"
    );

    result.supabase.connected = true;

    // 2) اختبار قراءة المنصات
    if (Array.isArray(platforms)) {
      result.platforms.connected = true;
      result.platforms.count = platforms.length;
      result.platforms.data = platforms;
    }

    // 3) اختبار قراءة الأحداث
    const events = await supabaseGet(
      "/rest/v1/events?select=id,slug,platform_id,title_ar,status,start_at,end_at,image_url&order=id"
    );

    if (Array.isArray(events)) {
      result.events.connected = true;
      result.events.count = events.length;
      result.events.data = events;
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      diagnostics: result
    });
  }
}