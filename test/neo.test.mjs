/* Neo AI: the twelve agents agree with the server, routing stays in bounds,
   reports never break the page, and the markdown cannot carry script. */
import { readFileSync } from 'node:fs';
import { AGENTS, KEYS, routeLocal, cleanAgents, readsFor, parseReport, readStored, md, reportText, MCP } from '../web/neologic.js';
import { NSTR } from '../web/neo.js';

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('  - ' + msg); } };

check(AGENTS.length === 12 && new Set(KEYS).size === 12, 'twelve agents, unique keys');
check(AGENTS.every(a => a.en && a.ar && a.jobEn && a.jobAr && a.reads.length), 'every agent is named and described in both languages and reads something');

/* The server keeps its own copy; the two must not drift. */
const fn = readFileSync(new URL('../supabase/functions/neo/index.ts', import.meta.url), 'utf8');
for (const a of AGENTS) {
  check(new RegExp(`\\b${a.key}:\\s+\\{`).test(fn), `server knows agent ${a.key}`);
  for (const [t, c, n] of a.reads) check(fn.includes(`['${t}', '${c}', ${n}]`), `server reads ${t} (${c}) for ${a.key} the same way`);
}
check(!/'\*'/.test(fn) && AGENTS.every(a => a.reads.every(r => r[1] !== '*')), 'no agent reads every column (no phone numbers or e-mails sent to the model)');
check(!fn.includes('SERVICE_ROLE') || /asCaller\.from\(table\)/.test(fn), 'workspace data is read with the caller\'s own token, not the service role');

check(JSON.stringify(routeLocal('Which tenders close this week?')) === '["tenders"]', 'routes a tenders question');
check(routeLocal('ما المناقصات التي تغلق هذا الأسبوع').includes('tenders'), 'routes in Arabic');
check(!routeLocal('three things for the weekly report').includes('hr'), '"three" does not wake the HR agent');
check(routeLocal('lead pricing project supplier payroll report').length === 3, 'never more than three agents');
check(JSON.stringify(routeLocal('hello')) === '["assistant"]', 'nothing matched → assistant');
check(JSON.stringify(cleanAgents(['hr', 'hr', 'nope', 'sales', 'finance', 'reports'])) === '["hr","sales","finance"]', 'picked agents are cleaned');
check(readsFor(['finance', 'pricing']).filter(r => r[0] === 'projects').length === 2, 'reads are de-duplicated by table and columns');

const good = parseReport('Sure! {"title":"T","sections":[{"agent":"sales","summary":"**3** leads"},{"agent":"ghost","summary":"x"}],"next_steps":["Call A",""]} thanks', ['sales']);
check(good.title === 'T' && good.sections.length === 1 && good.next_steps.length === 1, 'report parsed from chatter; unknown agents and empty steps dropped');
const prose = parseReport('Just text, no JSON', ['hr']);
check(prose.sections[0]?.agent === 'hr' && prose.sections[0].summary === 'Just text, no JSON', 'a model that ignored JSON still shows its answer');
check(parseReport(null, []).sections.length === 0, 'nothing back → empty report, no throw');
check(readStored({ status: 'done', result: '{bad' }).sections.length === 0, 'a broken saved row reads as empty');
check(readStored({ status: 'failed', result: 'error' }).sections.length === 0, 'failed rows have no report');

const html = md('# Head\n- **a** <img src=x onerror=alert(1)>\n- `b`\n\n1. one\n2. two\nplain *it*');
check(!/<img/i.test(html) && html.includes('&lt;img'), 'markdown escapes HTML from the model');
check(html.includes('<h4>Head</h4>') && html.includes('<ul><li><b>a</b>') && html.includes('<ol><li>one</li><li>two</li></ol>') && html.includes('<i>it</i>'), 'markdown: headings, bullets, numbers, bold, italic');
check(reportText('T', { sections: [{ agent: 'hr', summary: 'x' }], next_steps: ['a'] }, 'ar').includes('الموارد البشرية'), 'copied report uses the reader\'s language');

check(MCP.length === 8 && MCP.filter(m => m.state === 'builtin').length === 1, 'eight connectors, only workspace data claims to be built in');
check(MCP.every(m => /^[\w.-]+\/[\w.-]+$/.test(m.repo) && m.en[0] && m.ar[0]), 'connectors: real repo paths, both languages');

const flat = (o) => Object.entries(o).flatMap(([k, v]) => v && typeof v === 'object' ? flat(v).map(x => k + '.' + x) : [k]);
const en = flat(NSTR.en), ar = new Set(flat(NSTR.ar));
check(en.every(k => ar.has(k)), 'every Neo string has an Arabic version: ' + en.filter(k => !ar.has(k)).join(','));

if (failed) { console.log(`neo: ${failed} failed`); process.exit(1); }
console.log('neo: ok');
