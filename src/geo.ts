// Geocoding (Nominatim) + timezone (tz-lookup) + local→UTC conversion.
import tzlookup from "tz-lookup";

export interface Place { label: string; lat: number; lon: number; tz: string }

export async function geocode(query: string, cache?: KVNamespace): Promise<Place | null> {
  const key = `geo:${query.trim().toLowerCase()}`;
  if (cache) {
    const hit = await cache.get(key, "json");
    if (hit) return hit as Place;
  }
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": "rite.report (hello@rite.report)", Accept: "application/json" } });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
  if (!rows.length) return null;
  const lat = parseFloat(rows[0].lat), lon = parseFloat(rows[0].lon);
  const label = rows[0].display_name.split(",").slice(0, 1).concat(rows[0].display_name.split(",").slice(-1)).map((s) => s.trim()).join(", ");
  const place: Place = { label, lat, lon, tz: tzlookup(lat, lon) };
  if (cache) await cache.put(key, JSON.stringify(place), { expirationTtl: 60 * 60 * 24 * 90 });
  return place;
}

/** Offset (minutes east of UTC) of IANA zone `tz` at a given UTC instant. Uses ICU, so historical DST rules apply. */
function offsetMinutes(tz: string, utc: Date): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(f.formatToParts(utc).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - utc.getTime()) / 60000);
}

/** Convert a local wall-clock date/time in `tz` to a UTC Date. Two-pass to handle DST. */
export function localToUtc(dateISO: string, timeHHMM: string | null, tz: string): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = (timeHHMM ?? "12:00").split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
  let off = offsetMinutes(tz, guess);
  let utc = new Date(guess.getTime() - off * 60000);
  const off2 = offsetMinutes(tz, utc);
  if (off2 !== off) utc = new Date(guess.getTime() - off2 * 60000);
  return utc;
}

/** Current hour (0–23) in `tz`. */
export function localHour(tz: string, now = new Date()): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(now);
  return parseInt(h, 10);
}
