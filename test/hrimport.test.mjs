/* HR → Import from Excel: the reader, the column recognition, the value
   parsing, the matching across several reports, and the preview screen. */
import { deflateRawSync } from 'node:zlib';
import * as X from '../web/xlsxread.js';
import * as IM from '../web/hrimport.js';

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('  - ' + msg); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ------------------------------------------------------- a real .xlsx */
/* A deflated ZIP, as Excel writes it (the app's own writer stores without
   compression, so it would not exercise the inflate path). */
function zip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let off = 0;
  const u16 = (n) => [n & 255, (n >> 8) & 255];
  const u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  for (const [name, text] of Object.entries(files)) {
    const nb = enc.encode(name), raw = enc.encode(text), data = deflateRawSync(raw);
    const local = [...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0), ...u32(0),
      ...u32(data.length), ...u32(raw.length), ...u16(nb.length), ...u16(0)];
    parts.push(Uint8Array.from(local), nb, data);
    central.push(Uint8Array.from([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0), ...u32(0),
      ...u32(data.length), ...u32(raw.length), ...u16(nb.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nb);
    off += local.length + nb.length + data.length;
  }
  const cdLen = central.reduce((n, p) => n + p.length, 0);
  const end = Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(Object.keys(files).length), ...u16(Object.keys(files).length),
    ...u32(cdLen), ...u32(off), ...u16(0)]);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}
const xlsx = zip({
  'xl/workbook.xml': '<workbook><sheets><sheet name="Cover" sheetId="1" r:id="rId1"/><sheet name="الموظفين" sheetId="2" r:id="rId2"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
  'xl/sharedStrings.xml': '<sst><si><t>Employee ID</t></si><si><t>Employee Name</t></si><si><t>Email</t></si><si><r><t>Joining </t></r><r><t>Date</t></r></si>'
    + '<si><t>Basic Salary</t></si><si><t>Sara Ali &amp; Co</t></si><si><t>sara@expandexpo.com</t></si><si><t>Report</t></si></sst>',
  'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>7</v></c></row></sheetData></worksheet>',
  'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>7</v></c></row>'
    + '<row r="3"><c r="A3" t="s"><v>0</v></c><c r="B3" t="s"><v>1</v></c><c r="C3" t="s"><v>2</v></c><c r="D3" t="s"><v>3</v></c><c r="F3" t="s"><v>4</v></c></row>'
    + '<row r="4"><c r="A4"><v>101</v></c><c r="B4" t="s"><v>5</v></c><c r="C4" t="s"><v>6</v></c><c r="D4"><v>45323</v></c><c r="F4" t="inlineStr"><is><t>12,500</t></is></c></row>'
    + '</sheetData></worksheet>',
});
const sheets = await X.readXlsx(xlsx);
check(sheets.length === 2 && sheets[1].name === 'الموظفين', `sheet names ${sheets.map(s => s.name)}`);
check(eq(sheets[1].rows[2], ['Employee ID', 'Employee Name', 'Email', 'Joining Date', null, 'Basic Salary']), `header row ${JSON.stringify(sheets[1].rows[2])}`);
check(eq(sheets[1].rows[3], [101, 'Sara Ali & Co', 'sara@expandexpo.com', 45323, null, '12,500']), `data row ${JSON.stringify(sheets[1].rows[3])}`);
const setup = IM.setupFile('x.xlsx', sheets);
check(setup.sheetIdx === 1 && setup.headerRow === 2, `picked sheet ${setup.sheetIdx} row ${setup.headerRow}`);
check(eq(setup.map, ['employee_no', 'full_name', 'email', 'joining_date', null, 'basic']), `map ${JSON.stringify(setup.map)}`);

/* CSV and the HTML tables some systems save as .xls */
check(eq(X.parseCsv('Name;Email\n"Ali; Jr";a@x.com\n'), [['Name', 'Email'], ['Ali; Jr', 'a@x.com']]), 'csv with ; and quotes');
check(eq(X.parseHtmlTables('<table><tr><th>Name</th><th>Mobile</th></tr><tr><td>Ali</td><td>0501&nbsp;</td></tr></table>')[0].rows,
  [['Name', 'Mobile'], ['Ali', '0501\u00a0'.trim()]]), 'html table');

/* ------------------------------------------------------------- columns */
const g = (h) => IM.guessField(h);
check(g('ID Number') === 'national_id' && g('رقم الهوية/الإقامة') === 'national_id' && g('Iqama No.') === 'national_id', 'ID columns');
check(g('Contract End Date') === 'contract_end' && g('تاريخ انتهاء العقد') === 'contract_end', 'contract end');
check(g('Date of Birth (Hijri)') === null && g('تاريخ الميلاد هجري') === null, 'Hijri dates are not read as Gregorian');
check(g('Contract Status') === null && g('Total Salary') === null && g('Company Name') === null, 'look-alike columns are ignored');
check(g('Basic Salary (SAR)') === 'basic' && g('بدل السكن') === 'housing' && g('Transportation Allowance') === 'transport', 'salary parts');
check(g('Line Manager') === 'supervisor_id' && g('Emergency Contact Name') === 'emergency_name' && g('Bank Name') === 'bank_name', 'longest name wins');
check(g('Marital Status') === 'marital_status' && g('Status') === 'employment_status', 'status columns');

/* -------------------------------------------------------------- values */
check(IM.parseDate(45323) === '2024-02-01' && IM.parseDate('01/09/2023') === '2023-09-01' && IM.parseDate('2027-06-30') === '2027-06-30', 'dates');
check(IM.parseDate('1445/07/20') === null && IM.parseDate('٢٠٢٥/٠١/٠٥') === '2025-01-05' && IM.parseDate('13/25/2024') === null, 'Hijri refused, Arabic digits read');
check(IM.parsePhone(501234567) === '0501234567' && IM.parsePhone('+966 55 111 2222') === '0551112222' && IM.parsePhone('00971501112222') === '+971501112222', 'phones');
check(IM.parseValue('national_id', 1098765432) === '1098765432' && IM.parseValue('national_id', 'مهندس') === null, 'ID numbers');
check(IM.parseValue('iban', 'sa03 8000 0000 6080 1016 7519') === 'SA0380000000608010167519' && IM.parseValue('iban', '12345') === null, 'IBAN');
check(IM.parseValue('gender', 'أنثى') === 'female' && IM.parseValue('gender', 'M') === 'male', 'gender');
check(IM.parseValue('employment_status', 'على رأس العمل') === 'active' && IM.parseValue('employment_status', 'Resigned') === 'terminated', 'status values');
check(IM.parseValue('contract_type', 'غير محدد المدة') === 'unlimited' && IM.parseValue('contract_type', 'محدد المدة') === 'fixed', 'contract types');
check(IM.parseValue('basic', '١٠٬٠٠٠') === 10000 && IM.parseValue('basic', '-') === null, 'money');

/* ------------------------------------------------------------- the plan */
const file = (name, rows) => IM.setupFile(name, [{ name: 'S', rows }]);
const jisr = file('jisr.xlsx', [
  ['Employee Master Report'], [],
  ['Employee ID', 'Employee Name', 'Email', 'Mobile', 'Nationality', 'Department', 'Line Manager', 'Joining Date', 'Job Title', 'Grade'],
  [101, 'Sara Ahmed Ali', 'SARA@expandexpo.com', 501234567, 'Saudi', 'Project management', 'Walid ElGendy', 45323, 'Project Manager', ''],
  [102, 'Omar Hassan', 'omar.other@gmail.com', null, 'Egyptian', 'Nowhere', 'Nobody Here', '01/09/2023', 'Designer', null],
  [103, 'Stranger Person', 'stranger@gmail.com', null, 'Indian', null, null, null, 'Driver', null],
]);
const mudad = file('mudad.xlsx', [
  ['الرقم الوظيفي', 'اسم الموظف', 'رقم الهوية/الإقامة', 'الراتب الأساسي', 'بدل السكن', 'بدل النقل', 'إجمالي الراتب', 'رقم الآيبان'],
  [101, 'سارة', null, '10,000', '2,500', 500, 13000, 'SA03 8000 0000 6080 1016 7519'],
  [null, 'Omar Hassan', '2234567890', 8000, 2000, 500, 10500, null],
]);
const people = [
  { id: 'w', full_name: 'Walid ElGendy', email: 'walid@expandexpo.com', department_id: 'bd' },
  { id: 's', full_name: 'Sara Ali', email: 'sara@expandexpo.com', department_id: 'bd', supervisor_id: null },
  { id: 'o', full_name: 'Omar Hassan', email: 'omar@expandexpo.com', department_id: 'pm' },
];
const plan = IM.planImport({
  files: [jisr, mudad], people,
  emps: [{ profile_id: 's', phone: '0500000000', grade: 'G5', position: 'Project Manager' }],
  privs: [], salaries: [{ employee_id: 'o', effective_from: '2025-01-01', basic: 7000, housing: 2000, transport: 500, other_allowances: 0 }],
  departments: [{ id: 'pm', name_en: 'Project management', name_ar: 'إدارة المشاريع' }, { id: 'bd', name_en: 'Business development', name_ar: 'تطوير الأعمال' }],
  today: '2026-11-01',
});
const sara = plan.people.find(p => p.id === 's'), omar = plan.people.find(p => p.id === 'o');
check(plan.people.length === 2 && plan.skipped.length === 1 && plan.skipped[0].label === 'Stranger Person', `matched ${plan.people.length}, skipped ${JSON.stringify(plan.skipped)}`);
check(sara && sara.how.includes('email') && sara.how.includes('linked'), `Sara matched by ${sara?.how}`);
check(sara.emp.phone === '0501234567' && sara.emp.joining_date === '2024-02-01' && sara.emp.is_saudi === true, `Sara emp ${JSON.stringify(sara.emp)}`);
check(!('grade' in sara.emp) && !('position' in sara.emp), 'an empty cell or an equal value changes nothing');
check(eq(sara.prof, { department_id: 'pm', supervisor_id: 'w' }), `Sara org ${JSON.stringify(sara.prof)}`);
check(sara.priv.iban === 'SA0380000000608010167519', 'IBAN from the second report, linked by employee number');
check(eq(sara.salary, { basic: 10000, housing: 2500, transport: 500, other_allowances: 0, effective_from: '2024-02-01', reason: 'hire' }), `Sara salary ${JSON.stringify(sara.salary)}`);
check(omar && omar.how.includes('name') && omar.priv.national_id === '2234567890', `Omar ${JSON.stringify(omar)}`);
check(omar.salary && omar.salary.basic === 8000 && omar.salary.effective_from === '2026-11-01' && omar.salary.reason === 'adjustment', `Omar raise ${JSON.stringify(omar.salary)}`);
check(plan.warnings.length === 2 && plan.warnings.some(w => w.kind === 'dept' && w.value === 'Nowhere'), `warnings ${JSON.stringify(plan.warnings)}`);
check(IM.nameMatcher([{ id: 'a', full_name: 'Ali Saleh' }, { id: 'b', full_name: 'Ali Saleh Omar' }])('Ali Saleh')?.id === 'a', 'exact name beats partial');
check(IM.nameMatcher([{ id: 'a', full_name: 'Ali Saleh' }, { id: 'b', full_name: 'Ali Saleh' }])('Ali Saleh') === null, 'two people with one name match nobody');

/* --------------------------------------------------------------- screen */
for (const lang of ['en', 'ar']) {
  const html = IM.hrImportView(lang, { people, departments: [{ id: 'pm', name_en: 'Project management', name_ar: 'إدارة المشاريع' }],
    imp: { files: [jisr, mudad], plan, skip: { o: true } } });
  check(html.includes('data-imp-files') && html.includes('data-imp-col="0"') && html.includes('data-imp-apply'), `${lang}: screen controls`);
  check(html.includes('data-imp-skip="o"') && !html.includes('data-imp-skip="o" checked'), `${lang}: an unticked person stays unticked`);
  check(html.includes(lang === 'en' ? 'Save ' : 'حفظ ') && html.includes('Stranger Person'), `${lang}: save button and skipped list`);
}

if (failed) { console.log(`\nFAIL (${failed})`); process.exit(1); }
console.log('hrimport: all checks passed');
