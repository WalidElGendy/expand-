/* ==========================================================================
   Signed-in screens: sign in, and the dashboard your role earns.

   The routing rule is deliberately by DEPARTMENT first and ROLE second,
   because that is how the company actually works. A 3D designer and a 3D
   lead want the same screen with different buttons; a project manager and a
   business developer want entirely different screens at the same seniority.

   Every date on these screens comes from engine/scheduler.js — the same code
   the estimator uses. Nothing here re-implements a delivery date, so there is
   no second answer that can quietly disagree with the first.
   ========================================================================== */

import * as db from './db.js';
import { Scheduler, DEFAULT_SIZE_FACTORS } from '../engine/scheduler.js';
import { WorkCalendar, iso, parse } from '../engine/calendar.js';

const CAL = new WorkCalendar();
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => iso(CAL.nextWorking(new Date()));

/* The same rule the database enforces in can_plan(): active, and either a
   manager/admin or in PM. It lives here so the sidebar, the "New project"
   button and the row actions cannot drift apart from each other — or from
   the policy, which is the only one of the four that actually decides. */
export const canPlan = (me = db.state.me) =>
  !!me && me.is_active !== false &&
  (['admin', 'manager'].includes(me.role) || me.department_id === 'pm');

export const DSTR = {
  en: {
    signIn: 'Sign in', signOut: 'Sign out', email: 'Email', password: 'Password',
    firstTime: 'First time here?', setPassword: 'Create your password',
    firstTimeTitle: 'Getting in for the first time',
    firstTimePrompt: 'Enter your work email. If you are on the team, we will send you a link to choose your password. You do not need one yet.',
    forgotPrompt: 'Enter your work email and we will send you a link to set a new password.',
    emailMeLink: 'Email me a link',
    linkOnTheWay: 'If that address belongs to someone here, a link is on its way. Open the newest email you have — it works once, lasts a day, and asking again cancels the one before it. Check your junk folder if it is not there.',
    forgot: 'Forgot your password?', sendReset: 'Email me a reset link',
    backToSignIn: 'Back to sign in', checkInbox: 'Check your inbox.',
    newPassword: 'Choose a new password', setIt: 'Save my new password',
    linkExpired: 'That link has expired or was already used.',
    linkExpiredWhy: 'Sign-in links last a day and work once, and every new link cancels the one before it — so an older email in your inbox will always say this. Open the newest one, or send yourself a fresh link and use that. Some mail scanners also open links before you do, which uses them up.',
    sendFresh: 'Email me a new link', passwordSaved: 'Password saved. Signing you in…',
    recoverPrompt: 'Choose it now, before you close this page. The link has signed you in, but until a password is saved there is nothing to sign in with next time.',
    noInvite: 'Your account exists but has not been activated. Ask an admin to add you.',
    home: 'Home', projects: 'Projects', newProject: 'New project', leads: 'Leads',
    documents: 'Documents', people: 'People', myQueue: 'My queue',
    save: 'Save', cancel: 'Cancel', add: 'Add', uploading: 'Uploading…', saving: 'Saving…',
    name: 'Name', client: 'Client', size: 'Size', description: 'Description',
    start: 'Earliest start', deadline: 'Submission deadline',
    stages: 'Which teams does this need?', assignTo: 'Assign to',
    rfp: 'RFP document', refs: 'Reference photos', dropHere: 'Choose files',
    estimate: 'Estimated delivery', naive: 'If the teams were free',
    queueDays: 'of that is queue', createAndAssign: 'Create and assign',
    status: 'Status', due: 'Due', owner: 'Owner', stage: 'Stage', team: 'Team',
    start_: 'Start', markDone: 'Mark done', started: 'Started', done: 'Done',
    nothingQueued: 'Nothing is queued for you.',
    company: 'Company', phone: 'Phone', followUp: 'Next follow-up', value: 'Value (SAR)',
    addLead: 'Add lead', logCall: 'Log a call', logNote: 'Add a note',
    title: 'Title', upload: 'Upload', library: 'Document library',
    invite: 'Invite someone', role: 'Role', department: 'Department', active: 'Active',
    pending: 'Invited, not signed in yet', noLogin: 'No login yet',
    inviteNote: 'They will set their own password from the sign-in screen. You never see it.',
    unassigned: 'Unassigned', overdue: 'overdue', workingDays: 'working days',
    importedFrom: 'Imported from Asana', flagged: 'Imported with caveats',
    searchPlaceholder: 'Search this page…',
    homeSub: 'What is open, what is late, and what it costs',
    leadsSub: 'Every lead and where it stands', peopleSub: 'Who can sign in, and as what',
    openProjects: 'Open projects', overdue_: 'Overdue', unassigned_: 'Stages unassigned',
    committedDays: 'Design days committed', openLeads: 'Open leads', nextFree: 'A new project would deliver',
    ofTotal: 'of', needsReview: 'Needs review', allRows: 'All', teamsCol: 'Teams',
    overdueFollow: 'Follow-ups overdue',
    titleHint: 'What is this document called?',
    descHint: 'What is it for, and who should read it? Optional.',
    dropHint: 'PDF, Word, PowerPoint, Excel or images. You can pick several at once.',
    filesPicked: 'files selected', filePicked: 'file selected',
    noDocsYet: 'No documents yet. The first upload appears here.',
    attachments: 'Attachments',
    onlineNow: 'Online now', onlineNowSub: 'with the app open right now',
    waitingApproval: 'Waiting for approval', waitingSub: 'signed up, cannot get in yet',
    waitingNone: 'nobody is blocked',
    invitedNotIn: 'Invited, not signed up', invitedSub: 'the email went out, they have not used it',
    rosterOnly: 'On the roster only', rosterSub: 'imported from Asana, no login',
    canSignIn: 'Can sign in', approve: 'Approve', revoke: 'Revoke',
    lastSeen: 'Last seen', now: 'now', never: 'never',
    minsAgo: '{n}m ago', hoursAgo: '{n}h ago', daysAgo: '{n}d ago',
    approved: '{name} can sign in now.', revoked: '{name} can no longer sign in.',
    sendLink: 'Send link', sendingLink: 'Sending…',
    linkSent: 'Emailed {email} a link to set a password.',
    linkFailed: 'Could not email {email}: {reason}',
    resetHint: 'Nobody can set a password for somebody else, so the button emails them a link and they choose it themselves.',
    roles: { member: 'Member', lead: 'Lead', manager: 'Manager', admin: 'Admin' },
    sending: 'Sending…', inviteNoReason: 'the mail server gave no reason',
    inviteSent: 'Invited {email}. They have an email with a link to set their password.',
    inviteResent: '{email} already has an account, so we sent a sign-in link instead.',
    inviteNoMail: '{email} can sign in with that role now, but the email did not go out: {reason}. They have not been told anything — fix the sender under Authentication → Emails, then invite them again.',
    rfpHint: 'The brief you were sent. PDF, Word, Excel or a zip.',
    refsHint: 'Photos, moodboards, anything the designers should look at first.',
    deadlineChart: 'Deadlines by month', deadlineNote: 'Open projects grouped by submission deadline. The dashed line is today, so everything to its left is already late.',
    noneYet: 'Nothing here yet.', today_: 'today',
    /* `submitted` has always meant "submitted on Etemad" here, and `won`/`lost`
       are that platform's verdict coming back. The column names stay — 79 rows
       depend on them — but nobody should have to be told that "Won" is what
       the screen calls an acceptance. */
    st: { intake: 'Intake', in_design: 'In design', pricing: 'Pricing',
          submitted: 'Submitted on Etemad', won: 'Accepted', lost: 'Rejected',
          in_production: 'In production',
          delivered: 'Delivered', archived: 'Archived', draft: 'Draft', pending: 'Pending',
          in_progress: 'In progress', done: 'Done', blocked: 'Blocked', new: 'New',
          contacted: 'Contacted', qualified: 'Qualified', proposal: 'Proposal' },

    /* --- Projects screen: filters and detail ------------------------------ */
    filters: 'Filters', clearFilters: 'Clear',   // owner/team/status/due already exist above
    anyOwner: 'Any owner', anyTeam: 'Any team', anyStatus: 'Any status', anyDue: 'Any deadline',
    unassignedOwner: 'No owner', sortBy: 'Sort',
    sortRecent: 'Most recent', sortDueSoon: 'Deadline, soonest', sortDueLate: 'Deadline, latest',
    sortName: 'Name', dueOverdue: 'Overdue', due30: 'Next 30 days', due90: 'Next 90 days',
    dueNone: 'No deadline set', showingN: 'Showing {n} of {t}',
    noMatch: 'No project matches these filters.',
    openOnly: 'Open only', includeClosed: 'Include delivered and archived',
    backToProjects: 'Projects', notFound: 'That project is not here.',
    overview: 'Overview', history: 'History', addNote: 'Add a note', post: 'Post',
    noHistory: 'Nothing recorded yet. Status changes from this page will show up here.',
    noDocuments: 'No files uploaded for this project.',
    tasksHead: 'Tasks', noTasks: 'No tasks on this project.',
    stagesHead: 'Teams and stages', noStages: 'No stages on this project yet.',
    moveTo: 'Move to', statusNote: 'Why (optional)', movedBy: '{who} moved it to {to}',
    createdOn: 'Created', updatedOn: 'Last change', noDescription: 'No description was written.',
    toProduction: 'Accepted — this opens a production stage for the production team.',
    terminal: 'This project is archived. Nothing follows it.',
    openInAsana: 'Open in Asana', sizeBand: 'Size', uploadedBy: 'by {who}',
  },
  ar: {
    signIn: 'تسجيل الدخول', signOut: 'تسجيل الخروج', email: 'البريد الإلكتروني', password: 'كلمة المرور',
    firstTime: 'أول مرة هنا؟', setPassword: 'أنشئ كلمة المرور',
    firstTimeTitle: 'الدخول لأول مرة',
    firstTimePrompt: 'أدخل بريد العمل. إن كنت ضمن الفريق سنرسل لك رابطاً لاختيار كلمة المرور. لا تحتاج كلمة مرور الآن.',
    forgotPrompt: 'أدخل بريد العمل وسنرسل لك رابطاً لضبط كلمة مرور جديدة.',
    emailMeLink: 'أرسل لي رابطاً',
    linkOnTheWay: 'إن كان هذا البريد يخص أحداً هنا، فالرابط في طريقه إليك. افتح أحدث رسالة وصلتك — الرابط يعمل مرة واحدة، وصالح ليوم كامل، وكل طلب جديد يُلغي السابق. راجع مجلد الرسائل غير المرغوبة إن لم تجدها.',
    forgot: 'نسيت كلمة المرور؟', sendReset: 'أرسل لي رابط إعادة التعيين',
    backToSignIn: 'رجوع لتسجيل الدخول', checkInbox: 'تحقق من بريدك.',
    newPassword: 'اختر كلمة مرور جديدة', setIt: 'حفظ كلمة المرور',
    linkExpired: 'انتهت صلاحية الرابط أو تم استخدامه من قبل.',
    linkExpiredWhy: 'روابط الدخول تعمل مرة واحدة ولمدة يوم كامل، وكل رابط جديد يُلغي ما قبله — لذا ستظهر هذه الرسالة دائماً مع أي بريد أقدم. افتح أحدث رسالة، أو أرسل لنفسك رابطاً جديداً واستخدمه. كما أن بعض أنظمة فحص البريد تفتح الرابط قبلك فتستهلكه.',
    sendFresh: 'أرسل لي رابطاً جديداً', passwordSaved: 'تم حفظ كلمة المرور. جارٍ تسجيل دخولك…',
    recoverPrompt: 'اخترها الآن قبل إغلاق الصفحة. الرابط سجّل دخولك، لكن قبل حفظ كلمة المرور لا يوجد ما تدخل به في المرة القادمة.',
    noInvite: 'حسابك موجود لكنه غير مفعّل. اطلب من المسؤول إضافتك.',
    home: 'الرئيسية', projects: 'المشاريع', newProject: 'مشروع جديد', leads: 'العملاء المحتملون',
    documents: 'المستندات', people: 'الفريق', myQueue: 'مهامي',
    save: 'حفظ', cancel: 'إلغاء', add: 'إضافة', uploading: 'جارٍ الرفع…', saving: 'جارٍ الحفظ…',
    name: 'الاسم', client: 'العميل', size: 'الحجم', description: 'الوصف',
    start: 'أقرب بداية', deadline: 'موعد التقديم',
    stages: 'ما الفرق المطلوبة؟', assignTo: 'إسناد إلى',
    rfp: 'كراسة الشروط', refs: 'صور مرجعية', dropHere: 'اختر الملفات',
    estimate: 'موعد التسليم المتوقع', naive: 'لو كانت الفرق فارغة',
    queueDays: 'منها انتظار', createAndAssign: 'إنشاء وإسناد',
    status: 'الحالة', due: 'الاستحقاق', owner: 'المسؤول', stage: 'المرحلة', team: 'الفريق',
    start_: 'ابدأ', markDone: 'تم الإنجاز', started: 'قيد التنفيذ', done: 'منجز',
    nothingQueued: 'لا يوجد عمل في انتظارك.',
    company: 'الجهة', phone: 'الهاتف', followUp: 'المتابعة القادمة', value: 'القيمة (ر.س)',
    addLead: 'إضافة عميل محتمل', logCall: 'تسجيل مكالمة', logNote: 'إضافة ملاحظة',
    title: 'العنوان', upload: 'رفع', library: 'مكتبة المستندات',
    invite: 'دعوة شخص', role: 'الصلاحية', department: 'القسم', active: 'مفعّل',
    pending: 'مدعو، لم يسجّل الدخول بعد', noLogin: 'لا يوجد حساب دخول',
    inviteNote: 'سيضع كلمة المرور بنفسه من شاشة الدخول. أنت لا تراها أبداً.',
    unassigned: 'غير مسند', overdue: 'متأخرة', workingDays: 'أيام عمل',
    importedFrom: 'مستورد من أسانا', flagged: 'مستورد مع تحفظات',
    searchPlaceholder: 'ابحث في هذه الصفحة…',
    homeSub: 'ما هو مفتوح، وما هو متأخر، وكم يكلّف',
    leadsSub: 'كل عميل محتمل وموقعه', peopleSub: 'من يستطيع الدخول، وبأي صلاحية',
    openProjects: 'مشاريع مفتوحة', overdue_: 'متأخرة', unassigned_: 'مراحل غير مسندة',
    committedDays: 'أيام تصميم ملتزم بها', openLeads: 'عملاء محتملون مفتوحون', nextFree: 'مشروع جديد يُسلَّم في',
    ofTotal: 'من', needsReview: 'تحتاج مراجعة', allRows: 'الكل', teamsCol: 'الفرق',
    overdueFollow: 'متابعات متأخرة',
    titleHint: 'ما اسم هذا المستند؟',
    descHint: 'ما الغرض منه، ومن يجب أن يقرأه؟ اختياري.',
    dropHint: 'PDF أو وورد أو باوربوينت أو إكسل أو صور. يمكن اختيار عدة ملفات.',
    filesPicked: 'ملفات مختارة', filePicked: 'ملف مختار',
    noDocsYet: 'لا توجد مستندات بعد. أول رفع سيظهر هنا.',
    attachments: 'المرفقات',
    onlineNow: 'متصل الآن', onlineNowSub: 'التطبيق مفتوح لديهم الآن',
    waitingApproval: 'بانتظار الموافقة', waitingSub: 'سجّلوا ولا يستطيعون الدخول بعد',
    waitingNone: 'لا أحد معطَّل',
    invitedNotIn: 'مدعو، لم يسجّل', invitedSub: 'أُرسلت الرسالة ولم يستخدمها',
    rosterOnly: 'في القائمة فقط', rosterSub: 'مستورد من أسانا، بلا حساب',
    canSignIn: 'يستطيع الدخول', approve: 'اعتماد', revoke: 'إلغاء',
    lastSeen: 'آخر ظهور', now: 'الآن', never: 'أبداً',
    minsAgo: 'قبل {n} د', hoursAgo: 'قبل {n} س', daysAgo: 'قبل {n} ي',
    approved: 'يستطيع {name} الدخول الآن.', revoked: 'لم يعد {name} يستطيع الدخول.',
    sendLink: 'أرسل رابطاً', sendingLink: 'جارٍ الإرسال…',
    linkSent: 'أُرسل إلى {email} رابط لضبط كلمة المرور.',
    linkFailed: 'تعذّر الإرسال إلى {email}: {reason}',
    resetHint: 'لا أحد يضبط كلمة مرور نيابة عن غيره، لذا يرسل الزر رابطاً ويختارها صاحبها بنفسه.',
    roles: { member: 'عضو', lead: 'قائد', manager: 'مدير', admin: 'مسؤول' },
    sending: 'جارٍ الإرسال…', inviteNoReason: 'لم يذكر خادم البريد سبباً',
    inviteSent: 'تمت دعوة {email}. وصلته رسالة فيها رابط لضبط كلمة المرور.',
    inviteResent: '{email} لديه حساب بالفعل، فأرسلنا له رابط دخول بدلاً من ذلك.',
    inviteNoMail: 'يستطيع {email} الدخول بهذه الصلاحية الآن، لكن الرسالة لم تُرسل: {reason}. لم يصله أي إشعار — أصلح المُرسِل من Authentication ← Emails ثم أعد الدعوة.',
    rfpHint: 'الكراسة التي وصلتك. PDF أو وورد أو إكسل أو ملف مضغوط.',
    refsHint: 'صور أو لوحات إلهام، أي شيء يجب أن يراه المصممون أولاً.',
    deadlineChart: 'المواعيد حسب الشهر', deadlineNote: 'المشاريع المفتوحة مجمّعة حسب موعد التقديم. الخط المتقطع هو اليوم، وكل ما على يساره متأخر بالفعل.',
    noneYet: 'لا شيء هنا بعد.', today_: 'اليوم',
    st: { intake: 'استلام', in_design: 'قيد التصميم', pricing: 'التسعير',
          submitted: 'مُقدَّم على اعتماد', won: 'مقبول', lost: 'مرفوض',
          in_production: 'قيد التنفيذ الفعلي',
          delivered: 'مُسلَّم', archived: 'مؤرشف', draft: 'مسودة', pending: 'بانتظار',
          in_progress: 'قيد التنفيذ', done: 'منجز', blocked: 'متوقف', new: 'جديد',
          contacted: 'تم التواصل', qualified: 'مؤهل', proposal: 'عرض' },

    filters: 'التصفية', clearFilters: 'مسح',
    anyOwner: 'كل المسؤولين', anyTeam: 'كل الفرق', anyStatus: 'كل الحالات', anyDue: 'كل المواعيد',
    unassignedOwner: 'بلا مسؤول', sortBy: 'الترتيب',
    sortRecent: 'الأحدث', sortDueSoon: 'الموعد، الأقرب', sortDueLate: 'الموعد، الأبعد',
    sortName: 'الاسم', dueOverdue: 'متأخر', due30: 'خلال ٣٠ يوماً', due90: 'خلال ٩٠ يوماً',
    dueNone: 'بلا موعد', showingN: 'يعرض {n} من {t}',
    noMatch: 'لا يوجد مشروع يطابق هذه التصفية.',
    openOnly: 'المفتوحة فقط', includeClosed: 'تضمين المُسلَّمة والمؤرشفة',
    backToProjects: 'المشاريع', notFound: 'هذا المشروع غير موجود.',
    overview: 'نظرة عامة', history: 'السجل', addNote: 'أضف ملاحظة', post: 'نشر',
    noHistory: 'لا شيء مسجل بعد. تغييرات الحالة من هذه الصفحة ستظهر هنا.',
    noDocuments: 'لا توجد ملفات مرفوعة لهذا المشروع.',
    tasksHead: 'المهام', noTasks: 'لا توجد مهام على هذا المشروع.',
    stagesHead: 'الفرق والمراحل', noStages: 'لا توجد مراحل على هذا المشروع بعد.',
    moveTo: 'انقل إلى', statusNote: 'السبب (اختياري)', movedBy: '{who} نقله إلى {to}',
    createdOn: 'أُنشئ', updatedOn: 'آخر تغيير', noDescription: 'لم يُكتب وصف.',
    toProduction: 'مقبول — سيفتح هذا مرحلة تنفيذ لفريق الإنتاج.',
    terminal: 'هذا المشروع مؤرشف. لا شيء يليه.',
    openInAsana: 'افتح في أسانا', sizeBand: 'الحجم', uploadedBy: 'بواسطة {who}',
  },
};

/* ------------------------------------------------------------------ helpers */

const fmt = (isoStr, lang) => isoStr
  ? parse(isoStr).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB',
      { day: 'numeric', month: 'short', year: 'numeric' })
  : '—';

const lateBy = (d) => {
  if (!d) return null;
  const due = parse(d), now = CAL.nextWorking(new Date());
  return due < now ? CAL.countWorkingDays(due, now) : 0;
};

const deptName = (id, lang) => {
  const d = db.dept(id);
  return d ? (lang === 'ar' ? d.name_ar : d.name_en) : id;
};

const STAGE_LABEL = { pending: 'pending', in_progress: 'started', done: 'done', blocked: 'blocked' };

/* -------------------------------------------------------------- status pills
   Status is a STATE, not a series, so it uses the reserved status colours and
   always carries its own word. `in_design` shipped to production as raw enum
   text; a colleague should not have to know the column names of the database
   to read their own dashboard. */
/* Deliberately NOT the categorical hues. A "3D design" team pill and an
   "In design" status pill sit inches apart in the same row, and giving them
   the same purple makes the reader work out which is which. Status uses the
   reserved status slots plus one info blue that is not in the series set. */
const ST_COLOUR = {
  intake:      'var(--ink3)',
  in_design:   'var(--info)',
  in_progress: 'var(--info)',
  qualified:   'var(--info)',
  pricing:     'var(--s2)',
  /* Accepted is a good outcome but not the finish line, so it must not wear
     the same green as `delivered`. It gets the second series hue: clearly
     positive, clearly not done. */
  in_production: 'var(--s1)',
  submitted:   'var(--warn)',
  proposal:    'var(--warn)',
  contacted:   'var(--warn)',
  pending:     'var(--ink3)',
  draft:       'var(--ink3)',
  new:         'var(--ink3)',
  blocked:     'var(--critical)',
  lost:        'var(--critical)',
  won:         'var(--ok)',
  done:        'var(--ok)',
  delivered:   'var(--ok)',
  archived:    'var(--ink4)',
};

/* "3 minutes ago" rather than a timestamp: nobody reads 2026-08-11T09:12Z and
   thinks "that was this morning". Falls back to the date once it is old
   enough that the elapsed time stops being the useful part. */
function sinceText(iso_, lang, t) {
  if (!iso_) return t.never;
  const mins = Math.floor((Date.now() - new Date(iso_).getTime()) / 60000);
  if (mins < 1)    return t.now;
  if (mins < 60)   return t.minsAgo.replace('{n}', mins);
  if (mins < 1440) return t.hoursAgo.replace('{n}', Math.floor(mins / 60));
  if (mins < 10080) return t.daysAgo.replace('{n}', Math.floor(mins / 1440));
  return fmt(iso_.slice(0, 10), lang);
}

export function statusPill(status, lang) {
  if (!status) return '';
  const label = DSTR[lang].st[status] || String(status).replace(/_/g, ' ');
  return `<span class="st" style="--c:${ST_COLOUR[status] || 'var(--ink3)'}"><i></i>${esc(label)}</span>`;
}

/* ------------------------------------------------------------- file picker
   The native file input cannot be styled and its "No file chosen" text is
   not translatable, so every upload on the product used to look like a raw
   OS control dropped into a dark page. This renders the same input visually
   hidden — still focusable, still what the label activates — behind a target
   that says what it takes. controller.js fills the hint with the chosen file
   names, which the hidden control can no longer do for itself. */
export function dropField(id, title, hint, { accept = '', multiple = false, required = false, tall = false } = {}) {
  return `
  <label class="drop${tall ? ' drop--tall' : ''}" for="${esc(id)}">
    <svg class="drop__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 16V4M8 8l4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>
    </svg>
    <span class="drop__t">
      <b>${esc(title)}</b>
      <span class="drop__h" data-hint>${esc(hint)}</span>
    </span>
    <input id="${esc(id)}" type="file"${multiple ? ' multiple' : ''}${required ? ' required' : ''}
           accept="${esc(accept)}" />
  </label>`;
}

/* --------------------------------------------------------------- KPI tiles */

const kpi = (n, label, { sub = '', bad = false, colour = '', date = false } = {}) => `
  <div class="kpi${bad ? ' kpi--bad' : ''}${date ? ' kpi--date' : ''}">
    <span class="kpi__l">${colour ? `<i style="--c:${colour}"></i>` : ''}${esc(label)}</span>
    <span class="kpi__n">${n}</span>
    ${sub ? `<span class="kpi__s">${esc(sub)}</span>` : ''}
  </div>`;

/* ------------------------------------------------------------- the chart
   One series, so no legend — the title names it. Bars are anchored to the
   baseline with only their top corners rounded, separated by a 2px surface
   gap, over a recessive grid. Only the tallest bar is labelled: a number on
   every bar is a table pretending to be a chart.

   The window is the data's own range rather than "the next 12 months",
   because these deadlines were imported from Asana and most of them are
   already in the past. A forward-looking chart would have been empty and
   would have read as "nothing due" rather than "nothing captured".        */

function monthKey(d) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; }

export function deadlineChart(lang, projects) {
  const dated = projects.filter(p => p.due_on);
  if (dated.length < 2) return '';

  const counts = new Map();
  for (const p of dated) {
    const k = monthKey(parse(p.due_on));
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const keys = [...counts.keys()].sort();

  // A contiguous run of months, so an empty month reads as a gap rather than
  // being silently closed up — the shape of the workload is the point.
  const months = [];
  let [y, m] = keys[0].split('-').map(Number);
  const [ly, lm] = keys[keys.length - 1].split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
    if (months.length > 24) break;
  }
  const series = months.slice(-14).map(k => ({ k, n: counts.get(k) || 0 }));
  const max = Math.max(...series.map(s => s.n), 1);

  /* A viewBox close to the width the card actually gets, so the SVG is not
     scaled up 2x on a wide screen — which would take 11px axis labels to 22px
     and make the chart shout over everything around it. */
  const W = 1180, H = 250, PAD_L = 36, PAD_R = 10, PAD_T = 20, PAD_B = 34;
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
  const step = plotW / series.length;
  const barW = Math.max(6, Math.min(46, step - 16));   // thin marks, clear surface gap
  const yOf = (n) => PAD_T + plotH - (n / max) * plotH;

  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const label = (k) => {
    const [yy, mm] = k.split('-');
    return new Date(Date.UTC(+yy, +mm - 1, 1))
      .toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB',
        { month: 'short', timeZone: 'UTC' });
  };

  // Top-rounded bar: a plain rx rounds the base too, which lifts the bar off
  // its own axis and makes small values look like floating lozenges.
  const barPath = (x, y, w, h) => {
    const r = Math.min(4, w / 2, h);
    return `M${x} ${y + h}V${y + r}q0-${r} ${r}-${r}h${w - 2 * r}q${r} 0 ${r} ${r}V${y + h}Z`;
  };

  const nowKey = monthKey(new Date());
  const nowIdx = series.findIndex(s => s.k >= nowKey);
  const nowX = nowIdx < 0 ? null : PAD_L + nowIdx * step;

  const t = DSTR[lang];
  const peak = series.reduce((a, b) => (b.n > a.n ? b : a), series[0]);

  return `
<section class="card chartcard">
  <div class="card__head">
    <h2>${esc(t.deadlineChart)}</h2>
    <span class="muted small">${dated.length} ${esc(lang === 'ar' ? 'مشروع له موعد' : 'projects with a deadline')}</span>
  </div>
  <div style="padding:6px 16px 0">
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img"
         aria-label="${esc(t.deadlineChart)}: ${series.map(s => `${label(s.k)} ${s.n}`).join(', ')}">
      <g class="grid">
        ${ticks.map(v => `<line x1="${PAD_L}" x2="${W - PAD_R}" y1="${yOf(v)}" y2="${yOf(v)}"/>`).join('')}
      </g>
      <g class="axis">
        ${ticks.map(v => `<text x="${PAD_L - 8}" y="${yOf(v) + 4}" text-anchor="end">${v}</text>`).join('')}
        ${series.map((s, i) => `<text x="${PAD_L + i * step + step / 2}" y="${H - 10}" text-anchor="middle">${esc(label(s.k))}</text>`).join('')}
      </g>
      ${nowX !== null ? `<g class="now">
        <line x1="${nowX}" x2="${nowX}" y1="${PAD_T - 6}" y2="${PAD_T + plotH}"/>
        <text x="${nowX + 4}" y="${PAD_T - 1}">${esc(t.today_)}</text>
      </g>` : ''}
      <g>
        ${series.map((s, i) => {
          if (!s.n) return '';
          const x = PAD_L + i * step + (step - barW) / 2, y = yOf(s.n);
          return `<g class="bar"><title>${esc(label(s.k))} ${s.k.slice(0, 4)} — ${s.n}</title>
            <path d="${barPath(x, y, barW, PAD_T + plotH - y)}"/></g>`;
        }).join('')}
        ${peak.n ? `<text class="val" x="${PAD_L + series.indexOf(peak) * step + step / 2}" y="${yOf(peak.n) - 6}" text-anchor="middle">${peak.n}</text>` : ''}
      </g>
    </svg>
  </div>
  <p class="note">${esc(t.deadlineNote)}</p>
</section>`;
}

/* --------------------------------------------------------------- scheduling
   Build a scheduler that already knows what everyone is carrying, then ask it
   about the new project. Without the first half the answer is the naive one:
   how long the work takes, on a team with nothing else to do. */

export function buildScheduler(people, openStages) {
  const members = people
    .filter(p => p.department_id && db.dept(p.department_id)?.is_stage)
    .map(p => ({ id: p.id, name: p.full_name || p.email, team: p.department_id }));

  const sched = new Scheduler({ members, calendar: CAL });

  // Replay committed work oldest-first so the ledger reflects reality.
  const byProject = new Map();
  for (const s of openStages) {
    if (s.status === 'done') continue;
    if (!byProject.has(s.project_id)) byProject.set(s.project_id, { start: s.planned_start, stages: [] });
    const e = byProject.get(s.project_id);
    e.stages.push(s.department_id);
    if (s.planned_start && (!e.start || s.planned_start < e.start)) e.start = s.planned_start;
  }
  let n = 0;
  for (const [pid, e] of byProject) {
    const stages = e.stages.filter(d => db.dept(d)?.base_days);
    if (!stages.length) continue;
    try {
      sched.scheduleProject({
        id: 'live-' + pid, name: 'committed', size: 'M',
        earliestStart: e.start || today(), stages, commit: true,
      });
      n++;
    } catch { /* a project the engine cannot place must not block the estimate */ }
  }
  return { sched, committed: n, members };
}

export function estimateFor(sched, { name, size, start, deadline, stages }) {
  const real = sched.scheduleProject({
    id: '__new__', name, size, earliestStart: start, deadline: deadline || null,
    stages, commit: false,
  });
  const naive = new Scheduler({ members: sched.members ?? [], calendar: CAL })
    .scheduleProject({ id: 'n', name, size, earliestStart: start, stages, commit: false });
  return { real, naive };
}

/* ================================ SIGN IN ================================= */

export function signInView(lang, mode = 'in', msg = '', authErr = null) {
  const t = DSTR[lang];
  const title = mode === 'up' ? t.firstTimeTitle
              : mode === 'forgot' ? t.forgot
              : mode === 'reset' ? t.newPassword
              : t.signIn;

  /* 'up' and 'forgot' ask for an address and send a link; only 'in' and
     'reset' involve a password at all. The first-time screen used to take a
     password too, which meant whoever typed an address first owned it — and
     an address is what decides a role here. */
  const wantsPassword = mode === 'in' || mode === 'reset';
  const prompt = mode === 'up' ? t.firstTimePrompt : mode === 'forgot' ? t.forgotPrompt : '';
  const go = mode === 'reset' ? t.setIt
           : mode === 'up' ? t.emailMeLink
           : mode === 'forgot' ? t.sendReset
           : t.signIn;

  /* An expired link is the single most likely way to arrive here, and the
     only useful response is a new link — so the panel carries the button
     rather than telling the user to go and find it. */
  const expired = authErr && /expired|invalid/i.test(authErr.code || authErr.message || '');
  const errPanel = !authErr ? '' : `
    <div class="autherr">
      <p class="autherr__h">${esc(expired ? t.linkExpired : authErr.message || t.linkExpired)}</p>
      ${expired ? `<p class="autherr__b small">${esc(t.linkExpiredWhy)}</p>
                   <button type="button" class="btn btn--sm" data-auth="forgot">${esc(t.sendFresh)}</button>` : ''}
    </div>`;

  return `
<section class="authwrap">
  <div class="card auth">
    <div class="card__head"><h2>${esc(title)}</h2></div>
    ${errPanel}
    <form id="authForm" class="authform" autocomplete="on">
      ${mode === 'reset' ? `<p class="small muted">${esc(t.recoverPrompt)}</p>` : `
      ${prompt ? `<p class="small muted">${esc(prompt)}</p>` : ''}
      <label class="f f--wide">
        <span>${esc(t.email)}</span>
        <input id="aEmail" type="email" name="email" required autocomplete="username"
               placeholder="you@expandexpo.com" />
      </label>`}
      ${!wantsPassword ? '' : `
      <label class="f f--wide">
        <span>${esc(mode === 'reset' ? t.newPassword : t.password)}</span>
        <input id="aPass" type="password" name="password" required minlength="8"
               autocomplete="${mode === 'reset' ? 'new-password' : 'current-password'}" />
      </label>`}
      ${msg ? `<p class="authmsg ${/^!/.test(msg) ? 'bad' : ''}">${esc(msg.replace(/^!/, ''))}</p>` : ''}
      <button class="btn btn--primary" type="submit" id="aGo">${esc(go)}</button>
      <div class="authlinks small">
        ${mode === 'reset' ? ''
          : mode === 'in'
          ? `<button type="button" class="link" data-auth="up">${esc(t.firstTime)}</button>
             <button type="button" class="link" data-auth="forgot">${esc(t.forgot)}</button>`
          : `<button type="button" class="link" data-auth="in">${esc(t.backToSignIn)}</button>`}
      </div>
    </form>
  </div>
</section>`;
}

/* ================================== HOME ================================== */

export function homeView(lang, ctx) {
  const t = DSTR[lang], me = db.state.me;
  if (!me) return `<section class="card"><p class="note">${esc(t.noInvite)}</p></section>`;
  if (!me.is_active) return `<section class="card"><p class="note note--lead">${esc(t.noInvite)}</p></section>`;

  const d = me.department_id;
  if (d === 'bd') return leadsView(lang, ctx);
  if (d === 'content') return docsView(lang, ctx);
  if (d === 'pm' || me.role === 'admin' || me.role === 'manager') return pmView(lang, ctx);
  return queueView(lang, ctx);
}

/* ------------------------------- designer queue --------------------------- */

export function queueView(lang, ctx) {
  const t = DSTR[lang];
  const mine = (ctx.stages || []).filter(s => s.assignee_id === db.state.me?.id && s.status !== 'done');
  mine.sort((a, b) => String(a.planned_end || '9999').localeCompare(String(b.planned_end || '9999')));

  return `
<section class="card">
  <div class="card__head">
    <h2>${esc(t.myQueue)}</h2>
    <span class="muted small">${mine.length} ${esc(lang === 'ar' ? 'بند' : 'items')}</span>
  </div>
  ${mine.length ? `
  <table class="tbl">
    <thead><tr>
      <th>${esc(t.projects)}</th><th>${esc(t.stage)}</th>
      <th class="num">${esc(t.due)}</th><th class="num">${esc(t.status)}</th>
    </tr></thead>
    <tbody>
      ${mine.map(s => {
        const late = lateBy(s.planned_end);
        return `<tr>
          <td>${esc(s.project_name || '—')}</td>
          <td class="muted">${esc(deptName(s.department_id, lang))}</td>
          <td class="num ${late ? 'bad' : 'muted'}">${esc(fmt(s.planned_end, lang))}
            ${late ? `<span class="block small">${late} ${esc(t.overdue)}</span>` : ''}</td>
          <td class="num">
            ${s.status === 'pending'
              ? `<button class="btn btn--sm" data-stage="${esc(s.id)}" data-to="in_progress">${esc(t.start_)}</button>`
              : `<button class="btn btn--sm btn--primary" data-stage="${esc(s.id)}" data-to="done">${esc(t.markDone)}</button>`}
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>` : `<p class="muted">${esc(t.nothingQueued)}</p>`}
</section>`;
}

/* ------------------------------------ PM ---------------------------------- */

/* -------------------------------------------------------------- filtering

   A pure function over (projects, filters) so the table, the counts and the
   tests all read the same rule. The moment "how many match" is computed in
   one place and "which rows to draw" in another, the header starts claiming
   a number the body does not show.                                        */

export const CLOSED_STATUS = ['delivered', 'archived', 'lost'];
const DAY = 86400000;

export const PF_DEFAULT = {
  owner: '', team: '', status: '', due: '', sort: 'recent', closed: false,
};

export function filterProjects(projects, pf = {}) {
  const f = { ...PF_DEFAULT, ...pf };
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const inDays = (d) => Math.round((parse(d) - midnight) / DAY);

  let rows = (projects || []).filter(p => !p.is_crm_list);

  /* Asking for a closed status explicitly must not be overruled by the
     open-only default, or picking "Delivered" would return nothing and the
     screen would insist there are no delivered projects. */
  if (!f.closed && !CLOSED_STATUS.includes(f.status)) {
    rows = rows.filter(p => !CLOSED_STATUS.includes(p.status));
  }
  if (f.status) rows = rows.filter(p => p.status === f.status);
  // '~none' rather than '' — an empty value already means "any owner", and
  // the two questions are different ones.
  if (f.owner) rows = f.owner === '~none'
    ? rows.filter(p => !p.owner_id)
    : rows.filter(p => p.owner_id === f.owner);
  if (f.team) rows = rows.filter(p => (p.project_stages || [])
    .some(s => s.department_id === f.team));

  if (f.due === 'overdue') rows = rows.filter(p => p.due_on && inDays(p.due_on) < 0);
  else if (f.due === 'd30') rows = rows.filter(p => p.due_on && inDays(p.due_on) >= 0 && inDays(p.due_on) <= 30);
  else if (f.due === 'd90') rows = rows.filter(p => p.due_on && inDays(p.due_on) >= 0 && inDays(p.due_on) <= 90);
  else if (f.due === 'none') rows = rows.filter(p => !p.due_on);

  /* Undated projects sort last in both directions. Treating a missing
     deadline as either the beginning or the end of time puts 274 blanks on
     top of whichever end you asked to see. */
  const byDue = (dir) => (a, b) => {
    if (!a.due_on && !b.due_on) return 0;
    if (!a.due_on) return 1;
    if (!b.due_on) return -1;
    return dir * (parse(a.due_on) - parse(b.due_on));
  };
  const sorters = {
    recent:  (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
    due:     byDue(1),
    duelate: byDue(-1),
    name:    (a, b) => String(a.name).localeCompare(String(b.name)),
  };
  return rows.slice().sort(sorters[f.sort] || sorters.recent);
}

/* The filter bar. Selects rather than chips: five independent questions with
   long answer lists (23 owners) do not fit a chip row, and a chip row that
   scrolls sideways hides its own options. */
function filterBar(lang, ctx, all) {
  const t = DSTR[lang];
  const f = { ...PF_DEFAULT, ...(ctx.pf || {}) };
  const people = ctx.people || [];

  /* Only offer owners who actually own something here, sorted by how much.
     A dropdown listing all 47 colleagues, 27 of whom can never match, is a
     list of dead ends. */
  const counts = new Map();
  all.forEach(p => { if (p.owner_id) counts.set(p.owner_id, (counts.get(p.owner_id) || 0) + 1); });
  const owners = [...counts.entries()]
    .map(([id, n]) => ({ id, n, name: people.find(x => x.id === id)?.full_name
                                    || all.find(p => p.owner_id === id)?.owner?.full_name || id }))
    .sort((a, b) => b.n - a.n || String(a.name).localeCompare(String(b.name)));
  const noOwner = all.filter(p => !p.owner_id).length;

  const teams = (db.state.departments || []).filter(d => d.is_stage)
    .map(d => ({ id: d.id, name: lang === 'ar' ? d.name_ar : d.name_en,
                 n: all.filter(p => (p.project_stages || []).some(s => s.department_id === d.id)).length }))
    .filter(d => d.n > 0);

  const statuses = [...new Set(all.map(p => p.status))]
    .sort((a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b));

  const sel = (key, label, options) => `
    <label class="f f--sm"><span>${esc(label)}</span>
      <select data-pf="${esc(key)}">
        ${options.map(o => `<option value="${esc(o.v)}"${o.v === f[key] ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}
      </select></label>`;

  const active = ['owner', 'team', 'status', 'due'].some(k => f[k]) || f.closed || f.sort !== 'recent';

  return `
<div class="filterbar">
  ${sel('owner', t.owner, [{ v: '', l: t.anyOwner },
    ...owners.map(o => ({ v: o.id, l: `${o.name} (${o.n})` })),
    ...(noOwner ? [{ v: '~none', l: `${t.unassignedOwner} (${noOwner})` }] : [])])}
  ${sel('team', t.team, [{ v: '', l: t.anyTeam },
    ...teams.map(d => ({ v: d.id, l: `${d.name} (${d.n})` }))])}
  ${sel('status', t.status, [{ v: '', l: t.anyStatus },
    ...statuses.map(s => ({ v: s, l: t.st[s] || String(s).replace(/_/g, ' ') }))])}
  ${sel('due', t.due, [{ v: '', l: t.anyDue },
    { v: 'overdue', l: t.dueOverdue }, { v: 'd30', l: t.due30 },
    { v: 'd90', l: t.due90 }, { v: 'none', l: t.dueNone }])}
  ${sel('sort', t.sortBy, [{ v: 'recent', l: t.sortRecent }, { v: 'due', l: t.sortDueSoon },
    { v: 'duelate', l: t.sortDueLate }, { v: 'name', l: t.sortName }])}
  <label class="chk chk--inline">
    <input type="checkbox" data-pf="closed"${f.closed ? ' checked' : ''} />
    <span>${esc(t.includeClosed)}</span>
  </label>
  ${active ? `<button class="btn btn--sm" data-pf-clear="1">${esc(t.clearFilters)}</button>` : ''}
</div>`;
}

const STATUS_ORDER = ['intake', 'in_design', 'pricing', 'submitted', 'won',
                      'in_production', 'delivered', 'lost', 'archived'];

export function pmView(lang, ctx) {
  const t = DSTR[lang];
  const projects = (ctx.projects || []).filter(p => !p.is_crm_list);
  const open = projects.filter(p => !CLOSED_STATUS.includes(p.status));

  /* --- the numbers above the table ------------------------------------- */
  const overdue = open.filter(p => lateBy(p.due_on)).length;
  const stages = open.flatMap(p => p.project_stages || []);
  const liveStages = stages.filter(s => s.status !== 'done');
  const unassigned = liveStages.filter(s => !s.assignee_id).length;

  /* Every stage imported from Asana has a NULL effort_days — Asana has no
     such field — so summing the column alone renders a confident zero next to
     204 open stages. Fall back to the department's stated figure, and count
     how many stages have neither so the tile can say what it is missing
     rather than quietly under-reporting. */
  const effortOf = (s) => Number(s.effort_days) || Number(db.dept(s.department_id)?.base_days) || 0;
  const committed = Math.round(liveStages.reduce((sum, s) => sum + effortOf(s), 0));
  const unpriced = liveStages.filter(s => !effortOf(s)).length;

  const leads = ctx.leads || [];
  const openLeads = leads.filter(l => !['won', 'lost'].includes(l.status)).length;

  /* The product's own promise, on the dashboard: if a medium proposal landed
     today, when would it deliver — against everything already committed.
     It runs through the same scheduler the estimator uses, so this tile and
     that screen cannot quietly disagree. Wrapped because a roster with an
     empty stage throws, and one empty tile beats a blank dashboard. */
  let freeFrom = null;
  try {
    const { sched } = buildScheduler(ctx.people || [], liveStages);
    /* Only stages the scheduler can actually price AND staff. `pricing` and
       `production` are flagged as stages but have no stated effort and nobody
       assigned, and asking the engine to schedule one throws — which took the
       whole tile down with it and printed an em dash. */
    const probeStages = (db.state.departments || [])
      .filter(d => d.is_stage && Number(d.base_days) > 0)
      .filter(d => (ctx.people || []).some(p => p.department_id === d.id))
      .map(d => d.id);
    if (probeStages.length) {
      const { real } = estimateFor(sched, {
        name: 'probe', size: 'M', start: today(), deadline: null, stages: probeStages,
      });
      freeFrom = real?.delivery || null;
    }
  } catch { freeFrom = null; }

  /* The tiles describe the business, the table answers your query. Keeping
     the tiles on the unfiltered open set means picking one owner does not
     make the company look like it has three projects. */
  const matched = filterProjects(projects, ctx.pf);
  const rows = matched.slice(0, 120);

  /* Only offer the review filter if there is something to review, and count
     it over the matched set rather than the visible page. */
  const flagged = matched.filter(p => p.import_flags?.length).length;

  /* The estimate column earned its place only if any row can fill it. When
     every cell is an em dash the column is not information, it is furniture
     that makes the table look broken. */
  const anyEstimate = rows.some(p => p.estimated_delivery);
  const anyOwner = rows.some(p => p.owner?.full_name);

  return `
<div class="kpis">
  ${kpi(open.length, t.openProjects, { sub: `${projects.length} ${lang === 'ar' ? 'إجمالاً' : 'in total'}`, colour: 'var(--brand)' })}
  ${kpi(overdue, t.overdue_, { bad: overdue > 0, sub: lang === 'ar' ? 'تجاوزت موعد التقديم' : 'past their deadline', colour: 'var(--critical)' })}
  ${kpi(unassigned, t.unassigned_, { sub: `${liveStages.length} ${lang === 'ar' ? 'مرحلة مفتوحة' : 'open stages'}`, colour: 'var(--warn)' })}
  ${kpi(committed, t.committedDays, { colour: 'var(--s2)',
    sub: unpriced ? `${unpriced} ${lang === 'ar' ? 'مرحلة بلا رقم جهد' : 'stages have no effort figure'}`
                  : (lang === 'ar' ? 'جهد متبقٍ' : 'effort still to do') })}
  ${kpi(openLeads, t.openLeads, { sub: `${leads.length} ${lang === 'ar' ? 'في القائمة' : 'in the list'}`, colour: 'var(--s3)' })}
  ${kpi(esc(fmt(freeFrom, lang)), t.nextFree, { date: true, sub: lang === 'ar' ? 'حجم متوسط، يبدأ اليوم' : 'medium size, starting today', colour: 'var(--s1)' })}
</div>

${deadlineChart(lang, open)}

<section class="card">
  <div class="card__head">
    <h2>${esc(t.projects)}</h2>
    <span class="muted small">${esc(t.showingN.replace('{n}', matched.length).replace('{t}', projects.length))}</span>
    ${canPlan() ? `<button class="btn btn--primary btn--sm" style="margin-inline-start:auto" data-act="go" data-route="#/new">${esc(t.newProject)}</button>` : ''}
  </div>
  ${filterBar(lang, ctx, projects)}
  ${flagged ? `<div class="chipbar">
    <button class="chip chip--btn is-on" data-rows="all">${esc(t.allRows)} ${matched.length}</button>
    <button class="chip chip--btn" data-rows="flagged">${esc(t.needsReview)} ${flagged}</button>
  </div>` : ''}
  <div class="tblwrap">
    <table class="tbl">
      <thead><tr>
        <th>${esc(t.name)}</th>
        ${anyOwner ? `<th>${esc(t.owner)}</th>` : ''}
        <th>${esc(t.teamsCol)}</th>
        ${anyEstimate ? `<th class="num">${esc(t.estimate)}</th>` : ''}
        <th class="num">${esc(t.due)}</th><th>${esc(t.status)}</th>
      </tr></thead>
      <tbody>
        ${rows.length ? rows.map(p => {
          const late = lateBy(p.due_on);
          const st = (p.project_stages || []).slice().sort((a, b) => a.sort - b.sort);
          return `<tr${p.import_flags?.length ? ' data-flagged="1"' : ''}>
            <td><button class="link" data-act="go" data-route="#/p/${esc(p.id)}">${esc(p.name)}</button></td>
            ${anyOwner ? `<td class="small ${p.owner ? '' : 'muted'}">${esc(p.owner?.full_name || t.unassignedOwner)}</td>` : ''}
            <td class="small"><span class="stagecell">${st.map(s => `<span class="pill" style="--c:${esc(db.dept(s.department_id)?.colour || '#555')}">${esc(deptName(s.department_id, lang))}${s.status === 'done' ? ' ✓' : ''}</span>`).join('')}</span></td>
            ${anyEstimate ? `<td class="num">${esc(fmt(p.estimated_delivery, lang))}</td>` : ''}
            <td class="num ${late ? 'bad' : 'muted'}">${esc(fmt(p.due_on, lang))}
              ${late ? `<span class="block small">${late} ${esc(t.overdue)}</span>` : ''}</td>
            <td>${statusPill(p.status, lang)}</td>
          </tr>`;
        }).join('')
        : `<tr><td class="tbl__empty" colspan="6">${esc(t.noMatch)}</td></tr>`}
      </tbody>
    </table>
  </div>
  ${matched.length > rows.length ? `<p class="note">${esc(lang === 'ar'
    ? `تعرض ${rows.length} من ${matched.length} مشروعاً مطابقاً. ضيّق التصفية أو استخدم البحث في الأعلى.`
    : `Showing ${rows.length} of ${matched.length} matching projects. Narrow the filters or use the search above.`)}</p>` : ''}
</section>`;
}

/* ========================================================================
   One project.

   The row link in the table has pointed at #/p/<id> since the table was
   written, and nothing answered it — clicking a project name did nothing at
   all. This is that page: what the project is, who owns it, which teams are
   on it, what has been uploaded, and the one control that moves it forward.
   ======================================================================== */

export function projectView(lang, ctx) {
  const t = DSTR[lang];
  const p = ctx.project;
  if (!p) {
    return `
<nav class="crumb"><button class="link" data-act="go" data-route="#/projects">← ${esc(t.backToProjects)}</button></nav>
<section class="card"><div class="card__head"><h2>${esc(t.notFound)}</h2></div></section>`;
  }

  const stages = (p.project_stages || []).slice().sort((a, b) => a.sort - b.sort);
  const files = ctx.projectFiles || [];
  const tasks = ctx.projectTasks || [];
  const events = ctx.projectEvents || [];
  const late = lateBy(p.due_on);
  const next = db.NEXT_STATUS[p.status] || [];
  const mayMove = canPlan() && next.length > 0;

  const fact = (label, value, cls = '') =>
    `<div class="fact"><span class="fact__l">${esc(label)}</span><span class="fact__v ${cls}">${value}</span></div>`;

  return `
<nav class="crumb"><button class="link" data-act="go" data-route="#/projects">← ${esc(t.backToProjects)}</button></nav>

<section class="card">
  <div class="card__head">
    <h2>${esc(p.name)}</h2>
    ${statusPill(p.status, lang)}
    ${p.asana_url ? `<a class="link" style="margin-inline-start:auto" href="${esc(p.asana_url)}" target="_blank" rel="noopener">${esc(t.openInAsana)} ↗</a>` : ''}
  </div>

  <div class="factgrid">
    ${fact(t.client, esc(p.client || '—'))}
    ${fact(t.owner, esc(p.owner?.full_name || t.unassignedOwner), p.owner ? '' : 'muted')}
    ${fact(t.sizeBand, esc(p.size || '—'))}
    ${fact(t.start, esc(fmt(p.start_on, lang)))}
    ${fact(t.due, `${esc(fmt(p.due_on, lang))}${late ? ` <span class="bad small">${late} ${esc(t.overdue)}</span>` : ''}`)}
    ${fact(t.estimate, esc(fmt(p.estimated_delivery, lang)))}
    ${fact(t.createdOn, esc(fmt((p.created_at || '').slice(0, 10), lang)))}
    ${fact(t.updatedOn, esc(fmt((p.updated_at || '').slice(0, 10), lang)))}
  </div>

  <h3 class="subhead">${esc(t.description)}</h3>
  <p class="prose${p.description ? '' : ' muted'}">${esc(p.description || t.noDescription)}</p>
</section>

${mayMove ? `
<section class="card">
  <div class="card__head"><h2>${esc(t.moveTo)}</h2></div>
  <form id="stForm" class="inlineform">
    <div class="fields">
      <label class="f"><span>${esc(t.status)}</span>
        <select id="stNext">
          ${next.map(s => `<option value="${esc(s)}">${esc(t.st[s] || s)}</option>`).join('')}
        </select></label>
      <label class="f f--wide"><span>${esc(t.statusNote)}</span><input id="stNote" /></label>
    </div>
    ${next.includes('in_production') ? `<p class="note note--lead">${esc(t.toProduction)}</p>` : ''}
    <div class="actions"><button type="submit" class="btn btn--primary btn--sm" id="stGo">${esc(t.moveTo)}</button></div>
  </form>
</section>` : (canPlan() ? `<section class="card"><p class="note">${esc(t.terminal)}</p></section>` : '')}

<section class="card">
  <div class="card__head"><h2>${esc(t.stagesHead)}</h2><span class="muted small">${stages.length}</span></div>
  ${stages.length ? `<div class="tblwrap"><table class="tbl tbl--tight">
    <thead><tr><th>${esc(t.team)}</th><th>${esc(t.owner)}</th>
      <th class="num">${esc(t.due)}</th><th>${esc(t.status)}</th></tr></thead>
    <tbody>${stages.map(s => `<tr>
      <td><span class="pill" style="--c:${esc(db.dept(s.department_id)?.colour || '#555')}">${esc(deptName(s.department_id, lang))}</span></td>
      <td class="small ${s.assignee ? '' : 'muted'}">${esc(s.assignee?.full_name || t.unassigned)}</td>
      <!-- planned_end, not due_on: a stage has a plan, the project has a deadline -->

      <td class="num muted">${esc(fmt(s.planned_end, lang))}</td>
      <td>${statusPill(s.status, lang)}</td></tr>`).join('')}</tbody>
  </table></div>` : `<p class="note">${esc(t.noStages)}</p>`}
</section>

<section class="card">
  <div class="card__head"><h2>${esc(t.documents)}</h2><span class="muted small">${files.length}</span></div>
  ${files.length ? `<ul class="filelist">${files.map(f => `
    <li class="filerow">
      <button class="link" data-file="${esc(f.id)}">${esc(f.title || f.filename)}</button>
      <span class="muted small">${esc(f.purpose)}${f.size_bytes ? ` · ${Math.max(1, Math.round(f.size_bytes / 1024))} KB` : ''}
        ${f.uploader?.full_name ? ` · ${esc(t.uploadedBy.replace('{who}', f.uploader.full_name))}` : ''}</span>
    </li>`).join('')}</ul>` : `<p class="note">${esc(t.noDocuments)}</p>`}
</section>

${tasks.length ? `
<section class="card">
  <div class="card__head"><h2>${esc(t.tasksHead)}</h2>
    <span class="muted small">${tasks.filter(x => !x.completed).length} / ${tasks.length}</span></div>
  <div class="tblwrap"><table class="tbl tbl--tight"><tbody>
    ${tasks.slice(0, 60).map(x => `<tr>
      <td class="${x.completed ? 'muted' : ''}">${x.completed ? '✓ ' : ''}${esc(x.name)}</td>
      <td class="small muted">${esc(x.section_name || '')}</td>
      <td class="small muted">${esc(x.assignee?.full_name || '')}</td>
      <td class="num muted">${esc(fmt(x.due_on, lang))}</td></tr>`).join('')}
  </tbody></table></div>
</section>` : ''}

<section class="card">
  <div class="card__head"><h2>${esc(t.history)}</h2></div>
  ${canPlan() ? `<form id="noteForm" class="inlineform">
    <div class="fields">
      <label class="f f--wide"><span>${esc(t.addNote)}</span><input id="noteBody" required /></label>
    </div>
    <div class="actions"><button type="submit" class="btn btn--sm">${esc(t.post)}</button></div>
  </form>` : ''}
  ${events.length ? `<ul class="timeline">${events.map(e => `
    <li class="timeline__i">
      <span class="timeline__d">${esc(sinceText(e.created_at, lang, t))}</span>
      <span class="timeline__b">${e.kind === 'status'
        ? esc(t.movedBy.replace('{who}', e.author?.full_name || '—')
                       .replace('{to}', t.st[e.to_status] || e.to_status || '—'))
        : `<b>${esc(e.author?.full_name || '—')}</b> — ${esc(e.body || '')}`}
        ${e.kind === 'status' && e.body ? `<span class="block muted small">${esc(e.body)}</span>` : ''}</span>
    </li>`).join('')}</ul>` : `<p class="note">${esc(t.noHistory)}</p>`}
</section>`;
}

/* ------------------------------ new project ------------------------------- */

export function newProjectView(lang, ctx) {
  const t = DSTR[lang];
  const stageDepts = db.state.departments.filter(d => d.is_stage);
  const people = ctx.people || [];

  return `
<nav class="crumb"><button class="link" data-act="go" data-route="#/home">← ${esc(t.projects)}</button></nav>
<section class="card">
  <div class="card__head"><h2>${esc(t.newProject)}</h2></div>
  <form id="projForm" class="projform">
    <div class="fields">
      <label class="f f--wide"><span>${esc(t.name)}</span><input id="pName" required /></label>
      <label class="f"><span>${esc(t.client)}</span><input id="pClient" /></label>
      <label class="f"><span>${esc(t.size)}</span>
        <select id="pSize">
          ${['S', 'M', 'L', 'XL'].map(s => `<option value="${s}"${s === 'M' ? ' selected' : ''}>${s} · ×${DEFAULT_SIZE_FACTORS[s]}</option>`).join('')}
        </select></label>
      <label class="f"><span>${esc(t.start)}</span><input id="pStart" type="date" value="${today()}" /></label>
      <label class="f"><span>${esc(t.deadline)}</span><input id="pDeadline" type="date" /></label>
      <label class="f f--wide"><span>${esc(t.description)}</span><textarea id="pDesc" rows="3"></textarea></label>
    </div>

    <h3 class="subhead">${esc(t.stages)}</h3>
    <div class="stagepick">
      ${stageDepts.map(d => `
        <div class="stagepick__row">
          <label class="chk">
            <input type="checkbox" class="stageOn" value="${esc(d.id)}" ${['3d', '2d'].includes(d.id) ? 'checked' : ''} />
            <i style="background:${esc(d.colour)}"></i>
            <span>${esc(lang === 'ar' ? d.name_ar : d.name_en)}</span>
            <span class="muted small">${d.base_days ? `${d.base_days} ${esc(t.workingDays)}` : esc(lang === 'ar' ? 'بلا رقم جهد' : 'no stated effort')}</span>
          </label>
          <select class="stageWho" data-dept="${esc(d.id)}">
            <option value="">${esc(t.unassigned)}</option>
            ${people.filter(p => p.department_id === d.id)
              .map(p => `<option value="${esc(p.id)}">${esc(p.full_name || p.email)}</option>`).join('')}
          </select>
        </div>`).join('')}
    </div>

    <h3 class="subhead">${esc(t.attachments)}</h3>
    <div class="dropgrid">
      ${dropField('pRfp', t.rfp, t.rfpHint, { accept: '.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt', tall: true })}
      ${dropField('pRefs', t.refs, t.refsHint, { accept: 'image/*,.pdf', multiple: true, tall: true })}
    </div>

    <div id="estBox" class="estbox"></div>

    <div class="actions">
      <button type="submit" class="btn btn--primary" id="pGo">${esc(t.createAndAssign)}</button>
      <button type="button" class="btn" data-act="go" data-route="#/home">${esc(t.cancel)}</button>
    </div>
  </form>
</section>`;
}

export function estimateBox(lang, est) {
  const t = DSTR[lang];
  if (!est) return '';
  const { real, naive } = est;
  const gap = real.delivery && naive.delivery
    ? CAL.countWorkingDays(parse(naive.delivery), parse(real.delivery)) : 0;
  return `
  <div class="est">
    <div class="est__side">
      <span class="est__k">${esc(t.naive)}</span>
      <span class="est__v">${esc(fmt(naive.delivery, lang))}</span>
    </div>
    <div class="est__arrow">→</div>
    <div class="est__side est__side--real">
      <span class="est__k">${esc(t.estimate)}</span>
      <span class="est__v">${esc(fmt(real.delivery, lang))}</span>
      ${gap > 0 ? `<span class="est__note small">${gap} ${esc(t.workingDays)} ${esc(t.queueDays)}</span>` : ''}
    </div>
  </div>`;
}

/* ----------------------------------- leads -------------------------------- */

export function leadsView(lang, ctx) {
  const t = DSTR[lang];
  const leads = ctx.leads || [];
  const STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];
  const counts = Object.fromEntries(STATUSES.map(s => [s, leads.filter(l => l.status === s).length]));
  const stale = leads.filter(l => l.status !== 'won' && l.status !== 'lost' && lateBy(l.next_follow_up_on)).length;
  const open = leads.filter(l => !['won', 'lost'].includes(l.status)).length;

  /* Same tiles as the dashboard rather than the old edge-to-edge strip: the
     strip had no card, no colour and no denominator, so "0 qualified" read as
     a rendering gap instead of the finding it is. Each tile carries the share
     of the whole list, and its dot matches the pill the same status wears in
     the table below. */
  const share = (n) => leads.length
    ? `${Math.round((n / leads.length) * 100)}% ${lang === 'ar' ? 'من القائمة' : 'of the list'}`
    : '';

  return `
<div class="kpis kpis--4">
  ${kpi(open, t.openLeads, { colour: 'var(--brand)',
    sub: `${leads.length} ${lang === 'ar' ? 'في القائمة' : 'in the list'}` })}
  ${kpi(stale, t.overdueFollow, { bad: stale > 0, colour: 'var(--critical)',
    sub: lang === 'ar' ? 'موعد المتابعة فات' : 'follow-up date has passed' })}
  ${STATUSES.map(s => kpi(counts[s], t.st[s] || s, {
    colour: ST_COLOUR[s] || 'var(--ink3)', sub: share(counts[s]),
  })).join('')}
</div>

<section class="card">
  <div class="card__head">
    <h2>${esc(t.leads)}</h2>
    <span class="muted small">${leads.length}</span>
    <button class="btn btn--primary btn--sm" style="margin-inline-start:auto" data-act="newlead">${esc(t.addLead)}</button>
  </div>
  <div id="leadForm"></div>
  <div class="tblwrap">
  <table class="tbl">
    <thead><tr>
      <th>${esc(t.name)}</th><th>${esc(t.company)}</th><th>${esc(t.status)}</th>
      <th class="num">${esc(t.followUp)}</th><th>${esc(t.owner)}</th><th></th>
    </tr></thead>
    <tbody>
      ${leads.slice(0, 200).map(l => {
        const late = lateBy(l.next_follow_up_on);
        return `<tr>
          <td>${esc(l.name)}${l.email ? `<span class="muted small block">${esc(l.email)}</span>` : ''}</td>
          <td class="muted small">${esc(l.company || l.source || '')}</td>
          <td>
            <select class="leadStatus btn--sm" data-lead="${esc(l.id)}">
              ${STATUSES.map(s => `<option value="${s}"${s === l.status ? ' selected' : ''}>${esc(t.st[s] || s)}</option>`).join('')}
            </select>
          </td>
          <td class="num ${late ? 'bad' : 'muted'}">${esc(fmt(l.next_follow_up_on, lang))}</td>
          <td class="muted small">${esc(l.owner?.full_name || t.unassigned)}</td>
          <td class="num"><button class="link small" data-note="${esc(l.id)}">${esc(t.logNote)}</button></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
  </div>
</section>`;
}

export const leadFormHtml = (lang, people) => {
  const t = DSTR[lang];
  return `
<form id="newLead" class="inlineform">
  <div class="fields">
    <label class="f"><span>${esc(t.name)}</span><input id="lName" required /></label>
    <label class="f"><span>${esc(t.company)}</span><input id="lCompany" /></label>
    <label class="f"><span>${esc(t.email)}</span><input id="lEmail" type="email" /></label>
    <label class="f"><span>${esc(t.phone)}</span><input id="lPhone" type="tel" inputmode="tel" /></label>
    <label class="f"><span>${esc(t.followUp)}</span><input id="lFollow" type="date" /></label>
    <label class="f"><span>${esc(t.value)}</span><input id="lValue" type="number" min="0" step="1000" /></label>
    <label class="f f--wide"><span>${esc(t.description)}</span><textarea id="lNotes" rows="2"></textarea></label>
  </div>
  <div class="actions">
    <button class="btn btn--primary" type="submit">${esc(t.add)}</button>
    <button class="btn" type="button" data-act="cancellead">${esc(t.cancel)}</button>
  </div>
</form>`;
};

/* --------------------------------- documents ------------------------------ */

export function docsView(lang, ctx) {
  const t = DSTR[lang];
  const files = ctx.files || [];
  return `
<section class="card">
  <div class="card__head"><h2>${esc(t.library)}</h2><span class="muted small">${files.length}</span></div>
  <form id="docForm" class="uploader">
    <label class="f"><span>${esc(t.title)}</span>
      <input id="dTitle" autocomplete="off" placeholder="${esc(t.titleHint)}" /></label>
    <label class="f"><span>${esc(t.description)}</span>
      <textarea id="dDesc" rows="3" placeholder="${esc(t.descHint)}"></textarea></label>

    ${dropField('dFiles', t.dropHere, t.dropHint, {
      accept: '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,image/*',
      multiple: true, required: true, tall: true,
    })}

    <div class="actions actions--end">
      <button class="btn btn--primary" type="submit">${esc(t.upload)}</button>
    </div>
  </form>

  <div class="tblwrap">
    <table class="tbl">
      <thead><tr><th>${esc(t.name)}</th><th>${esc(t.title)}</th><th class="num">${esc(lang === 'ar' ? 'الحجم' : 'Size')}</th><th></th></tr></thead>
      <tbody>
        ${files.length ? files.map(f => `<tr>
          <td>${esc(f.filename)}<span class="muted small block">${esc(f.uploader?.full_name || '')}</span></td>
          <td class="muted small">${esc(f.title || '')}</td>
          <!-- dir=ltr because bidi reorders "4.0 MB" into "MB 4.0" in an
               Arabic paragraph; the unit belongs after the number. -->
          <td class="num muted small" dir="ltr">${f.size_bytes ? (f.size_bytes / 1048576).toFixed(1) + ' MB' : '—'}</td>
          <td class="num"><button class="link small" data-open="${esc(f.id)}">${esc(lang === 'ar' ? 'فتح' : 'Open')}</button></td>
        </tr>`).join('')
        : `<tr><td class="tbl__empty" colspan="4">${esc(t.noDocsYet)}</td></tr>`}
      </tbody>
    </table>
  </div>
</section>`;
}

/* ----------------------------------- admin -------------------------------- */

export function adminView(lang, ctx) {
  const t = DSTR[lang];
  const people = ctx.people || [];
  const invites = ctx.invites || [];
  const depts = db.state.departments;
  const online = db.state.online || new Set();
  const invitedEmails = new Set(invites.map(i => (i.email || '').toLowerCase()));

  /* Five states, and they are genuinely different situations rather than
     shades of one. The one that matters is `waiting`: somebody created a
     login and is sitting on the sign-in screen until an admin says yes. */
  const keyOf = (p) => {
    if (p.user_id && online.has(p.id)) return 'online';
    if (p.user_id && !p.is_active)     return 'waiting';
    /* An account exists but nobody has ever opened the app with it. Minting a
       sign-in link creates the auth user immediately, so "has a login" stopped
       being the same question as "has arrived" — and an admin watching this
       screen after inviting five people needs the second one. */
    if (p.user_id && !p.last_seen_at)  return 'invited';
    if (p.user_id)                     return 'active';
    if (invitedEmails.has((p.email || '').toLowerCase())) return 'invited';
    return 'roster';
  };

  const waiting = people.filter(p => keyOf(p) === 'waiting');
  const invited = people.filter(p => keyOf(p) === 'invited');
  const roster  = people.filter(p => keyOf(p) === 'roster');
  const onlineNow = people.filter(p => keyOf(p) === 'online').length;

  const stateOf = (p) => {
    const key = keyOf(p);
    const pill = {
      online:  `<span class="st st--live" style="--c:var(--ok)"><span class="live"><i></i></span>${esc(t.onlineNow)}</span>`,
      waiting: `<span class="st" style="--c:var(--warn)"><i></i>${esc(t.waitingApproval)}</span>`,
      active:  `<span class="st" style="--c:var(--ink3)"><i></i>${esc(t.canSignIn)}</span>`,
      invited: `<span class="st" style="--c:var(--info)"><i></i>${esc(t.invitedNotIn)}</span>`,
      roster:  `<span class="st" style="--c:var(--ink4)"><i></i>${esc(t.rosterOnly)}</span>`,
    }[key];
    // Approve is the only action that changes someone's access, so it is the
    // only one given a filled button. Everything else is a dropdown that saves
    // itself, or a quiet secondary.
    const access = key === 'waiting'
      ? `<button class="btn btn--primary btn--sm" data-approve="${esc(p.id)}">${esc(t.approve)}</button>`
      : (key === 'active' || key === 'online')
        ? `<button class="btn btn--sm" data-revoke="${esc(p.id)}">${esc(t.revoke)}</button>` : '';
    /* Sending a link is the whole of what an admin can do about a password.
       Useless without an address, so it is absent rather than disabled — a
       disabled button asks the reader to work out why. */
    const link = p.email
      ? `<button class="btn btn--sm btn--ghost" data-sendlink="${esc(p.id)}">${esc(t.sendLink)}</button>` : '';
    const action = `<span class="rowacts">${access}${link}</span>`;
    return { key, pill, action, seen: key === 'online' ? t.now : sinceText(p.last_seen_at, lang, t) };
  };

  /* Whoever needs a decision goes first. A screen that sorts alphabetically
     buries the one person who is blocked behind forty who are not. */
  const RANK = { waiting: 0, online: 1, active: 2, invited: 3, roster: 4 };
  const sorted = people.slice().sort((a, b) =>
    (RANK[keyOf(a)] - RANK[keyOf(b)]) ||
    String(a.full_name || '').localeCompare(String(b.full_name || '')));

  const GROUPS = [
    { key: 'all',     label: t.allRows,        n: people.length },
    { key: 'waiting', label: t.waitingApproval, n: waiting.length },
    { key: 'online',  label: t.onlineNow,      n: onlineNow },
    { key: 'active',  label: t.canSignIn,      n: people.filter(p => keyOf(p) === 'active').length },
    { key: 'invited', label: t.invitedNotIn,   n: invited.length },
    { key: 'roster',  label: t.rosterOnly,     n: roster.length },
  ].filter(g => g.n || g.key === 'all');

  return `
<div class="kpis kpis--4">
  ${kpi(`<span class="live"><i></i></span>${onlineNow}`, t.onlineNow, {
    colour: 'var(--ok)', sub: t.onlineNowSub })}
  ${kpi(waiting.length, t.waitingApproval, { bad: waiting.length > 0, colour: 'var(--warn)',
    sub: waiting.length ? t.waitingSub : t.waitingNone })}
  ${kpi(invited.length, t.invitedNotIn, { colour: 'var(--info)', sub: t.invitedSub })}
  ${kpi(roster.length, t.rosterOnly, { colour: 'var(--ink3)', sub: t.rosterSub })}
</div>

<section class="card">
  <div class="card__head"><h2>${esc(t.invite)}</h2></div>
  <form id="inviteForm" class="inlineform">
    <div class="fields">
      <label class="f"><span>${esc(t.email)}</span><input id="iEmail" type="email" required placeholder="name@expandexpo.com" /></label>
      <label class="f"><span>${esc(t.name)}</span><input id="iName" /></label>
      <label class="f"><span>${esc(t.department)}</span>
        <select id="iDept">${depts.map(d => `<option value="${esc(d.id)}">${esc(lang === 'ar' ? d.name_ar : d.name_en)}</option>`).join('')}</select></label>
      <label class="f"><span>${esc(t.role)}</span>
        <select id="iRole">${['member', 'lead', 'manager', 'admin'].map(r => `<option value="${r}">${esc(t.roles[r] || r)}</option>`).join('')}</select></label>
    </div>
    <p class="note">${esc(t.inviteNote)}</p>
    ${ctx.inviteMsg ? `<p class="msg ${ctx.inviteMsg.ok ? 'msg--ok' : 'msg--bad'}">${esc(ctx.inviteMsg.text)}</p>` : ''}
    <div class="actions"><button class="btn btn--primary" type="submit">${esc(t.invite)}</button></div>
  </form>
</section>

<section class="card">
  <div class="card__head">
    <h2>${esc(t.people)}</h2>
    <span class="muted small">${people.length}</span>
  </div>
  ${ctx.resetMsg ? `<p class="msg ${ctx.resetMsg.ok ? 'msg--ok' : 'msg--bad'}">${esc(ctx.resetMsg.text)}</p>` : ''}
  <div class="chipbar">
    ${GROUPS.map(g => `<button class="chip chip--btn${g.key === 'all' ? ' is-on' : ''}" data-who="${g.key}">${esc(g.label)} ${g.n}</button>`).join('')}
  </div>
  <div class="tblwrap">
    <table class="tbl">
      <thead><tr>
        <th>${esc(t.name)}</th><th>${esc(t.status)}</th><th>${esc(t.department)}</th>
        <th>${esc(t.role)}</th><th>${esc(t.lastSeen)}</th><th class="num"></th>
      </tr></thead>
      <tbody>
        ${sorted.map(p => {
          const st = stateOf(p);
          return `<tr data-who="${st.key}">
            <td>
              <span class="who">
                <span class="ava ava--sm${st.key === 'online' ? ' ava--live' : ''}" style="--c:${esc(db.dept(p.department_id)?.colour || 'var(--ink4)')}">${esc((p.full_name || p.email || '?').trim().slice(0, 1).toUpperCase())}</span>
                <span class="who__t">
                  <b>${esc(p.full_name || '—')}</b>
                  <span class="muted small">${esc(p.email || '—')}</span>
                </span>
              </span>
            </td>
            <td>${st.pill}</td>
            <td><select class="pDept btn--sm" data-p="${esc(p.id)}">
              <option value="">—</option>
              ${depts.map(d => `<option value="${esc(d.id)}"${d.id === p.department_id ? ' selected' : ''}>${esc(lang === 'ar' ? d.name_ar : d.name_en)}</option>`).join('')}
            </select></td>
            <td><select class="pRole btn--sm" data-p="${esc(p.id)}">
              ${['member', 'lead', 'manager', 'admin'].map(r => `<option value="${r}"${r === p.role ? ' selected' : ''}>${esc(t.roles[r] || r)}</option>`).join('')}
            </select></td>
            <td class="muted small">${esc(st.seen)}</td>
            <td class="num">${st.action}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>
  <p class="note">${esc(t.resetHint)}</p>
</section>`;
}
