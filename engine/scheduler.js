/* ==========================================================================
   Finite-capacity scheduler.

   THE THING THIS EXISTS TO PREVENT
   The obvious implementation of "3D needs 5 days, 2D needs 2, content needs 3"
   is to add them up, or to take the largest, and promise that many days out.
   Both are wrong for the same reason: they describe how long the WORK takes,
   not when the work can START. A team with four proposals already queued does
   not begin the fifth today.

   That gap is the entire problem the PMs have. A tool that closes it has to
   answer a different question — not "how long does this take" but "when does a
   person who can do this next have a free hour" — and that is a scheduling
   problem over a capacity calendar.

   THE MODEL
   * Every team member owns a day-by-day ledger of committed capacity.
   * A stage needs `effort` person-days, scaled by project size.
   * Scheduling a stage means: for each qualified member, walk their ledger from
     the earliest allowed start, accumulate free capacity until the effort is
     covered, note the finish date. Take the member who finishes soonest.
   * Stages run in parallel (confirmed with Expand), so the project's delivery
     date is the LATEST stage finish — and the driving team is whichever one is
     most backed up, which is frequently not the one with the longest task.

   WHAT IT REFUSES TO DO
   It does not invent precision. Every estimate is returned with the split
   between queue time and work time, because queue time is the uncertain part,
   and a date that is 80% queue deserves to be read differently from one that is
   80% work.
   ========================================================================== */

'use strict';

import { WorkCalendar, iso, parse } from './calendar.js';

/* ------------------------------- defaults -------------------------------- */

/** The three sizes. Ordered smallest first; `whatIf` steps down this list. */
export const SIZES = ['S', 'M', 'L'];

/**
 * Effort in person-days, stated per stage and per size.
 *
 * This used to be one base figure per team multiplied by a size factor
 * (S x0.6, M x1.0, L x1.8), and that model could not express the real numbers.
 * Expand's 3D goes 2 -> 3 -> 5 across the sizes and 2D goes 1 -> 2 -> 3: one
 * of those steps is x1.67 from medium to large and the other is x1.5, so no
 * single factor table produces both. Multiplying also invented precision
 * nobody had asked for, like 3.6 days of 2D on a large stand.
 *
 * Written out instead. Nine numbers a project manager can read, check against
 * what the teams actually say, and correct without arithmetic. The database
 * carries the same nine in departments.days_s/days_m/days_l, and that copy is
 * what the live app uses — these are the fallback when a department has none.
 *
 * Pricing and production are deliberately absent. Nobody has stated an effort
 * figure for them, and inventing one would put a confident number on a stage
 * that is frequently what everyone is waiting for.
 */
export const DEFAULT_STAGES = {
  '3d':      { label: '3D design',        team: '3d',      days: { S: 2, M: 3, L: 5 } },
  '2d':      { label: '2D technical',     team: '2d',      days: { S: 1, M: 2, L: 3 } },
  'content': { label: 'Content creation', team: 'content', days: { S: 1, M: 2, L: 3 } },
};

/**
 * Fraction of a working day genuinely available for project work.
 *
 * Left at 1.0 deliberately. Expand's "5 days" figures almost certainly already
 * describe real elapsed effort including the meetings and revisions, so
 * discounting again would double-count. If those numbers are pure hands-on
 * time, set this to about 0.8 and every estimate stretches accordingly.
 */
export const DEFAULT_FOCUS = 1.0;

/* -------------------------------- helpers -------------------------------- */

const round1 = (n) => Math.round(n * 10) / 10;
const DAY_MS = 86400000;

/* ------------------------------ the resource ----------------------------- */

class MemberLedger {
  constructor(member, focus) {
    this.id = member.id;
    this.name = member.name;
    this.team = member.team;
    this.role = member.role || 'member';
    // Availability multiplier: 0.5 for someone half-allocated elsewhere,
    // 0 for someone on leave for the whole horizon.
    this.availability = member.availability ?? 1;
    this.focus = member.focus ?? focus;
    this.leave = new Set(member.leave || []);
    /** ISO date -> person-days already committed. */
    this.booked = new Map();
  }

  capacityOn(day) {
    if (this.leave.has(day)) return 0;
    return this.availability * this.focus;
  }

  freeOn(day) {
    return Math.max(0, this.capacityOn(day) - (this.booked.get(day) || 0));
  }

  book(day, amount) {
    this.booked.set(day, (this.booked.get(day) || 0) + amount);
  }

  /** Person-days committed across a window — used for utilisation reporting. */
  loadBetween(cal, from, to) {
    let committed = 0, capacity = 0;
    for (const d of cal.workingDaysBetween(from, to)) {
      committed += this.booked.get(d) || 0;
      capacity += this.capacityOn(d);
    }
    return { committed, capacity, utilisation: capacity ? committed / capacity : 0 };
  }
}

/* ------------------------------ the scheduler ---------------------------- */

export class Scheduler {
  /**
   * @param {object} cfg
   * @param {Array}  cfg.members    [{id, name, team, availability?, focus?, leave?[]}]
   * @param {object} cfg.stages     stage definitions, defaults to DEFAULT_STAGES
   * @param {object} cfg.calibration per-team learned multipliers (see calibrate())
   * @param {WorkCalendar} cfg.calendar
   */
  constructor({
    members = [],
    stages = DEFAULT_STAGES,
    calibration = {},
    focus = DEFAULT_FOCUS,
    calendar = new WorkCalendar(),
  } = {}) {
    this.cal = calendar;
    this.stages = stages;
    this.calibration = calibration;
    this.members = members.map(m => new MemberLedger(m, focus));
    this.byTeam = new Map();
    for (const m of this.members) {
      if (!this.byTeam.has(m.team)) this.byTeam.set(m.team, []);
      this.byTeam.get(m.team).push(m);
    }
    this.assignments = [];
  }

  teamOf(team) { return this.byTeam.get(team) || []; }

  /** Effort in person-days for one stage of one project. */
  effortFor(stageKey, size) {
    const stage = this.stages[stageKey];
    if (!stage) throw new Error(`unknown stage: ${stageKey}`);
    /* Straight lookup. An unknown size falls back to M rather than throwing,
       because a project row imported with a size nobody recognises should get
       a middling estimate rather than take the whole screen down. */
    const days = stage.days?.[size] ?? stage.days?.M ?? 0;
    // Calibration is how the tool gets better: the ratio of what actually
    // happened to what was predicted, per team. Starts at 1 and moves as
    // real projects close. See calibrate().
    const cal = this.calibration[stage.team] ?? 1;
    return days * cal;
  }

  /**
   * Earliest finish for `effort` person-days by one member, starting no earlier
   * than `from`. Returns null if the horizon is exhausted.
   */
  _earliestFinish(member, effort, from, horizonDays = 400) {
    let remaining = effort;
    let day = this.cal.nextWorking(from);
    let start = null;
    const slices = [];
    let guard = 0;

    while (remaining > 1e-9) {
      if (++guard > horizonDays) return null;
      const key = iso(day);
      const free = member.freeOn(key);
      if (free > 1e-9) {
        const take = Math.min(free, remaining);
        if (!start) start = key;
        slices.push([key, take]);
        remaining -= take;
      }
      if (remaining > 1e-9) day = this.cal.nextWorking(new Date(parse(key).getTime() + DAY_MS));
    }
    return { start, finish: slices[slices.length - 1][0], slices };
  }

  /**
   * Schedule one stage. Picks the member who finishes soonest; ties break to
   * the least-loaded member so work spreads instead of piling on one person.
   */
  scheduleStage({ projectId, projectName, stageKey, size, earliestStart, commit = true }) {
    const stage = this.stages[stageKey];
    const effort = this.effortFor(stageKey, size);
    const pool = this.teamOf(stage.team).filter(m => m.availability > 0);

    if (!pool.length) {
      return {
        stage: stageKey, team: stage.team, label: stage.label, effort,
        error: 'no_members', message: `No one is assigned to the ${stage.team} team.`,
      };
    }

    let best = null;
    for (const m of pool) {
      const fit = this._earliestFinish(m, effort, earliestStart);
      if (!fit) continue;
      const load = m.loadBetween(this.cal, earliestStart, fit.finish).committed;
      if (!best ||
          fit.finish < best.fit.finish ||
          (fit.finish === best.fit.finish && load < best.load)) {
        best = { member: m, fit, load };
      }
    }

    if (!best) {
      return {
        stage: stageKey, team: stage.team, label: stage.label, effort,
        error: 'no_capacity', message: `The ${stage.team} team has no free capacity within the horizon.`,
      };
    }

    if (commit) {
      for (const [day, amount] of best.fit.slices) best.member.book(day, amount);
    }

    // Queue time is the honest part of the estimate: days the work sat waiting
    // because the person was busy, as opposed to days spent doing it.
    const firstPossible = iso(this.cal.nextWorking(earliestStart));
    const queueDays = this.cal.countWorkingDays(firstPossible, best.fit.start);
    const spanDays = this.cal.countWorkingDays(best.fit.start, best.fit.finish) + 1;

    const record = {
      projectId, projectName,
      stage: stageKey, label: stage.label, team: stage.team,
      memberId: best.member.id, memberName: best.member.name,
      effortDays: round1(effort),
      start: best.fit.start,
      finish: best.fit.finish,
      queueDays,
      spanDays,
      // Work stretched over more days than it needs means the person is
      // splitting attention across projects.
      fragmentation: round1(spanDays - effort),
      slices: best.fit.slices,
    };
    if (commit) this.assignments.push(record);
    return record;
  }

  /**
   * Schedule a whole proposal. Stages run in parallel, so they all start from
   * the same earliest date and the delivery date is the latest finish.
   */
  scheduleProject({
    id, name, size = 'M', earliestStart = iso(new Date()),
    stages = Object.keys(this.stages), deadline = null, commit = true,
  }) {
    const scheduled = stages.map(stageKey => this.scheduleStage({
      projectId: id, projectName: name, stageKey, size, earliestStart, commit,
    }));

    const ok = scheduled.filter(s => !s.error);
    const failed = scheduled.filter(s => s.error);

    if (!ok.length) {
      return { id, name, size, error: 'unschedulable', stages: scheduled, failed };
    }

    // Parallel stages: the project is done when the slowest one is.
    const delivery = ok.reduce((a, s) => (s.finish > a ? s.finish : a), ok[0].finish);
    const driver = ok.find(s => s.finish === delivery);

    const totalEffort = ok.reduce((a, s) => a + s.effortDays, 0);
    const totalQueue = driver.queueDays;
    const leadWorkingDays = this.cal.countWorkingDays(
      iso(this.cal.nextWorking(earliestStart)), delivery) + 1;

    // How much of the wait is queueing rather than working. High share means
    // the date is driven by how busy the team is, which is both the least
    // certain input and the most actionable one.
    const queueShare = leadWorkingDays ? totalQueue / leadWorkingDays : 0;

    const result = {
      id, name, size,
      earliestStart: iso(this.cal.nextWorking(earliestStart)),
      delivery,
      deliveryCalendarDays: this.cal.calendarSpan(earliestStart, delivery),
      leadWorkingDays,
      totalEffortDays: round1(totalEffort),
      // The team that sets the date. Adding people anywhere else changes nothing.
      bottleneck: { team: driver.team, stage: driver.stage, label: driver.label,
                    member: driver.memberName, queueDays: driver.queueDays },
      queueDays: totalQueue,
      queueShare: round1(queueShare * 100) / 100,
      confidence: confidenceFrom(queueShare, ok.length),
      stages: scheduled,
      failed,
    };

    if (deadline) {
      result.deadline = deadline;
      result.meetsDeadline = delivery <= deadline;
      result.slackWorkingDays = this.cal.countWorkingDays(delivery, deadline);
      if (!result.meetsDeadline) {
        result.overrunWorkingDays = this.cal.countWorkingDays(deadline, delivery);
      }
    }
    return result;
  }

  /** Utilisation per team over a window — the "how busy are we" answer. */
  utilisation(from, to) {
    const out = {};
    for (const [team, members] of this.byTeam) {
      let committed = 0, capacity = 0;
      const per = [];
      for (const m of members) {
        const l = m.loadBetween(this.cal, from, to);
        committed += l.committed;
        capacity += l.capacity;
        per.push({ id: m.id, name: m.name, ...l, utilisation: round1(l.utilisation * 100) / 100 });
      }
      out[team] = {
        committed: round1(committed),
        capacity: round1(capacity),
        utilisation: capacity ? round1((committed / capacity) * 100) / 100 : 0,
        headcount: members.length,
        members: per.sort((a, b) => b.utilisation - a.utilisation),
      };
    }
    return out;
  }

  /** A member's assignments, for their personal dashboard. */
  workloadFor(memberId) {
    return this.assignments.filter(a => a.memberId === memberId)
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  /** Deep copy, so what-if analysis never mutates the live plan. */
  fork(extraMembers = []) {
    const clone = new Scheduler({
      members: [], stages: this.stages,
      calibration: this.calibration, calendar: this.cal,
    });
    clone.members = this.members.map(m => {
      const c = new MemberLedger(
        { id: m.id, name: m.name, team: m.team, role: m.role,
          availability: m.availability, focus: m.focus, leave: [...m.leave] }, m.focus);
      c.booked = new Map(m.booked);
      return c;
    });
    for (const m of extraMembers) clone.members.push(new MemberLedger(m, DEFAULT_FOCUS));
    clone.byTeam = new Map();
    for (const m of clone.members) {
      if (!clone.byTeam.has(m.team)) clone.byTeam.set(m.team, []);
      clone.byTeam.get(m.team).push(m);
    }
    clone.assignments = [...this.assignments];
    return clone;
  }

  /**
   * What would actually move this date?
   *
   * Answers the question a PM asks next: "can we do better?" Each option is
   * simulated on a fork, so the numbers are real rather than rules of thumb.
   */
  whatIf(project) {
    const base = this.fork().scheduleProject({ ...project, commit: false });
    if (base.error) return { base, options: [] };

    const options = [];
    const bteam = base.bottleneck.team;

    // 1. Add one person to the bottleneck team.
    const withHire = this.fork([{
      id: '__hire__', name: `New ${bteam} designer`, team: bteam, availability: 1,
    }]).scheduleProject({ ...project, commit: false });
    if (!withHire.error && withHire.delivery < base.delivery) {
      options.push({
        action: 'add_person',
        label: `Add one person to the ${bteam} team`,
        delivery: withHire.delivery,
        savedWorkingDays: this.cal.countWorkingDays(withHire.delivery, base.delivery),
      });
    }

    // 2. Drop one size band.
    const order = SIZES;
    const idx = order.indexOf(project.size || 'M');
    if (idx > 0) {
      const smaller = this.fork().scheduleProject({ ...project, size: order[idx - 1], commit: false });
      if (!smaller.error && smaller.delivery < base.delivery) {
        options.push({
          action: 'reduce_scope',
          label: `Scope down from ${order[idx]} to ${order[idx - 1]}`,
          delivery: smaller.delivery,
          savedWorkingDays: this.cal.countWorkingDays(smaller.delivery, base.delivery),
        });
      }
    }

    // 3. Drop the stage that is driving the date, if it is optional.
    const without = this.fork().scheduleProject({
      ...project, commit: false,
      stages: Object.keys(this.stages).filter(s => s !== base.bottleneck.stage),
    });
    if (!without.error && without.delivery < base.delivery) {
      options.push({
        action: 'defer_stage',
        label: `Deliver without ${base.bottleneck.label} and follow up`,
        delivery: without.delivery,
        savedWorkingDays: this.cal.countWorkingDays(without.delivery, base.delivery),
      });
    }

    return { base, options: options.sort((a, b) => b.savedWorkingDays - a.savedWorkingDays) };
  }
}

/* ------------------------------- confidence ------------------------------ */

/**
 * Queue time is a prediction about other people's projects finishing on time.
 * Work time is a prediction about a known task. The more of the estimate is
 * queue, the softer the date — so say so instead of printing one number.
 */
function confidenceFrom(queueShare, stageCount) {
  let level, note;
  if (queueShare < 0.2) {
    level = 'high';
    note = 'Mostly hands-on work, little waiting. This date holds unless scope changes.';
  } else if (queueShare < 0.5) {
    level = 'medium';
    note = 'A meaningful part of this is waiting for the team to free up. Slips upstream will move it.';
  } else {
    level = 'low';
    note = 'Most of this date is queue, not work. It is a forecast about other projects finishing on time.';
  }
  if (stageCount < 2) note += ' Based on a single stage.';
  return { level, queueShare: round1(queueShare * 100) / 100, note };
}

/* ------------------------------- calibration ----------------------------- */

/**
 * Learn from what actually happened.
 *
 * For each team, compare the effort we predicted against the effort really
 * spent, and produce a multiplier. A team that consistently takes 30% longer
 * gets 1.3, and every future estimate for them stretches to match. This is the
 * mechanism that makes the tool better the longer it runs — and it is honest
 * about small samples rather than over-reacting to two projects.
 *
 * @param {Array} history [{team, size, predictedDays, actualDays}]
 */
export function calibrate(history, { minSamples = 3, damping = 0.5 } = {}) {
    const byTeam = {};
  for (const h of history) {
    if (!h.team || !(h.predictedDays > 0) || !(h.actualDays > 0)) continue;
    (byTeam[h.team] ||= []).push(h.actualDays / h.predictedDays);
  }

  const out = {};
  const detail = {};
  for (const [team, ratios] of Object.entries(byTeam)) {
    const n = ratios.length;
    const sorted = [...ratios].sort((a, b) => a - b);
    // Median, not mean: one catastrophic project should not reprice the team.
    const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

    if (n < minSamples) {
      out[team] = 1;
      detail[team] = { samples: n, median: round1(median), applied: 1,
                       note: `Only ${n} finished project${n === 1 ? '' : 's'} — not enough to adjust yet.` };
      continue;
    }
    // Damped: move part of the way towards the observed ratio, so the estimate
    // tracks reality without oscillating on every closed project.
    const applied = 1 + (median - 1) * damping;
    out[team] = Math.max(0.5, Math.min(2.5, applied));
    detail[team] = {
      samples: n, median: round1(median), applied: round1(out[team]),
      note: median > 1.05
        ? `Runs about ${Math.round((median - 1) * 100)}% over estimate. Future estimates stretched.`
        : median < 0.95
          ? `Finishes about ${Math.round((1 - median) * 100)}% under estimate. Future estimates tightened.`
          : 'Estimates are tracking actuals.',
    };
  }
  return { factors: out, detail };
}

/* -------------------------------- backtest ------------------------------- */

/**
 * Replay closed projects through the engine and compare against what really
 * happened. This is the only honest way to answer "should we trust it?" —
 * before it is used to promise a client anything.
 *
 * @param {Array} projects [{id, name, size, start, actualDelivery, stages?}]
 */
export function backtest(projects, schedulerFactory) {
  const rows = [];
  for (const p of projects) {
    const s = schedulerFactory();
    const r = s.scheduleProject({
      id: p.id, name: p.name, size: p.size || 'M',
      earliestStart: p.start, stages: p.stages, commit: false,
    });
    if (r.error) { rows.push({ ...p, error: r.error }); continue; }
    const cal = s.cal;
    const errDays = cal.countWorkingDays(r.delivery, p.actualDelivery)
                  - cal.countWorkingDays(p.actualDelivery, r.delivery);
    rows.push({
      id: p.id, name: p.name, size: p.size || 'M',
      predicted: r.delivery, actual: p.actualDelivery,
      errorWorkingDays: errDays,
      bottleneck: r.bottleneck.team,
    });
  }

  const scored = rows.filter(r => !r.error);
  const errs = scored.map(r => r.errorWorkingDays);
  const abs = errs.map(Math.abs).sort((a, b) => a - b);
  const mae = errs.length ? errs.reduce((a, b) => a + Math.abs(b), 0) / errs.length : null;
  const bias = errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : null;

  return {
    rows,
    summary: {
      n: scored.length,
      meanAbsErrorDays: mae == null ? null : round1(mae),
      // Positive bias = the engine is optimistic, promising earlier than reality.
      biasDays: bias == null ? null : round1(bias),
      medianAbsErrorDays: abs.length ? abs[Math.floor(abs.length / 2)] : null,
      within2Days: errs.length ? round1(errs.filter(e => Math.abs(e) <= 2).length / errs.length * 100) / 100 : null,
      verdict: mae == null ? 'no data'
        : mae <= 2 ? 'usable for client commitments'
        : mae <= 5 ? 'usable internally, add buffer before promising a client'
        : 'not yet trustworthy — check team capacity and size bands first',
    },
  };
}
