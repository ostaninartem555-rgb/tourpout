const decimal = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  useGrouping: false,
});
export function formatCount(value) {
  if (!Number.isFinite(value)) return "н/д";
  if (value >= 1e9) return decimal.format(value / 1e9) + " млрд";
  if (value >= 1e6) return decimal.format(value / 1e6) + " млн";
  if (value >= 1e3) return decimal.format(value / 1e3) + " тыс.";
  return String(value);
}
export function artistSummary(stats) {
  return `SoundCloud: ${formatCount(stats?.soundcloudPlays)} просл. топ-треков, ${formatCount(stats?.soundcloudFollowers)} подп. · YouTube Music: ${formatCount(stats?.youtubePlays)} просмотров, ${stats?.youtubeSubscribers || "н/д"} подп.`;
}
