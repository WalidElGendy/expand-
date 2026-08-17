/* ==========================================================================
   Asana → scheduler import.

   Maps what Asana actually stores onto what the scheduler needs. The two
   models do not line up, and pretending they do is how an import produces a
   plausible-looking schedule built on nothing:

     Asana has                     the scheduler needs
     ------------------------      --------------------------------
     assignee                      which TEAM (3d / 2d / content)
     due_on                        earliest START and effort in days
     section / custom field        project SIZE (S/M/L)
     completed_at                  ACTUAL delivery, for backtesting

   Only the last one is unambiguous. The rest are inferred, and every inference
   is reported in `warnings` rather than silently assumed — because a backtest
   run on guessed sizes tells you nothing except that your guesses are
   self-consistent.

   Usage once the Asana connector is enabled:
     const raw = await asana.get_project({ project_gid })      // per project
     const { projects, warnings } = fromAsana(raw, { teamMap })
   ========================================================================== */

'use strict';

/**
 * Section name → team. This is the PRIMARY router, because Expand's Asana
 * already uses a consistent section template on every proposal:
 *
 *   3D Design / 3D تصاميم -> 3d      Financial            -> pricing
 *   2D Design / 2D تصميم  -> 2d      Production / التنفيذ -> production
 *   المحتوى                -> content
 *
 * Sections beat task names: they are set by the template rather than typed by
 * hand, and they work in both languages without keyword guessing.
 */
export const SECTION_TEAMS = [
  [/3\s*d|ثلاثي|تصاميم/i, '3d'],
  [/2\s*d|رسومات|تصميم(?!\s*ثلاثي)/i, '2d'],
  [/content|محتوى/i, 'content'],
  [/financial|pricing|مالي|تسعير/i, 'pricing'],
  [/production|تنفيذ|تركيب/i, 'production'],
];

export function teamFromSection(sectionName) {
  const n = String(sectionName || '');
  for (const [re, team] of SECTION_TEAMS) if (re.test(n)) return team;
  return null;
}

/** Fallback keyword → team routing, used only when a task has no section. */
export const DEFAULT_TEAM_KEYWORDS = {
  '3d': ['3d', 'render', 'visual', 'modelling', 'modeling', 'ثلاثي', 'تصميم ثلاثي'],
  '2d': ['2d', 'technical', 'drawing', 'cad', 'shop drawing', 'رسومات', 'فني'],
  content: ['content', 'copy', 'script', 'narrative', 'محتوى', 'نصوص'],
  pricing: ['pricing', 'boq', 'cost', 'تسعير'],
  bd: ['bd', 'business development', 'tender', 'مناقصة'],
};

/* Three bands, because three is what the teams have day figures for. Pavilion
   and expo words used to imply a fourth; they now mean large, which is the
   biggest thing the engine can honestly price. */
const SIZE_KEYWORDS = {
  L: ['pavilion', 'expo', 'giga', 'جناح', 'stand', 'exhibition', 'معرض'],
  S: ['activation', 'popup', 'pop-up', 'kiosk', 'تفعيل'],
};

const norm = (s) => String(s || '').toLowerCase();

/** Which team does this task belong to? Returns null when nothing matches. */
export function teamFor(text, keywords = DEFAULT_TEAM_KEYWORDS) {
  const t = norm(text);
  for (const [team, words] of Object.entries(keywords)) {
    if (words.some(w => t.includes(w))) return team;
  }
  return null;
}

/**
 * Size band. Asana rarely stores this, so it is guessed from the project name
 * unless a custom field carries it — and the guess is always reported.
 */
export function sizeFor(project, sizeField = 'Size') {
  const custom = (project.custom_fields || [])
    .find(f => norm(f.name) === norm(sizeField));
  const explicit = custom?.enum_value?.name || custom?.text_value;
  if (explicit) {
    const v = String(explicit).trim().toUpperCase();
    /* XL folds into L. The engine prices three sizes because those are the
       three anybody has stated day figures for; an Asana row still labelled XL
       is a large project with an emphatic label, not a fourth band. */
    if (v === 'XL') return { size: 'L', inferred: false };
    if (['S', 'M', 'L'].includes(v)) return { size: v, inferred: false };
    if (/small|صغير/i.test(explicit))  return { size: 'S', inferred: false };
    if (/medium|متوسط/i.test(explicit)) return { size: 'M', inferred: false };
    if (/large|كبير/i.test(explicit))  return { size: 'L', inferred: false };
  }
  const name = norm(project.name);
  for (const [size, words] of Object.entries(SIZE_KEYWORDS)) {
    if (words.some(w => name.includes(w))) return { size, inferred: true };
  }
  return { size: 'M', inferred: true };
}

const isoDate = (s) => (s ? String(s).slice(0, 10) : null);

/**
 * Convert Asana projects (with their tasks) into scheduler input.
 *
 * @param {Array} asanaProjects [{gid, name, created_at, due_on, completed, custom_fields, tasks:[...]}]
 * @param {object} opts {teamKeywords, sizeField, members}
 * @returns {{projects, people, history, warnings, stats}}
 */
export function fromAsana(asanaProjects, opts = {}) {
  const { teamKeywords = DEFAULT_TEAM_KEYWORDS, sizeField = 'Size' } = opts;
  const warnings = [];
  const projects = [];
  const history = [];
  const people = new Map();

  let unroutedTasks = 0, totalTasks = 0, inferredSizes = 0, noDates = 0;

  for (const p of asanaProjects) {
    const tasks = p.tasks || [];
    totalTasks += tasks.length;

    const { size, inferred } = sizeFor(p, sizeField);
    if (inferred) inferredSizes++;

    // Which teams actually touched this project, and who.
    const teams = new Set();
    for (const t of tasks) {
      // Section first; task name only as a fallback.
      const sectionName = t.memberships?.[0]?.section?.name || t.section || '';
      const team = teamFromSection(sectionName)
                || teamFor(`${t.name} ${t.notes || ''}`, teamKeywords);
      if (!team) { unroutedTasks++; continue; }
      teams.add(team);
      const a = t.assignee;
      if (a?.gid) {
        if (!people.has(a.gid)) {
          people.set(a.gid, { id: a.gid, name: a.name || a.gid, team, tasks: 0 });
        }
        people.get(a.gid).tasks++;
      }
    }

    const start = isoDate(p.created_at) || isoDate(p.start_on);
    const done = isoDate(p.completed_at);
    if (!start) { noDates++; continue; }

    const row = {
      id: p.gid,
      name: p.name,
      size,
      sizeInferred: inferred,
      start,
      stages: teams.size ? [...teams].filter(t => ['3d', '2d', 'content'].includes(t)) : undefined,
      asanaUrl: p.permalink_url,
    };
    projects.push(row);

    // Closed projects are the only rows worth backtesting against.
    if (p.completed && done) history.push({ ...row, actualDelivery: done });
  }

  /* ---- warnings: everything the import had to guess ---- */
  if (inferredSizes) {
    warnings.push({
      kind: 'inferred_size',
      count: inferredSizes,
      message: `${inferredSizes} of ${asanaProjects.length} projects had no "${sizeField}" field — size was guessed from the name. Add that field in Asana, or correct the sizes before trusting a backtest.`,
    });
  }
  if (unroutedTasks) {
    warnings.push({
      kind: 'unrouted_tasks',
      count: unroutedTasks,
      message: `${unroutedTasks} of ${totalTasks} tasks could not be matched to a team from their name. They are excluded, so those projects look smaller than they were.`,
    });
  }
  if (noDates) {
    warnings.push({
      kind: 'no_start_date',
      count: noDates,
      message: `${noDates} projects had no start date and were skipped entirely.`,
    });
  }
  if (history.length < 10) {
    warnings.push({
      kind: 'thin_history',
      count: history.length,
      message: `Only ${history.length} completed projects with a delivery date. A backtest needs roughly 15–20 before its verdict means anything.`,
    });
  }

  // Team membership is inferred from what people worked on most.
  const members = [...people.values()].map(p => ({ id: p.id, name: p.name, team: p.team }));

  return {
    projects,
    history,
    people: members,
    warnings,
    stats: {
      projects: projects.length,
      completed: history.length,
      people: members.length,
      tasks: totalTasks,
      unroutedTasks,
      inferredSizes,
    },
  };
}

/**
 * Best-effort team assignment for people, by majority of their routed tasks.
 * Anyone ambiguous is returned separately rather than assigned at random.
 */
export function resolvePeople(asanaProjects, opts = {}) {
  const { teamKeywords = DEFAULT_TEAM_KEYWORDS } = opts;
  const tally = new Map();

  for (const p of asanaProjects) {
    for (const t of p.tasks || []) {
      const a = t.assignee;
      if (!a?.gid) continue;
      const sectionName = t.memberships?.[0]?.section?.name || t.section || '';
      const team = teamFromSection(sectionName) || teamFor(t.name, teamKeywords);
      if (!team) continue;
      if (!tally.has(a.gid)) tally.set(a.gid, { id: a.gid, name: a.name, counts: {} });
      const e = tally.get(a.gid);
      e.counts[team] = (e.counts[team] || 0) + 1;
    }
  }

  const confident = [], ambiguous = [];
  for (const e of tally.values()) {
    const entries = Object.entries(e.counts).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, n]) => s + n, 0);
    const [team, n] = entries[0];
    // Below 60% of their work in one team, the assignment is a coin flip.
    if (n / total >= 0.6) confident.push({ id: e.id, name: e.name, team, share: n / total });
    else ambiguous.push({ id: e.id, name: e.name, counts: e.counts });
  }
  return { confident, ambiguous };
}
