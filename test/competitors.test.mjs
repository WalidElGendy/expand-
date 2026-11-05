/* Etimad Insights → Competitors: reading Etimad's award panel, building
   rounds from it, and the per-company statistics and profile screens. */
import * as A from '../supabase/functions/etimad/awards.js';
import * as C from '../web/competitors.js';
import * as db from '../web/db.js';
import * as V from '../web/etimad.js';

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('  - ' + msg); } };

/* ------------------------------------------------------ the award panel */
const panel = `<div class="row"><h4 class="text-primary">قائمة الموردين المتقدمين</h4><table><thead><tr><th>إسم المورد</th><th>قيمة العرض المالي</th><th>نتائج فحص العروض الفنية</th></tr></thead>
<tbody><tr><td>شركة مجال للمقاولات العامة</td><td><h5>762415.50</h5></td><td><h5>مطابق</h5></td></tr>
<tr><td> شركة أرض التجهيزات   للمقاولات </td><td><h5>674,256.50</h5></td><td><h5>مطابق</h5></td></tr>
<tr><td>مؤسسة ثالثة</td><td><h5>500000</h5></td><td><h5>غير مطابق</h5></td></tr></tbody></table></div>
<div class="row"><h4>قائمة الموردين المرسى عليهم  -  ( ترسية كاملة )</h4><table><tbody>
<tr><td>شركة أرض التجهيزات للمقاولات</td><td><h5>674256.50</h5></td><td><h5>668256.00</h5></td></tr></tbody></table></div>`;
const p = A.parseAwards(panel);
check(p.rows.length === 3 && p.kind === 'full', 'three bidders, a full award');
const win = p.rows.find(r => r.won);
check(win?.supplier === 'شركة أرض التجهيزات للمقاولات' && win.value_sar === 674256.5 && win.award_sar === 668256, 'winner, offer and award value');
check(p.rows.find(r => r.supplier === 'مؤسسة ثالثة')?.tech === false, '"غير مطابق" is a technical fail, not a pass');
check(A.money('١٢٣٤٫٥') === 1234.5, 'Arabic digits and decimal mark');
check(A.parseAwards('<div class="x">لم يتم اعلان نتائج الترسية بعد</div>').rows.length === 0, 'not awarded yet: no rows');
check(A.looksLikePanel(panel) && !A.looksLikePanel('<html>Request Rejected</html>'), 'a block page is not a panel');

/* ------------------------------------------------------------ the names */
check(C.compKey('شركة أعالي التقنية للتجارة') === C.compKey('شركه اعالي التقنيه للتجاره'), 'legal form and letter variants fold');
check(C.compKey('شركة أمكنة لتنظيم المعارض والمؤتمرات شركة شخص واحد') === C.compKey('شركة أمكنة لتنظيم المعارض والمؤتمرات'), '"شركة شخص واحد" folds');
check(C.isUs('شركة إكسباند للمعارض', ['اكسباند']) && !C.isUs('شركة بليند إكسبيرينس', ['اكسباند']), 'our name, not a look-alike');

/* ---------------------------------------------------------------- rounds */
const etimad = [
  { id: '1', name: 'جناح أمانة الجوف', agency: 'أمانة الجوف', last_offer_at: '2025-05-01', scopes: ['stands'], awards: [
    { supplier: 'وكالة مقاس', value_sar: 3757292, won: true, tech: true, award_sar: 3757292 },
    { supplier: 'شركة أعالي التقنية للتجارة', value_sar: 4951854, won: false, tech: true },
    { supplier: 'شركة إكسباند', value_sar: 4200000, won: false, tech: true },
    { supplier: 'مؤسسة رخيصة', value_sar: 2000000, won: false, tech: false }] },
  { id: '2', name: 'مؤتمر', agency: 'وزارة الصحة', last_offer_at: '2025-08-01', scopes: ['events'], awards: [
    { supplier: 'شركه اعالي التقنيه للتجاره', value_sar: 1000000, won: true, tech: true },
    { supplier: 'شركة إكسباند', value_sar: 900000, won: false, tech: false }] },
  { id: '3', name: 'بلا نتائج', awards: null },
];
const ours = [{ id: 't', title: 'مؤتمر', client: 'وزارة الصحة', competitors: [
  { name: 'وكالة مقاس', project: 'جناح 2024', year: 2024, price_sar: 3553155, won: true },
  { name: 'شركة أعالي التقنية للتجارة', project: 'جناح 2024', year: 2024, price_sar: 5044252, won: false },
  { name: 'منافس محتمل', project: null, year: null, price_sar: null, won: false }] }];
const rounds = C.buildRounds({ etimad, ours, outcomes: [], ourNames: ['اكسباند'] });
check(rounds.length === 3, 'two Etimad rounds and one from our analysis; tenders without results and "likely" names are not rounds');
check(rounds.every(r => r.bidders.length >= 2), 'every round has its bidders');
check(C.roundMedian(rounds.find(r => r.id === 'e:1')) === 4200000, 'median over technically compliant offers only');

const comps = C.competitorStats(rounds);
const aali = comps.find(c => c.key === C.compKey('شركة أعالي التقنية للتجارة'));
check(aali && aali.part === 3 && aali.wins === 1 && aali.winRate === 33, 'participations and wins across both spellings and sources');
check(aali.vsUs.met === 2 && aali.vsUs.theyWon === 1, 'rounds against Expand');
const lostTo = aali.vsUs.rounds.find(v => v.them.won);
check(lostTo.why.code === 'failed_tech', 'why we lost: our technical offer failed');
const maqas = comps.find(c => c.key === C.compKey('وكالة مقاس'));
check(maqas.wins === 2 && maqas.wonNotCheapest === 0, 'Maqas won both of its rounds');
check(comps.find(c => c.key === C.compKey('مؤسسة رخيصة'))?.techRate === 0, 'a technical fail counts');
const us = comps.find(c => c.us);
check(us && us.part === 2 && us.wins === 0, 'Expand has its own record');
check(C.whyLost(null, { price: 100, tech: true }, { price: 120, tech: true }).code === 'cheaper' && C.whyLost(null, { price: 100 }, { price: 120 }).pct === 20, 'cheaper by 20%');
const m = C.marketStats(rounds, comps);
check(m.rounds === 3 && m.etimad === 2 && m.withUs === 2 && m.usRate === 0, 'market numbers');
const strong = C.strengths({ ...aali, part: 6, winRate: 50, techKnown: 5, techRate: 100, rounds: [1, 2, 3], vsMedian: 85, wonNotCheapest: 3 });
check(['high_win_rate', 'tech_strong', 'price_aggressive', 'wins_on_quality', 'beats_us'].every(k => strong.some(s => s.code === k)), 'strengths from the numbers');
const weak = C.weaknesses({ ...aali, part: 9, winRate: 5, techKnown: 5, techRate: 40, rounds: [1, 2, 3], vsMedian: 130, cheapestLost: 3, vsUs: { met: 3, theyWon: 0, weWon: 2 } });
check(['low_win_rate', 'tech_weak', 'price_high', 'cheap_but_loses', 'we_beat_them'].every(k => weak.some(s => s.code === k)), 'weaknesses from the numbers');

/* --------------------------------------------------------------- screens */
db.state.me = { id: 'x', role: 'admin', is_active: true };
for (const lang of ['en', 'ar']) {
  const ctx = { etTenders: etimad, tenders: ours, etOutcomes: [], etStatus: {}, cpTodo: 4 };
  const list = V.etimadCompetitorsView(lang, ctx);
  check(list.includes('data-cp-fetch') && list.includes('data-cp-rows') && list.includes(encodeURIComponent(aali.key)), `${lang}: the list links to profiles`);
  ctx.routeId = aali.key;
  const prof = V.etimadCompetitorView(lang, ctx);
  check(prof.includes('cptiles') && prof.includes('cppoints'), `${lang}: profile tiles and strengths`);
  check(!/undefined|NaN|\{[a-z]+\}/.test(list + prof), `${lang}: no unfilled placeholders`);
  ctx.routeId = 'nobody';
  check(V.etimadCompetitorView(lang, ctx).includes(V.ESTR[lang].cp.notFound), `${lang}: unknown company`);
}
db.state.me = { id: 'y', role: 'member', department_id: 'bd', is_active: true };
check(V.etimadCompetitorsView('en', { etTenders: etimad }).includes(V.ESTR.en.denied), 'only tender staff and admins');

if (failed) { console.log(`competitors: ${failed} failed`); process.exit(1); }
console.log('competitors: all checks passed');
