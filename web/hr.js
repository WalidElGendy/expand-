/* ==========================================================================
   HR system screens. Pure functions of (lang, ctx) returning HTML, like every
   other view; hrctl.js loads the data and wires the controls; hrlogic.js
   decides every number. What a person sees is decided by what the database
   lets them read — these views only choose which controls to draw.
   ========================================================================== */

import * as db from './db.js';
import * as H from './hrlogic.js';
import { esc, fmt, kpi, deptName, isHR, formScore, KPI_ROWS, leaveSummary, dropField,
         hrEmpPill, hrReqPill, DSTR, fileSize } from './dash.js';

/* ------------------------------------------------------------------ words */
export const HSTR = {
  en: {
    myHr: 'My HR', tabs: { dash: 'Dashboard', people: 'Employees', attendance: 'Attendance', requests: 'Requests',
      payroll: 'Payroll', performance: 'Performance', letters: 'Letters', hiring: 'Hiring', settings: 'Settings', team: 'My team' },
    k: { headcount: 'Employees', active: 'Active', present: 'Present today', onLeave: 'On leave', sick: 'Sick today',
      absent: 'Absent today', late: 'Late today', contracts: 'Contracts ending', pending: 'Pending requests',
      docs: 'Documents expiring', low: 'Low performers', probation: 'On probation', notWorkDay: 'Not a work day' },
    alerts: 'Alerts', noAlerts: 'Nothing needs attention.',
    al: { contract_end: 'Contract ends {d}', probation_end: 'Probation ends {d}', id_expiry: 'ID/Iqama expires {d}',
      passport_expiry: 'Passport expires {d}', doc_expiry: '{doc} expires {d}', leave_ending: 'Back from leave {d}',
      approval_delay: 'Request waiting {h} hours', expired: '(overdue)' },
    trend: 'Attendance, last 14 work days', trendNote: 'Share of expected staff who clocked in (people on leave are not expected).',
    byDept: 'Employees by department', leaders: 'Most leave this year', lowPerf: 'Low performers (latest review under 60%)',
    noData: 'No data yet.', days: 'days', viewAll: 'View all',
    name: 'Name', dept: 'Department', position: 'Position', status: 'Status', joined: 'Joined', contractEnd: 'Contract ends',
    balance: 'Annual balance', today: 'Today', search: 'Search', all: 'All', exportCsv: 'Export CSV', newHire: '+ New hiring request',
    st: { in: 'In', out: 'Left', absent: 'Absent', leave: 'On leave', sick: 'Sick', off: 'Off', expected: 'Not in yet' },
    empTabs: { profile: 'Profile', documents: 'Documents', leave: 'Leave', attendance: 'Attendance', salary: 'Salary',
      performance: 'Performance', requests: 'Requests' },
    personal: 'Personal', job: 'Job & contract', identity: 'Identity & bank (HR only)',
    f: { phone: 'Mobile', nationality: 'Nationality', is_saudi: 'Saudi national', gender: 'Gender', male: 'Male', female: 'Female',
      birth_date: 'Date of birth', marital_status: 'Marital status', address: 'Address', emergency_name: 'Emergency contact',
      emergency_phone: 'Emergency phone', position: 'Position', grade: 'Grade', joining_date: 'Joining date',
      employment_status: 'Employment status', contract_type: 'Contract type', contract_start: 'Contract start',
      contract_end: 'Contract end', probation_end: 'Probation ends', work_location: 'Work location',
      gosi_scheme: 'GOSI scheme', annual_leave_override: 'Annual leave days (override)', job_description: 'Job description',
      end_date: 'Last working day', end_reason: 'Reason for leaving', national_id: 'ID / Iqama no.', id_expiry: 'ID / Iqama expiry',
      passport_no: 'Passport no.', passport_expiry: 'Passport expiry', iban: 'IBAN', bank_name: 'Bank', hr_notes: 'HR notes' },
    ct: { unlimited: 'Unlimited', fixed: 'Fixed term', part_time: 'Part time', temporary: 'Temporary' },
    gs: { saudi_legacy: 'Saudi (before Jul 2024)', saudi_new: 'Saudi (new system)', non_saudi: 'Non-Saudi', exempt: 'Exempt', auto: 'From nationality' },
    save: 'Save', saved: 'Saved', readOnly: 'Only HR can change this.', remove: 'Remove', view: 'View', open: 'Open', back: 'Back',
    docKind: { contract: 'Contract', id: 'National ID', iqama: 'Iqama', passport: 'Passport', visa: 'Visa', certificate: 'Certificate',
      medical: 'Medical', bank: 'Bank letter', offer: 'Offer letter', other: 'Other' },
    docTitle: 'Title', docExpiry: 'Expires', docUpload: 'Upload document', docHint: 'Contract, ID, passport, certificates…', noDocs: 'No documents yet.',
    leaveKind: { annual: 'Annual', sick: 'Sick', unpaid: 'Unpaid', other: 'Other' },
    lv: { balance: 'Annual leave left', taken: 'Annual taken', sick: 'Sick days', sickBands: '{f} full pay · {q} at 75% · {u} unpaid',
      from: 'From', to: 'To', days: 'Days', type: 'Type', note: 'Note', record: 'Record leave', none: 'No leave recorded.',
      legal: 'Annual: 21 days a year, 30 after five years (art. 109). Sick: 30 days full pay, 60 at 75%, 30 unpaid per year (art. 117).' },
    att: { day: 'Day', in: 'In', out: 'Out', late: 'Late', early: 'Early', remote: 'Away from office', note: 'Note', month: 'Month',
      workDays: 'Work days', present: 'Present', absent: 'Absent', lateN: 'Late', earlyN: 'Early leave', remoteN: 'Away punches',
      leaveDays: 'Leave', fix: 'Correct a day', fixHint: 'Times in the office time zone.', min: 'min', none: 'No attendance yet.',
      report: 'Monthly attendance report', todayHead: 'Today', distance: '{m} m from office', noLoc: 'no location',
      forgot: 'No clock-out', date: 'Date' },
    sal: { current: 'Current salary', basic: 'Basic', housing: 'Housing', transport: 'Transport', other: 'Other allowances',
      gross: 'Gross', gosiEmp: 'GOSI (employee)', gosiEr: 'GOSI (employer)', netEst: 'Estimated net', history: 'Salary history & raises',
      effective: 'Effective from', reason: 'Reason', add: 'Add salary / raise', none: 'No salary recorded.',
      rs: { hire: 'On hire', raise: 'Raise', promotion: 'Promotion', adjustment: 'Adjustment' }, change: 'Change',
      advances: 'Advances', amount: 'Amount', instalments: 'Instalments', monthly: 'Monthly', remaining: 'Remaining', start: 'From',
      advSt: { active: 'Active', repaid: 'Repaid', cancelled: 'Cancelled' }, noAdv: 'No advances.' },
    perf: { goals: 'Goals', title: 'Goal', due: 'Due', weight: 'Weight %', progress: 'Progress', addGoal: 'Add goal', noGoals: 'No goals yet.',
      gst: { open: 'Open', done: 'Done', dropped: 'Dropped' }, reviews: 'Evaluations', period: 'Period', score: 'Score', by: 'By',
      newReview: 'New evaluation', monthly: 'Monthly', quarterly: 'Quarterly', strengths: 'Strengths', improve: 'To improve',
      notes: 'Manager notes & one-on-ones', addNote: 'Add note', noReviews: 'No evaluations yet.', noNotes: 'No notes yet.',
      actions: 'Action items', latest: 'Latest score', openGoals: 'Open goals', avgProgress: 'Avg. progress' },
    req: { type: 'Request', employee: 'Employee', dates: 'Dates / details', submitted: 'Submitted', stage: 'Stage', age: 'Waiting',
      approve: 'Approve', reject: 'Reject', note: 'Note (optional)', cancel: 'Cancel request', complete: 'Mark done',
      result: 'Upload result (letter / certificate)', makeLetter: 'Draft letter', attachment: 'Attachment', resultFile: 'Result',
      none: 'No requests.', new: 'New request', submit: 'Submit request', mine: 'My requests', waitingYou: 'Waiting for your approval',
      open: 'Open', allReq: 'All', amount: 'Amount (SAR)', instalments: 'Monthly instalments', addressee: 'Addressed to',
      addresseeHint: 'Embassy, bank, government entity…', details: 'Details', time: 'Leaving at', period: 'Month',
      sickDoc: 'Sick note / medical report', attach: 'Attachment (optional)', hours: '{n} h',
      types: { annual_leave: 'Annual leave', sick_leave: 'Sick leave', unpaid_leave: 'Unpaid leave', other_leave: 'Other leave',
        early_leave: 'Early leave', advance: 'Salary advance', salary_certificate: 'Salary certificate', letter: 'Letter from company',
        payslip: 'Payslip', data_update: 'Update my data', other: 'Other' },
      st: { pending_manager: 'Manager review', pending_hr: 'HR review', approved: 'Approved', rejected: 'Rejected',
        cancelled: 'Cancelled', completed: 'Done' },
      flow: 'Leave, early leave and advances go to your manager, then HR. Letters and certificates go straight to HR.',
      over: 'This is more than your current balance ({b} days).' },
    pay: { runs: 'Payroll runs', prepare: 'Prepare payroll', period: 'Month', status: 'Status', employees: 'Employees', total: 'Total net',
      rst: { draft: 'Draft', approved: 'Approved', paid: 'Paid' }, recalc: 'Recalculate from attendance', approve: 'Approve',
      paid: 'Mark as paid', toDraft: 'Back to draft', del: 'Delete draft', additions: 'Additions', otherDed: 'Other deductions',
      absence: 'Absence', late: 'Late', unpaid: 'Unpaid leave', advance: 'Advance', net: 'Net', gosi: 'GOSI',
      employer: 'Employer GOSI', print: 'Print payslips', noSalary: 'Without a salary on record (left out): {n}',
      locked: 'Approved runs are locked. Send back to draft to change them.', none: 'No payroll runs yet.',
      payslip: 'Payslip', earnings: 'Earnings', deductions: 'Deductions', myPayslips: 'My payslips', noSlips: 'No payslips yet.',
      salarySheet: 'Salaries', outstanding: 'Outstanding advances', gosiNote: 'GOSI rates come from Settings — check them against GOSI before each run.' },
    let: { letters: 'Letters', internal: 'Internal', external: 'External', newInt: '+ Internal letter', newExt: '+ External letter',
      number: 'No.', date: 'Date', to: 'To', subject: 'Subject', body: 'Body', kind: 'Type', lang: 'Language', toDept: 'To department',
      recipient: 'Recipient (entity)', attn: 'Attention of', employee: 'Related employee', template: 'Fill from template',
      attachments: 'Attachments', addAtt: 'Attach file', signatory: 'Signed by', signTitle: 'Title',
      lst: { draft: 'Draft', review: 'For review', approved: 'Approved', sent: 'Sent' },
      submit: 'Send for review', toDraft: 'Return to draft', approve: 'Approve & sign', send: 'Mark as sent', sentVia: 'Sent via',
      print: 'Print / save PDF', del: 'Delete draft', onlyAdmin: 'Only an admin can approve.', locked: 'Approved letters cannot be edited.',
      kinds: { memo: 'Memo', circular: 'Circular', salary_certificate: 'Salary certificate', employment_certificate: 'Employment certificate',
        experience: 'Experience certificate', embassy: 'Embassy letter', bank: 'Bank letter', to_whom: 'To whom it may concern',
        warning: 'Warning', other: 'Other' },
      none: 'No letters yet.', draftMark: 'DRAFT — NOT APPROVED', year: 'Year' },
    set: { office: 'Office location (for clock-in)', lat: 'Latitude', lng: 'Longitude', radius: 'Allowed distance (m)',
      useHere: 'Use my current location', hours: 'Working hours', attStart: 'Count absences from', start: 'Start', end: 'End', grace: 'Grace (min)', workDays: 'Work days',
      deduct: 'Payroll deductions', dAbs: 'Deduct unexcused absence (gross ÷ 30 per day)', dLate: 'Deduct lateness (per minute)',
      gosi: 'GOSI rates (%)', scheme: 'Scheme', empPct: 'Employee %', erPct: 'Employer %', cap: 'Contribution cap (SAR)',
      alerts: 'Alerts', approvalHours: 'Approval delay (hours)', contractDays: 'Contract ending (days ahead)', docDays: 'Documents expiring (days ahead)',
      company: 'Company & letters', nameEn: 'Company name (English)', nameAr: 'Company name (Arabic)', cr: 'CR number', address: 'Address',
      footer: 'Letter footer', signatory: 'Signatory name', signTitle: 'Signatory title', signature: 'Signature image', stamp: 'Stamp image',
      imgHint: 'PNG with a transparent background works best', holidays: 'Public holidays', addHol: 'Add holiday', holName: 'Name',
      dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], uploaded: 'uploaded' },
    me: { clockIn: 'Clock in', clockOut: 'Clock out', clockAgain: 'Update clock-out', inAt: 'In at {t}', outAt: 'Out at {t}',
      notIn: 'You have not clocked in today.', locating: 'Getting your location…', noLoc: 'Location not shared — recorded as away from the office.',
      awayWarn: 'You were {m} m from the office — recorded as away.', hours: 'Work hours {a}–{b}', thisMonth: 'This month',
      myDocs: 'My documents', myGoals: 'My goals', approvals: 'Approvals waiting for you', notSetUp: 'Your HR file is not set up yet — ask HR to add your joining date.' },
    hiring: 'Hiring requests',
    dataUpdate: 'What should change?',
    confirmDel: 'Delete this?', confirmReject: 'Reject this request?', confirmPaid: 'Mark this payroll as paid? Advance balances will be reduced.',
    confirmApproveRun: 'Approve this payroll? Employees will see their payslips.',
  },
  ar: {
    myHr: 'ملفي الوظيفي', tabs: { dash: 'لوحة التحكم', people: 'الموظفون', attendance: 'الحضور', requests: 'الطلبات',
      payroll: 'الرواتب', performance: 'الأداء', letters: 'الخطابات', hiring: 'التوظيف', settings: 'الإعدادات', team: 'فريقي' },
    k: { headcount: 'الموظفون', active: 'على رأس العمل', present: 'حاضرون اليوم', onLeave: 'في إجازة', sick: 'مرضى اليوم',
      absent: 'غائبون اليوم', late: 'متأخرون اليوم', contracts: 'عقود ستنتهي', pending: 'طلبات معلّقة',
      docs: 'وثائق ستنتهي', low: 'أداء منخفض', probation: 'تحت التجربة', notWorkDay: 'ليس يوم عمل' },
    alerts: 'التنبيهات', noAlerts: 'لا شيء يحتاج إلى متابعة.',
    al: { contract_end: 'ينتهي العقد {d}', probation_end: 'تنتهي فترة التجربة {d}', id_expiry: 'تنتهي الهوية/الإقامة {d}',
      passport_expiry: 'ينتهي الجواز {d}', doc_expiry: 'تنتهي {doc} {d}', leave_ending: 'يعود من الإجازة {d}',
      approval_delay: 'طلب ينتظر منذ {h} ساعة', expired: '(متأخر)' },
    trend: 'الحضور خلال آخر 14 يوم عمل', trendNote: 'نسبة من سجّلوا الحضور من المتوقع حضورهم (من في إجازة غير متوقع).',
    byDept: 'الموظفون حسب القسم', leaders: 'الأكثر إجازات هذا العام', lowPerf: 'أداء منخفض (آخر تقييم أقل من 60%)',
    noData: 'لا توجد بيانات بعد.', days: 'يوم', viewAll: 'عرض الكل',
    name: 'الاسم', dept: 'القسم', position: 'المسمى', status: 'الحالة', joined: 'المباشرة', contractEnd: 'نهاية العقد',
    balance: 'الرصيد السنوي', today: 'اليوم', search: 'بحث', all: 'الكل', exportCsv: 'تصدير CSV', newHire: '+ طلب توظيف جديد',
    st: { in: 'حاضر', out: 'انصرف', absent: 'غائب', leave: 'إجازة', sick: 'مريض', off: 'عطلة', expected: 'لم يحضر بعد' },
    empTabs: { profile: 'الملف', documents: 'الوثائق', leave: 'الإجازات', attendance: 'الحضور', salary: 'الراتب',
      performance: 'الأداء', requests: 'الطلبات' },
    personal: 'البيانات الشخصية', job: 'الوظيفة والعقد', identity: 'الهوية والبنك (للموارد البشرية فقط)',
    f: { phone: 'الجوال', nationality: 'الجنسية', is_saudi: 'سعودي الجنسية', gender: 'الجنس', male: 'ذكر', female: 'أنثى',
      birth_date: 'تاريخ الميلاد', marital_status: 'الحالة الاجتماعية', address: 'العنوان', emergency_name: 'جهة اتصال للطوارئ',
      emergency_phone: 'هاتف الطوارئ', position: 'المسمى الوظيفي', grade: 'الدرجة', joining_date: 'تاريخ المباشرة',
      employment_status: 'الحالة الوظيفية', contract_type: 'نوع العقد', contract_start: 'بداية العقد',
      contract_end: 'نهاية العقد', probation_end: 'نهاية التجربة', work_location: 'مقر العمل',
      gosi_scheme: 'نظام التأمينات', annual_leave_override: 'أيام الإجازة السنوية (تعديل)', job_description: 'الوصف الوظيفي',
      end_date: 'آخر يوم عمل', end_reason: 'سبب ترك العمل', national_id: 'رقم الهوية / الإقامة', id_expiry: 'انتهاء الهوية / الإقامة',
      passport_no: 'رقم الجواز', passport_expiry: 'انتهاء الجواز', iban: 'الآيبان', bank_name: 'البنك', hr_notes: 'ملاحظات الموارد البشرية' },
    ct: { unlimited: 'غير محدد المدة', fixed: 'محدد المدة', part_time: 'دوام جزئي', temporary: 'مؤقت' },
    gs: { saudi_legacy: 'سعودي (قبل يوليو 2024)', saudi_new: 'سعودي (النظام الجديد)', non_saudi: 'غير سعودي', exempt: 'معفى', auto: 'حسب الجنسية' },
    save: 'حفظ', saved: 'تم الحفظ', readOnly: 'الموارد البشرية فقط يمكنها التعديل.', remove: 'حذف', view: 'عرض', open: 'فتح', back: 'رجوع',
    docKind: { contract: 'العقد', id: 'الهوية الوطنية', iqama: 'الإقامة', passport: 'الجواز', visa: 'التأشيرة', certificate: 'شهادة',
      medical: 'طبي', bank: 'خطاب بنك', offer: 'عرض وظيفي', other: 'أخرى' },
    docTitle: 'العنوان', docExpiry: 'ينتهي', docUpload: 'رفع وثيقة', docHint: 'العقد، الهوية، الجواز، الشهادات…', noDocs: 'لا توجد وثائق بعد.',
    leaveKind: { annual: 'سنوية', sick: 'مرضية', unpaid: 'بدون راتب', other: 'أخرى' },
    lv: { balance: 'المتبقي من السنوية', taken: 'السنوية المأخوذة', sick: 'أيام مرضية', sickBands: '{f} براتب كامل · {q} بـ75% · {u} بدون راتب',
      from: 'من', to: 'إلى', days: 'الأيام', type: 'النوع', note: 'ملاحظة', record: 'تسجيل إجازة', none: 'لا توجد إجازات مسجلة.',
      legal: 'السنوية: 21 يوماً، و30 بعد خمس سنوات (المادة 109). المرضية: 30 يوماً براتب كامل، 60 بـ75%، 30 بدون راتب في السنة (المادة 117).' },
    att: { day: 'اليوم', in: 'الدخول', out: 'الخروج', late: 'تأخير', early: 'انصراف مبكر', remote: 'خارج المكتب', note: 'ملاحظة', month: 'الشهر',
      workDays: 'أيام العمل', present: 'حضور', absent: 'غياب', lateN: 'تأخير', earlyN: 'انصراف مبكر', remoteN: 'تسجيل خارج المكتب',
      leaveDays: 'إجازات', fix: 'تصحيح يوم', fixHint: 'الأوقات بتوقيت المكتب.', min: 'د', none: 'لا يوجد حضور بعد.',
      report: 'تقرير الحضور الشهري', todayHead: 'اليوم', distance: 'يبعد {m} م عن المكتب', noLoc: 'بدون موقع',
      forgot: 'لم يسجل الخروج', date: 'التاريخ' },
    sal: { current: 'الراتب الحالي', basic: 'الأساسي', housing: 'السكن', transport: 'النقل', other: 'بدلات أخرى',
      gross: 'الإجمالي', gosiEmp: 'التأمينات (الموظف)', gosiEr: 'التأمينات (صاحب العمل)', netEst: 'الصافي التقديري', history: 'سجل الرواتب والزيادات',
      effective: 'يسري من', reason: 'السبب', add: 'إضافة راتب / زيادة', none: 'لا يوجد راتب مسجل.',
      rs: { hire: 'عند التعيين', raise: 'زيادة', promotion: 'ترقية', adjustment: 'تعديل' }, change: 'التغيير',
      advances: 'السلف', amount: 'المبلغ', instalments: 'الأقساط', monthly: 'شهرياً', remaining: 'المتبقي', start: 'من',
      advSt: { active: 'قائمة', repaid: 'مسددة', cancelled: 'ملغاة' }, noAdv: 'لا توجد سلف.' },
    perf: { goals: 'الأهداف', title: 'الهدف', due: 'الاستحقاق', weight: 'الوزن %', progress: 'الإنجاز', addGoal: 'إضافة هدف', noGoals: 'لا توجد أهداف بعد.',
      gst: { open: 'قائم', done: 'مكتمل', dropped: 'ملغى' }, reviews: 'التقييمات', period: 'الفترة', score: 'الدرجة', by: 'بواسطة',
      newReview: 'تقييم جديد', monthly: 'شهري', quarterly: 'ربع سنوي', strengths: 'نقاط القوة', improve: 'مجالات التحسين',
      notes: 'ملاحظات المدير والاجتماعات الفردية', addNote: 'إضافة ملاحظة', noReviews: 'لا توجد تقييمات بعد.', noNotes: 'لا توجد ملاحظات بعد.',
      actions: 'المهام المتفق عليها', latest: 'آخر درجة', openGoals: 'أهداف قائمة', avgProgress: 'متوسط الإنجاز' },
    req: { type: 'الطلب', employee: 'الموظف', dates: 'التواريخ / التفاصيل', submitted: 'تاريخ التقديم', stage: 'المرحلة', age: 'الانتظار',
      approve: 'اعتماد', reject: 'رفض', note: 'ملاحظة (اختياري)', cancel: 'إلغاء الطلب', complete: 'تم التنفيذ',
      result: 'رفع النتيجة (خطاب / شهادة)', makeLetter: 'إعداد خطاب', attachment: 'المرفق', resultFile: 'النتيجة',
      none: 'لا توجد طلبات.', new: 'طلب جديد', submit: 'إرسال الطلب', mine: 'طلباتي', waitingYou: 'بانتظار اعتمادك',
      open: 'المفتوحة', allReq: 'الكل', amount: 'المبلغ (ر.س)', instalments: 'عدد الأقساط الشهرية', addressee: 'موجّه إلى',
      addresseeHint: 'سفارة، بنك، جهة حكومية…', details: 'التفاصيل', time: 'وقت الانصراف', period: 'الشهر',
      sickDoc: 'التقرير الطبي', attach: 'مرفق (اختياري)', hours: '{n} ساعة',
      types: { annual_leave: 'إجازة سنوية', sick_leave: 'إجازة مرضية', unpaid_leave: 'إجازة بدون راتب', other_leave: 'إجازة أخرى',
        early_leave: 'انصراف مبكر', advance: 'سلفة', salary_certificate: 'تعريف بالراتب', letter: 'خطاب من الشركة',
        payslip: 'كشف راتب', data_update: 'تعديل بيانات', other: 'أخرى' },
      st: { pending_manager: 'لدى المدير', pending_hr: 'لدى الموارد البشرية', approved: 'معتمد', rejected: 'مرفوض',
        cancelled: 'ملغى', completed: 'تم' },
      flow: 'الإجازات والانصراف المبكر والسلف تذهب لمديرك ثم للموارد البشرية. الخطابات والتعريفات تذهب مباشرة للموارد البشرية.',
      over: 'هذا أكثر من رصيدك الحالي ({b} يوم).' },
    pay: { runs: 'مسيرات الرواتب', prepare: 'إعداد مسير', period: 'الشهر', status: 'الحالة', employees: 'الموظفون', total: 'إجمالي الصافي',
      rst: { draft: 'مسودة', approved: 'معتمد', paid: 'مدفوع' }, recalc: 'إعادة الاحتساب من الحضور', approve: 'اعتماد',
      paid: 'تم الصرف', toDraft: 'إعادة إلى مسودة', del: 'حذف المسودة', additions: 'إضافات', otherDed: 'خصومات أخرى',
      absence: 'غياب', late: 'تأخير', unpaid: 'إجازة بدون راتب', advance: 'سلفة', net: 'الصافي', gosi: 'التأمينات',
      employer: 'تأمينات صاحب العمل', print: 'طباعة الكشوف', noSalary: 'بدون راتب مسجل (غير مشمولين): {n}',
      locked: 'المسيرات المعتمدة مقفلة. أعدها إلى مسودة للتعديل.', none: 'لا توجد مسيرات بعد.',
      payslip: 'كشف راتب', earnings: 'المستحقات', deductions: 'الاستقطاعات', myPayslips: 'كشوف رواتبي', noSlips: 'لا توجد كشوف بعد.',
      salarySheet: 'الرواتب', outstanding: 'السلف القائمة', gosiNote: 'نسب التأمينات من الإعدادات — راجعها مع التأمينات الاجتماعية قبل كل مسير.' },
    let: { letters: 'الخطابات', internal: 'داخلي', external: 'صادر', newInt: '+ خطاب داخلي', newExt: '+ خطاب صادر',
      number: 'الرقم', date: 'التاريخ', to: 'إلى', subject: 'الموضوع', body: 'نص الخطاب', kind: 'النوع', lang: 'اللغة', toDept: 'القسم المرسل إليه',
      recipient: 'الجهة المستلمة', attn: 'عناية', employee: 'الموظف المعني', template: 'تعبئة من قالب',
      attachments: 'المرفقات', addAtt: 'إرفاق ملف', signatory: 'المعتمد', signTitle: 'المنصب',
      lst: { draft: 'مسودة', review: 'للمراجعة', approved: 'معتمد', sent: 'تم الإرسال' },
      submit: 'إرسال للمراجعة', toDraft: 'إعادة إلى مسودة', approve: 'اعتماد وتوقيع', send: 'تم الإرسال', sentVia: 'وسيلة الإرسال',
      print: 'طباعة / حفظ PDF', del: 'حذف المسودة', onlyAdmin: 'الاعتماد للمدير العام فقط.', locked: 'لا يمكن تعديل الخطاب بعد اعتماده.',
      kinds: { memo: 'مذكرة', circular: 'تعميم', salary_certificate: 'تعريف بالراتب', employment_certificate: 'شهادة تعريف',
        experience: 'شهادة خبرة', embassy: 'خطاب سفارة', bank: 'خطاب بنك', to_whom: 'إلى من يهمه الأمر',
        warning: 'إنذار', other: 'أخرى' },
      none: 'لا توجد خطابات بعد.', draftMark: 'مسودة — غير معتمد', year: 'السنة' },
    set: { office: 'موقع المكتب (لتسجيل الحضور)', lat: 'خط العرض', lng: 'خط الطول', radius: 'المسافة المسموحة (م)',
      useHere: 'استخدام موقعي الحالي', hours: 'ساعات العمل', attStart: 'احتساب الغياب ابتداءً من', start: 'البداية', end: 'النهاية', grace: 'السماحية (د)', workDays: 'أيام العمل',
      deduct: 'خصومات الرواتب', dAbs: 'خصم الغياب بدون عذر (الإجمالي ÷ 30 لليوم)', dLate: 'خصم التأخير (بالدقيقة)',
      gosi: 'نسب التأمينات (%)', scheme: 'النظام', empPct: 'الموظف %', erPct: 'صاحب العمل %', cap: 'الحد الأعلى للأجر (ر.س)',
      alerts: 'التنبيهات', approvalHours: 'تأخر الموافقات (ساعات)', contractDays: 'انتهاء العقود (أيام مسبقاً)', docDays: 'انتهاء الوثائق (أيام مسبقاً)',
      company: 'الشركة والخطابات', nameEn: 'اسم الشركة (إنجليزي)', nameAr: 'اسم الشركة (عربي)', cr: 'السجل التجاري', address: 'العنوان',
      footer: 'تذييل الخطاب', signatory: 'اسم المعتمد', signTitle: 'منصب المعتمد', signature: 'صورة التوقيع', stamp: 'صورة الختم',
      imgHint: 'يفضل PNG بخلفية شفافة', holidays: 'الإجازات الرسمية', addHol: 'إضافة إجازة', holName: 'الاسم',
      dow: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'], uploaded: 'مرفوع' },
    me: { clockIn: 'تسجيل الحضور', clockOut: 'تسجيل الانصراف', clockAgain: 'تحديث الانصراف', inAt: 'الحضور {t}', outAt: 'الانصراف {t}',
      notIn: 'لم تسجل حضورك اليوم.', locating: 'جارٍ تحديد موقعك…', noLoc: 'لم تتم مشاركة الموقع — سُجّل كخارج المكتب.',
      awayWarn: 'كنت على بعد {m} م من المكتب — سُجّل كخارج المكتب.', hours: 'الدوام {a}–{b}', thisMonth: 'هذا الشهر',
      myDocs: 'وثائقي', myGoals: 'أهدافي', approvals: 'بانتظار اعتمادك', notSetUp: 'ملفك لم يكتمل بعد — اطلب من الموارد البشرية إضافة تاريخ مباشرتك.' },
    hiring: 'طلبات التوظيف',
    dataUpdate: 'ما الذي يجب تعديله؟',
    confirmDel: 'حذف؟', confirmReject: 'رفض هذا الطلب؟', confirmPaid: 'تأكيد صرف المسير؟ سيتم خصم أقساط السلف.',
    confirmApproveRun: 'اعتماد المسير؟ سيتمكن الموظفون من رؤية كشوفهم.',
  },
};

/* ------------------------------------------------------------- helpers */
const T = (lang) => HSTR[lang];
const nm = (people, id) => { const p = (people || []).find(x => x.id === id); return p ? (p.full_name || p.email || '—') : '—'; };
const num = (n, d = 2) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const hhmm = (ts, tz = 'Asia/Riyadh') => ts ? new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }) : '—';
const pill = (label, colour) => `<span class="st" style="--c:${colour}"><i></i>${esc(label)}</span>`;
const REQ_C = { pending_manager: 'var(--warn)', pending_hr: 'var(--warn)', approved: 'var(--info)', rejected: 'var(--critical)',
  cancelled: 'var(--ink4)', completed: 'var(--ok)' };
const LET_C = { draft: 'var(--ink3)', review: 'var(--warn)', approved: 'var(--info)', sent: 'var(--ok)' };
const RUN_C = { draft: 'var(--ink3)', approved: 'var(--info)', paid: 'var(--ok)' };
const ST_C = { in: 'var(--ok)', out: 'var(--ink3)', absent: 'var(--critical)', leave: 'var(--info)', sick: 'var(--warn)',
  off: 'var(--ink4)', expected: 'var(--ink4)' };
export const reqPill = (s, lang) => pill(T(lang).req.st[s] || s, REQ_C[s] || 'var(--ink3)');
const letPill = (s, lang) => pill(T(lang).let.lst[s] || s, LET_C[s] || 'var(--ink3)');
const runPill = (s, lang) => pill(T(lang).pay.rst[s] || s, RUN_C[s] || 'var(--ink3)');
const stPill = (s, lang) => pill(T(lang).st[s] || s, ST_C[s] || 'var(--ink3)');
const opt = (v, label, sel) => `<option value="${esc(v)}"${String(v) === String(sel ?? '') ? ' selected' : ''}>${esc(label)}</option>`;
const fld = (label, inner, wide = false) => `<label class="f${wide ? ' f--wide' : ''}"><span>${esc(label)}</span>${inner}</label>`;
const inp = (id, val, attrs = '') => `<input id="${id}" value="${esc(val ?? '')}" ${attrs} />`;
const go = (route, label, cls = 'link') => `<button class="${cls}" data-act="go" data-route="${esc(route)}">${esc(label)}</button>`;
const card = (title, body, extra = '') => `<section class="card"><div class="card__head"><h2>${esc(title)}</h2>${extra}</div>${body}</section>`;
const empty = (text) => `<p class="note">${esc(text)}</p>`;
const tbl = (head, rows, cls = '') => `<div class="tblwrap"><table class="tbl tbl--tight ${cls}"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
const reqDetail = (r, lang) => {
  const t = T(lang);
  if (['annual_leave', 'sick_leave', 'unpaid_leave', 'other_leave'].includes(r.type))
    return `${fmt(r.start_date, lang)} → ${fmt(r.end_date, lang)} · ${num(r.days, 0)} ${t.days}`;
  if (r.type === 'early_leave') return `${fmt(r.start_date, lang)} · ${(r.leave_time || '').slice(0, 5)}`;
  if (r.type === 'advance') return `${H.money(r.amount, lang)} / ${r.instalments || 1}`;
  if (['salary_certificate', 'letter'].includes(r.type)) return r.addressee || '';
  if (r.type === 'payslip') return r.details || '';
  return (r.details || '').slice(0, 80);
};
const periodLabel = (p, lang) => p ? new Date(`${p}-01T00:00:00Z`).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB',
  { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';

/** The HR area's own tab bar. */
export function hrTabs(lang, active) {
  const t = T(lang);
  const hr = isHR();
  const tabs = hr
    ? [['dash', '#/hr'], ['people', '#/hr/people'], ['attendance', '#/hr/attendance'], ['requests', '#/hr/requests'],
       ['payroll', '#/hr/payroll'], ['performance', '#/hr/performance'], ['letters', '#/hr/letters'],
       ['hiring', '#/hr/hiring'], ['settings', '#/hr/settings']]
    : [['team', '#/hr'], ['requests', '#/hr/requests'], ['attendance', '#/hr/attendance'], ['performance', '#/hr/performance']];
  return `<nav class="hrtabs" role="tablist">${tabs.map(([k, r]) =>
    `<button class="hrtab${k === active || (k === 'team' && active === 'dash') ? ' is-on' : ''}" data-act="go" data-route="${r}" role="tab">${esc(t.tabs[k])}</button>`).join('')}</nav>`;
}
const denied = (lang) => card(T(lang).myHr, `<p class="note">${esc(DSTR[lang].hrNoAccess)}</p>`);

/** People HR looks after: active, or with an HR file (new hires before their login). */
export function rosterOf(ctx, { includeLeft = false } = {}) {
  const emps = new Map((ctx.hrEmployees || []).map(e => [e.profile_id, e]));
  return (ctx.people || []).filter(p => (p.is_active || emps.has(p.id)) &&
    (includeLeft || emps.get(p.id)?.employment_status !== 'terminated'))
    .sort((a, b) => String(a.full_name || a.email).localeCompare(String(b.full_name || b.email)));
}
const scope = (ctx) => {
  const me = db.state.me;
  const r = rosterOf(ctx);
  return isHR() ? r : r.filter(p => p.supervisor_id === me?.id);
};

/* ------------------------------------------------------------ charts */
function hbars(rows, { fill = 'var(--brand)', unit = '' } = {}) {
  if (!rows.length) return '';
  const max = Math.max(...rows.map(r => r.n), 1);
  return `<ul class="hbars">${rows.map(r => `
    <li class="hb" title="${esc(r.label)} — ${r.n}${unit ? ' ' + esc(unit) : ''}">
      <span class="hb__l">${r.route ? go(r.route, r.label) : esc(r.label)}${r.sub ? `<span class="hb__sub">${esc(r.sub)}</span>` : ''}</span>
      <span class="hb__track"><span class="hb__fill" style="width:${(r.n / max) * 100}%;background:${fill}"></span></span>
      <span class="hb__n">${r.n}</span>
    </li>`).join('')}</ul>`;
}

/** Present share per work day — one series, so no legend; the title names it. */
function trendChart(lang, trend) {
  if (!trend.length) return empty(T(lang).noData);
  const W = 560, H = 200, PT = 24, PB = 30, PL = 8, PR = 8;
  const series = lang === 'ar' ? [...trend].reverse() : trend;
  const step = (W - PL - PR) / series.length, bw = Math.max(6, Math.min(26, step - 6));
  const ph = H - PT - PB, base = PT + ph;
  const pct = (d) => d.expected ? Math.round((d.present / d.expected) * 100) : 0;
  const maxI = series.reduce((m, d, i) => (pct(d) > pct(series[m]) ? i : m), 0);
  const minI = series.reduce((m, d, i) => (pct(d) < pct(series[m]) ? i : m), 0);
  const bar = (x, y, w, h) => { const r = Math.min(4, w / 2, h); return h <= 0 ? '' : `M${x} ${y + h}V${y + r}q0-${r} ${r}-${r}h${w - 2 * r}q${r} 0 ${r} ${r}V${y + h}Z`; };
  return `<div class="chartwrap"><svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(T(lang).trend)}">
    <g class="grid"><line x1="${PL}" x2="${W - PR}" y1="${base}" y2="${base}"/></g>
    ${series.map((d, i) => {
      const p = pct(d), h = (p / 100) * ph, x = PL + i * step + (step - bw) / 2, y = base - h;
      const lab = i === maxI || i === minI;
      return `<g class="bar"><title>${esc(fmt(d.day, lang))} — ${d.present}/${d.expected} (${p}%)</title>
        <rect x="${PL + i * step}" y="${PT}" width="${step}" height="${ph}" fill="transparent"/>
        <path d="${bar(x, y, bw, h)}"/>
        ${lab ? `<text x="${x + bw / 2}" y="${y - 6}" class="val" text-anchor="middle">${p}%</text>` : ''}</g>`;
    }).join('')}
    ${series.map((d, i) => i % 2 === 0 ? `<text x="${PL + i * step + step / 2}" y="${H - 10}" class="axis" text-anchor="middle">${esc(d.day.slice(8))}/${esc(d.day.slice(5, 7))}</text>` : '').join('')}
  </svg></div>`;
}

/* ============================================================ dashboard */

export function hrDashView(lang, ctx) {
  const t = T(lang);
  const me = db.state.me;
  if (!me) return '';
  const hr = isHR();
  const people = scope(ctx);
  if (!hr && !people.length) return denied(lang);
  const S = H.settingsOf(ctx.hrSettings);
  const today = H.todayIn(S.timezone);
  const holidays = new Set((ctx.hrHolidays || []).map(h => h.day));
  const leaves = ctx.hrLeaves || [];
  const emps = new Map((ctx.hrEmployees || []).map(e => [e.profile_id, e]));
  const T0 = H.todayAttendance({ people, attendance: ctx.hrAttendance || [], leaves, settings: S, holidays, today,
    nowMin: H.minutesNowIn(S.timezone) });
  const reqs = ctx.hrRequests || [];
  const pending = reqs.filter(r => hr ? ['pending_manager', 'pending_hr'].includes(r.status)
    : (r.status === 'pending_manager' && r.manager_id === me.id));
  const alerts = H.hrAlerts({ people, emps: [...emps.values()].filter(e => people.some(p => p.id === e.profile_id)),
    privs: ctx.hrPrivs || [], documents: ctx.hrDocuments || [], leaves, requests: reqs, settings: S, today });
  const low = H.lowPerformers((ctx.hrReviews || []).filter(r => people.some(p => p.id === r.subject_id)), formScore);
  const contracts = alerts.filter(a => a.kind === 'contract_end').length;
  const docs = alerts.filter(a => ['id_expiry', 'passport_expiry', 'doc_expiry'].includes(a.kind)).length;
  const probation = people.filter(p => emps.get(p.id)?.employment_status === 'probation').length;

  const kpis = `
<div class="kpis">
  ${kpi(people.length, t.k.headcount, { colour: 'var(--brand)', sub: `${probation} ${t.k.probation}` })}
  ${kpi(T0.present, t.k.present, { colour: 'var(--ok)', sub: T0.work ? `${T0.clockedIn} ${t.st.in}` : t.k.notWorkDay })}
  ${kpi(T0.onLeave, t.k.onLeave, { colour: 'var(--info)' })}
  ${kpi(T0.sick, t.k.sick, { colour: 'var(--warn)' })}
  ${kpi(T0.absent, t.k.absent, { colour: 'var(--critical)', bad: T0.absent > 0 })}
  ${kpi(T0.late, t.k.late, { colour: 'var(--warn)' })}
</div>
<div class="kpis kpis--4">
  ${kpi(pending.length, t.k.pending, { colour: 'var(--warn)', bad: pending.length > 0 })}
  ${kpi(contracts, t.k.contracts, { colour: 'var(--critical)', bad: contracts > 0 })}
  ${kpi(docs, t.k.docs, { colour: 'var(--warn)', bad: docs > 0 })}
  ${kpi(low.length, t.k.low, { colour: 'var(--critical)' })}
</div>`;

  const alertText = (a) => {
    const d = fmt(a.date, lang);
    let s = (t.al[a.kind] || a.kind).replace('{d}', d).replace('{h}', a.hours ?? '').replace('{doc}', t.docKind[a.doc] || a.doc || '');
    if (a.level === 'critical') s += ` ${t.al.expired}`;
    return s;
  };
  const alertList = alerts.length ? `<ul class="alerts">${alerts.slice(0, 14).map(a => `
    <li class="alert alert--${a.level}">
      <span class="alert__dot"></span>
      ${go(a.request_id ? '#/hr/requests' : `#/hr/e/${a.employee_id}`, nm(ctx.people, a.employee_id))}
      <span class="alert__t">${esc(alertText(a))}</span>
    </li>`).join('')}</ul>${alerts.length > 14 ? `<p class="note">+${alerts.length - 14}</p>` : ''}` : empty(t.noAlerts);

  const trend = H.attendanceTrend({ attendance: ctx.hrAttendance || [], people, leaves, settings: S, holidays, today });
  const deptRows = Object.entries(people.reduce((m, p) => { const k = p.department_id || '—'; m[k] = (m[k] || 0) + 1; return m; }, {}))
    .map(([k, n]) => ({ label: k === '—' ? '—' : deptName(k, lang), n })).sort((a, b) => b.n - a.n);
  const leaders = H.leaveLeaders(leaves.filter(l => people.some(p => p.id === l.employee_id)), Number(today.slice(0, 4)))
    .map(x => ({ label: nm(ctx.people, x.employee_id), n: x.days, route: `#/hr/e/${x.employee_id}` }));
  const lowRows = low.slice(0, 8).map(x => ({ label: nm(ctx.people, x.employee_id), sub: x.period, n: x.pct, route: `#/hr/e/${x.employee_id}` }));

  const approvals = pending.length ? reqTable(lang, ctx, pending.slice(0, 10), { actions: true }) : empty(t.req.none);

  return `
${hrTabs(lang, 'dash')}
${kpis}
<div class="chartrow">
  ${card(t.alerts, alertList, `<span class="muted small">${alerts.length}</span>`)}
  ${card(t.req.waitingYou, approvals, `<span class="muted small">${pending.length}</span>${go('#/hr/requests', t.viewAll)}`)}
</div>
<div class="chartrow">
  ${card(t.trend, trendChart(lang, trend) + `<p class="note">${esc(t.trendNote)}</p>`)}
  ${card(t.byDept, hbars(deptRows) || empty(t.noData))}
</div>
<div class="chartrow">
  ${card(t.leaders, hbars(leaders, { fill: 'var(--info)', unit: t.days }) || empty(t.noData))}
  ${card(t.lowPerf, hbars(lowRows, { fill: 'var(--critical)', unit: '%' }) || empty(t.noData))}
</div>
${todayCard(lang, ctx, T0, S)}`;
}

function todayCard(lang, ctx, T0, S) {
  const t = T(lang);
  const order = { absent: 0, expected: 1, in: 2, out: 3, sick: 4, leave: 5, off: 6 };
  const rows = [...T0.rows].sort((a, b) => order[a.state] - order[b.state]);
  return card(`${t.att.todayHead} · ${fmt(H.todayIn(S.timezone), lang)}`, tbl(
    `<th>${t.name}</th><th>${t.dept}</th><th>${t.status}</th><th class="num">${t.att.in}</th><th class="num">${t.att.out}</th><th class="num">${t.att.late}</th><th>${t.att.remote}</th>`,
    rows.map(r => `<tr>
      <td>${go(`#/hr/e/${r.person.id}`, r.person.full_name || r.person.email)}</td>
      <td class="small muted">${esc(r.person.department_id ? deptName(r.person.department_id, lang) : '—')}</td>
      <td>${stPill(r.state, lang)}</td>
      <td class="num">${hhmm(r.att?.clock_in, S.timezone)}</td>
      <td class="num">${hhmm(r.att?.clock_out, S.timezone)}</td>
      <td class="num${r.late ? ' bad' : ' muted'}">${r.late ? `${r.late} ${t.att.min}` : '—'}</td>
      <td class="small">${r.remote ? `<span class="chip chip--warn">${esc(r.att?.in_distance_m != null ? t.att.distance.replace('{m}', r.att.in_distance_m) : t.att.remote)}</span>` : ''}</td>
    </tr>`).join('')), `<span class="muted small">${T0.present}/${T0.rows.length}</span>`);
}

/* ============================================================= requests table */

export function reqTable(lang, ctx, list, { actions = false, showEmployee = true, mine = false } = {}) {
  const t = T(lang);
  const me = db.state.me;
  if (!list.length) return empty(t.req.none);
  const now = Date.now();
  const canDecide = (r) => r.employee_id !== me?.id && (
    (r.status === 'pending_hr' && isHR()) || (r.status === 'pending_manager' && (r.manager_id === me?.id || isHR())));
  return tbl(
    `${showEmployee ? `<th>${t.req.employee}</th>` : ''}<th>${t.req.type}</th><th>${t.req.dates}</th><th>${t.status}</th><th class="num">${t.req.submitted}</th><th></th>`,
    list.map(r => {
      const open = ctx.openReq === r.id;
      const waitH = Math.floor((now - new Date(r.created_at)) / 3600000);
      return `<tr${open ? ' class="is-open"' : ''}>
        ${showEmployee ? `<td>${go(`#/hr/e/${r.employee_id}`, nm(ctx.people, r.employee_id))}</td>` : ''}
        <td>${esc(t.req.types[r.type] || r.type)}</td>
        <td class="small">${esc(reqDetail(r, lang))}</td>
        <td>${reqPill(r.status, lang)}${['pending_manager', 'pending_hr'].includes(r.status) ? ` <span class="muted small">${esc(t.req.hours.replace('{n}', waitH))}</span>` : ''}</td>
        <td class="num muted">${esc(fmt(r.created_at.slice(0, 10), lang))}</td>
        <td class="num"><button class="btn btn--sm" data-req-open="${esc(r.id)}">${esc(open ? t.back : t.open)}</button></td>
      </tr>${open ? `<tr class="reqdet"><td colspan="${showEmployee ? 6 : 5}">${reqPanel(lang, ctx, r, { canDecide: actions && canDecide(r), mine })}</td></tr>` : ''}`;
    }).join(''));
}

function reqPanel(lang, ctx, r, { canDecide, mine }) {
  const t = T(lang);
  const hr = isHR();
  const facts = [
    [t.req.type, t.req.types[r.type]], [t.req.dates, reqDetail(r, lang)],
    r.details ? [t.req.details, r.details] : null,
    r.manager_id ? [t.req.stage, `${nm(ctx.people, r.manager_id)}${r.manager_decided_at ? ` · ${fmt(r.manager_decided_at.slice(0, 10), lang)}` : ''}${r.manager_note ? ` — ${r.manager_note}` : ''}`] : null,
    r.hr_decided_at ? ['HR', `${nm(ctx.people, r.hr_decided_by)} · ${fmt(r.hr_decided_at.slice(0, 10), lang)}${r.hr_note ? ` — ${r.hr_note}` : ''}`] : null,
  ].filter(Boolean);
  const docTypes = ['salary_certificate', 'letter', 'payslip', 'data_update', 'other'];
  return `<div class="reqpanel">
    <div class="factgrid">${facts.map(([k, v]) => `<div class="fact"><span class="fact__l">${esc(k)}</span><span class="fact__v">${esc(v || '—')}</span></div>`).join('')}</div>
    <div class="actions">
      ${r.attachment_path ? `<button class="btn btn--sm" data-hr-doc="${esc(r.attachment_path)}">${esc(t.req.attachment)}: ${esc(r.attachment_name || '')}</button>` : ''}
      ${r.result_path ? `<button class="btn btn--sm" data-hr-doc="${esc(r.result_path)}">${esc(t.req.resultFile)}: ${esc(r.result_name || '')}</button>` : ''}
      ${mine && ['pending_manager', 'pending_hr'].includes(r.status) ? `<button class="btn btn--sm btn--danger" data-req-cancel="${esc(r.id)}">${esc(t.req.cancel)}</button>` : ''}
    </div>
    ${canDecide ? `<div class="inlineform" style="border:0;padding:8px 0 0">
      <div class="fields">${fld(t.req.note, `<input data-req-note="${esc(r.id)}" maxlength="400" />`, true)}</div>
      <div class="actions"><button class="btn btn--primary btn--sm" data-req-decide="${esc(r.id)}" data-approve="1">${esc(t.req.approve)}</button>
        <button class="btn btn--danger btn--sm" data-req-decide="${esc(r.id)}" data-approve="0">${esc(t.req.reject)}</button></div></div>` : ''}
    ${hr && docTypes.includes(r.type) && ['approved', 'pending_hr'].includes(r.status) ? `<div class="inlineform" style="border:0;padding:8px 0 0">
      <div class="actions">${['salary_certificate', 'letter'].includes(r.type) ? `<button class="btn btn--sm" data-req-letter="${esc(r.id)}">${esc(t.req.makeLetter)}</button>` : ''}</div>
      <div class="fields"><label class="f f--wide"><span>${esc(t.req.result)}</span><input type="file" data-req-result="${esc(r.id)}" accept="image/*,.pdf,.doc,.docx" /></label></div>
      <div class="actions"><button class="btn btn--primary btn--sm" data-req-complete="${esc(r.id)}">${esc(t.req.complete)}</button></div></div>` : ''}
  </div>`;
}

export function hrRequestsView(lang, ctx) {
  const t = T(lang);
  const me = db.state.me;
  const people = scope(ctx);
  if (!isHR() && !people.length) return denied(lang);
  const f = ctx.reqFilter || 'open';
  const typ = ctx.reqType || '';
  let list = (ctx.hrRequests || []).filter(r => isHR() || people.some(p => p.id === r.employee_id) || r.manager_id === me.id);
  if (f === 'open') list = list.filter(r => ['pending_manager', 'pending_hr', 'approved'].includes(r.status));
  if (typ) list = list.filter(r => r.type === typ);
  const year = H.todayIn().slice(0, 4);
  const leaves = (ctx.hrLeaves || []).filter(l => l.start_date.startsWith(year) && people.some(p => p.id === l.employee_id));
  return `
${hrTabs(lang, 'requests')}
<section class="card">
  <div class="card__head"><h2>${esc(t.tabs.requests)}</h2><span class="muted small">${list.length}</span></div>
  <div class="filterbar">
    <label class="f f--sm"><span>${esc(t.status)}</span><select data-reqf="reqFilter">${opt('open', t.req.open, f)}${opt('all', t.req.allReq, f)}</select></label>
    <label class="f f--sm"><span>${esc(t.req.type)}</span><select data-reqf="reqType">${opt('', t.all, typ)}${Object.entries(t.req.types).map(([k, v]) => opt(k, v, typ)).join('')}</select></label>
  </div>
  ${reqTable(lang, ctx, list, { actions: true })}
</section>
${card(`${t.lv.record} · ${year}`, leaves.length ? tbl(
  `<th>${t.name}</th><th>${t.lv.type}</th><th class="num">${t.lv.from}</th><th class="num">${t.lv.to}</th><th class="num">${t.lv.days}</th>`,
  leaves.map(l => `<tr><td>${go(`#/hr/e/${l.employee_id}`, nm(ctx.people, l.employee_id))}</td><td>${esc(t.leaveKind[l.kind])}</td>
    <td class="num muted">${esc(fmt(l.start_date, lang))}</td><td class="num muted">${esc(fmt(l.end_date, lang))}</td><td class="num">${num(l.days, 0)}</td></tr>`).join(''))
  : empty(t.lv.none), `<button class="btn btn--sm" data-hr-csv="leaves" style="margin-inline-start:auto">${esc(t.exportCsv)}</button>`)}`;
}

/* =============================================================== people */

export function hrPeopleView(lang, ctx) {
  const t = T(lang);
  if (!isHR()) return denied(lang);
  const S = H.settingsOf(ctx.hrSettings);
  const today = H.todayIn(S.timezone);
  const emps = new Map((ctx.hrEmployees || []).map(e => [e.profile_id, e]));
  const q = (ctx.peopleQ || '').toLowerCase();
  const dep = ctx.peopleDept || '';
  const stf = ctx.peopleStatus || '';
  const roster = rosterOf(ctx, { includeLeft: stf === 'terminated' || stf === 'all' });
  const statusOf = (p) => emps.get(p.id)?.employment_status || (p.is_active ? 'active' : 'probation');
  const rows = roster.filter(p => (!q || `${p.full_name} ${p.email} ${emps.get(p.id)?.position || ''}`.toLowerCase().includes(q))
    && (!dep || p.department_id === dep) && (!stf || stf === 'all' || statusOf(p) === stf));
  const depts = db.state.departments || [];
  const leaves = ctx.hrLeaves || [];
  return `
${hrTabs(lang, 'people')}
<section class="card">
  <div class="card__head"><h2>${esc(t.tabs.people)}</h2><span class="muted small">${rows.length}</span>
    <span style="margin-inline-start:auto;display:flex;gap:8px">
      <button class="btn btn--sm" data-hr-csv="people">${esc(t.exportCsv)}</button>
      ${go('#/hr/new', t.newHire, 'btn btn--primary btn--sm')}</span></div>
  <div class="filterbar">
    <label class="f f--sm"><span>${esc(t.search)}</span><input data-peoplef="peopleQ" value="${esc(ctx.peopleQ || '')}" /></label>
    <label class="f f--sm"><span>${esc(t.dept)}</span><select data-peoplef="peopleDept">${opt('', t.all, dep)}${depts.map(d => opt(d.id, lang === 'ar' ? d.name_ar : d.name_en, dep)).join('')}</select></label>
    <label class="f f--sm"><span>${esc(t.status)}</span><select data-peoplef="peopleStatus">${opt('', t.all, stf)}${['probation', 'active', 'on_leave', 'terminated'].map(s => opt(s, DSTR[lang].hrEmpSt[s], stf)).join('')}${opt('all', `${t.all} +`, stf)}</select></label>
  </div>
  ${tbl(`<th>${t.name}</th><th>${t.dept}</th><th>${t.position}</th><th>${t.status}</th><th class="num">${t.joined}</th><th class="num">${t.contractEnd}</th><th class="num">${t.balance}</th><th>${t.today}</th>`,
    rows.map(p => {
      const e = emps.get(p.id);
      const ls = leaveSummary(e, leaves.filter(l => l.employee_id === p.id), today);
      const lv = H.leaveOn(leaves, p.id, today);
      const a = (ctx.hrAttendance || []).find(x => x.employee_id === p.id && x.day === today);
      const st = lv ? (lv.kind === 'sick' ? 'sick' : 'leave') : a?.clock_in ? (a.clock_out ? 'out' : 'in') : '';
      const cEnd = e?.contract_end ? H.daysBetween(today, e.contract_end) : null;
      return `<tr>
        <td>${go(`#/hr/e/${p.id}`, p.full_name || p.email)}</td>
        <td class="small muted">${esc(p.department_id ? deptName(p.department_id, lang) : '—')}</td>
        <td class="small">${esc(e?.position || '—')}</td>
        <td>${hrEmpPill(statusOf(p), lang)}</td>
        <td class="num muted">${esc(fmt(e?.joining_date, lang))}</td>
        <td class="num${cEnd !== null && cEnd <= S.contract_alert_days ? ' bad' : ' muted'}">${esc(fmt(e?.contract_end, lang))}</td>
        <td class="num">${ls.balance === null ? '<span class="muted">—</span>' : num(ls.balance, 1)}</td>
        <td>${st ? stPill(st, lang) : ''}</td></tr>`;
    }).join(''))}
</section>`;
}

/* ======================================================== one employee */

export function hrEmpView(lang, ctx) {
  const t = T(lang);
  const me = db.state.me;
  const hr = isHR();
  const p = (ctx.people || []).find(x => x.id === ctx.hrId);
  if (!p) return `${hrTabs(lang, 'people')}${card(DSTR[lang].hrEmpNotFound, '')}`;
  const sup = p.supervisor_id === me?.id;
  if (!hr && !sup) return denied(lang);
  const e = ctx.hrEmp || {};
  const S = H.settingsOf(ctx.hrSettings);
  const today = H.todayIn(S.timezone);
  const tabs = ['profile', 'documents', 'leave', 'attendance', ...(hr ? ['salary'] : []), 'performance', 'requests'];
  const tab = tabs.includes(ctx.empTab) ? ctx.empTab : 'profile';
  const status = e.employment_status || (p.is_active ? 'active' : 'probation');
  const ls = leaveSummary(e, ctx.empLeaves || [], today);

  const head = `
<section class="card">
  <div class="card__head"><h2>${esc(p.full_name || p.email)}</h2>${hrEmpPill(status, lang)}
    <span class="muted small">${esc(e.position || '')}</span></div>
  <div class="factgrid">
    <div class="fact"><span class="fact__l">${esc(t.dept)}</span><span class="fact__v">${esc(p.department_id ? deptName(p.department_id, lang) : '—')}</span></div>
    <div class="fact"><span class="fact__l">${esc(DSTR[lang].hrSupervisor)}</span><span class="fact__v">${esc(p.supervisor_id ? nm(ctx.people, p.supervisor_id) : '—')}</span></div>
    <div class="fact"><span class="fact__l">${esc(t.joined)}</span><span class="fact__v">${esc(fmt(e.joining_date, lang))}</span></div>
    <div class="fact"><span class="fact__l">${esc(t.contractEnd)}</span><span class="fact__v">${esc(fmt(e.contract_end, lang))}</span></div>
    <div class="fact"><span class="fact__l">${esc(t.balance)}</span><span class="fact__v">${ls.balance === null ? '—' : num(ls.balance, 1)}</span></div>
    <div class="fact"><span class="fact__l">${esc(DSTR[lang].email)}</span><span class="fact__v">${esc(p.email || '—')}</span></div>
  </div>
</section>
<nav class="hrtabs hrtabs--sub">${tabs.map(k => `<button class="hrtab${k === tab ? ' is-on' : ''}" data-emp-tab="${k}">${esc(t.empTabs[k])}</button>`).join('')}</nav>`;

  const body = {
    profile: () => empProfile(lang, ctx, p, e, hr),
    documents: () => empDocuments(lang, ctx, p, hr),
    leave: () => empLeave(lang, ctx, p, e, hr, ls),
    attendance: () => empAttendance(lang, ctx, p, e, hr, S),
    salary: () => empSalary(lang, ctx, p, e),
    performance: () => empPerformance(lang, ctx, p),
    requests: () => card(t.empTabs.requests, reqTable(lang, ctx, ctx.empRequests || [], { actions: true, showEmployee: false })),
  }[tab] || (() => '');
  return `${hrTabs(lang, 'people')}${head}${body()}`;
}

function empProfile(lang, ctx, p, e, hr) {
  const t = T(lang);
  const dis = hr ? '' : ' disabled';
  const f = t.f;
  const v = (k) => e[k] ?? '';
  const date = (k) => fld(f[k], `<input type="date" data-ef="${k}" value="${esc(v(k))}"${dis} />`);
  const text = (k, wide = false) => fld(f[k], `<input data-ef="${k}" value="${esc(v(k))}" maxlength="300"${dis} />`, wide);
  const sel = (k, options) => fld(f[k], `<select data-ef="${k}"${dis}>${opt('', '—', v(k))}${options.map(([a, b]) => opt(a, b, v(k))).join('')}</select>`);
  const priv = ctx.empPriv || {};
  const pv = (k) => priv[k] ?? '';
  return `
<section class="card">
  <div class="card__head"><h2>${esc(t.personal)}</h2></div>
  <form id="empForm" class="inlineform" style="border-bottom:0">
    <div class="fields">
      ${text('phone')}${text('nationality')}
      <label class="chk"><input type="checkbox" data-ef="is_saudi"${e.is_saudi ? ' checked' : ''}${dis} /> ${esc(f.is_saudi)}</label>
      ${sel('gender', [['male', f.male], ['female', f.female]])}${date('birth_date')}${text('marital_status')}
      ${text('address', true)}${text('emergency_name')}${text('emergency_phone')}
    </div>
    <h3 class="subhead">${esc(t.job)}</h3>
    <div class="fields">
      ${text('position')}${text('grade')}${date('joining_date')}
      ${sel('employment_status', ['probation', 'active', 'on_leave', 'terminated'].map(s => [s, DSTR[lang].hrEmpSt[s]]))}
      ${sel('contract_type', Object.entries(t.ct))}${date('contract_start')}${date('contract_end')}${date('probation_end')}
      ${text('work_location')}
      ${fld(f.gosi_scheme, `<select data-ef="gosi_scheme"${dis}>${opt('', t.gs.auto, v('gosi_scheme'))}${['saudi_legacy', 'saudi_new', 'non_saudi', 'exempt'].map(s => opt(s, t.gs[s], v('gosi_scheme'))).join('')}</select>`)}
      ${fld(f.annual_leave_override, `<input type="number" min="0" max="365" step="0.5" data-ef="annual_leave_override" value="${esc(v('annual_leave_override'))}"${dis} />`)}
      ${date('end_date')}${text('end_reason')}
      ${fld(f.job_description, `<textarea data-ef="job_description" rows="3"${dis}>${esc(v('job_description'))}</textarea>`, true)}
    </div>
    ${hr ? `<div class="actions"><button type="submit" class="btn btn--primary btn--sm">${esc(t.save)}</button></div>` : `<p class="note">${esc(t.readOnly)}</p>`}
  </form>
</section>
${hr ? `<section class="card">
  <div class="card__head"><h2>${esc(t.identity)}</h2></div>
  <form id="privForm" class="inlineform" style="border-bottom:0">
    <div class="fields">
      ${fld(f.national_id, `<input data-pf="national_id" value="${esc(pv('national_id'))}" autocomplete="off" />`)}
      ${fld(f.id_expiry, `<input type="date" data-pf="id_expiry" value="${esc(pv('id_expiry'))}" />`)}
      ${fld(f.passport_no, `<input data-pf="passport_no" value="${esc(pv('passport_no'))}" autocomplete="off" />`)}
      ${fld(f.passport_expiry, `<input type="date" data-pf="passport_expiry" value="${esc(pv('passport_expiry'))}" />`)}
      ${fld(f.iban, `<input data-pf="iban" value="${esc(pv('iban'))}" autocomplete="off" />`)}
      ${fld(f.bank_name, `<input data-pf="bank_name" value="${esc(pv('bank_name'))}" />`)}
      ${fld(f.hr_notes, `<textarea data-pf="hr_notes" rows="2">${esc(pv('hr_notes'))}</textarea>`, true)}
    </div>
    ${priv.id_doc_path ? `<p class="prose"><button type="button" class="link" data-hr-doc="${esc(priv.id_doc_path)}">${esc(DSTR[lang].hrViewId)}</button> <span class="muted small">${esc(priv.id_doc_name || '')}</span></p>` : ''}
    <div class="actions"><button type="submit" class="btn btn--sm">${esc(t.save)}</button></div>
  </form>
</section>` : ''}`;
}

function empDocuments(lang, ctx, p, hr) {
  const t = T(lang);
  const docs = ctx.empDocs || [];
  const today = H.todayIn();
  return card(t.empTabs.documents, `
  ${hr ? `<form id="docUpForm" class="inlineform">
    <div class="fields">
      ${fld(t.lv.type, `<select id="duKind">${Object.entries(t.docKind).map(([k, v]) => opt(k, v, 'contract')).join('')}</select>`)}
      ${fld(t.docTitle, `<input id="duTitle" maxlength="200" />`)}
      ${fld(t.docExpiry, `<input id="duExp" type="date" />`)}
    </div>
    ${dropField('duFile', t.docUpload, t.docHint, { accept: 'image/*,.pdf,.doc,.docx,.xls,.xlsx', required: true })}
    <div class="actions"><button type="submit" class="btn btn--primary btn--sm">${esc(t.docUpload)}</button></div>
  </form>` : ''}
  ${docs.length ? tbl(`<th>${t.lv.type}</th><th>${t.docTitle}</th><th class="num">${t.docExpiry}</th><th></th>`,
    docs.map(d => {
      const left = d.expires_on ? H.daysBetween(today, d.expires_on) : null;
      return `<tr><td>${esc(t.docKind[d.kind] || d.kind)}</td>
      <td><button class="link" data-hr-doc="${esc(d.path)}">${esc(d.title || d.file_name || t.view)}</button> <span class="muted small">${esc(fileSize(d.size_bytes))}</span></td>
      <td class="num${left !== null && left <= 30 ? ' bad' : ' muted'}">${esc(fmt(d.expires_on, lang))}</td>
      <td class="num">${hr ? `<button class="x" data-doc-del="${esc(d.id)}" title="${esc(t.remove)}">✕</button>` : ''}</td></tr>`;
    }).join('')) : empty(t.noDocs)}`, `<span class="muted small">${docs.length}</span>`);
}

function empLeave(lang, ctx, p, e, hr, ls) {
  const t = T(lang);
  const leaves = ctx.empLeaves || [];
  const sickBefore = 0;
  const b = H.sickBands(sickBefore, ls.sick || 0);
  return `
<section class="card">
  <div class="card__head"><h2>${esc(t.empTabs.leave)}</h2><span class="muted small">${ls.year}</span></div>
  <div class="kpis kpis--in kpis--4">
    ${kpi(ls.balance === null ? '—' : num(ls.balance, 1), t.lv.balance, { colour: 'var(--ok)', bad: ls.balance !== null && ls.balance < 0,
      sub: ls.entitlement === null ? DSTR[lang].hrNoJoinDate : `${ls.accrued} / ${ls.entitlement}` })}
    ${kpi(ls.taken, t.lv.taken, { colour: 'var(--info)' })}
    ${kpi(ls.sick, t.lv.sick, { colour: 'var(--warn)', sub: t.lv.sickBands.replace('{f}', b.full).replace('{q}', b.threeQuarter).replace('{u}', b.unpaid) })}
    ${kpi(ls.unpaid, t.leaveKind.unpaid, { colour: 'var(--ink3)' })}
  </div>
  ${hr ? `<form id="lvForm" class="inlineform">
    <div class="fields">
      ${fld(t.lv.type, `<select id="lvKind">${Object.entries(t.leaveKind).map(([k, v]) => opt(k, v, 'annual')).join('')}</select>`)}
      ${fld(t.lv.from, `<input id="lvFrom" type="date" required />`)}${fld(t.lv.to, `<input id="lvTo" type="date" required />`)}
      ${fld(t.lv.days, `<input id="lvDays" type="number" min="0.5" max="366" step="0.5" required />`)}
      ${fld(t.lv.note, `<input id="lvNote" maxlength="400" />`, true)}
    </div>
    <div class="actions"><button type="submit" class="btn btn--sm">${esc(t.lv.record)}</button></div>
  </form>` : ''}
  ${leaves.length ? tbl(`<th>${t.lv.type}</th><th class="num">${t.lv.from}</th><th class="num">${t.lv.to}</th><th class="num">${t.lv.days}</th><th>${t.lv.note}</th><th></th>`,
    leaves.map(l => `<tr><td>${esc(t.leaveKind[l.kind])}</td><td class="num muted">${esc(fmt(l.start_date, lang))}</td>
      <td class="num muted">${esc(fmt(l.end_date, lang))}</td><td class="num">${num(l.days, 1)}</td><td class="small">${esc(l.note || '')}</td>
      <td class="num">${hr ? `<button class="x" data-leave-del="${esc(l.id)}" title="${esc(t.remove)}">✕</button>` : ''}</td></tr>`).join('')) : empty(t.lv.none)}
  <p class="note">${esc(t.lv.legal)}</p>
</section>`;
}

function attRows(lang, rows, S, { edit = false } = {}) {
  const t = T(lang);
  return tbl(`<th>${t.att.day}</th><th class="num">${t.att.in}</th><th class="num">${t.att.out}</th><th class="num">${t.att.late}</th><th class="num">${t.att.early}</th><th>${t.att.remote}</th><th>${t.att.note}</th>`,
    rows.map(a => `<tr>
      <td>${esc(fmt(a.day, lang))}</td><td class="num">${hhmm(a.clock_in, S.timezone)}</td>
      <td class="num">${a.clock_out ? hhmm(a.clock_out, S.timezone) : `<span class="muted small">${esc(t.att.forgot)}</span>`}</td>
      <td class="num${a.late_minutes ? ' bad' : ' muted'}">${a.late_minutes || '—'}</td>
      <td class="num${a.early_minutes ? ' bad' : ' muted'}">${a.clock_out && a.early_minutes ? a.early_minutes : '—'}</td>
      <td class="small">${a.in_remote || a.out_remote ? `<span class="chip chip--warn">${esc(a.in_distance_m != null ? t.att.distance.replace('{m}', a.in_distance_m) : t.att.noLoc)}</span>` : ''}</td>
      <td class="small">${esc(a.note || '')}</td></tr>`).join(''));
}

function monthBox(lang, m) {
  const t = T(lang);
  return `<div class="kpis kpis--in">
    ${kpi(m.workDays, t.att.workDays, { colour: 'var(--ink3)' })}
    ${kpi(m.present, t.att.present, { colour: 'var(--ok)' })}
    ${kpi(m.absent.length, t.att.absent, { colour: 'var(--critical)', bad: m.absent.length > 0, sub: m.absent.slice(0, 4).map(d => d.slice(8)).join(' · ') })}
    ${kpi(m.lateCount, t.att.lateN, { colour: 'var(--warn)', sub: `${m.lateMinutes} ${t.att.min}` })}
    ${kpi(m.earlyCount, t.att.earlyN, { colour: 'var(--warn)', sub: `${m.earlyMinutes} ${t.att.min}` })}
    ${kpi(m.remote, t.att.remoteN, { colour: 'var(--info)' })}
  </div>`;
}

function empAttendance(lang, ctx, p, e, hr, S) {
  const t = T(lang);
  const period = ctx.attPeriod || H.periodOf(H.todayIn(S.timezone));
  const rows = (ctx.empAttendance || []).filter(a => a.day.startsWith(period));
  const m = H.monthAttendance({ period, employeeId: p.id, emp: e, attendance: rows, leaves: ctx.empLeaves || [],
    holidays: new Set((ctx.hrHolidays || []).map(h => h.day)), settings: S, requests: ctx.empRequests || [], today: H.todayIn(S.timezone) });
  return `
<section class="card">
  <div class="card__head"><h2>${esc(t.empTabs.attendance)}</h2>
    <label class="f f--sm" style="margin-inline-start:auto"><input type="month" data-att-period value="${esc(period)}" /></label></div>
  ${monthBox(lang, m)}
  ${hr ? `<details class="pdet"><summary style="margin-inline:16px">${esc(t.att.fix)}</summary>
    <form id="attFixForm" class="inlineform">
      <div class="fields">
        ${fld(t.att.date, `<input id="afDay" type="date" required />`)}${fld(t.att.in, `<input id="afIn" type="time" />`)}
        ${fld(t.att.out, `<input id="afOut" type="time" />`)}${fld(t.att.note, `<input id="afNote" maxlength="300" />`, true)}
      </div><p class="note">${esc(t.att.fixHint)}</p>
      <div class="actions"><button type="submit" class="btn btn--sm">${esc(t.save)}</button></div></form></details>` : ''}
  ${rows.length ? attRows(lang, rows, S) : empty(t.att.none)}
</section>`;
}

function empSalary(lang, ctx, p, e) {
  const t = T(lang);
  const S = H.settingsOf(ctx.hrSettings);
  const sals = ctx.empSalaries || [];
  const cur = H.salaryOn(sals, p.id, H.todayIn(S.timezone));
  const g = H.gosiFor(e, cur, S);
  const advs = ctx.empAdvances || [];
  const prevOf = (s) => sals.filter(x => x.effective_from < s.effective_from).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
  return `
<section class="card">
  <div class="card__head"><h2>${esc(t.sal.current)}</h2><span class="muted small">${esc(t.gs[g.scheme] || '')}</span></div>
  ${cur ? `<div class="kpis kpis--in">
    ${kpi(num(cur.basic), t.sal.basic, { colour: 'var(--brand)' })}${kpi(num(cur.housing), t.sal.housing, { colour: 'var(--brand)' })}
    ${kpi(num(cur.transport), t.sal.transport, { colour: 'var(--brand)' })}${kpi(num(H.grossOf(cur)), t.sal.gross, { colour: 'var(--ok)', sub: num(cur.other_allowances) + ' ' + t.sal.other })}
    ${kpi(num(g.employee), t.sal.gosiEmp, { colour: 'var(--warn)', sub: `${t.sal.gosiEr}: ${num(g.employer)}` })}
    ${kpi(num(H.grossOf(cur) - g.employee), t.sal.netEst, { colour: 'var(--ok)' })}
  </div>` : empty(t.sal.none)}
  <form id="salForm" class="inlineform">
    <div class="fields">
      ${fld(t.sal.effective, `<input id="sfFrom" type="date" required />`)}
      ${fld(t.sal.basic, `<input id="sfBasic" type="number" min="0" step="0.01" required value="${esc(cur?.basic ?? '')}" />`)}
      ${fld(t.sal.housing, `<input id="sfHousing" type="number" min="0" step="0.01" value="${esc(cur?.housing ?? 0)}" />`)}
      ${fld(t.sal.transport, `<input id="sfTransport" type="number" min="0" step="0.01" value="${esc(cur?.transport ?? 0)}" />`)}
      ${fld(t.sal.other, `<input id="sfOther" type="number" min="0" step="0.01" value="${esc(cur?.other_allowances ?? 0)}" />`)}
      ${fld(t.sal.reason, `<select id="sfReason">${Object.entries(t.sal.rs).map(([k, v]) => opt(k, v, cur ? 'raise' : 'hire')).join('')}</select>`)}
      ${fld(t.lv.note, `<input id="sfNote" maxlength="300" />`, true)}
    </div>
    <div class="actions"><button type="submit" class="btn btn--primary btn--sm">${esc(t.sal.add)}</button></div>
  </form>
  <h3 class="subhead" style="padding:0 16px">${esc(t.sal.history)}</h3>
  ${sals.length ? tbl(`<th>${t.sal.effective}</th><th>${t.sal.reason}</th><th class="num">${t.sal.basic}</th><th class="num">${t.sal.gross}</th><th class="num">${t.sal.change}</th><th>${t.lv.note}</th><th></th>`,
    sals.map(s => { const pr = prevOf(s); const d = pr ? H.grossOf(s) - H.grossOf(pr) : null;
      return `<tr><td>${esc(fmt(s.effective_from, lang))}</td><td>${esc(t.sal.rs[s.reason] || s.reason)}</td>
      <td class="num">${num(s.basic)}</td><td class="num">${num(H.grossOf(s))}</td>
      <td class="num${d > 0 ? ' good' : ''}">${d === null ? '—' : `${d > 0 ? '+' : ''}${num(d)} (${pr && H.grossOf(pr) ? Math.round((d / H.grossOf(pr)) * 1000) / 10 : 0}%)`}</td>
      <td class="small">${esc(s.note || '')}</td><td class="num"><button class="x" data-sal-del="${esc(s.id)}" title="${esc(t.remove)}">✕</button></td></tr>`; }).join('')) : ''}
</section>
${card(t.sal.advances, advs.length ? tbl(`<th>${t.sal.start}</th><th class="num">${t.sal.amount}</th><th class="num">${t.sal.monthly}</th><th class="num">${t.sal.remaining}</th><th>${t.status}</th>`,
  advs.map(a => `<tr><td>${esc(a.start_period)}</td><td class="num">${num(a.amount)}</td><td class="num">${num(a.monthly_amount)}</td>
    <td class="num">${num(a.remaining)}</td><td>${esc(t.sal.advSt[a.status])}</td></tr>`).join('')) : empty(t.sal.noAdv))}`;
}

function empPerformance(lang, ctx, p) {
  const t = T(lang);
  const goals = ctx.empGoals || [];
  const reviews = (ctx.empReviews || []).slice().sort((a, b) => String(b.period).localeCompare(String(a.period)));
  const notes = ctx.empNotes || [];
  const canWrite = isHR() || p.supervisor_id === db.state.me?.id;
  const q = H.todayIn().slice(0, 7);
  return `
${card(t.perf.goals, `
  ${canWrite ? `<form id="goalForm" class="inlineform">
    <div class="fields">
      ${fld(t.perf.title, `<input id="gTitle" required maxlength="200" />`, true)}
      ${fld(t.perf.due, `<input id="gDue" type="date" />`)}${fld(t.perf.weight, `<input id="gWeight" type="number" min="0" max="100" />`)}
      ${fld(t.perf.period, `<input id="gPeriod" maxlength="20" placeholder="${esc(H.todayIn().slice(0, 4))}" />`)}
      ${fld(t.lv.note, `<input id="gDesc" maxlength="500" />`, true)}
    </div><div class="actions"><button type="submit" class="btn btn--sm">${esc(t.perf.addGoal)}</button></div></form>` : ''}
  ${goals.length ? tbl(`<th>${t.perf.title}</th><th class="num">${t.perf.due}</th><th class="num">${t.perf.weight}</th><th>${t.perf.progress}</th><th>${t.status}</th><th></th>`,
    goals.map(g => `<tr><td>${esc(g.title)}${g.description ? `<span class="block muted small">${esc(g.description)}</span>` : ''}</td>
      <td class="num muted">${esc(fmt(g.due_date, lang))}</td><td class="num">${g.weight ?? '—'}</td>
      <td>${canWrite ? `<input type="range" min="0" max="100" step="5" value="${g.progress}" data-goal-prog="${esc(g.id)}" /> ` : ''}<span class="small">${g.progress}%</span></td>
      <td>${canWrite ? `<select class="btn--sm" data-goal-st="${esc(g.id)}">${Object.entries(t.perf.gst).map(([k, v]) => opt(k, v, g.status)).join('')}</select>` : esc(t.perf.gst[g.status])}</td>
      <td class="num">${canWrite ? `<button class="x" data-goal-del="${esc(g.id)}" title="${esc(t.remove)}">✕</button>` : ''}</td></tr>`).join('')) : empty(t.perf.noGoals)}`)}
${card(t.perf.reviews, `
  ${canWrite ? `<details class="pdet"><summary style="margin-inline:16px">${esc(t.perf.newReview)}</summary>
    <form id="revForm" class="inlineform">
      <div class="fields">
        ${fld(t.perf.period, `<select id="rvKind">${opt('m', t.perf.monthly, 'q')}${opt('q', t.perf.quarterly, 'q')}</select>`)}
        ${fld(t.perf.period, `<input id="rvPeriod" required value="${esc(`${q.slice(0, 4)}-Q${Math.floor((Number(q.slice(5)) - 1) / 3) + 1}`)}" maxlength="10" />`)}
      </div>
      ${tbl(`<th>KPI</th><th class="num">1–5</th>`, KPI_ROWS.map(r => `<tr><td class="small">${esc(lang === 'ar' ? r.ar : r.en)}</td>
        <td class="num"><select class="btn--sm" data-rv="${esc(r.k)}">${opt('', '—', '')}${[1, 2, 3, 4, 5].map(n => opt(n, n, '')).join('')}</select></td></tr>`).join(''))}
      <div class="fields">${fld(t.perf.strengths, `<textarea id="rvStr" rows="2"></textarea>`, true)}${fld(t.perf.improve, `<textarea id="rvImp" rows="2"></textarea>`, true)}</div>
      <div class="actions"><button type="submit" class="btn btn--primary btn--sm">${esc(t.save)}</button></div></form></details>` : ''}
  ${reviews.length ? tbl(`<th>${t.perf.period}</th><th>${t.perf.by}</th><th class="num">${t.perf.score}</th><th>${t.perf.strengths}</th><th>${t.perf.improve}</th>`,
    reviews.map(r => { const s = formScore(r.ratings); return `<tr><td>${esc(r.period)}</td><td class="small muted">${esc(nm(ctx.people, r.author_id))}</td>
      <td class="num${s.pct !== null && s.pct < 60 ? ' bad' : ''}">${s.pct === null ? '—' : `${s.pct}%`} <span class="muted small">${s.answered}/${s.of}</span></td>
      <td class="small">${esc(r.strengths || '—')}</td><td class="small">${esc(r.improvements || '—')}</td></tr>`; }).join('')) : empty(t.perf.noReviews)}`)}
${card(t.perf.notes, `
  ${canWrite ? `<form id="noteForm1" class="inlineform">
    <div class="fields">${fld(t.att.date, `<input id="onDate" type="date" required value="${esc(H.todayIn())}" />`)}
      ${fld(t.perf.notes, `<textarea id="onNotes" rows="2" required></textarea>`, true)}${fld(t.perf.actions, `<input id="onAct" maxlength="500" />`, true)}</div>
    <div class="actions"><button type="submit" class="btn btn--sm">${esc(t.perf.addNote)}</button></div></form>` : ''}
  ${notes.length ? `<ul class="timeline">${notes.map(o => `<li class="timeline__i"><span class="timeline__d">${esc(fmt(o.held_on, lang))}</span>
    <span class="timeline__b"><b>${esc(o.by?.full_name || nm(ctx.people, o.conducted_by))}</b> — ${esc(o.notes || '')}
    ${o.action_items ? `<span class="block muted small">${esc(t.perf.actions)}: ${esc(o.action_items)}</span>` : ''}</span></li>`).join('')}</ul>` : empty(t.perf.noNotes)}`)}`;
}

/* ========================================================== attendance */

export function hrAttendanceView(lang, ctx) {
  const t = T(lang);
  const people = scope(ctx);
  if (!isHR() && !people.length) return denied(lang);
  const S = H.settingsOf(ctx.hrSettings);
  const today = H.todayIn(S.timezone);
  const holidays = new Set((ctx.hrHolidays || []).map(h => h.day));
  const leaves = ctx.hrLeaves || [];
  const T0 = H.todayAttendance({ people, attendance: ctx.hrAttendance || [], leaves, settings: S, holidays, today,
    nowMin: H.minutesNowIn(S.timezone) });
  const period = ctx.attPeriod || H.periodOf(today);
  const emps = new Map((ctx.hrEmployees || []).map(e => [e.profile_id, e]));
  const report = people.map(p => ({ p, m: H.monthAttendance({ period, employeeId: p.id, emp: emps.get(p.id),
    attendance: ctx.hrAttendance || [], leaves, holidays, settings: S, requests: ctx.hrRequests || [], today }) }));
  return `
${hrTabs(lang, 'attendance')}
<div class="kpis">
  ${kpi(T0.present, t.k.present, { colour: 'var(--ok)', sub: T0.work ? '' : t.k.notWorkDay })}
  ${kpi(T0.clockedIn, t.st.in, { colour: 'var(--ok)' })}
  ${kpi(T0.absent, t.k.absent, { colour: 'var(--critical)', bad: T0.absent > 0 })}
  ${kpi(T0.late, t.k.late, { colour: 'var(--warn)' })}
  ${kpi(T0.onLeave + T0.sick, t.k.onLeave, { colour: 'var(--info)' })}
  ${kpi(T0.remote, t.att.remote, { colour: 'var(--warn)' })}
</div>
${todayCard(lang, ctx, T0, S)}
<section class="card">
  <div class="card__head"><h2>${esc(t.att.report)}</h2>
    <span style="margin-inline-start:auto;display:flex;gap:8px;align-items:center">
      <input type="month" data-att-period value="${esc(period)}" />
      <button class="btn btn--sm" data-hr-csv="attendance">${esc(t.exportCsv)}</button></span></div>
  ${tbl(`<th>${t.name}</th><th class="num">${t.att.workDays}</th><th class="num">${t.att.present}</th><th class="num">${t.att.absent}</th>
    <th class="num">${t.att.lateN}</th><th class="num">${t.att.late} (${t.att.min})</th><th class="num">${t.att.earlyN}</th><th class="num">${t.att.remoteN}</th><th class="num">${t.att.leaveDays}</th>`,
    report.map(({ p, m }) => `<tr><td>${go(`#/hr/e/${p.id}`, p.full_name || p.email)}</td>
      <td class="num">${m.workDays}</td><td class="num">${m.present}</td>
      <td class="num${m.absent.length ? ' bad' : ''}" title="${esc(m.absent.join(', '))}">${m.absent.length}</td>
      <td class="num">${m.lateCount}</td><td class="num muted">${m.lateMinutes}</td><td class="num">${m.earlyCount}</td>
      <td class="num">${m.remote}</td><td class="num">${Object.values(m.leave).reduce((a, b) => a + b, 0)}</td></tr>`).join(''))}
</section>`;
}
export function attendanceCSV(lang, ctx) {
  const t = T(lang);
  const S = H.settingsOf(ctx.hrSettings);
  const today = H.todayIn(S.timezone);
  const period = ctx.attPeriod || H.periodOf(today);
  const emps = new Map((ctx.hrEmployees || []).map(e => [e.profile_id, e]));
  const holidays = new Set((ctx.hrHolidays || []).map(h => h.day));
  return H.toCSV([[t.name, t.dept, t.att.workDays, t.att.present, t.att.absent, t.att.lateN, `${t.att.late} (${t.att.min})`, t.att.earlyN, t.att.remoteN, t.att.leaveDays],
    ...scope(ctx).map(p => { const m = H.monthAttendance({ period, employeeId: p.id, emp: emps.get(p.id), attendance: ctx.hrAttendance || [],
      leaves: ctx.hrLeaves || [], holidays, settings: S, requests: ctx.hrRequests || [], today });
      return [p.full_name || p.email, p.department_id || '', m.workDays, m.present, m.absent.length, m.lateCount, m.lateMinutes, m.earlyCount, m.remote,
        Object.values(m.leave).reduce((a, b) => a + b, 0)]; })]);
}

/* ============================================================= payroll */

export function hrPayrollView(lang, ctx) {
  const t = T(lang);
  if (!isHR()) return denied(lang);
  const runs = ctx.hrRuns || [];
  const S = H.settingsOf(ctx.hrSettings);
  const today = H.todayIn(S.timezone);
  const people = rosterOf(ctx);
  const sals = ctx.hrSalaries || [];
  const emps = new Map((ctx.hrEmployees || []).map(e => [e.profile_id, e]));
  const advs = (ctx.hrAdvances || []).filter(a => a.status === 'active');
  return `
${hrTabs(lang, 'payroll')}
<section class="card">
  <div class="card__head"><h2>${esc(t.pay.runs)}</h2>
    <form id="runForm" style="margin-inline-start:auto;display:flex;gap:8px;align-items:center">
      <input type="month" id="runPeriod" value="${esc(H.periodOf(today))}" required />
      <button class="btn btn--primary btn--sm" type="submit">${esc(t.pay.prepare)}</button></form></div>
  ${runs.length ? tbl(`<th>${t.pay.period}</th><th>${t.pay.status}</th><th></th>`,
    runs.map(r => `<tr><td>${go(`#/hr/payroll/${r.period}`, periodLabel(r.period, lang))}</td><td>${runPill(r.status, lang)}</td>
      <td class="num">${go(`#/hr/payroll/${r.period}`, t.open, 'btn btn--sm')}</td></tr>`).join('')) : empty(t.pay.none)}
  <p class="note">${esc(t.pay.gosiNote)}</p>
</section>
${card(t.pay.salarySheet, tbl(`<th>${t.name}</th><th class="num">${t.sal.basic}</th><th class="num">${t.sal.housing}</th><th class="num">${t.sal.transport}</th><th class="num">${t.sal.other}</th><th class="num">${t.sal.gross}</th><th>${t.f.gosi_scheme}</th>`,
  people.map(p => { const s = H.salaryOn(sals, p.id, today); const e = emps.get(p.id);
    return `<tr><td>${go(`#/hr/e/${p.id}`, p.full_name || p.email)}</td>${s ? `<td class="num">${num(s.basic)}</td><td class="num">${num(s.housing)}</td>
      <td class="num">${num(s.transport)}</td><td class="num">${num(s.other_allowances)}</td><td class="num">${num(H.grossOf(s))}</td>` : `<td colspan="5" class="muted small">${esc(t.sal.none)}</td>`}
      <td class="small muted">${esc(t.gs[H.gosiSchemeOf(e)])}</td></tr>`; }).join('')), `<span class="muted small">${people.filter(p => H.salaryOn(sals, p.id, today)).length}/${people.length}</span>`)}
${card(t.pay.outstanding, advs.length ? tbl(`<th>${t.name}</th><th>${t.sal.start}</th><th class="num">${t.sal.amount}</th><th class="num">${t.sal.monthly}</th><th class="num">${t.sal.remaining}</th>`,
  advs.map(a => `<tr><td>${go(`#/hr/e/${a.employee_id}`, nm(ctx.people, a.employee_id))}</td><td>${esc(a.start_period)}</td><td class="num">${num(a.amount)}</td>
    <td class="num">${num(a.monthly_amount)}</td><td class="num">${num(a.remaining)}</td></tr>`).join('')) : empty(t.sal.noAdv))}`;
}

export function hrRunView(lang, ctx) {
  const t = T(lang);
  if (!isHR()) return denied(lang);
  const run = ctx.hrRun;
  if (!run) return `${hrTabs(lang, 'payroll')}${card(t.pay.none, '')}`;
  const slips = ctx.hrSlips || [];
  const draft = run.status === 'draft';
  const sum = (k) => slips.reduce((a, s) => a + Number(s[k] || 0), 0);
  const cols = [['gross', t.sal.gross], ['gosi_employee', t.pay.gosi], ['absence_deduction', t.pay.absence], ['late_deduction', t.pay.late],
    ['unpaid_deduction', t.pay.unpaid], ['advance_deduction', t.pay.advance]];
  return `
${hrTabs(lang, 'payroll')}
<section class="card">
  <div class="card__head"><h2>${esc(t.pay.payslip)} · ${esc(periodLabel(run.period, lang))}</h2>${runPill(run.status, lang)}
    <span class="muted small">${slips.length} ${esc(t.pay.employees)}</span></div>
  <div class="kpis kpis--in kpis--4">
    ${kpi(num(sum('gross')), t.sal.gross, { colour: 'var(--brand)' })}
    ${kpi(num(sum('net')), t.pay.total, { colour: 'var(--ok)' })}
    ${kpi(num(sum('gosi_employee')), t.sal.gosiEmp, { colour: 'var(--warn)' })}
    ${kpi(num(sum('gosi_employer')), t.pay.employer, { colour: 'var(--warn)' })}
  </div>
  <div class="actions" style="padding:0 16px 12px">
    ${draft ? `<button class="btn btn--sm" data-run-calc>${esc(t.pay.recalc)}</button>
      <button class="btn btn--primary btn--sm" data-run-status="approved"${slips.length ? '' : ' disabled'}>${esc(t.pay.approve)}</button>
      <button class="btn btn--danger btn--sm" data-run-del>${esc(t.pay.del)}</button>` : ''}
    ${run.status === 'approved' ? `<button class="btn btn--primary btn--sm" data-run-status="paid">${esc(t.pay.paid)}</button>
      <button class="btn btn--sm" data-run-status="draft">${esc(t.pay.toDraft)}</button>` : ''}
    <button class="btn btn--sm" data-hr-csv="payroll">${esc(t.exportCsv)}</button>
    <button class="btn btn--sm" data-run-print${slips.length ? '' : ' disabled'}>${esc(t.pay.print)}</button>
  </div>
  ${ctx.runMissing ? `<p class="note note--warn">${esc(t.pay.noSalary.replace('{n}', ctx.runMissing))}</p>` : ''}
  ${draft ? '' : `<p class="note">${esc(t.pay.locked)}</p>`}
  ${slips.length ? tbl(`<th>${t.name}</th>${cols.map(([, l]) => `<th class="num">${esc(l)}</th>`).join('')}<th class="num">${t.pay.additions}</th><th class="num">${t.pay.otherDed}</th><th class="num">${t.pay.net}</th><th></th>`,
    slips.map(s => `<tr><td>${go(`#/hr/e/${s.employee_id}`, nm(ctx.people, s.employee_id))}${s.absence_days ? `<span class="block muted small">${s.absence_days} ${esc(t.att.absent)}</span>` : ''}</td>
      ${cols.map(([k]) => `<td class="num">${num(s[k])}</td>`).join('')}
      <td class="num">${draft ? `<input class="cellinput num" type="number" step="0.01" min="0" data-slip-add="${esc(s.id)}" value="${esc(s.additions)}" />` : num(s.additions)}</td>
      <td class="num">${draft ? `<input class="cellinput num" type="number" step="0.01" min="0" data-slip-ded="${esc(s.id)}" value="${esc(s.other_deductions)}" />` : num(s.other_deductions)}</td>
      <td class="num"><b>${num(s.net)}</b></td>
      <td class="num"><button class="btn btn--sm" data-slip-print="${esc(s.id)}">${esc(t.pay.payslip)}</button></td></tr>`).join('')
    + `<tr class="tbl__total"><td><b>${esc(t.pay.total)}</b></td>${cols.map(([k]) => `<td class="num"><b>${num(sum(k))}</b></td>`).join('')}
      <td class="num">${num(sum('additions'))}</td><td class="num">${num(sum('other_deductions'))}</td><td class="num"><b>${num(sum('net'))}</b></td><td></td></tr>`) : empty(t.pay.none)}
</section>`;
}
export function payrollCSV(lang, ctx) {
  const t = T(lang);
  const rows = (ctx.hrSlips || []).map(s => [nm(ctx.people, s.employee_id), s.basic, s.housing, s.transport, s.other_allowances, s.additions, s.gross,
    s.gosi_employee, s.gosi_employer, s.absence_days, s.absence_deduction, s.late_deduction, s.unpaid_deduction, s.advance_deduction, s.other_deductions, s.net]);
  return H.toCSV([[t.name, t.sal.basic, t.sal.housing, t.sal.transport, t.sal.other, t.pay.additions, t.sal.gross, t.sal.gosiEmp, t.sal.gosiEr,
    t.att.absent, t.pay.absence, t.pay.late, t.pay.unpaid, t.pay.advance, t.pay.otherDed, t.pay.net], ...rows]);
}

/* ========================================================= performance */

export function hrPerformanceView(lang, ctx) {
  const t = T(lang);
  const people = scope(ctx);
  if (!isHR() && !people.length) return denied(lang);
  const latest = new Map();
  for (const r of ctx.hrReviews || []) { const c = latest.get(r.subject_id); if (!c || r.period > c.period) latest.set(r.subject_id, r); }
  const goals = ctx.hrGoals || [];
  const rows = people.map(p => {
    const r = latest.get(p.id); const s = r ? formScore(r.ratings).pct : null;
    const g = goals.filter(x => x.employee_id === p.id && x.status !== 'dropped');
    const open = g.filter(x => x.status === 'open').length;
    const avg = g.length ? Math.round(g.reduce((a, x) => a + x.progress, 0) / g.length) : null;
    return { p, r, s, open, avg };
  }).sort((a, b) => (a.s ?? 101) - (b.s ?? 101));
  return `
${hrTabs(lang, 'performance')}
${card(t.tabs.performance, tbl(`<th>${t.name}</th><th>${t.dept}</th><th class="num">${t.perf.latest}</th><th>${t.perf.period}</th><th class="num">${t.perf.openGoals}</th><th class="num">${t.perf.avgProgress}</th>`,
  rows.map(({ p, r, s, open, avg }) => `<tr><td>${go(`#/hr/e/${p.id}`, p.full_name || p.email)}</td>
    <td class="small muted">${esc(p.department_id ? deptName(p.department_id, lang) : '—')}</td>
    <td class="num${s !== null && s < 60 ? ' bad' : ''}">${s === null ? '—' : `${s}%`}</td><td class="small muted">${esc(r?.period || '')}</td>
    <td class="num">${open}</td><td class="num">${avg === null ? '—' : `${avg}%`}</td></tr>`).join('')))}`;
}

/* ============================================================== hiring */

export function hrHiringView(lang, ctx) {
  const t = T(lang);
  if (!isHR()) return denied(lang);
  const list = ctx.hiring || [];
  return `
${hrTabs(lang, 'hiring')}
${card(t.hiring, list.length ? tbl(`<th>${t.name}</th><th>${t.position}</th><th>${t.dept}</th><th class="num">${t.joined}</th><th>${t.status}</th>`,
  list.map(h => `<tr><td>${go(`#/hr/r/${h.id}`, h.full_name)}</td><td class="small">${esc(h.position || '—')}</td>
    <td class="small muted">${esc(h.department_id ? deptName(h.department_id, lang) : '—')}</td><td class="num muted">${esc(fmt(h.joining_date, lang))}</td>
    <td>${hrReqPill(h.status, lang)}</td></tr>`).join('')) : empty(DSTR[lang].hrReqNone), go('#/hr/new', t.newHire, 'btn btn--primary btn--sm" style="margin-inline-start:auto'))}`;
}

/* ============================================================== letters */

export function hrLettersView(lang, ctx) {
  const t = T(lang);
  if (!isHR()) return denied(lang);
  const q = (ctx.letQ || '').toLowerCase();
  const dir = ctx.letDir || '';
  const st = ctx.letSt || '';
  const yr = ctx.letYear || '';
  const all = ctx.hrLetters || [];
  const years = [...new Set(all.map(l => l.letter_date.slice(0, 4)))].sort().reverse();
  const list = all.filter(l => (!dir || l.direction === dir) && (!st || l.status === st) && (!yr || l.letter_date.startsWith(yr))
    && (!q || `${l.number} ${l.subject} ${l.recipient || ''} ${nm(ctx.people, l.employee_id)}`.toLowerCase().includes(q)));
  return `
${hrTabs(lang, 'letters')}
<section class="card">
  <div class="card__head"><h2>${esc(t.let.letters)}</h2><span class="muted small">${list.length}</span>
    <span style="margin-inline-start:auto;display:flex;gap:8px">
      ${go('#/hr/l/new-internal', t.let.newInt, 'btn btn--sm')}${go('#/hr/l/new-external', t.let.newExt, 'btn btn--primary btn--sm')}</span></div>
  <div class="filterbar">
    <label class="f f--sm"><span>${esc(t.search)}</span><input data-letf="letQ" value="${esc(ctx.letQ || '')}" /></label>
    <label class="f f--sm"><span>${esc(t.let.kind)}</span><select data-letf="letDir">${opt('', t.all, dir)}${opt('internal', t.let.internal, dir)}${opt('external', t.let.external, dir)}</select></label>
    <label class="f f--sm"><span>${esc(t.status)}</span><select data-letf="letSt">${opt('', t.all, st)}${Object.entries(t.let.lst).map(([k, v]) => opt(k, v, st)).join('')}</select></label>
    <label class="f f--sm"><span>${esc(t.let.year)}</span><select data-letf="letYear">${opt('', t.all, yr)}${years.map(y => opt(y, y, yr)).join('')}</select></label>
  </div>
  ${list.length ? tbl(`<th>${t.let.number}</th><th class="num">${t.let.date}</th><th>${t.let.to}</th><th>${t.let.subject}</th><th>${t.let.kind}</th><th>${t.status}</th>`,
    list.map(l => `<tr><td>${go(`#/hr/l/${l.id}`, l.number)}</td><td class="num muted">${esc(fmt(l.letter_date, lang))}</td>
      <td class="small">${esc(l.direction === 'internal' ? (l.to_department ? deptName(l.to_department, lang) : '—') : (l.recipient || '—'))}</td>
      <td>${esc(l.subject)}</td><td class="small muted">${esc(l.direction === 'internal' ? t.let.internal : t.let.external)} · ${esc(t.let.kinds[l.kind] || l.kind)}</td>
      <td>${letPill(l.status, lang)}</td></tr>`).join('')) : empty(t.let.none)}
</section>`;
}

export function hrLetterView(lang, ctx) {
  const t = T(lang);
  if (!isHR()) return denied(lang);
  const l = ctx.hrLetter;
  if (!l) return `${hrTabs(lang, 'letters')}${card(t.let.none, '')}`;
  const isNew = !l.id;
  const locked = ['approved', 'sent'].includes(l.status);
  const dis = locked ? ' disabled' : '';
  const internal = l.direction === 'internal';
  const admin = db.state.me?.role === 'admin';
  const depts = db.state.departments || [];
  const roster = rosterOf(ctx);
  const kinds = internal ? ['memo', 'circular', 'warning', 'other'] : ['salary_certificate', 'employment_certificate', 'embassy', 'bank', 'experience', 'to_whom', 'other'];
  return `
${hrTabs(lang, 'letters')}
<section class="card">
  <div class="card__head"><h2>${esc(isNew ? (internal ? t.let.newInt.replace('+ ', '') : t.let.newExt.replace('+ ', '')) : l.number)}</h2>
    ${isNew ? '' : letPill(l.status, lang)}<span class="muted small">${esc(internal ? t.let.internal : t.let.external)}</span>
    ${go('#/hr/letters', `← ${t.let.letters}`)}</div>
  <form id="letForm" class="inlineform" style="border-bottom:0">
    <div class="fields">
      ${fld(t.let.kind, `<select id="lfKind"${dis}>${kinds.map(k => opt(k, t.let.kinds[k], l.kind)).join('')}</select>`)}
      ${fld(t.let.lang, `<select id="lfLang"${dis}>${opt('ar', 'العربية', l.lang)}${opt('en', 'English', l.lang)}</select>`)}
      ${fld(t.let.date, `<input id="lfDate" type="date" value="${esc(l.letter_date || H.todayIn())}"${dis}${isNew ? '' : ' disabled'} />`)}
      ${internal ? fld(t.let.toDept, `<select id="lfDept"${dis}>${opt('', '—', l.to_department)}${depts.map(d => opt(d.id, lang === 'ar' ? d.name_ar : d.name_en, l.to_department)).join('')}</select>`)
        : fld(t.let.recipient, `<input id="lfRecipient" value="${esc(l.recipient || '')}" maxlength="200"${dis} />`) + fld(t.let.attn, `<input id="lfAttn" value="${esc(l.recipient_attn || '')}" maxlength="200"${dis} />`)}
      ${fld(t.let.employee, `<select id="lfEmp"${dis}>${opt('', '—', l.employee_id)}${roster.map(p => opt(p.id, p.full_name || p.email, l.employee_id)).join('')}</select>`)}
      ${locked ? '' : `<div class="f" style="align-self:end"><button type="button" class="btn btn--sm" data-let-template>${esc(t.let.template)}</button></div>`}
      ${fld(t.let.subject, `<input id="lfSubject" required value="${esc(l.subject || '')}" maxlength="300"${dis} />`, true)}
      ${fld(t.let.body, `<textarea id="lfBody" rows="12"${dis}>${esc(l.body || '')}</textarea>`, true)}
      ${fld(t.let.signatory, `<input id="lfSign" value="${esc(l.signatory_name || '')}" placeholder="${esc(ctx.hrSettings?.signatory_name || '')}" maxlength="120"${dis} />`)}
      ${fld(t.let.signTitle, `<input id="lfSignT" value="${esc(l.signatory_title || '')}" placeholder="${esc(ctx.hrSettings?.signatory_title || '')}" maxlength="120"${dis} />`)}
    </div>
    ${locked ? `<p class="note">${esc(t.let.locked)}</p>` : `<div class="actions"><button type="submit" class="btn btn--primary btn--sm">${esc(t.save)}</button></div>`}
  </form>
</section>
${isNew ? '' : `
<section class="card">
  <div class="card__head"><h2>${esc(t.let.attachments)}</h2><span class="muted small">${(l.attachments || []).length}</span></div>
  ${(l.attachments || []).length ? `<ul class="filelist">${l.attachments.map(a => `<li class="filerow"><button class="link" data-hr-doc="${esc(a.path)}">${esc(a.name)}</button></li>`).join('')}</ul>` : ''}
  ${locked ? '' : `<div class="inlineform" style="border-bottom:0"><label class="f f--wide"><span>${esc(t.let.addAtt)}</span><input type="file" data-let-att accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" /></label></div>`}
</section>
<section class="card">
  <div class="card__head"><h2>${esc(t.status)}</h2>${letPill(l.status, lang)}</div>
  <div class="actions" style="padding:12px 16px">
    ${l.status === 'draft' ? `<button class="btn btn--primary btn--sm" data-let-status="review">${esc(t.let.submit)}</button>
      <button class="btn btn--danger btn--sm" data-let-del>${esc(t.let.del)}</button>` : ''}
    ${l.status === 'review' ? `<button class="btn btn--sm" data-let-status="draft">${esc(t.let.toDraft)}</button>
      ${admin ? `<button class="btn btn--primary btn--sm" data-let-status="approved">${esc(t.let.approve)}</button>` : `<span class="muted small">${esc(t.let.onlyAdmin)}</span>`}` : ''}
    ${l.status === 'approved' ? `<input id="lfVia" placeholder="${esc(t.let.sentVia)}" maxlength="120" style="max-width:220px" />
      <button class="btn btn--primary btn--sm" data-let-status="sent">${esc(t.let.send)}</button>` : ''}
    <button class="btn btn--sm" data-let-print>${esc(t.let.print)}</button>
  </div>
  <p class="note">${[l.approved_at ? `${t.let.lst.approved}: ${nm(ctx.people, l.approved_by)} · ${fmt(l.approved_at.slice(0, 10), lang)}` : '',
    l.sent_at ? `${t.let.lst.sent}: ${fmt(l.sent_at.slice(0, 10), lang)}${l.sent_via ? ` · ${l.sent_via}` : ''}` : ''].filter(Boolean).map(esc).join(' — ') || '&nbsp;'}</p>
</section>`}`;
}

/* ============================================================== settings */

export function hrSettingsView(lang, ctx) {
  const t = T(lang);
  if (!isHR()) return denied(lang);
  const s = H.settingsOf(ctx.hrSettings);
  const raw = ctx.hrSettings || {};
  const g = s.gosi;
  const n = (id, v, attrs = '') => `<input id="${id}" type="number" value="${esc(v ?? '')}" ${attrs} />`;
  return `
${hrTabs(lang, 'settings')}
<form id="setForm">
${card(t.set.office, `<div class="inlineform" style="border-bottom:0"><div class="fields">
  ${fld(t.set.lat, n('stLat', s.office_lat, 'step="0.000001" min="-90" max="90"'))}${fld(t.set.lng, n('stLng', s.office_lng, 'step="0.000001" min="-180" max="180"'))}
  ${fld(t.set.radius, n('stRadius', s.office_radius_m, 'min="20" max="5000"'))}
  <div class="f" style="align-self:end"><button type="button" class="btn btn--sm" data-set-here>${esc(t.set.useHere)}</button></div></div></div>`)}
${card(t.set.hours, `<div class="inlineform" style="border-bottom:0"><div class="fields">
  ${fld(t.set.start, `<input id="stStart" type="time" value="${esc(String(s.work_start).slice(0, 5))}" />`)}
  ${fld(t.set.end, `<input id="stEnd" type="time" value="${esc(String(s.work_end).slice(0, 5))}" />`)}
  ${fld(t.set.grace, n('stGrace', s.grace_minutes, 'min="0" max="240"'))}
  ${fld(t.set.attStart, `<input id="stAttStart" type="date" value="${esc(s.attendance_start || '')}" />`)}
  <div class="f f--wide"><span>${esc(t.set.workDays)}</span><div class="daypick">${t.set.dow.map((d, i) =>
    `<label class="chk chk--inline"><input type="checkbox" data-wd="${i}"${(s.work_days || []).includes(i) ? ' checked' : ''} /> ${esc(d)}</label>`).join('')}</div></div>
  </div></div>`)}
${card(t.set.deduct, `<div class="inlineform" style="border-bottom:0">
  <label class="chk"><input type="checkbox" id="stDAbs"${s.deduct_absence ? ' checked' : ''} /> ${esc(t.set.dAbs)}</label>
  <label class="chk"><input type="checkbox" id="stDLate"${s.deduct_late ? ' checked' : ''} /> ${esc(t.set.dLate)}</label>
  <h3 class="subhead">${esc(t.set.gosi)}</h3>
  ${tbl(`<th>${t.set.scheme}</th><th class="num">${t.set.empPct}</th><th class="num">${t.set.erPct}</th>`,
    ['saudi_legacy', 'saudi_new', 'non_saudi'].map(k => `<tr><td>${esc(t.gs[k])}</td>
      <td class="num"><input class="cellinput num" type="number" step="0.01" min="0" max="50" data-gosi="${k}.employee" value="${esc(g[k]?.employee ?? 0)}" /></td>
      <td class="num"><input class="cellinput num" type="number" step="0.01" min="0" max="50" data-gosi="${k}.employer" value="${esc(g[k]?.employer ?? 0)}" /></td></tr>`).join(''))}
  <div class="fields">${fld(t.set.cap, n('stCap', g.cap, 'min="0" step="1"'))}</div>
  <p class="note">${esc(t.pay.gosiNote)}</p></div>`)}
${card(t.set.alerts, `<div class="inlineform" style="border-bottom:0"><div class="fields">
  ${fld(t.set.approvalHours, n('stApH', s.approval_alert_hours, 'min="1" max="720"'))}
  ${fld(t.set.contractDays, n('stCtD', s.contract_alert_days, 'min="1" max="365"'))}
  ${fld(t.set.docDays, n('stDocD', s.doc_alert_days, 'min="1" max="365"'))}</div></div>`)}
${card(t.set.company, `<div class="inlineform" style="border-bottom:0"><div class="fields">
  ${fld(t.set.nameEn, inp('stCoEn', raw.company_en, 'maxlength="200"'))}${fld(t.set.nameAr, inp('stCoAr', raw.company_ar, 'maxlength="200"'))}
  ${fld(t.set.cr, inp('stCr', raw.company_cr, 'maxlength="60"'))}${fld(t.set.address, inp('stAddr', raw.company_address, 'maxlength="300"'), true)}
  ${fld(t.set.footer, inp('stFooter', raw.letter_footer, 'maxlength="300"'), true)}
  ${fld(t.set.signatory, inp('stSign', raw.signatory_name, 'maxlength="120"'))}${fld(t.set.signTitle, inp('stSignT', raw.signatory_title, 'maxlength="120"'))}
  ${fld(`${t.set.signature}${raw.signature_path ? ` · ${t.set.uploaded}` : ''}`, `<input type="file" id="stSigImg" accept="image/png,image/jpeg" />`)}
  ${fld(`${t.set.stamp}${raw.stamp_path ? ` · ${t.set.uploaded}` : ''}`, `<input type="file" id="stStampImg" accept="image/png,image/jpeg" />`)}
  </div><p class="note">${esc(t.set.imgHint)}</p></div>`)}
<div class="actions" style="margin:4px 0 16px"><button type="submit" class="btn btn--primary">${esc(t.save)}</button></div>
</form>
${card(t.set.holidays, `<form id="holForm" class="inlineform"><div class="fields">
  ${fld(t.att.date, `<input id="hoDay" type="date" required />`)}${fld(t.set.holName, `<input id="hoName" required maxlength="120" />`)}</div>
  <div class="actions"><button type="submit" class="btn btn--sm">${esc(t.set.addHol)}</button></div></form>
  ${(ctx.hrHolidays || []).length ? tbl(`<th>${t.att.date}</th><th>${t.set.holName}</th><th></th>`,
    ctx.hrHolidays.map(h => `<tr><td>${esc(fmt(h.day, lang))}</td><td>${esc(h.name)}</td><td class="num"><button class="x" data-hol-del="${esc(h.day)}">✕</button></td></tr>`).join('')) : ''}`)}`;
}

/* ============================================================ self-service */

export function meView(lang, ctx) {
  const t = T(lang);
  const me = db.state.me;
  if (!me) return '';
  const S = H.settingsOf(ctx.hrSettings);
  const today = H.todayIn(S.timezone);
  const e = ctx.hrEmp || null;
  const att = (ctx.meAttendance || []).find(a => a.day === today) || null;
  const ls = leaveSummary(e, ctx.meLeaves || [], today);
  const period = H.periodOf(today);
  const m = H.monthAttendance({ period, employeeId: me.id, emp: e, attendance: ctx.meAttendance || [], leaves: ctx.meLeaves || [],
    holidays: new Set((ctx.hrHolidays || []).map(h => h.day)), settings: S, requests: ctx.meRequests || [], today });
  const rt = ctx.reqNewType || 'annual_leave';
  const isLeave = ['annual_leave', 'sick_leave', 'unpaid_leave', 'other_leave'].includes(rt);
  const waiting = (ctx.hrRequests || []).filter(r => r.status === 'pending_manager' && r.manager_id === me.id);
  const clockBtn = !att ? t.me.clockIn : !att.clock_out ? t.me.clockOut : t.me.clockAgain;
  const slips = ctx.meSlips || [];
  return `
<section class="card clockcard">
  <div class="card__head"><h2>${esc(t.myHr)}</h2><span class="muted small">${esc(fmt(today, lang))} · ${esc(t.me.hours.replace('{a}', String(S.work_start).slice(0, 5)).replace('{b}', String(S.work_end).slice(0, 5)))}</span></div>
  <div class="clock">
    <div class="clock__state">
      ${att ? `<b>${esc(t.me.inAt.replace('{t}', hhmm(att.clock_in, S.timezone)))}</b>${att.clock_out ? ` · <b>${esc(t.me.outAt.replace('{t}', hhmm(att.clock_out, S.timezone)))}</b>` : ''}
        ${att.late_minutes ? `<span class="chip chip--warn">${esc(t.att.late)} ${att.late_minutes} ${esc(t.att.min)}</span>` : ''}
        ${att.in_remote || att.out_remote ? `<span class="chip chip--warn">${esc((att.out_distance_m ?? att.in_distance_m) != null ? t.me.awayWarn.replace('{m}', att.out_distance_m ?? att.in_distance_m) : t.me.noLoc)}</span>` : ''}`
        : `<span class="muted">${esc(t.me.notIn)}</span>`}
      <span class="block muted small" data-clock-msg>${esc(ctx.clockMsg || '')}</span>
    </div>
    <button class="btn btn--primary clock__btn" data-clock>${esc(clockBtn)}</button>
  </div>
</section>
${!e?.joining_date ? `<p class="note note--warn">${esc(t.me.notSetUp)}</p>` : ''}
<div class="kpis">
  ${kpi(ls.balance === null ? '—' : num(ls.balance, 1), t.lv.balance, { colour: 'var(--ok)', sub: ls.entitlement === null ? '' : `${ls.accrued} / ${ls.entitlement}` })}
  ${kpi(ls.taken, t.lv.taken, { colour: 'var(--info)' })}
  ${kpi(ls.sick, t.lv.sick, { colour: 'var(--warn)' })}
  ${kpi(m.present, `${t.att.present} · ${t.me.thisMonth}`, { colour: 'var(--ok)', sub: `${m.workDays} ${t.att.workDays}` })}
  ${kpi(m.absent.length, t.att.absent, { colour: 'var(--critical)', bad: m.absent.length > 0 })}
  ${kpi(m.lateCount, t.att.lateN, { colour: 'var(--warn)', sub: `${m.lateMinutes} ${t.att.min}` })}
</div>
${waiting.length ? card(t.me.approvals, reqTable(lang, ctx, waiting, { actions: true }), `<span class="muted small">${waiting.length}</span>`) : ''}
<section class="card">
  <div class="card__head"><h2>${esc(t.req.new)}</h2></div>
  <form id="reqForm" class="inlineform" style="border-bottom:0">
    <div class="fields">
      ${fld(t.req.type, `<select id="rqType">${Object.entries(t.req.types).map(([k, v]) => opt(k, v, rt)).join('')}</select>`)}
      ${isLeave ? fld(t.lv.from, `<input id="rqFrom" type="date" required />`) + fld(t.lv.to, `<input id="rqTo" type="date" required />`)
        + fld(t.lv.days, `<input id="rqDays" type="number" min="0.5" max="366" step="0.5" />`) : ''}
      ${rt === 'early_leave' ? fld(t.att.date, `<input id="rqFrom" type="date" required value="${esc(today)}" />`) + fld(t.req.time, `<input id="rqTime" type="time" required />`) : ''}
      ${rt === 'advance' ? fld(t.req.amount, `<input id="rqAmount" type="number" min="1" step="1" required />`) + fld(t.req.instalments, `<input id="rqInst" type="number" min="1" max="24" value="1" required />`) : ''}
      ${['salary_certificate', 'letter'].includes(rt) ? fld(t.req.addressee, `<input id="rqTo2" required maxlength="200" placeholder="${esc(t.req.addresseeHint)}" />`, true) : ''}
      ${rt === 'payslip' ? fld(t.req.period, `<input id="rqPeriod" type="month" required value="${esc(H.shiftPeriod(period, -1))}" />`) : ''}
      ${fld(rt === 'data_update' ? t.dataUpdate : t.req.details, `<textarea id="rqDetails" rows="2" maxlength="1000"${rt === 'data_update' || rt === 'other' ? ' required' : ''}></textarea>`, true)}
    </div>
    ${['sick_leave', 'data_update', 'other', 'other_leave'].includes(rt) ? dropField('rqFile', rt === 'sick_leave' ? t.req.sickDoc : t.req.attach, '', { accept: 'image/*,.pdf', required: rt === 'sick_leave' }) : ''}
    <p class="note">${esc(t.req.flow)}</p>
    <div class="actions"><button type="submit" class="btn btn--primary btn--sm">${esc(t.req.submit)}</button></div>
  </form>
</section>
${card(t.req.mine, reqTable(lang, ctx, ctx.meRequests || [], { showEmployee: false, mine: true }), `<span class="muted small">${(ctx.meRequests || []).length}</span>`)}
${card(t.pay.myPayslips, slips.length ? tbl(`<th>${t.pay.period}</th><th class="num">${t.sal.gross}</th><th class="num">${t.pay.net}</th><th></th>`,
  slips.map(s => `<tr><td>${esc(periodLabel(s.period, lang))}</td><td class="num">${num(s.gross)}</td><td class="num"><b>${num(s.net)}</b></td>
    <td class="num"><button class="btn btn--sm" data-slip-print="${esc(s.id)}">${esc(t.pay.payslip)}</button></td></tr>`).join('')) : empty(t.pay.noSlips))}
${card(t.me.myDocs, (ctx.meDocs || []).length ? `<ul class="filelist">${ctx.meDocs.map(d => `<li class="filerow">
  <button class="link" data-hr-doc="${esc(d.path)}">${esc(d.title || t.docKind[d.kind] || d.file_name)}</button>
  <span class="muted small">${esc(t.docKind[d.kind] || '')}${d.expires_on ? ` · ${esc(t.docExpiry)} ${esc(fmt(d.expires_on, lang))}` : ''}</span></li>`).join('')}</ul>` : empty(t.noDocs))}
${(ctx.meGoals || []).length ? card(t.me.myGoals, tbl(`<th>${t.perf.title}</th><th class="num">${t.perf.due}</th><th class="num">${t.perf.progress}</th><th>${t.status}</th>`,
  ctx.meGoals.map(g => `<tr><td>${esc(g.title)}</td><td class="num muted">${esc(fmt(g.due_date, lang))}</td><td class="num">${g.progress}%</td><td>${esc(t.perf.gst[g.status])}</td></tr>`).join(''))) : ''}`;
}

/* ================================================================ print */

const printShell = (lang, title, body, { draft = false } = {}) => `<!doctype html>
<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; color: #111; font-size: 13px; line-height: 1.6; margin: 0; }
  .lh { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 18px; }
  .lh b { font-size: 18px; } .muted { color: #555; font-size: 11.5px; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 12.5px; }
  h1 { font-size: 16px; margin: 6px 0 14px; text-align: center; }
  .body { white-space: pre-wrap; min-height: 280px; }
  .sign { margin-top: 36px; display: flex; justify-content: flex-end; gap: 30px; align-items: flex-end; }
  .sign img { max-height: 90px; max-width: 200px; }
  .foot { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 10.5px; color: #666; border-top: 1px solid #ccc; padding-top: 4px; }
  .draft { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 46px; color: rgba(200,0,0,.18); transform: rotate(-24deg); font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; }
  td, th { border: 1px solid #bbb; padding: 6px 8px; text-align: start; } td.n, th.n { text-align: end; font-variant-numeric: tabular-nums; }
  .slip { page-break-after: always; } .slip:last-child { page-break-after: auto; }
  .tot td { font-weight: 700; background: #f2f2f2; }
</style></head><body>${draft ? `<div class="draft">${esc(T(lang).let.draftMark)}</div>` : ''}${body}
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script></body></html>`;

const letterhead = (lang, s) => `<div class="lh"><div><b>${esc(lang === 'ar' ? (s.company_ar || s.company_en || '') : (s.company_en || s.company_ar || ''))}</b>
  <div class="muted">${esc(s.company_address || '')}${s.company_cr ? ` · CR ${esc(s.company_cr)}` : ''}</div></div>
  <div class="muted" style="text-align:end">${esc(lang === 'ar' ? (s.company_en || '') : (s.company_ar || ''))}</div></div>`;

export function letterPrintHtml(lang0, l, s, { signature = null, stamp = null, deptLabel = '' } = {}) {
  const lang = l.lang || lang0;
  const t = T(lang);
  const approved = ['approved', 'sent'].includes(l.status);
  const to = l.direction === 'internal' ? deptLabel : [l.recipient, l.recipient_attn ? `${lang === 'ar' ? 'عناية' : 'Attn.'} ${l.recipient_attn}` : ''].filter(Boolean).join(' — ');
  return printShell(lang, l.number || 'letter', `
${letterhead(lang, s || {})}
<div class="meta"><div>${esc(t.let.number)}: <b>${esc(l.number || '—')}</b><br>${esc(t.let.date)}: ${esc(l.letter_date || '')}</div>
  <div>${esc(t.let.to)}: <b>${esc(to || '—')}</b></div></div>
<h1>${esc(l.subject || '')}</h1>
<div class="body">${esc(l.body || '')}</div>
<div class="sign">
  ${approved && stamp ? `<img src="${stamp}" alt="">` : ''}
  <div style="text-align:center">${approved && signature ? `<img src="${signature}" alt=""><br>` : ''}
    <b>${esc(l.signatory_name || s?.signatory_name || '')}</b><br><span class="muted">${esc(l.signatory_title || s?.signatory_title || '')}</span></div>
</div>
${s?.letter_footer ? `<div class="foot">${esc(s.letter_footer)}</div>` : ''}`, { draft: !approved });
}

export function payslipPrintHtml(lang, slips, { people, emps, s }) {
  const t = T(lang);
  const n2 = (v) => num(v);
  const page = (p) => {
    const person = (people || []).find(x => x.id === p.employee_id) || {};
    const e = emps?.get(p.employee_id) || {};
    const earn = [[t.sal.basic, p.basic], [t.sal.housing, p.housing], [t.sal.transport, p.transport], [t.sal.other, p.other_allowances], [t.pay.additions, p.additions]];
    const ded = [[t.sal.gosiEmp, p.gosi_employee], [`${t.pay.absence} (${p.absence_days})`, p.absence_deduction], [t.pay.late, p.late_deduction],
      [`${t.pay.unpaid} (${p.unpaid_days})`, p.unpaid_deduction], [t.pay.advance, p.advance_deduction], [t.pay.otherDed, p.other_deductions]];
    const dedTotal = ded.reduce((a, [, v]) => a + Number(v || 0), 0);
    return `<div class="slip">${letterhead(lang, s || {})}
      <h1>${esc(t.pay.payslip)} — ${esc(periodLabel(p.period, lang))}</h1>
      <table><tr><th>${esc(t.name)}</th><td>${esc(person.full_name || person.email || '')}</td><th>${esc(t.position)}</th><td>${esc(e.position || '')}</td></tr>
        <tr><th>${esc(t.dept)}</th><td>${esc(person.department_id ? deptName(person.department_id, lang) : '')}</td><th>${esc(t.joined)}</th><td>${esc(e.joining_date || '')}</td></tr></table>
      <table><tr><th>${esc(t.pay.earnings)}</th><th class="n">SAR</th><th>${esc(t.pay.deductions)}</th><th class="n">SAR</th></tr>
        ${Array.from({ length: Math.max(earn.length, ded.length) }, (_, i) => `<tr><td>${esc(earn[i]?.[0] || '')}</td><td class="n">${earn[i] ? n2(earn[i][1]) : ''}</td>
          <td>${esc(ded[i]?.[0] || '')}</td><td class="n">${ded[i] ? n2(ded[i][1]) : ''}</td></tr>`).join('')}
        <tr class="tot"><td>${esc(t.sal.gross)}</td><td class="n">${n2(Number(p.gross) + Number(p.additions || 0))}</td><td>${esc(t.pay.deductions)}</td><td class="n">${n2(dedTotal)}</td></tr>
        <tr class="tot"><td colspan="3">${esc(t.pay.net)}</td><td class="n">${n2(p.net)}</td></tr></table>
      <p class="muted">${esc(t.pay.employer)}: ${n2(p.gosi_employer)}</p></div>`;
  };
  return printShell(lang, t.pay.payslip, slips.map(page).join(''));
}
