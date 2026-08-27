export const events = [
  // مثال مؤقت — هنستبدله بالأحداث الحقيقية
  {
    id: "test-event-1",
    platform: "Bybit",
    title: "Crypto Events Test",
    reward: "Test Reward",
    startDate: "2026-08-27T00:00:00Z",
    endDate: "2026-08-30T23:59:59Z",
    distributionDate: null,

    eventUrl: "https://www.bybit.com/",
    affiliateUrl: "https://partner.bybit.com/b/165247",

    description: "هذا حدث تجريبي لاختبار نظام Crypto Events.",
    requirements: [
      "راجع شروط الحدث الرسمية",
      "سجل من رابط الأفليت"
    ],

    status: "active"
  }
];

export function getActiveEvents() {
  const now = new Date();

  return events.filter((event) => {
    const start = new Date(event.startDate);
    const end = new Date(event.endDate);

    return start <= now && now <= end;
  });
}

export function getUpcomingEvents() {
  const now = new Date();

  return events.filter((event) => {
    return new Date(event.startDate) > now;
  });
}

export function getExpiredEvents() {
  const now = new Date();

  return events.filter((event) => {
    return new Date(event.endDate) < now;
  });
}