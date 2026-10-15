/* ==========================================================================
   Pure helpers for the fingerprint sync: no network, no database, so the
   same file runs in the edge function (Deno) and in the Node tests.

   The fingerprint system (Malachite) reports punches as wall-clock times with
   no offset ("2026-10-15T08:22:00") and durations as .NET TimeSpans
   ("06:47:00", "1.02:00:00"). Everything here turns those into the shape of
   an hr_attendance row.
   ========================================================================== */

/** "06:47:00" → 407, "1.02:00:00" → 1560, "-00:05:00" → 0, null → 0. */
export function spanMin(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Math.max(0, Math.round(v));
  const m = String(v).trim().match(/^(-)?(?:(\d+)\.)?(\d+):(\d+)(?::(\d+)(?:\.\d+)?)?$/);
  if (!m) return 0;
  if (m[1]) return 0;
  const days = +(m[2] || 0), h = +m[3], mi = +m[4], s = +(m[5] || 0);
  return days * 1440 + h * 60 + mi + Math.floor(s / 60);
}

/** Minutes east of UTC for `tz` at the given instant. */
export function tzOffsetMin(tz, at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at).reduce((o, p) => (o[p.type] = p.value, o), {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** A wall-clock time in `tz` as an ISO instant. Strings that already carry
    an offset or Z are passed through. */
export function localToISO(v, tz = 'Asia/Riyadh') {
  if (!v) return null;
  const s = String(v).trim();
  if (/[zZ]$|[+-]\d\d:?\d\d$/.test(s)) return new Date(s).toISOString();
  const m = s.match(/^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)(?::(\d\d))?/);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  const off = tzOffsetMin(tz, new Date(guess));
  return new Date(guess - off * 60000).toISOString();
}

/** One Malachite attendance record → an hr_attendance row, or null when the
    day has no punch at all (absence is worked out by the app, not stored). */
export function recordToRow(rec, employee_id, tz = 'Asia/Riyadh') {
  if (!rec) return null;
  const day = String(rec.date || rec.firstCheckIn || '').slice(0, 10);
  if (!/^\d{4}-\d\d-\d\d$/.test(day)) return null;
  const cin = localToISO(rec.firstCheckIn, tz);
  let cout = localToISO(rec.lastCheckOut, tz);
  if (!cin && !cout) return null;
  if (cin && cout && cout <= cin) cout = null;           // a single punch
  return {
    employee_id, day,
    clock_in: cin || cout, clock_out: cin ? cout : null,
    late_minutes: spanMin(rec.lateDuration),
    early_minutes: cout ? spanMin(rec.earlyCheckOutDuration) : 0,
    in_remote: !!rec.isRemoteWork,
    source: 'fingerprint',
    ext: {
      id: rec.id ?? null,
      status: rec.status?.english ?? null,
      status_ar: rec.status?.arabic ?? null,
      worked_min: spanMin(rec.totalDuration),
      required_min: spanMin(rec.totalRequiredDuration),
      overtime_min: rec.isOvertime ? spanMin(rec.overtimeDuration) : 0,
      location: rec.location?.nameEn ?? null,
      shift: rec.shiftInfo?.nameEn ?? null,
      excuse: !!rec.hasExcuse, trip: !!rec.hasBusinessTrip, out_of_office: !!rec.hasOutOfOffice,
      locked: !!rec.isLocked,
    },
  };
}

/** Combine a fresh fingerprint row with what is already stored. A row HR
    corrected by hand is left alone; a row clocked in the app is widened to
    the earliest in and latest out. */
export function mergeRow(existing, row) {
  if (!row) return null;
  if (!existing) return row;
  if (existing.source === 'manual') return null;
  if (existing.source === 'app') {
    const ins = [existing.clock_in, row.clock_in].filter(Boolean).map(x => new Date(x).toISOString()).sort();
    const outs = [existing.clock_out, row.clock_out].filter(Boolean).map(x => new Date(x).toISOString()).sort();
    return { ...row, clock_in: ins[0] || null, clock_out: outs.length ? outs[outs.length - 1] : null,
      in_remote: !!(row.in_remote || existing.in_remote) };
  }
  return row;
}

const normName = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[ً-ٰٟ]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const normEmail = (s) => String(s || '').trim().toLowerCase();

/**
 * Pair fingerprint employees with people in the app. A device number HR typed
 * on the profile always wins; otherwise the work email, then the full name
 * (English or Arabic) when exactly one person carries it.
 *   remote: [{ employeeNumber, name:{english,arabic}, contact:{email} }]
 *   local:  [{ id, email, full_name, device_no }]
 */
export function matchEmployees(remote, local) {
  const byNo = new Map(), links = [], used = new Set();
  const localByDevice = new Map(local.filter(p => p.device_no).map(p => [String(p.device_no).trim(), p]));
  const count = (key) => local.reduce((m, p) => { const k = key(p); if (k) m.set(k, (m.get(k) || 0) + 1); return m; }, new Map());
  const emails = count(p => normEmail(p.email)), names = count(p => normName(p.full_name));
  const unmatchedRemote = [];
  for (const r of remote) {
    const no = String(r.employeeNumber ?? '').trim();
    if (!no) continue;
    let p = localByDevice.get(no), how = 'device';
    if (!p) {
      const e = normEmail(r.contact?.email || r.email);
      const cand = e && emails.get(e) === 1 ? local.find(x => normEmail(x.email) === e) : null;
      if (cand && !cand.device_no && !used.has(cand.id)) { p = cand; how = 'email'; }
    }
    if (!p) {
      for (const n of [r.name?.english, r.name?.arabic].map(normName).filter(Boolean)) {
        const cand = names.get(n) === 1 ? local.find(x => normName(x.full_name) === n) : null;
        if (cand && !cand.device_no && !used.has(cand.id)) { p = cand; how = 'name'; break; }
      }
    }
    if (!p) { unmatchedRemote.push({ no, name_en: r.name?.english || '', name_ar: r.name?.arabic || '', email: r.contact?.email || '' }); continue; }
    used.add(p.id);
    byNo.set(no, p.id);
    if (how !== 'device') links.push({ profile_id: p.id, device_no: no, how });
  }
  const unmatchedLocal = local.filter(p => !used.has(p.id)).map(p => ({ id: p.id, name: p.full_name || p.email || '' }));
  return { byNo, links, unmatchedRemote, unmatchedLocal };
}

/** The dates a sync covers, as YYYY-MM-DD strings in the company timezone. */
export function syncRange({ from, to, today, attendanceStart, defaultDays = 3, maxDays = 62 }) {
  const ok = (d) => typeof d === 'string' && /^\d{4}-\d\d-\d\d$/.test(d);
  const add = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  let t = ok(to) && to <= today ? to : today;
  let f = ok(from) ? from : add(t, -(defaultDays - 1));
  if (ok(attendanceStart) && f < attendanceStart && !ok(from)) f = attendanceStart;
  if (f > t) f = t;
  if (add(f, maxDays - 1) < t) f = add(t, -(maxDays - 1));
  return { from: f, to: t };
}
