/* ==========================================================================
   Working calendar — Saudi Arabia.

   Every date in this system is a WORKING date. A proposal that needs 5 days of
   3D work starting Wednesday does not finish Sunday; it finishes the following
   Tuesday, because Friday and Saturday are the weekend here.

   Getting this wrong is not a rounding error. Over a 10-working-day estimate it
   is four calendar days of drift, which is exactly the size of the gap that
   makes a PM stop trusting the tool.
   ========================================================================== */

'use strict';

/** KSA weekend: Friday (5) and Saturday (6). Configurable per org. */
export const DEFAULT_WEEKEND = [5, 6];

/**
 * Public and company holidays. Eid dates move with the Hijri calendar and are
 * announced year by year, so they are DATA, never computed. Ship the list, let an
 * admin edit it, and warn when it runs out.
 */
export const DEFAULT_HOLIDAYS = [
  // 2026 — Saudi national holidays. Eid dates are announced by moon sighting
  // and shift by a day or two; confirm each year before relying on them.
  '2026-02-22', // Founding Day
  '2026-03-19', '2026-03-20', '2026-03-21', '2026-03-22', // Eid al-Fitr (approx)
  '2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29', // Eid al-Adha (approx)
  '2026-09-23', // National Day
];

const DAY_MS = 86400000;

export const iso = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
};

export const parse = (s) => (s instanceof Date ? s : new Date(String(s) + 'T00:00:00Z'));

export class WorkCalendar {
  /**
   * @param {number[]} weekend  day indices, 0 = Sunday
   * @param {string[]} holidays ISO dates
   */
  constructor({ weekend = DEFAULT_WEEKEND, holidays = DEFAULT_HOLIDAYS } = {}) {
    this.weekend = new Set(weekend);
    this.holidays = new Set(holidays);
    this._cache = new Map();
  }

  isWorking(date) {
    const s = iso(date);
    if (this._cache.has(s)) return this._cache.get(s);
    const d = parse(s);
    const ok = !this.weekend.has(d.getUTCDay()) && !this.holidays.has(s);
    this._cache.set(s, ok);
    return ok;
  }

  /** The first working day on or after `date`. */
  nextWorking(date) {
    let d = parse(iso(date));
    let guard = 0;
    while (!this.isWorking(d)) {
      d = new Date(d.getTime() + DAY_MS);
      if (++guard > 400) throw new Error('no working day found within a year — check the holiday list');
    }
    return d;
  }

  /** Add N working days to a date. addWorkingDays(d, 0) === nextWorking(d). */
  addWorkingDays(date, n) {
    let d = this.nextWorking(date);
    let left = Math.max(0, Math.round(n));
    while (left > 0) {
      d = this.nextWorking(new Date(d.getTime() + DAY_MS));
      left--;
    }
    return d;
  }

  /** Working days between two dates, inclusive of `from`, exclusive of `to`. */
  countWorkingDays(from, to) {
    let d = parse(iso(from));
    const end = parse(iso(to));
    let n = 0, guard = 0;
    while (d < end) {
      if (this.isWorking(d)) n++;
      d = new Date(d.getTime() + DAY_MS);
      if (++guard > 3650) break;
    }
    return n;
  }

  /** Every working date in [from, to], as ISO strings. */
  workingDaysBetween(from, to) {
    const out = [];
    let d = parse(iso(from));
    const end = parse(iso(to));
    let guard = 0;
    while (d <= end) {
      if (this.isWorking(d)) out.push(iso(d));
      d = new Date(d.getTime() + DAY_MS);
      if (++guard > 3650) break;
    }
    return out;
  }

  /** Calendar days a working-day span actually consumes — what the client sees. */
  calendarSpan(from, to) {
    return Math.round((parse(iso(to)) - parse(iso(from))) / DAY_MS) + 1;
  }

  /** Warn when the holiday table has gone stale rather than silently drifting. */
  holidayCoverageEndsBefore(date) {
    const last = [...this.holidays].sort().pop();
    return last ? parse(last) < parse(iso(date)) : true;
  }
}
