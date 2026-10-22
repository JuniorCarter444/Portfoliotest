// Shared by the browser (live quote) and the server (the price actually charged).
(function (root) {
  // Cheapest way to cover `days` using the car's daily rate and any multi-day packages
  // (e.g. 3 days for £2,700, 7 days for £4,500). Returns null for price-on-request cars.
  function rentalPrice(car, days) {
    if (!car || !car.dailyRate || !(days > 0)) return null;
    const options = [{ days: 1, price: car.dailyRate }, ...(car.packages || [])];
    const best = [0];
    for (let d = 1; d <= days; d++) {
      best[d] = Infinity;
      for (const o of options) {
        const prev = best[Math.max(0, d - o.days)];
        best[d] = Math.min(best[d], prev + o.price);
      }
    }
    return best[days];
  }

  function daysBetween(start, end) {
    const a = Date.parse(`${start}T00:00:00Z`);
    const b = Date.parse(`${end}T00:00:00Z`);
    if (isNaN(a) || isNaN(b)) return null;
    return Math.round((b - a) / 86400000);
  }

  const api = { rentalPrice, daysBetween };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Pricing = api;
})(this);
