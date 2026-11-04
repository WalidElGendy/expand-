/* Leads → recommended by tender insights: the organisation ranking, the
   Lusha contact picking, and the panel. */
import * as R from '../supabase/functions/lead-intel/rank.js';
import { leadIntelCard } from '../web/leadintel.js';

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('  - ' + msg); } };

/* ------------------------------------------------------------ names */
check(R.cleanAgency('20251231SAUDI IRRIGATION ORG') === 'SAUDI IRRIGATION ORG', 'date code stripped');
check(R.cleanAgency('12345678') === null, 'code-only name rejected');
check(R.orgKey('وزارة الصحة - الديوان العام') === R.orgKey('وزارة الصحه'), 'department dash and ة/ه fold together');
check(R.orgKey('أمانة الجوف') === R.orgKey('امانه الجوف'), 'alef variants fold');

/* ---------------------------------------------------------- ranking */
const today = '2026-11-01';
const etimad = [
  { id: 1, agency: 'جامعة أ', scopes: ['events'], published_on: '2026-10-01', last_offer_at: '2026-11-20', est_value_sar: 500000, shortlisted: true },
  { id: 2, agency: 'جامعة أ', scopes: ['stands'], published_on: '2026-06-01', last_offer_at: '2026-06-20' },
  { id: 3, agency: 'هيئة ب', scopes: ['marketing'], published_on: '2023-01-01', last_offer_at: '2023-02-01' },
  { id: 4, agency: 'هيئة ج', scopes: ['events'], published_on: '2026-10-01', dismissed: true },
  { id: 5, agency: 'هيئة د', scopes: [], published_on: '2026-10-01' },
];
const out = R.rankOrgs({
  etimad, analyses: [{ etimad_tender_id: 1, result: { fit_score: 80 } }],
  ours: [{ id: 'x', client: 'هيئة ب', title: 'Expo', created_at: '2025-01-01' }],
  outcomes: [{ tender_id: 'x', bid_status: 'won' }],
  leads: [{ company: 'جامعة أ' }], today,
});
check(out.length === 2, 'dismissed and unscoped tenders do not create organisations');
check(out[0].agency === 'جامعة أ' && out[0].rank === 1, 'busy, open, shortlisted buyer ranks first');
check(out[0].signals.open === 1 && out[0].signals.nextDeadline === '2026-11-20', 'open count and next deadline');
check(out[0].signals.fitAvg === 80, 'fit average from the AI analyses');
check(out[0].signals.scopes.length === 2 && out[0].signals.hasLeads, 'scopes and existing leads');
check(out[1].signals.ourBids === 1 && out[1].signals.ourWon === 1, 'our bids and wins counted');
check(out[0].top_tenders[0].open, 'open tenders listed first');

/* --------------------------------------------------------- contacts */
check(R.roleOf('Head of Corporate Communication') === 'marketing', 'marketing title');
check(R.roleOf('Procurement Specialist') === 'procurement', 'procurement title');
check(R.roleOf('Software Engineer') === null, 'other titles ignored');
const people = [
  { id: 'a', jobTitle: { title: 'Marketing Manager' }, has: [] },
  { id: 'b', jobTitle: { title: 'Director of Events' }, canReveal: [{ field: 'emails', credits: 1 }] },
  { id: 'c', jobTitle: { title: 'Procurement Manager' }, has: ['phones', 'emails'] },
  { id: 'd', jobTitle: { title: 'IT Manager' }, has: ['emails'] },
  { id: 'e', jobTitle: { title: 'Marketing Specialist' }, has: ['emails'] },
];
const picked = R.pickContacts(people, 2);
check(picked.length === 2, 'at most max picked');
check(!picked.some(p => p.id === 'a' || p.id === 'd'), 'nobody without revealable data or outside the roles');
check(picked.map(p => p._role).join() === 'marketing,events' || new Set(picked.map(p => p._role)).size === 2, 'one per role first');
check(picked.every(p => p._reveal.length), 'reveal only the fields Lusha has');
check(R.pickContacts([{ id: 'z', jobTitle: { title: 'Events lead' } }], 2).length === 1, 'falls back to people without data when nobody has any');

/* ------------------------------------------------------------ panel */
const ctx = { leadIntel: [
  { id: 'o1', rank: 1, agency: 'جامعة أ', name_en: 'Uni A', sector: 'education', signals: { scoped: 3, open: 1, nextDeadline: '2099-01-01', scopes: ['events'] }, insight_en: 'Why <now>', angle_en: 'Pitch it', leads_added: 2 },
  { id: 'o2', rank: 2, agency: 'هيئة', signals: {}, lusha_note: 'no_people' },
  { id: 'o3', rank: 3, agency: 'gone', dismissed: true },
] };
const en = leadIntelCard('en', ctx, { canAct: true });
check(en.includes('Recommended by tender insights') && en.includes('2 in Leads') && en.includes('Not in Lusha'), 'panel shows states');
check(en.includes('Why &lt;now&gt;') && !en.includes('<now>'), 'insight escaped');
check(!en.includes('gone'), 'dismissed hidden');
check(en.includes('data-li-pull="o1"') && en.includes('data-li-refresh'), 'actions for sellers');
const ar = leadIntelCard('ar', ctx, { canAct: false });
check(ar.includes('توصيات من تحليل المنافسات') && !ar.includes('data-li-pull'), 'Arabic, read-only');
check(leadIntelCard('en', { leadIntel: [] }, { canAct: false }) === '', 'nothing for viewers when empty');

if (failed) { console.log(`leadintel: ${failed} failed`); process.exit(1); }
console.log('leadintel: all checks passed');
