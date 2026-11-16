/* Pricing sheet → pricing lines: the house template, the app's own export,
   sheets saved without computed values, and the odd heading. */
import * as X from '../web/xlsxread.js';
import * as P from '../web/pricingimport.js';
import { buildXlsx } from '../web/xlsx.js';
import { pricingSheet, projectPrice } from '../web/dash.js';

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('  - ' + msg); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ------------------------------------------- the house template (هيكلية) */
const HEAD = ['#', 'المخرج', 'البند', 'وصف البد', 'الكمية ', 'وحدة القياس', 'سعر التكلفة الإفرادي',
  'سعر التكلفة الإجمالي', 'تكلفة الوحدة', 'الإجمالي', 'ملاحظات'];
const line = (n, item, desc, q, unit, cost, note = null) =>
  [n, 'حفل الإطلاق', item, desc, q, unit, cost, cost * q, cost * 1.6, cost * 1.6 * q, note];
const house = {
  name: 'التفاصيل المالية',
  rows: [
    ['هيكلية مشروع - حفل الإطلاق'],
    HEAD,
    line(1, '1.1 – مفهوم الحفل', 'فكرة إبداعية', 1, 'مفهوم', 505520),
    line(2, '1.4 – تصميم الدعوات', 'الدعوة المطبوعة والرقمية', 2, 'صيغة دعوة', 1520),
    line(3, '1.4 – إرسال الدعوات', 'تأكيد الحضور', 200, 'ضيف', 90, 'بطاقة مطبوعة مع بوكس'),
    [null, null, null, null, null, null, null, 505520 + 3040 + 18000, 'الإجمالي للبيع', (505520 + 3040 + 18000) * 1.6],
    [null, null, null, null, null, null, null, null, 'الضريبة ١٥ ٪', (505520 + 3040 + 18000) * 1.6 * 0.15],
  ],
};
let r = P.readPricing([{ name: 'other', rows: [['nothing here']] }, house]);
check(r.sheet === 'التفاصيل المالية', 'the priced sheet is found among others');
check(r.items.length === 3, `three item rows, not the totals under them (got ${r.items.length})`);
check(eq(r.items[0], { name: '1.1 – مفهوم الحفل', description: 'فكرة إبداعية', qty: 1, unit: 'مفهوم', cost_sar: 505520, unit_price_sar: 808832 }),
  'a line: item, description, quantity, unit, cost and the SELLING unit price (تكلفة الوحدة there is cost × 1.6)');
check(r.items[2].qty === 200 && r.items[2].unit_price_sar === 144 && r.items[2].cost_sar === 90, 'quantities and unit figures, not line totals');
check(r.items[2].description === 'تأكيد الحضور — بطاقة مطبوعة مع بوكس', 'a note is kept with the description');
check(!r.items[0].name.includes('حفل الإطلاق'), 'a single deliverable is not repeated on every line');
check(r.subtotal === 842496, `subtotal before VAT (got ${r.subtotal})`);
check(r.sheetSubtotal === 842496 && r.matches === true, 'the sheet\'s own subtotal is found, and the VAT line is not taken for it');

/* Two deliverables: each line says which one it belongs to. */
const two = { name: 's', rows: [HEAD, line(1, 'أ', '', 1, 'x', 10), [...line(2, 'ب', '', 1, 'x', 10).slice(0, 1), 'المعرض', ...line(2, 'ب', '', 1, 'x', 10).slice(2)]] };
r = P.readPricing([two]);
check(r.items[0].name === 'حفل الإطلاق · أ' && r.items[1].name === 'المعرض · ب', 'with several deliverables the line is prefixed with its own');
check(r.items[0].description === null, 'an empty description is null, not ""');

/* ----------------------------------------- saved without computed values
   A script-written file: formulas, no results, and shared formulas filled
   down from a master (Excel's own way of storing a copied column). */
const xml = `<worksheet><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>البند</t></is></c><c r="B1" t="inlineStr"><is><t>الكمية</t></is></c><c r="C1" t="inlineStr"><is><t>سعر التكلفة الإفرادي</t></is></c><c r="D1" t="inlineStr"><is><t>تكلفة الوحدة</t></is></c><c r="E1" t="inlineStr"><is><t>الإجمالي</t></is></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>شاشات</t></is></c><c r="B2"><v>2</v></c><c r="C2"><v>1000</v></c><c r="D2"><f t="shared" ref="D2:D3" si="0">C2*1.6</f></c><c r="E2"><f t="shared" ref="E2:E3" si="1">D2*B2</f></c></row>
<row r="3"><c r="A3" t="inlineStr"><is><t>إضاءة</t></is></c><c r="B3"><v>3</v></c><c r="C3"><v>500</v></c><c r="D3"><f t="shared" si="0"/></c><c r="E3"><f t="shared" si="1"/></c></row>
<row r="4"><c r="D4" t="inlineStr"><is><t>الإجمالي للبيع</t></is></c><c r="E4"><f>SUM(E2:E3)</f></c></row>
</sheetData></worksheet>`;
const fx = {};
const rows = X.parseSheet(xml, [], fx);
check(fx['2,3'] === 'C3*1.6' && fx['2,4'] === 'D3*B3', `shared formulas are expanded for the cells filled from them (${fx['2,3']}, ${fx['2,4']})`);
r = P.readPricing([{ name: 'calc', rows, formulas: fx }]);
check(r.items.length === 2, 'rows whose figures are all formulas still count');
check(r.items[0].unit_price_sar === 1600 && r.items[1].unit_price_sar === 800, 'prices worked out from the formulas');
check(r.subtotal === 5600 && r.sheetSubtotal === 5600 && r.matches, 'and the SUM under them agrees');

check(X.shiftFormula('$C$2*B2+SUM(A1:A3)', 2, 1) === '$C$2*C4+SUM(B3:B5)', 'filling a formula moves relative references and keeps anchored ones');
check(P.evalFormula('ROUND(A1*1.155,2)+10%', (r_, c) => (r_ === 0 && c === 0 ? 100 : null)) === 115.6, 'ROUND and percent');

/* ---------------------------------------------------- numbers as text */
check(P.toNum('1,500') === 1500 && P.toNum('١٬٥٠٠') === 1500 && P.toNum('SAR 2,000.50') === 2000.5, 'commas, Arabic digits and a currency');
check(P.toNum('٢٥٫٥') === 25.5 && P.toNum('15%') === 0.15 && P.toNum('n/a') === null && P.toNum('') === null, 'Arabic decimal point, percent, and not-a-number');

/* -------------------------------------------- English headings, no total */
r = P.readPricing([{ name: 'en', rows: [
  ['Item', 'Description', 'Qty', 'Unit', 'Unit cost', 'Unit price'],
  ['Booth', 'Shell scheme', 1, 'lot', 8000, 12000],
  ['Carpet', '', '40', 'm²', '25', '45'],
] }]);
check(r.items.length === 2 && r.items[1].qty === 40 && r.items[1].unit_price_sar === 45 && r.items[1].cost_sar === 25, 'English headings; price and cost told apart by their names');
check(r.subtotal === 13800 && r.matches === null, 'no stated subtotal → no verdict');

/* Only a total: the unit price is the total over the quantity. */
r = P.readPricing([{ name: 't', rows: [['البند', 'الكمية', 'الإجمالي'], ['منصة', 4, 1000]] }]);
check(r.items[0].unit_price_sar === 250, 'only a line total → unit price = total ÷ quantity');

/* Nothing usable. */
check(P.readPricing([{ name: 'x', rows: [['Name', 'Phone'], ['Sara', '055']] }]).reason === 'no_header', 'a sheet that is not a pricing sheet says so');
check(P.readPricing([{ name: 'x', rows: [['Item', 'Qty', 'Price']] }]).reason === 'no_rows', 'headings with no lines under them');

/* --------------------------- shapes seen in the sheets already uploaded */
/* Two tables on one sheet, the second with one column fewer: each is read
   with its own headings, and the stated subtotals add up. */
r = P.readPricing([{ name: 'إطار', rows: [
  ['هيكلية اتفاقية إطار عمل'],
  ['م', 'البند', 'وحدة القياس', 'وصف البند', 'مدة التوريد', 'الكمية', 'التكلفة الفردية', 'التكلفة الاجمالية', 'سعر البيع الافرادي', 'سعر البيع الإجمالي', 'ملاحظات'],
  [1, 'ملف', 'وحدة', 'ملف', '7 أيام', 10, 4, 40, 6.4, 64, null],
  [null, null, null, null, null, null, null, 40, 'الإجمالي', 64],
  [],
  ['م', 'الموقع', 'وحدة القياس', 'وصف البند', 'الكمية', 'التكلفة الفردية', 'التكلفة الاجمالي', 'سعر البيع الافرادي', 'سعر البيع الإجمالي', 'ملاحظات'],
  [1, 'محطة الرياض', 'رحلة', 'محطة الرياض', 1, 500, 500, 800, 800, null],
  [2, 'محطة القصيم', 'رحلة', 'محطة القصيم', 2, 1200, 2400, 1920, 3840, null],
  [null, null, null, null, null, null, 2900, 'الإجمالي', 4640],
] }]);
check(r.items.length === 3, `both tables are read (got ${r.items.length})`);
check(r.items[1].qty === 1 && r.items[1].unit_price_sar === 800 && r.items[2].qty === 2 && r.items[2].cost_sar === 1200,
  `the second table uses its own columns, not the first one's (${JSON.stringify(r.items[2])})`);
check(r.items[1].name === 'محطة الرياض' && r.items[1].description === null, 'a description that only repeats the name is dropped');
check(r.subtotal === 4704 && r.sheetSubtotal === 4704 && r.matches, `the tables' stated subtotals add up (${r.subtotal} / ${r.sheetSubtotal})`);

/* A discount and VAT columns in the sheet: the price is after the discount,
   and the tax columns are not taken for the line total. */
r = P.readPricing([{ name: 'NHC', rows: [
  ['هيكلية المشروع'],
  ['المحتوى', 'الاجمالي بعد الضريبة', 'الضريبة 15%', 'الإجمالي بعد الخصم', 'خصم 5%', 'السعر الاجمالي', 'سعر الوحدة \nU', 'التكلفة الاجمالية', 'التكلفة الافرادية', '( المواصفات )', 'الكمية \nQYT', 'وحدة القياس\nU', 'الوصف\nDescription', 'الرقم التسلسلي'],
  [null, 11886.4, 1550.4, 10336, 544, 10880, 1360, 5600, 700, 'بوث إدارة الالتزام', 8, 'بوث', 'بناء جناح', 1],
  [null, 9177, 1197, 7980, 420, 8400, 8400, 5500, 5500, 'ركن التصوير', 1, 'ركن', 'جدار ركن تصوير', 2],
  [null, 21063.4, 2747.4, 18316, 'الإجمالي'],
] }]);
check(r.items.length === 2 && r.discounted, 'a sheet with a discount column is read as discounted');
check(r.items[0].unit_price_sar === 1292 && r.items[0].cost_sar === 700 && r.items[0].qty === 8, `the unit price is after the 5% discount (${JSON.stringify(r.items[0])})`);
check(r.subtotal === 18316 && r.sheetSubtotal === 18316 && r.matches, `and agrees with the sheet's discounted total (${r.subtotal} / ${r.sheetSubtotal})`);

/* Two total columns, the stated figure under the second; a lump-sum line. */
r = P.readPricing([{ name: 's', rows: [
  ['#', 'البند', 'وصف البند', 'الكمية ', 'سعر التكلفة الإفرادي', 'سعر التكلفة الإجمالي', 'سعر البيع الإفرادي', 'سعر البيع الإجمالي', 'اجمالي سعر البيع'],
  [1, 'تركيب وتشغيل', 'الإجمالي حسب جدول الكميات', 1, 17250, 17250, 27600, 27600, 27600],
  [null, null, null, null, null, 17250, 'الإجمالي ', null, 27600],
  [null, null, null, null, null, null, 'ضريبة القيمة المضافة', null, 4140],
] }]);
check(r.items.length === 1 && r.sheetSubtotal === 27600 && r.matches, `the stated total is found under either total column (${r.sheetSubtotal})`);

/* "مسمى البند" names the item; "رقم البند بالاتفاقية" does not. */
r = P.readPricing([{ name: 'inv', rows: [
  ['م', 'رقم البند بالاتفاقية', 'مسمى البند', 'الوحدة', 'الكمية', 'التكلفة الفردية', 'التكلفة الاجمالي', 'سعر البيع الافرادي', 'سعر البيع الإجمالي', 'ملاحظات'],
  [1, 8, 'طاولات شاي', 'طاولة', 10, 700, 7000, 700, 7000, null],
] }]);
check(r.items[0]?.name === 'طاولات شاي' && r.items[0].unit === 'طاولة' && r.items[0].unit_price_sar === 700, `"مسمى البند" is the item (${JSON.stringify(r.items[0])})`);

/* A sheet with no heading row at all is not guessed at. */
check(P.readPricing([{ name: 'x', rows: [[1, 'حجز المساحة', 'متر', 'سعر حجز', 2200, 216, 0]] }]).reason === 'no_header', 'no headings → nothing is guessed');

/* ------------------------------------- the app's own export, round trip */
const items = [
  { id: 'a', name: 'Stand', description: 'Main stand', qty: 2, unit: 'pcs', cost_sar: 1000, unit_price_sar: 1500 },
  { id: 'b', name: 'Screens', description: null, qty: 3, unit: null, cost_sar: null, unit_price_sar: 700 },
];
for (const lang of ['en', 'ar']) {
  const bytes = buildXlsx(pricingSheet(lang, { project: { name: 'P' }, pricingItems: items, people: [] }), { title: 'x' });
  const back = P.readPricing(await X.readXlsx(bytes));
  check(back.items.length === 2, `${lang}: the exported table reads back (${back.items.length} lines, ${back.reason})`);
  check(back.items[0].unit_price_sar === 1500 && back.items[0].cost_sar === 1000 && back.items[0].qty === 2,
    `${lang}: price and cost are not swapped on the way back (${JSON.stringify(back.items[0])})`);
  check(back.items[1].cost_sar === null && back.subtotal === 5100, `${lang}: a blank cost stays blank; subtotal ${back.subtotal}`);
}

check(P.isSpreadsheet({ filename: 'a.XLSX' }) && P.isSpreadsheet({ name: 'b.csv' }) && !P.isSpreadsheet({ filename: 'c.pdf' }), 'which uploads are read');

/* ------------------------------------------------ the project's price */
check(projectPrice({ pricing_items: [{ qty: 2, unit_price_sar: 10 }, { qty: 1, unit_price_sar: null }] }) === 20, 'a project\'s price is Σ qty × unit price');
check(projectPrice({ pricing_items: [] }) === null && projectPrice({}) === null, 'no lines → no price (not zero)');
check(projectPrice({ pricing_items: [{ qty: 3, unit_price_sar: null }, { qty: 2, unit_price_sar: 0 }] }) === null, 'lines with no prices yet → not priced, not SAR 0');

if (failed) { console.log(`pricing import: ${failed} failed`); process.exit(1); }
console.log('pricing import: ok');
