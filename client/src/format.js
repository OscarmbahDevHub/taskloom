const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatMoney(cents) {
  return formatter.format((cents || 0) / 100);
}