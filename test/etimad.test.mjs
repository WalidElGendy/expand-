/* Etimad Insights: the function's mapping helpers and the page's arithmetic. */
import * as M from '../supabase/functions/etimad/map.js';
import * as L from '../web/etimadlogic.js';

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('  - ' + msg); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------------------------------------------------------------- map.js */

check(eq(M.classify('تصميم وتنفيذ جناح الهيئة في معرض سيتي سكيب').scopes, ['stands']), 'a pavilion tender is not a stand');
check(M.classify('تنظيم فعاليات اليوم الوطني').scopes.includes('events'), 'national-day events are not events');
check(M.classify('Fit-out of the visitor centre museum').scopes.includes('fitout'), 'museum fit-out is not fit-out');
check(M.classify('توريد أدوية').scopes.length === 0, 'medicine supply matched one of our scopes');

check(M.toDate('2026-11-05') === '2026-11-05', 'ISO date');
check(M.toDate('05/11/2026') === '2026-11-05', 'DD/MM/YYYY date');
check(M.toDate('١٤٤٨/٠٥/١٤') === null, 'a Hijri date was read as Gregorian');
check(M.toDate({ gregorian: '2026-12-01', hijri: '1448-06-10' }) === '2026-12-01', 'a dates object');
check(M.toInstant('2026-11-05', '10:00 ص') === '2026-11-05T10:00:00+03:00', 'morning time');
check(M.toInstant('2026-11-05 02:30 م') === '2026-11-05T14:30:00+03:00', 'afternoon time');
check(M.toNum('1,500.00 ريال') === 1500 && M.toNum('٢٥٠٠') === 2500 && M.toNum('') === null, 'numbers');

const sample = {
  agency_name: 'وزارة الثقافة', tender_name: 'تصميم وتنفيذ جناح الوزارة في معرض الرياض الدولي للكتاب',
  tender_number: '260939001234', reference_number: '261039012345', tender_id_string: 'yCXTwlfa9SRZE2o67WnycQ==',
  tender_type: 'منافسة عامة', status: 'معتمدة',
  classification: { activities: ['تنظيم المعارض والمؤتمرات'], regions: ['منطقة الرياض'] },
  dates: { last_offer_presentation_date: { gregorian: '2026-11-20', hijri: '1448-05-29' }, last_offer_presentation_time: '23:59',
    offers_opening_date: { gregorian: '2026-11-22' }, expected_award_date: '2026-12-10' },
  documents_price: '1,000.00', source_url: 'https://tenders.etimad.sa/Tender/DetailsForVisitor?STenderId=yCXTwlfa9SRZE2o67WnycQ%3D%3D',
};
const row = M.normTender(sample);
check(row.tender_id_string === 'yCXTwlfa9SRZE2o67WnycQ==', 'tender id');
check(row.agency === 'وزارة الثقافة' && row.tender_number === '260939001234', 'agency and number');
check(row.last_offer_at === '2026-11-20T23:59:00+03:00', `deadline ${row.last_offer_at}`);
check(row.opening_at === '2026-11-22T23:59:00+03:00' && row.expected_award_on === '2026-12-10', 'opening and award dates');
check(row.documents_price === 1000, 'document fee');
check(eq(row.regions, ['منطقة الرياض']), `regions ${JSON.stringify(row.regions)}`);
check(row.scopes.includes('stands') && row.scopes.includes('events'), `scopes ${row.scopes}`);
check(M.tenderIdOf({ url: 'https://tenders.etimad.sa/Tender/DetailsForVisitor?STenderId=abc%2B1%3D' }) === 'abc+1=', 'id from a link');

const found = M.findTenders({ data: { results: [sample, { ...sample }, { tender_name: 'x', link: '?STenderId=zz' }], total: 3 } });
check(found.length === 2, `search rows found: ${found.length}`);

const aw = M.awardsFrom({ award_results: [{ supplier_name: 'شركة المعارض المتقدمة', awarded_value: '450,000' }],
  offers: [{ supplier: 'Alpha Events', financial_offer: 520000, status: 'غير فائز' }] });
check(aw.length === 2 && aw[0].won && aw[0].value_sar === 450000 && aw[1].value_sar === 520000 && !aw[1].won, `awards ${JSON.stringify(aw)}`);

const tools = M.toolsFrom({ items: [
  { provider: 'tenders-etimad-sa', capability: 'public-procurement-tenders/search_tenders',
    options: { type: 'object', properties: { keyword: { type: 'string' }, page: { type: 'integer' }, page_size: { type: 'integer', maximum: 30 } } } },
  { provider: 'tenders-etimad-sa', capability: 'public-procurement-tenders/get_tender', options: { properties: { tender_id_string: {} } } }] });
check(tools.length === 2, 'tools');
const sc = M.searchCall(tools, 'معرض', 2);
check(sc.capability.endsWith('search_tenders') && eq(sc.options, { keyword: 'معرض', page: 2, page_size: 30 }), `search options ${JSON.stringify(sc)}`);
check(eq(M.searchCall([], 'جناح').options, { keyword: 'جناح' }), 'search without a catalogue');

/* ------------------------------------------------------------ etimadlogic */

const today = '2026-10-27';
const et = [
  { id: 'a', name: 'جناح', agency: 'وزارة الثقافة', scopes: ['stands'], regions: ['الرياض'], last_offer_at: '2026-10-30T23:59:00+03:00', documents_price: 1000, shortlisted: true },
  { id: 'b', name: 'مؤتمر', agency: 'وزارة الثقافة', scopes: ['events'], regions: ['جدة'], last_offer_at: '2026-11-20T23:59:00+03:00', documents_price: 500 },
  { id: 'c', name: 'قديم', agency: 'هيئة', scopes: ['fitout'], last_offer_at: '2026-09-01T23:59:00+03:00',
    awards: [{ supplier: 'Alpha', value_sar: 300000, won: true }] },
  { id: 'd', name: 'مرفوض', agency: 'هيئة', scopes: ['marketing'], last_offer_at: '2026-11-25T23:59:00+03:00', dismissed: true },
];
check(L.daysToOffer(et[0], today) === 3 && L.daysToOffer(et[2], today) < 0, 'days to the offer deadline');
check(eq(L.filterEtimad(et, { open: true }, today).map(x => x.id), ['a', 'b']), 'open, not dismissed');
check(eq(L.filterEtimad(et, { scope: 'events' }, today).map(x => x.id), ['b']), 'scope filter');
check(eq(L.filterEtimad(et, { view: 'shortlist' }, today).map(x => x.id), ['a']), 'shortlist view');
check(eq(L.filterEtimad(et, { view: 'dismissed' }, today).map(x => x.id), ['d']), 'dismissed view');
const ov = L.etimadOverview(et, [], today);
check(ov.open === 2 && ov.closing7 === 1 && ov.shortlisted === 1, `overview ${JSON.stringify({ o: ov.open, c: ov.closing7, s: ov.shortlisted })}`);
check(ov.byScope.find(x => x.key === 'stands').n === 1 && ov.agencies[0].name === 'وزارة الثقافة' && ov.agencies[0].n === 2, 'by scope and agency');
check(ov.competitors[0].name === 'Alpha' && ov.competitors[0].wins === 1, 'competitors from awards');

const score = L.ruleScore(et[1], { today, ours: [{ client: 'وزارة الثقافة', status: 'approved' }] });
check(score > L.ruleScore(et[2], { today }), 'an open known-agency tender scores above a closed one');

const ours = [
  { id: 't1', title: 'A', client: 'X', value_sar: 100000, status: 'approved', created_at: '2026-01-01',
    competitors: [{ name: 'Alpha', price_sar: 90000, won: true }, { name: 'Beta', price_sar: 120000 }] },
  { id: 't2', title: 'B', client: 'Y', value_sar: 200000, status: 'approved', created_at: '2026-03-01', competitors: [] },
  { id: 't3', title: 'C', client: 'Z', value_sar: 50000, status: 'rejected', reject_reason: 'price', created_at: '2026-04-01' },
];
const outs = [
  { tender_id: 't1', bid_status: 'lost', our_price_sar: 110000, winner: 'Alpha', winning_price_sar: 90000 },
  { tender_id: 't2', bid_status: 'won', our_price_sar: 200000 },
];
const ourS = L.ourStats(ours, outs);
check(ourS.applied === 2 && ourS.won === 1 && ourS.lost === 1 && ourS.winRate === 50, `our stats ${JSON.stringify(ourS)}`);
check(ourS.wonValue === 200000 && ourS.avgGapPct === 22.2, `won value / price gap ${ourS.wonValue} ${ourS.avgGapPct}`);
check(ourS.rivals[0].name === 'Alpha' && ourS.rivals[0].beatUs === 1, 'rival that beat us');

const ph = L.priceHistory({ ours, outcomes: outs, etimad: et, projects: [{ contract_value_sar: 150000 }] });
check(ph.winning.length === 3 && ph.winning.includes(90000) && ph.winning.includes(200000) && ph.winning.includes(300000), `winning prices ${ph.winning}`);
check(ph.median !== null && ph.n >= 4, 'price history median');

/* ------------------------------------------------------------- the screens */
const dbmod = await import('../web/db.js');
const V = await import('../web/etimad.js');
dbmod.state.departments = [];
dbmod.state.me = { id: 'u1', role: 'member', department_id: 'tenders', is_active: true, tender: { analyst: true } };
const vctx = { etTenders: et, etAnalyses: [], tenders: ours, etOutcomes: outs, etStatus: { keys: { firecrawl: true, anthropic: false, lusha: false } } };
for (const lang of ['en', 'ar']) {
  const ov = V.etimadOverviewView(lang, vctx);
  check(ov.includes('LUSHA_API_KEY') && ov.includes('data-et-sync'), `${lang}: overview lacks the setup card or the sync button`);
  check(V.etimadListView(lang, vctx).includes('data-et-short="a"'), `${lang}: the list does not show an open tender`);
  check(V.etimadTenderView(lang, { ...vctx, etTender: et[0], etTenderAnalyses: [] }).includes('data-et-analyze disabled'), `${lang}: analysis offered without an Anthropic key`);
  check(V.etimadOursView(lang, vctx).includes('data-out-row="t1"'), `${lang}: our bids table is missing an applied tender`);
}
check(!V.canSeeEtimad({ id: 'x', role: 'member', tender: {} }), 'a non-tender member can see Etimad Insights');
check(V.friendly('en', new Error('missing_key:LUSHA_API_KEY')).message.includes('LUSHA_API_KEY'), 'missing key message');

if (failed) { console.log(`\nFAIL (${failed})`); process.exit(1); }
console.log('etimad: all checks passed');
