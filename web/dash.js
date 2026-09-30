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
import { Scheduler, SIZES, DEFAULT_STAGES } from '../engine/scheduler.js';
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

/* HR: admins and the HR department. Mirrors is_hr() in the database — the
   sidebar and the edit controls follow this, RLS is what enforces it. */
export const isHR = (me = db.state.me) =>
  !!me && me.is_active !== false && (me.role === 'admin' || me.department_id === 'hr');

/* Who may fill the procurement list and production schedule: the production
   team, plus planners and leads. Mirrors can_edit_production() in the database
   exactly — the client hides the controls, RLS is what enforces it. */
export const canEditProduction = (me = db.state.me) =>
  canPlan(me) || (!!me && me.is_active !== false &&
    (me.department_id === 'production' || ['lead', 'manager', 'admin'].includes(me.role)));

export const DSTR = {
  en: {
    signIn: 'Sign in', signOut: 'Sign out', email: 'Email', password: 'Password',
    firstTime: 'First time here?', setPassword: 'Create your password',
    firstTimeTitle: 'Getting in for the first time',
    firstTimePrompt: 'Enter your work email. If you are on the team, we will email you a code to type here. You do not need a password yet.',
    forgotPrompt: 'Enter your work email and we will send you a code to type here.',
    emailMeLink: 'Email me a code',
    linkOnTheWay: 'If that address belongs to someone here, a code is on its way. Type it below. It lasts a day, and asking for another one replaces it — so use the newest email. Check your junk folder if it is not there.',
    forgot: 'Forgot your password?', sendReset: 'Email me a code',

    /* --- the code step --- */
    codeTitle: 'Enter your code', codeLabel: 'Your code',
    codePromptCold: 'Enter your work email and the code we emailed you. You can stay on this page.',
    codePrompt: 'We emailed a code to {e}. Type it here — you can stay on this page.',
    codeGo: 'Continue', codeResend: 'Send another code', codeWrongAddr: 'Use a different address',
    codeBad: 'That code did not work. Check you are reading the newest email — a newer code replaces the one before it.',
    backToSignIn: 'Back to sign in', checkInbox: 'Check your inbox.',
    newPassword: 'Choose a new password', setIt: 'Save my new password',
    linkExpired: 'That link has expired or was already used.',
    linkExpiredWhy: 'Old sign-in links no longer work at all — we email a code instead, which you type on this page. Ask for a code below and use the newest email.',
    sendFresh: 'Email me a code', passwordSaved: 'Password saved. Signing you in…',
    recoverPrompt: 'Choose it now, before you close this page. The code has signed you in, but until a password is saved there is nothing to sign in with next time.',
    noInvite: 'Your account exists but has not been activated. Ask an admin to add you.',
    home: 'Home', projects: 'Projects', newProject: 'New project', leads: 'Leads',
    documents: 'Documents', people: 'People', myQueue: 'My queue',
    save: 'Save', cancel: 'Cancel', add: 'Add', uploading: 'Uploading…', saving: 'Saving…',
    name: 'Name', client: 'Client', size: 'Size', description: 'Description',
    start: 'Earliest start', deadline: 'Submission deadline',
    stages: 'Which teams does this need?', assignTo: 'Assign to',
    rfp: 'RFP documents', refs: 'Reference photos', dropHere: 'Choose files',
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

    /* --- business highlights (management only) --- */
    highlights: 'Business highlights',
    highlightsSub: 'Where the work sits, where it slips, and who it depends on',
    openEstimator: 'Delivery estimator',
    hlEmpty: 'There is nothing to measure yet.',

    hlDelivery: 'Delivery record',
    hlDeliveryNote: 'Only projects that have both a submission deadline and a recorded delivery date can be judged. The rest are silent, not on time.',
    hlOnTime: 'Delivered on time', hlLate: 'Delivered late',
    hlMedianLate: 'Typical delay when late', hlDays: 'days',
    hlJudged: 'of {n} judged', hlUnjudged: '{n} projects have no delivery date recorded',
    hlStillLate: 'Open and already past due', hlWorstLate: 'Longest overdue right now',
    hlOnTimeRate: 'On-time rate',
    hlLateBands: 'How late, when late',
    hlLateBandsNote: 'Each delivered-late project placed in a band. One project 708 days late would drag an average; bands show the shape instead.',
    band0: 'Up to a week', band1: '1–4 weeks', band2: '1–3 months', band3: 'Over 3 months',

    hlLoad: 'Who is carrying what',
    hlLoadNote: 'Open stages on open projects, by the person they are assigned to. Unassigned work is shown as its own row because it is nobody\'s and it is the biggest row.',
    hlStages: 'open stages', hlPeople: 'people hold work', hlUnowned: 'stages nobody owns',
    hlShareOfAll: 'share of all open work',

    hlRisk: 'Single points of failure',
    hlRiskNote: 'For each team, how much of its open work sits with one person. A high share means the team stops when that person does.',
    hlBusiest: 'Busiest person', hlHolds: 'holds', hlOfTeam: 'of the team\'s open work',
    hlSole: 'sole holder', hlRiskHigh: 'At risk', hlRiskOk: 'Spread',
    hlTeam: 'Team', hlTeamStages: 'Open stages', hlConcentration: 'Concentration',

    hlPipeline: 'Pipeline pressure',
    hlPipelineNote: 'What is waiting on somebody. These are not forecasts — every number is a row that exists right now.',
    hlLeadsNoOwner: 'Leads with no owner', hlFollowOverdue: 'Follow-ups past their date',
    hlAtEtemad: 'Sitting at Etemad', hlAtEtemadSub: 'submitted, no verdict back',
    hlProjNoOwner: 'Projects with no owner',
    hlOfLeads: 'of {n} leads', hlOfProjects: 'of {n} projects',
    hlNobody: 'nobody', daysWord: 'days',
    sizes: { S: 'Small', M: 'Medium', L: 'Large' },
    whyLate: 'The work itself is quick; the wait is not. {team} is {days} working days deep — {stages} open stages between {people} people — so a new project queues behind all of it. Closing finished projects or adding capacity moves this date; nothing else will.',
    wcTitle: 'Workload calendar', wcSub: 'free person-days per team, month by month',
    wcOf: 'of', wcPersonDays: 'person-days', wcNoPeople: 'no one on this team',
    wcRestOf: 'rest of month', wcFreeOf: 'free of {n}',
    wcHead: '{p} people · {d} days a {size} project',
    wcHead1: '1 person · {d} days a {size} project',
    wcHead0: 'nobody · {d} days a {size} project',
    wcNobodyRow: 'Nobody is on this team, so none of its stages ever start.',
    wcAnswer: 'The next {size} project can start in {m} without queueing behind anything — that is the first month every team it needs has a whole stage of room left.',
    wcAnswerNone: 'No month in the next {n} has room for a whole {size} project on every team it needs. Submitting one now means it queues; the calendar above shows which team runs out first.',
    wcAnswerNobody: 'Nobody is on {teams}, so no month is free — a stage with no one to do it never comes up in the queue at all. Assign someone before reading anything else here as capacity.',
    wcPerTeam: 'Team by team, the first month with a whole {size} stage free: {list}.',
    wcNever: 'not in the next {n}',
    wcStale: 'Holidays are only listed to the end of 2026, so months after that are counted as if nothing is closed. Add next year’s dates to keep this honest.',
    openProjects: 'Open projects', overdue_: 'Overdue', unassigned_: 'Stages unassigned',
    committedDays: 'Design days committed', openLeads: 'Open leads', nextFree: 'A new project would deliver',
    ofTotal: 'of', needsReview: 'Needs review', allRows: 'All', teamsCol: 'Teams',
    overdueFollow: 'Follow-ups overdue',
    titleHint: 'What is this document called?',
    descHint: 'What is it for, and who should read it? Optional.',
    dropHint: 'PDF, Word, PowerPoint, Excel or images. You can pick several at once.',
    filesQueued: '{n} to upload', removeFile: 'Remove',
    noDocsYet: 'No documents yet. The first upload appears here.',
    noDocsInFilter: 'Nothing in this slice. The other tabs above still have files in them.',
    perf: 'Performance', perfSub: 'your score this quarter',
    perfMine: 'Your score', perfNoScore: 'No score yet',
    perfNoScoreSub: 'Nobody has reviewed you for this quarter.',
    perfAuto: 'From the tool', perfForm: 'From your supervisor',
    perfOf: 'of', perfPts: 'pts',
    perfSales: 'Lead conversion', perfRfp: 'Proposals won',
    perfCovSales: 'from {n} leads assigned to you',
    perfCovRfp: 'from {n} proposals with a verdict',
    perfNoSales: 'No leads are assigned to you, so this scores zero.',
    perfNoRfp: 'No proposal of yours has been marked won or lost, so this scores zero. {a} are still waiting on a verdict.',
    perfFormOnly: 'Your whole score comes from your supervisor\u2019s review.',
    perfNotFilled: 'Not filled in yet',
    perfMyTeam: 'People you review', perfNobody: 'Nobody is assigned to you.',
    perfTeamTotal: 'Team score', perfTeamCov: '{n} of {m} scored',
    /* The same facts said about somebody else. Every one of these drops the
       possessive rather than swapping the pronoun: it reads correctly for a
       person of any gender, which matters most in the Arabic. */
    perfNoScoreSubOther: 'No review has been filled in for this quarter.',
    perfFormOther: 'From your review',
    perfFormOnlyOther: 'The whole score comes from the review.',
    perfCovSalesOther: 'from {n} leads assigned',
    perfNoSalesOther: 'No leads are assigned, so this scores zero.',
    perfNoRfpOther: 'No proposal has been marked won or lost, so this scores zero. {a} are still waiting on a verdict.',
    perfTeamNone: 'Nobody on your team has a score yet.',
    perfTeamBlank: '{n} of these have nothing recorded yet \u2014 no verdict and no review \u2014 so they count as zero.',
    perfReview: 'Review', perfSave: 'Save review', perfSaved: 'Saved',
    perfRate: 'Rating (1\u20135)', perfKpi: 'Indicator',
    perfStrengths: 'Strengths', perfImprove: 'Areas to improve',
    perfPrivate: 'Only you and your supervisor can see this. It is enforced by the database, not by this screen.',
    perfQuarter: 'Quarter', perfUnrated: '\u2014',
    perfSupervisor: 'Supervisor', perfNoSupervisor: 'None',
    pipeline: 'Business pipeline', pipelineSub: 'every lead, by how far it has got',
    pipe: { new: 'New', contacted: 'Contacted', progress: 'In progress', closed: 'Won' },
    pipeLive: 'Live leads', pipeSpent: '{n} will not move again',
    pipeNone: 'Nothing at this stage.', pipeMore: '{n} more — open Leads to filter them',
    pipeUnmapped: '{n} leads carry a status this board does not place yet: {s}. They are counted in the list total but appear in no column — tell me and I will put them where they belong.',
    docAll: 'Everything', docLibrary: 'Library', docFromProjects: 'On projects',
    docWhere: 'Where it lives',
    /* An RFP and a reference image are not the same thing to somebody
       deciding what to open, and neither is a raw enum. */
    purposes: { document: 'Uploaded here', rfp: 'RFP / tender', reference: 'Reference' },
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
    sendLink: 'Send code', sendingLink: 'Sending…',
    linkSent: 'Emailed {email} a sign-in code.',
    linkFailed: 'Could not email {email}: {reason}',
    remove: 'Remove', removing: 'Removing…',
    removeConfirm: 'Remove {name} for good? This deletes their profile and login, and cannot be undone.',
    removed: 'Removed {name}.',
    removeBlocked: 'Can’t remove {name} — still on {what}. Revoke their access instead.',
    removeFailed: 'Could not remove {name}: {reason}',
    nProjects: '{n} projects', nTasks: '{n} tasks', nLeads: '{n} leads', nFiles: '{n} files',
    resetHint: 'Nobody can set a password for somebody else, so the button emails them a code. They type it on the sign-in page and choose a password themselves.',
    roles: { member: 'Member', lead: 'Lead', manager: 'Manager', admin: 'Admin' },
    sending: 'Sending…', inviteNoReason: 'the mail server gave no reason',
    inviteSent: 'Invited {email}. They have an email with a link to set their password.',
    inviteResent: '{email} already has an account, so we sent a sign-in link instead.',
    inviteNoMail: '{email} can sign in with that role now, but the email did not go out: {reason}. They have not been told anything — fix the sender under Authentication → Emails, then invite them again.',
    rfpHint: 'The brief you were sent, and anything that came with it. PDF, Word, Excel or a zip — as many as you need.',
    refsHint: 'Photos, moodboards, anything the designers should look at first. Pick as many as you need.',
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
          contacted: 'Contacted', qualified: 'Qualified', proposal: 'Proposal',
          /* The BD team's own words. "Wrong number", "No answer", "Message
             not delivered" and "Address not found" used to collapse into
             "lost", which erased the difference between a lead who said no
             and one nobody ever reached. */
          not_contacted: 'Not contacted', interested: 'Interested',
          not_interested: 'Not interested', follow_up: 'Follow up',
          wrong_number: 'Wrong number', no_answer: 'No answer',
          not_delivered: 'Message not delivered', address_not_found: 'Address not found' },

    /* --- Leads screen ---------------------------------------------------- */
    jobTitle: 'Title', website: 'Website', source_: 'Source',   // phone already exists above
    anySource: 'Any source', anyFollow: 'Any follow-up', followOverdue: 'Overdue',
    follow7: 'Next 7 days', follow30: 'Next 30 days', followNone: 'No date set',
    sortFollow: 'Follow-up, soonest', sortAdded: 'Recently added', sortCompany: 'Company',
    backToLeads: 'Leads', leadNotFound: 'That lead is not here.',
    noLeadMatch: 'No lead matches these filters.',
    contactHead: 'Contact', proposalsHead: 'Proposals',
    noProposals: 'No proposal is linked to this lead yet.',
    linkProposal: 'Link a proposal', searchProjects: 'Search projects by name',
    link: 'Link', unlink: 'Unlink', alreadyLinked: 'already linked to another lead',
    noProjectMatch: 'No project matches that.',
    leadHistory: 'Activity', noLeadHistory: 'Nothing logged yet.',
    companyUnknown: 'No company recorded',
    fromLead: 'Came from lead', openInAsanaLead: 'Open in Asana',

    /* --- volume charts --- */
    projectsByMonth: 'Projects by month', byManager: 'Projects per manager',
    perMonth: 'per month', total_: 'Total', fewer: 'Fewer', more: 'More',
    startedInWindow: '{n} of {t} started in this window',
    allProjects: '{n} projects, all of them',
    earlierBar: 'Earlier', earlierLong: 'Everything before {m}',
    byStartNote: 'Every project is counted, by the month its work started. Deadlines play no part — they are set on only 95 of the 369, so counting by deadline would describe a quarter of the business and look like all of it. The grey bar holds everything that started before the twelve months shown.',

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
    procHead: 'Procurement — items to buy', procItem: 'Item', procRef: 'Reference',
    procAdd: '+ Add item', procNone: 'No items added yet.', procView: 'View', procPhoto: 'Add photo',
    procList: 'Upload a list', procListHint: 'Excel, PDF or a photo of the full items list',
    procDelConfirm: 'Remove this item from the list?',
    procSt: { pending: 'Pending', in_process: 'In process', done: 'Done', not_available: 'Not available', expensive: 'Expensive' },
    prodHead: 'Production', prodSchedule: 'Production schedule',
    prodScheduleHint: 'Phases, dates, who does what — free text.',
    prodDelivery: 'Delivery to site', prodFiles: 'Production files',
    prodFilesHint: 'Drawings, plans, deliverables', prodFilesHead: 'Files', prodNoFiles: 'No production files yet.',
    prodOnlyTeam: 'Only the production team and planners can edit these.',
    /* --- HR --- */
    hrNav: 'HR', hrTeamNav: 'My team', hrHead: 'Workforce', hrTeamHead: 'My team',
    hrNewHire: '+ New hiring request',
    hrKHead: 'Headcount', hrKHeadSub: '{p} on probation',
    hrKLeave: 'On leave today', hrKOpen: 'Open hiring requests', hrKOpenSub: '{a} approved, waiting to join',
    hrKJoin: 'Joining in 30 days', hrKNoFile: 'No HR file yet', hrKNoFileSub: 'Joining date missing — no leave balance',
    hrReqHead: 'Hiring requests', hrReqNone: 'No hiring requests yet.',
    hrEmpHead: 'Employees', hrEmpNone: 'Nobody here yet.',
    hrName: 'Full name', hrPosition: 'Position', hrDept: 'Department', hrJoined: 'Joined', hrJoining: 'Joining date',
    hrService: 'Service', hrBalance: 'Annual balance', hrSick: 'Sick days', hrLastOO: 'Last 1:1', hrScore: 'Latest score',
    hrRequestedBy: 'Requested by', hrRequestedOn: 'Requested', hrKit: 'Equipment',
    hrYears: '{n} y', hrMonths: '{n} mo', hrDays: '{n} days', hrDaysShort: '{n} d',
    hrSt: { requested: 'Requested', approved: 'Approved', rejected: 'Rejected', hired: 'Hired' },
    hrEmpSt: { probation: 'Probation', active: 'Active', on_leave: 'On leave', terminated: 'Left' },
    hrLeaveKind: { annual: 'Annual', sick: 'Sick', unpaid: 'Unpaid', other: 'Other' },
    hrShowLeft: 'Show people who left',
    /* the hiring form */
    hrHireTitle: 'New hiring request', hrBack: 'HR',
    hrHireLead: 'Once approved and marked as hired, this creates the employee record. The app login is a separate invitation from People.',
    hrEmail: 'Work email (optional)', hrEmailHint: 'If they already have a profile, the record attaches to it.',
    hrPhone: 'Mobile number', hrNatId: 'National ID / Iqama number',
    hrIdCopy: 'Copy of the ID', hrIdCopyHint: 'Photo or PDF — stored privately, HR only',
    hrJobDesc: 'Job description', hrTools: 'Tools and software needed', hrToolsHint: 'Software licences, accounts, access…',
    hrLaptop: 'Needs a laptop', hrEquip: 'Other equipment', hrEquipHint: 'Monitor, phone, desk, uniform…',
    hrFeedback: 'Feedback on the new hire', hrFeedbackHint: 'Interview notes, impressions, references…',
    hrSubmit: 'Submit request', hrPickDept: 'Choose…',
    /* one request */
    hrReqNotFound: 'That request is not here.',
    hrApprove: 'Approve', hrReject: 'Reject', hrMarkHired: 'Mark as hired — create employee',
    hrHireNote: 'Creates the employee record (on probation) and moves the ID into their HR file.',
    hrRejectConfirm: 'Reject this hiring request?', hrHireConfirm: 'Create the employee record for {n}?',
    hrReopen: 'Reopen', hrOpenEmp: 'Open employee record →',
    hrViewId: 'View ID copy', hrNoId: 'No ID copy uploaded.', hrDecided: '{s} by {who} on {d}',
    hrSaveFb: 'Save feedback', hrNoValue: '—',
    /* one employee */
    hrEmpNotFound: 'That person is not here.',
    hrScorecard: 'Scorecard', hrReviews: 'Quarterly reviews', hrNoReviews: 'No reviews yet.',
    hrPeriod: 'Quarter', hrBy: 'By', hrStrengths: 'Strengths', hrImprove: 'To improve',
    hrOO: 'One-on-one meetings', hrNoOO: 'No one-on-ones recorded.',
    hrOODate: 'Date', hrOONotes: 'Notes', hrOOActions: 'Action items', hrOOAdd: 'Record meeting',
    hrLeaves: 'Leave', hrNoLeaves: 'No leave recorded.',
    hrLeaveType: 'Type', hrFrom: 'From', hrTo: 'To', hrDaysCol: 'Days', hrNote: 'Note', hrLeaveAdd: 'Record leave',
    hrDelConfirm: 'Delete this entry?',
    hrBalanceNote: '{year}: {ent} days a year, {acc} accrued to date, {taken} taken. Calendar year, accrued daily, no carry-over.',
    hrLegal: '21 days a year, 30 after five years of service (Saudi Labor Law, art. 109).',
    hrNoJoinDate: 'Add a joining date to calculate the leave balance.',
    hrKBalance: 'Annual leave left', hrKTaken: 'Annual taken {y}', hrKSick: 'Sick days {y}', hrKLast: 'Latest review',
    hrKOO: 'One-on-ones', hrKOOSub: 'last {d}',
    hrFile: 'Employment file', hrStatusL: 'Employment status', hrOverride: 'Annual entitlement override',
    hrOverrideHint: 'Days a year. Leave empty to follow the law.', hrSupervisor: 'Supervisor',
    hrReadOnly: 'Only HR can change this file.',
    hrIdentity: 'Identity — HR only', hrHrNotes: 'Private HR notes', hrReplaceId: 'Upload ID copy',
    hrTimeline: 'History', hrTlJoined: 'Joined as {p}', hrTlLeave: '{k} leave ({n} d)', hrScoreCol: 'Score', hrTlOO: '1:1 with {who}',
    hrTlReview: 'Review {q}: {s}%', hrTlHired: 'Hiring request approved',
    hrNoAccess: 'This screen is for HR, and for supervisors about their own team.',
  },
  ar: {
    signIn: 'تسجيل الدخول', signOut: 'تسجيل الخروج', email: 'البريد الإلكتروني', password: 'كلمة المرور',
    firstTime: 'أول مرة هنا؟', setPassword: 'أنشئ كلمة المرور',
    firstTimeTitle: 'الدخول لأول مرة',
    firstTimePrompt: 'أدخل بريد العمل. إن كنت ضمن الفريق سنرسل لك رمزاً تكتبه هنا. لا تحتاج كلمة مرور الآن.',
    forgotPrompt: 'أدخل بريد العمل وسنرسل لك رمزاً تكتبه هنا.',
    emailMeLink: 'أرسل لي رمزاً',
    linkOnTheWay: 'إن كان هذا البريد يخص أحداً هنا، فالرمز في طريقه إليك. اكتبه بالأسفل. صالح ليوم كامل، وكل طلب جديد يُلغي السابق — لذا استخدم أحدث رسالة. راجع مجلد الرسائل غير المرغوبة إن لم تجدها.',
    forgot: 'نسيت كلمة المرور؟', sendReset: 'أرسل لي رمزاً',

    /* --- خطوة الرمز --- */
    codeTitle: 'أدخل الرمز', codeLabel: 'الرمز',
    codePromptCold: 'أدخل بريد العمل والرمز الذي أرسلناه إليك. يمكنك البقاء في هذه الصفحة.',
    codePrompt: 'أرسلنا رمزاً إلى {e}. اكتبه هنا — يمكنك البقاء في هذه الصفحة.',
    codeGo: 'متابعة', codeResend: 'أرسل رمزاً آخر', codeWrongAddr: 'استخدام بريد آخر',
    codeBad: 'الرمز غير صحيح. تأكد أنك تقرأ أحدث رسالة — كل رمز جديد يُلغي ما قبله.',
    backToSignIn: 'رجوع لتسجيل الدخول', checkInbox: 'تحقق من بريدك.',
    newPassword: 'اختر كلمة مرور جديدة', setIt: 'حفظ كلمة المرور',
    linkExpired: 'انتهت صلاحية الرابط أو تم استخدامه من قبل.',
    linkExpiredWhy: 'روابط الدخول القديمة لم تعد تعمل — نرسل الآن رمزاً تكتبه في هذه الصفحة. اطلب رمزاً بالأسفل واستخدم أحدث رسالة.',
    sendFresh: 'أرسل لي رمزاً', passwordSaved: 'تم حفظ كلمة المرور. جارٍ تسجيل دخولك…',
    recoverPrompt: 'اخترها الآن قبل إغلاق الصفحة. الرمز سجّل دخولك، لكن قبل حفظ كلمة المرور لا يوجد ما تدخل به في المرة القادمة.',
    noInvite: 'حسابك موجود لكنه غير مفعّل. اطلب من المسؤول إضافتك.',
    home: 'الرئيسية', projects: 'المشاريع', newProject: 'مشروع جديد', leads: 'العملاء المحتملون',
    documents: 'المستندات', people: 'الفريق', myQueue: 'مهامي',
    save: 'حفظ', cancel: 'إلغاء', add: 'إضافة', uploading: 'جارٍ الرفع…', saving: 'جارٍ الحفظ…',
    name: 'الاسم', client: 'العميل', size: 'الحجم', description: 'الوصف',
    start: 'أقرب بداية', deadline: 'موعد التقديم',
    stages: 'ما الفرق المطلوبة؟', assignTo: 'إسناد إلى',
    rfp: 'كراسة الشروط والمرفقات', refs: 'صور مرجعية', dropHere: 'اختر الملفات',
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

    /* --- مؤشرات الأعمال (للإدارة فقط) --- */
    highlights: 'مؤشرات الأعمال',
    highlightsSub: 'أين يقف العمل، وأين يتأخر، وعلى من يعتمد',
    openEstimator: 'حاسبة موعد التسليم',
    hlEmpty: 'لا توجد بيانات كافية للقياس بعد.',

    hlDelivery: 'سجل التسليم',
    hlDeliveryNote: 'تُحتسب المشاريع التي لها موعد تقديم وتاريخ تسليم مسجّل معاً فقط. البقية غير معروفة، وليست «في الموعد».',
    hlOnTime: 'سُلّمت في موعدها', hlLate: 'سُلّمت متأخرة',
    hlMedianLate: 'التأخير المعتاد عند التأخر', hlDays: 'يوماً',
    hlJudged: 'من {n} مقيّمة', hlUnjudged: '{n} مشروعاً بلا تاريخ تسليم مسجّل',
    hlStillLate: 'مفتوحة وتجاوزت موعدها', hlWorstLate: 'الأطول تأخراً الآن',
    hlOnTimeRate: 'نسبة الالتزام بالموعد',
    hlLateBands: 'حجم التأخير عند التأخر',
    hlLateBandsNote: 'كل مشروع متأخر داخل نطاق. مشروع واحد متأخر ٧٠٨ أيام يشوّه المتوسط، والنطاقات تُظهر الصورة الحقيقية.',
    band0: 'حتى أسبوع', band1: 'أسبوع إلى ٤ أسابيع', band2: 'شهر إلى ٣ أشهر', band3: 'أكثر من ٣ أشهر',

    hlLoad: 'من يحمل ماذا',
    hlLoadNote: 'المراحل المفتوحة في المشاريع المفتوحة، حسب الشخص المسند إليه. العمل غير المسند له صف خاص لأنه ليس لأحد وهو أكبر صف.',
    hlStages: 'مرحلة مفتوحة', hlPeople: 'أشخاص يحملون عملاً', hlUnowned: 'مرحلة بلا مسؤول',
    hlShareOfAll: 'من إجمالي العمل المفتوح',

    hlRisk: 'نقاط الاعتماد على شخص واحد',
    hlRiskNote: 'لكل فريق: كم من عمله المفتوح يقع على شخص واحد. النسبة العالية تعني توقف الفريق بتوقفه.',
    hlBusiest: 'الأكثر تحميلاً', hlHolds: 'يحمل', hlOfTeam: 'من عمل الفريق المفتوح',
    hlSole: 'المسؤول الوحيد', hlRiskHigh: 'معرّض للخطر', hlRiskOk: 'موزّع',
    hlTeam: 'الفريق', hlTeamStages: 'مراحل مفتوحة', hlConcentration: 'التركّز',

    hlPipeline: 'ضغط خط الأعمال',
    hlPipelineNote: 'ما ينتظر قراراً أو متابعة. ليست توقعات — كل رقم هنا صف موجود الآن.',
    hlLeadsNoOwner: 'عملاء محتملون بلا مسؤول', hlFollowOverdue: 'متابعات تجاوزت موعدها',
    hlAtEtemad: 'لدى اعتماد', hlAtEtemadSub: 'مقدَّمة ولم يصل قرار',
    hlProjNoOwner: 'مشاريع بلا مسؤول',
    hlOfLeads: 'من {n} عميلاً محتملاً', hlOfProjects: 'من {n} مشروعاً',
    hlNobody: 'لا أحد', daysWord: 'أيام',
    sizes: { S: 'صغير', M: 'متوسط', L: 'كبير' },
    whyLate: 'العمل نفسه سريع، لكن الانتظار ليس كذلك. {team} أمامه {days} يوم عمل من الأعمال المفتوحة — {stages} مرحلة على {people} أشخاص — لذا ينتظر أي مشروع جديد خلفها كلها. إغلاق المشاريع المنتهية أو زيادة الطاقة يقرّب هذا التاريخ، ولا شيء غير ذلك.',
    wcTitle: 'تقويم الأحمال', wcSub: 'أيام العمل المتاحة لكل فريق، شهراً بشهر',
    wcOf: 'من', wcPersonDays: 'يوم عمل', wcNoPeople: 'لا أحد في هذا الفريق',
    wcRestOf: 'بقية الشهر', wcFreeOf: 'متاح من {n}',
    wcHead: '{p} أشخاص · {d} أيام للمشروع {size}',
    wcHead1: 'شخص واحد · {d} أيام للمشروع {size}',
    wcHead0: 'لا أحد · {d} أيام للمشروع {size}',
    wcNobodyRow: 'لا أحد في هذا الفريق، لذا لا تبدأ أي من مراحله إطلاقاً.',
    wcAnswer: 'يمكن بدء المشروع {size} القادم في {m} دون انتظار خلف أي عمل آخر — وهو أول شهر يتوفر فيه لكل فريق يحتاجه مساحة مرحلة كاملة.',
    wcAnswerNone: 'لا يوجد خلال الأشهر الـ{n} القادمة شهر يتسع لمشروع {size} كامل في كل الفرق التي يحتاجها. تقديم مشروع الآن يعني أنه سينتظر؛ والتقويم أعلاه يبيّن أي فريق ينفد أولاً.',
    wcAnswerNobody: 'لا أحد في {teams}، لذا لا يوجد شهر متاح — المرحلة التي لا أحد ينفذها لا تدخل الطابور أصلاً. أسنِد شخصاً قبل اعتبار أي رقم هنا طاقة متاحة.',
    wcPerTeam: 'فريقاً بفريق، أول شهر تتوفر فيه مساحة مرحلة {size} كاملة: {list}.',
    wcNever: 'ليس خلال الأشهر الـ{n} القادمة',
    wcStale: 'العطلات مسجّلة حتى نهاية ٢٠٢٦ فقط، لذا تُحسب الأشهر بعدها كأن لا عطلة فيها. أضف تواريخ السنة القادمة ليبقى هذا دقيقاً.',
    openProjects: 'مشاريع مفتوحة', overdue_: 'متأخرة', unassigned_: 'مراحل غير مسندة',
    committedDays: 'أيام تصميم ملتزم بها', openLeads: 'عملاء محتملون مفتوحون', nextFree: 'مشروع جديد يُسلَّم في',
    ofTotal: 'من', needsReview: 'تحتاج مراجعة', allRows: 'الكل', teamsCol: 'الفرق',
    overdueFollow: 'متابعات متأخرة',
    titleHint: 'ما اسم هذا المستند؟',
    descHint: 'ما الغرض منه، ومن يجب أن يقرأه؟ اختياري.',
    dropHint: 'PDF أو وورد أو باوربوينت أو إكسل أو صور. يمكن اختيار عدة ملفات.',
    filesQueued: '{n} للرفع', removeFile: 'إزالة',
    noDocsYet: 'لا توجد مستندات بعد. أول رفع سيظهر هنا.',
    noDocsInFilter: 'لا شيء في هذا التصنيف. التبويبات الأخرى أعلاه ما زالت تحتوي ملفات.',
    perf: 'الأداء', perfSub: 'درجتك في هذا الربع',
    perfMine: 'درجتك', perfNoScore: 'لا توجد درجة بعد',
    perfNoScoreSub: 'لم يقم أحد بتقييمك في هذا الربع.',
    perfAuto: 'من النظام', perfForm: 'من مديرك',
    perfOf: 'من', perfPts: 'نقطة',
    perfSales: 'تحويل العملاء المحتملين', perfRfp: 'العروض الفائزة',
    perfCovSales: 'من {n} عميل مسند إليك',
    perfCovRfp: 'من {n} عرض صدر بشأنه قرار',
    perfNoSales: 'لا يوجد عملاء مسندون إليك، لذا فهذه الدرجة صفر.',
    perfNoRfp: 'لم يُسجَّل فوز أو خسارة لأي من عروضك، لذا فهذه الدرجة صفر. ولا يزال {a} بانتظار القرار.',
    perfFormOnly: 'درجتك كاملة تأتي من تقييم مديرك.',
    perfNotFilled: 'لم يُملأ بعد',
    perfMyTeam: 'من تقوم بتقييمهم', perfNobody: 'لا أحد مسند إليك.',
    perfTeamTotal: 'درجة الفريق', perfTeamCov: 'تم احتساب {n} من {m}',
    perfNoScoreSubOther: 'لم يُملأ تقييم لهذا الربع.',
    perfFormOther: 'من تقييمك',
    perfFormOnlyOther: 'الدرجة كاملة تأتي من التقييم.',
    perfCovSalesOther: 'من {n} عميل مسند',
    perfNoSalesOther: 'لا يوجد عملاء مسندون، لذا فهذه الدرجة صفر.',
    perfNoRfpOther: 'لم يُسجَّل فوز أو خسارة لأي عرض، لذا فهذه الدرجة صفر. ولا يزال {a} بانتظار القرار.',
    perfTeamNone: 'لا أحد في فريقك لديه درجة بعد.',
    perfTeamBlank: '{n} منهم لم يُسجَّل لهم شيء بعد \u2014 لا قرار ولا تقييم \u2014 لذا تُحتسب درجتهم صفراً.',
    perfReview: 'تقييم', perfSave: 'حفظ التقييم', perfSaved: 'تم الحفظ',
    perfRate: 'التقييم (١-٥)', perfKpi: 'المؤشر',
    perfStrengths: 'نقاط القوة', perfImprove: 'مجالات للتحسين',
    perfPrivate: 'أنت ومديرك فقط من يرى هذا. القاعدة مطبّقة في قاعدة البيانات وليست مجرد إخفاء في الشاشة.',
    perfQuarter: 'الربع', perfUnrated: '\u2014',
    perfSupervisor: 'المدير المباشر', perfNoSupervisor: 'لا يوجد',
    pipeline: 'مسار الأعمال', pipelineSub: 'كل العملاء المحتملين حسب مرحلتهم',
    pipe: { new: 'جديد', contacted: 'تم التواصل', progress: 'قيد التقدم', closed: 'تم الفوز' },
    pipeLive: 'عملاء نشطون', pipeSpent: '{n} لن يتحرك مجدداً',
    pipeNone: 'لا شيء في هذه المرحلة.', pipeMore: '{n} إضافيون — افتح صفحة العملاء لتصفيتهم',
    pipeUnmapped: '{n} من العملاء يحملون حالة لا يضعها هذا اللوح بعد: {s}. هم ضمن الإجمالي لكن لا يظهرون في أي عمود — أخبرني لأضعهم في مكانهم.',
    docAll: 'الكل', docLibrary: 'المكتبة', docFromProjects: 'على المشاريع',
    docWhere: 'مكان الملف',
    purposes: { document: 'مرفوع هنا', rfp: 'كراسة شروط', reference: 'مرجع' },
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
    sendLink: 'أرسل رمزاً', sendingLink: 'جارٍ الإرسال…',
    linkSent: 'أُرسل إلى {email} رمز دخول.',
    linkFailed: 'تعذّر الإرسال إلى {email}: {reason}',
    remove: 'حذف', removing: 'جارٍ الحذف…',
    removeConfirm: 'حذف {name} نهائياً؟ يُحذف ملفه وحسابه ولا يمكن التراجع.',
    removed: 'تم حذف {name}.',
    removeBlocked: 'تعذّر حذف {name} — لا يزال مرتبطاً بـ {what}. ألغِ صلاحيته بدلاً من ذلك.',
    removeFailed: 'تعذّر حذف {name}: {reason}',
    nProjects: '{n} مشاريع', nTasks: '{n} مهام', nLeads: '{n} عملاء', nFiles: '{n} ملفات',
    resetHint: 'لا أحد يضبط كلمة مرور نيابة عن غيره، لذا يرسل الزر رمزاً، يكتبه صاحبه في صفحة الدخول ويختار كلمة المرور بنفسه.',
    roles: { member: 'عضو', lead: 'قائد', manager: 'مدير', admin: 'مسؤول' },
    sending: 'جارٍ الإرسال…', inviteNoReason: 'لم يذكر خادم البريد سبباً',
    inviteSent: 'تمت دعوة {email}. وصلته رسالة فيها رابط لضبط كلمة المرور.',
    inviteResent: '{email} لديه حساب بالفعل، فأرسلنا له رابط دخول بدلاً من ذلك.',
    inviteNoMail: 'يستطيع {email} الدخول بهذه الصلاحية الآن، لكن الرسالة لم تُرسل: {reason}. لم يصله أي إشعار — أصلح المُرسِل من Authentication ← Emails ثم أعد الدعوة.',
    rfpHint: 'الكراسة التي وصلتك وما رافقها. PDF أو وورد أو إكسل أو ملف مضغوط، بأي عدد.',
    refsHint: 'صور أو لوحات إلهام، أي شيء يجب أن يراه المصممون أولاً. اختر بأي عدد.',
    deadlineChart: 'المواعيد حسب الشهر', deadlineNote: 'المشاريع المفتوحة مجمّعة حسب موعد التقديم. الخط المتقطع هو اليوم، وكل ما على يساره متأخر بالفعل.',
    noneYet: 'لا شيء هنا بعد.', today_: 'اليوم',
    st: { intake: 'استلام', in_design: 'قيد التصميم', pricing: 'التسعير',
          submitted: 'مُقدَّم على اعتماد', won: 'مقبول', lost: 'مرفوض',
          in_production: 'قيد التنفيذ الفعلي',
          delivered: 'مُسلَّم', archived: 'مؤرشف', draft: 'مسودة', pending: 'بانتظار',
          in_progress: 'قيد التنفيذ', done: 'منجز', blocked: 'متوقف', new: 'جديد',
          contacted: 'تم التواصل', qualified: 'مؤهل', proposal: 'عرض',
          not_contacted: 'لم يتم التواصل', interested: 'مهتم',
          not_interested: 'غير مهتم', follow_up: 'متابعة',
          wrong_number: 'رقم خاطئ', no_answer: 'لا رد',
          not_delivered: 'لم تصل الرسالة', address_not_found: 'العنوان غير موجود' },

    jobTitle: 'المسمى الوظيفي', website: 'الموقع', source_: 'المصدر',
    anySource: 'كل المصادر', anyFollow: 'كل المتابعات', followOverdue: 'متأخرة',
    follow7: 'خلال ٧ أيام', follow30: 'خلال ٣٠ يوماً', followNone: 'بلا موعد',
    sortFollow: 'المتابعة، الأقرب', sortAdded: 'الأحدث إضافة', sortCompany: 'الشركة',
    backToLeads: 'العملاء المحتملون', leadNotFound: 'هذا العميل غير موجود.',
    noLeadMatch: 'لا يوجد عميل يطابق هذه التصفية.',
    contactHead: 'بيانات التواصل', proposalsHead: 'العروض',
    noProposals: 'لا يوجد عرض مرتبط بهذا العميل بعد.',
    linkProposal: 'اربط عرضاً', searchProjects: 'ابحث عن مشروع بالاسم',
    link: 'ربط', unlink: 'إلغاء الربط', alreadyLinked: 'مرتبط بعميل آخر بالفعل',
    noProjectMatch: 'لا يوجد مشروع مطابق.',
    leadHistory: 'النشاط', noLeadHistory: 'لا شيء مسجل بعد.',
    companyUnknown: 'لا توجد شركة مسجلة',
    fromLead: 'جاء من عميل محتمل', openInAsanaLead: 'افتح في أسانا',

    projectsByMonth: 'المشاريع حسب الشهر', byManager: 'المشاريع لكل مدير',
    perMonth: 'شهرياً', total_: 'الإجمالي', fewer: 'أقل', more: 'أكثر',
    startedInWindow: '{n} من {t} بدأت في هذه الفترة',
    allProjects: '{n} مشروعاً، جميعها',
    earlierBar: 'أقدم', earlierLong: 'كل ما بدأ قبل {m}',
    byStartNote: 'كل المشاريع محسوبة، حسب شهر بدء العمل. المواعيد النهائية لا دخل لها: فهي مسجلة على ٩٥ مشروعاً فقط من ٣٦٩، لذا العد حسب الموعد النهائي يصف ربع الأعمال ويبدو وكأنه كلها. العمود الرمادي يضم كل ما بدأ قبل الأشهر الاثني عشر المعروضة.',

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
    procHead: 'المشتريات — الأصناف المطلوبة', procItem: 'الصنف', procRef: 'مرجع',
    procAdd: '+ إضافة صنف', procNone: 'لا توجد أصناف بعد.', procView: 'عرض', procPhoto: 'إضافة صورة',
    procList: 'رفع قائمة', procListHint: 'إكسل أو PDF أو صورة لقائمة الأصناف كاملة',
    procDelConfirm: 'حذف هذا الصنف من القائمة؟',
    procSt: { pending: 'قيد الانتظار', in_process: 'قيد التنفيذ', done: 'تم', not_available: 'غير متوفر', expensive: 'مكلف' },
    prodHead: 'الإنتاج', prodSchedule: 'جدول الإنتاج',
    prodScheduleHint: 'المراحل والتواريخ ومن يقوم بماذا — نص حر.',
    prodDelivery: 'التسليم للموقع', prodFiles: 'ملفات الإنتاج',
    prodFilesHint: 'رسومات، مخططات، مخرجات', prodFilesHead: 'الملفات', prodNoFiles: 'لا توجد ملفات إنتاج بعد.',
    prodOnlyTeam: 'يمكن لفريق الإنتاج والمخططين فقط التعديل هنا.',
    /* --- الموارد البشرية --- */
    hrNav: 'الموارد البشرية', hrTeamNav: 'فريقي', hrHead: 'القوى العاملة', hrTeamHead: 'فريقي',
    hrNewHire: '+ طلب توظيف جديد',
    hrKHead: 'عدد الموظفين', hrKHeadSub: '{p} تحت التجربة',
    hrKLeave: 'في إجازة اليوم', hrKOpen: 'طلبات توظيف مفتوحة', hrKOpenSub: '{a} معتمدة بانتظار المباشرة',
    hrKJoin: 'مباشرة خلال 30 يوماً', hrKNoFile: 'بلا ملف موارد بشرية', hrKNoFileSub: 'تاريخ المباشرة غير مسجل — لا رصيد إجازات',
    hrReqHead: 'طلبات التوظيف', hrReqNone: 'لا توجد طلبات توظيف بعد.',
    hrEmpHead: 'الموظفون', hrEmpNone: 'لا يوجد أحد بعد.',
    hrName: 'الاسم الكامل', hrPosition: 'المسمى الوظيفي', hrDept: 'القسم', hrJoined: 'تاريخ المباشرة', hrJoining: 'تاريخ المباشرة',
    hrService: 'مدة الخدمة', hrBalance: 'رصيد الإجازة السنوية', hrSick: 'أيام مرضية', hrLastOO: 'آخر اجتماع فردي', hrScore: 'آخر تقييم',
    hrRequestedBy: 'مقدم الطلب', hrRequestedOn: 'تاريخ الطلب', hrKit: 'التجهيزات',
    hrYears: '{n} سنة', hrMonths: '{n} شهر', hrDays: '{n} يوم', hrDaysShort: '{n} ي',
    hrSt: { requested: 'مطلوب', approved: 'معتمد', rejected: 'مرفوض', hired: 'تم التعيين' },
    hrEmpSt: { probation: 'تحت التجربة', active: 'على رأس العمل', on_leave: 'في إجازة', terminated: 'غادر' },
    hrLeaveKind: { annual: 'سنوية', sick: 'مرضية', unpaid: 'بدون راتب', other: 'أخرى' },
    hrShowLeft: 'إظهار من غادروا',
    hrHireTitle: 'طلب توظيف جديد', hrBack: 'الموارد البشرية',
    hrHireLead: 'بعد الاعتماد وتحديده كـ«تم التعيين» يُنشأ سجل الموظف. دعوة الدخول إلى التطبيق منفصلة من صفحة الأشخاص.',
    hrEmail: 'بريد العمل (اختياري)', hrEmailHint: 'إن كان له ملف مسبقاً يُربط السجل به.',
    hrPhone: 'رقم الجوال', hrNatId: 'رقم الهوية / الإقامة',
    hrIdCopy: 'صورة الهوية', hrIdCopyHint: 'صورة أو PDF — تُحفظ بسرية، للموارد البشرية فقط',
    hrJobDesc: 'الوصف الوظيفي', hrTools: 'الأدوات والبرامج المطلوبة', hrToolsHint: 'تراخيص برامج، حسابات، صلاحيات…',
    hrLaptop: 'يحتاج جهاز لابتوب', hrEquip: 'تجهيزات أخرى', hrEquipHint: 'شاشة، جوال، مكتب، زي…',
    hrFeedback: 'ملاحظات حول المرشح', hrFeedbackHint: 'ملاحظات المقابلة، الانطباعات، المعرّفون…',
    hrSubmit: 'إرسال الطلب', hrPickDept: 'اختر…',
    hrReqNotFound: 'هذا الطلب غير موجود.',
    hrApprove: 'اعتماد', hrReject: 'رفض', hrMarkHired: 'تم التعيين — إنشاء سجل الموظف',
    hrHireNote: 'يُنشئ سجل الموظف (تحت التجربة) وينقل الهوية إلى ملفه.',
    hrRejectConfirm: 'رفض طلب التوظيف هذا؟', hrHireConfirm: 'إنشاء سجل الموظف لـ {n}؟',
    hrReopen: 'إعادة فتح', hrOpenEmp: 'فتح سجل الموظف ←',
    hrViewId: 'عرض صورة الهوية', hrNoId: 'لم تُرفع صورة الهوية.', hrDecided: '{s} بواسطة {who} في {d}',
    hrSaveFb: 'حفظ الملاحظات', hrNoValue: '—',
    hrEmpNotFound: 'هذا الشخص غير موجود.',
    hrScorecard: 'بطاقة الأداء', hrReviews: 'التقييمات الربعية', hrNoReviews: 'لا توجد تقييمات بعد.',
    hrPeriod: 'الربع', hrBy: 'بواسطة', hrStrengths: 'نقاط القوة', hrImprove: 'مجالات التحسين',
    hrOO: 'الاجتماعات الفردية', hrNoOO: 'لا توجد اجتماعات فردية مسجلة.',
    hrOODate: 'التاريخ', hrOONotes: 'الملاحظات', hrOOActions: 'المهام المتفق عليها', hrOOAdd: 'تسجيل الاجتماع',
    hrLeaves: 'الإجازات', hrNoLeaves: 'لا توجد إجازات مسجلة.',
    hrLeaveType: 'النوع', hrFrom: 'من', hrTo: 'إلى', hrDaysCol: 'الأيام', hrNote: 'ملاحظة', hrLeaveAdd: 'تسجيل إجازة',
    hrDelConfirm: 'حذف هذا السجل؟',
    hrBalanceNote: '{year}: {ent} يوماً في السنة، {acc} مستحقة حتى اليوم، {taken} مأخوذة. سنة ميلادية، استحقاق يومي، بدون ترحيل.',
    hrLegal: '21 يوماً في السنة، و30 يوماً بعد خمس سنوات خدمة (نظام العمل السعودي، المادة 109).',
    hrNoJoinDate: 'أضف تاريخ المباشرة لحساب رصيد الإجازات.',
    hrKBalance: 'المتبقي من الإجازة السنوية', hrKTaken: 'السنوية المأخوذة {y}', hrKSick: 'الأيام المرضية {y}', hrKLast: 'آخر تقييم',
    hrKOO: 'الاجتماعات الفردية', hrKOOSub: 'آخرها {d}',
    hrFile: 'ملف التوظيف', hrStatusL: 'الحالة الوظيفية', hrOverride: 'تعديل الاستحقاق السنوي',
    hrOverrideHint: 'أيام في السنة. اتركه فارغاً لاتباع النظام.', hrSupervisor: 'المشرف',
    hrReadOnly: 'الموارد البشرية فقط يمكنها تعديل هذا الملف.',
    hrIdentity: 'الهوية — للموارد البشرية فقط', hrHrNotes: 'ملاحظات خاصة بالموارد البشرية', hrReplaceId: 'رفع صورة الهوية',
    hrTimeline: 'السجل', hrTlJoined: 'باشر بمسمى {p}', hrTlLeave: 'إجازة {k} ({n} ي)', hrScoreCol: 'الدرجة', hrTlOO: 'اجتماع فردي مع {who}',
    hrTlReview: 'تقييم {q}: {s}%', hrTlHired: 'اعتماد طلب التوظيف',
    hrNoAccess: 'هذه الشاشة للموارد البشرية، وللمشرفين على فرقهم فقط.',
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
  /* The four "we never reached them" outcomes share one muted colour: they
     are the same fact from the reader's point of view — the contact detail
     is wrong — and giving each its own hue would imply four kinds of
     progress where there is none. */
  wrong_number:      'var(--ink4)',
  no_answer:         'var(--ink4)',
  not_delivered:     'var(--ink4)',
  address_not_found: 'var(--ink4)',
  not_contacted: 'var(--ink3)',
  follow_up:     'var(--warn)',
  interested:    'var(--ok)',
  not_interested:'var(--critical)',
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

/* Procurement item status. A separate map from ST_COLOUR because these are the
   procurement team's own words — "not available", "expensive" — and share only
   the neutral/ok slots with the pipeline. */
const PROC_COLOUR = {
  pending: 'var(--ink3)', in_process: 'var(--info)', done: 'var(--ok)',
  not_available: 'var(--critical)', expensive: 'var(--warn)',
};
export function procStatusPill(status, lang) {
  const label = DSTR[lang].procSt[status] || status;
  return `<span class="st" style="--c:${PROC_COLOUR[status] || 'var(--ink3)'}"><i></i>${esc(label)}</span>`;
}

/* ------------------------------------------------------------- file picker
   The native file input cannot be styled and its "No file chosen" text is
   not translatable, so every upload on the product used to look like a raw
   OS control dropped into a dark page. This renders the same input visually
   hidden — still focusable, still what the label activates — behind a target
   that says what it takes.

   The queue below it is a SIBLING of the label, never a child. Nested inside,
   every click — including the one on a remove button — would bubble up to the
   label and reopen the file dialog, so removing a file would immediately ask
   for another one. */
export function dropField(id, title, hint, { accept = '', multiple = false, required = false, tall = false } = {}) {
  return `
  <div class="dropwrap">
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
    </label>
    <div class="pendbox" data-pend-for="${esc(id)}"></div>
  </div>`;
}

/* What is queued on a picker, listed under it so a choice can be undone before
   anything is uploaded. controller.js re-renders this on every change.

   The queue lives on the input's own FileList and nowhere else. Keeping a
   parallel array beside it is exactly the bug where a file the user removed
   from the list uploads anyway, because submit reads `input.files` and the
   list was only ever a picture of a second, divergent truth. */
export function pendingFiles(lang, id, files) {
  const t = DSTR[lang];
  if (!files.length) return '';
  const total = files.reduce((a, f) => a + (f.size || 0), 0);
  return `
  <div class="pend__head">
    <span>${esc(t.filesQueued.replace('{n}', files.length))}</span>
    <span class="pend__sum">${esc(fileSize(total))}</span>
  </div>
  <ul class="pend">
    ${files.map((f, i) => `
    <li class="pend__i">
      <span class="pend__n" title="${esc(f.name)}">${esc(f.name)}</span>
      <span class="pend__s">${esc(fileSize(f.size))}</span>
      <button type="button" class="pend__x" data-drop-rm="${esc(id)}" data-i="${i}"
              title="${esc(t.removeFile)}" aria-label="${esc(t.removeFile)}: ${esc(f.name)}">&times;</button>
    </li>`).join('')}
  </ul>`;
}

/* Bytes the way a file manager says it. Not a rounded "1 MB" for everything
   between 0.5 and 1.5 — the number is here so someone can tell a 200KB logo
   from a 40MB render before they commit to waiting on the upload. */
export function fileSize(n) {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  const k = n / 1024;
  if (k < 1024) return `${k < 10 ? k.toFixed(1) : Math.round(k)} KB`;
  const m = k / 1024;
  return m < 1024 ? `${m < 10 ? m.toFixed(1) : Math.round(m)} MB` : `${(m / 1024).toFixed(1)} GB`;
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

/* ===================================================================== volume

   Two questions, two charts, one shared month axis so they can be read across:
   how much work started each month, and who was carrying it.

   The month comes from `start_on`, not `due_on`. Only 95 of 369 projects have
   a deadline, so a "projects per month" chart built on due dates would quietly
   describe a quarter of the business and present it as all of it. Every
   project has a start date. `created_at` is useless here — the Asana import
   stamped all 369 rows with the same day, so grouping by it draws one bar.
   ===================================================================== */

/** The months both charts share: contiguous, so an idle month reads as a gap
    rather than being closed up, and capped at the last 12 that carry data. */
export function monthWindow(projects, span = 12) {
  const keys = projects.filter(p => p.start_on).map(p => monthKey(parse(p.start_on)));
  if (!keys.length) return [];
  const sorted = [...new Set(keys)].sort();
  const out = [];
  let [y, m] = sorted[0].split('-').map(Number);
  const [ly, lm] = sorted[sorted.length - 1].split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
    if (out.length > 60) break;
  }
  return out.slice(-span);
}

const monthLabel = (k, lang) => {
  const [yy, mm] = k.split('-');
  return new Date(Date.UTC(+yy, +mm - 1, 1))
    .toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB',
      { month: 'short', timeZone: 'UTC' });
};
const monthLong = (k, lang) => {
  const [yy, mm] = k.split('-');
  return new Date(Date.UTC(+yy, +mm - 1, 1))
    .toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB',
      { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

/* How many projects started each month, and EVERY project is in here somewhere.
   One series, so slot-1 brand purple and no legend — the title names it.

   The window is the last 12 months that carry work, but 14 projects start in
   2023 and then nothing happens for two years. Drawing the true span would be
   37 columns with a 23-month hole in it; dropping those 14 would print a total
   that quietly disagrees with the 369 on the tile above. So they go into one
   "Earlier" bucket at the head of the axis, painted grey rather than brand so
   it cannot be misread as a month with a suspiciously round number in it. */
export function monthlyProjectsChart(lang, projects, months) {
  const t = DSTR[lang];
  const dated = projects.filter(p => p.start_on);
  if (months.length < 2) return '';

  const counts = new Map();
  let earlier = 0, later = 0;
  for (const p of dated) {
    const k = monthKey(parse(p.start_on));
    if (k < months[0]) { earlier++; continue; }
    if (k > months[months.length - 1]) { later++; continue; }
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const bars = months.map(k => ({ k, n: counts.get(k) || 0 }));
  /* `later` should always be 0 — the window ends at the last month with work —
     but it is counted rather than assumed, and folded into the bucket if the
     window rule ever changes, so the arithmetic cannot silently go wrong. */
  const spill = earlier + later;
  const all = spill ? [{ k: '~earlier', n: spill, bucket: true }, ...bars] : bars;
  const shown = all.reduce((a, s) => a + s.n, 0);
  const max = Math.max(...all.map(s => s.n), 1);

  /* An SVG does not mirror under `dir="rtl"` — its coordinates are absolute —
     but the heatmap beside it is a table and does. Left unhandled, the two
     charts run in opposite directions in Arabic and the shared month axis,
     which is the whole reason they sit side by side, stops lining up. So the
     bars are reversed by hand for RTL. */
  const series = lang === 'ar' ? [...all].reverse() : all;

  /* Every bar is labelled, so the y axis is gone: printing the same numbers
     twice, once as a scale and once on the marks, is clutter that makes the
     chart harder to read rather than more precise. Only the baseline stays,
     because a bar chart without one has nothing to sit on. The top padding
     grows to make room for the labels. */
  const W = 560, H = 250, PAD_L = 8, PAD_R = 8, PAD_T = 26, PAD_B = 34;
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
  const step = plotW / series.length;
  const barW = Math.max(6, Math.min(34, step - 8));
  const yOf = (n) => PAD_T + plotH - (n / max) * plotH;
  const base = PAD_T + plotH;
  const barPath = (x, y, w, h) => {
    const r = Math.min(4, w / 2, h);
    return h <= 0 ? '' : `M${x} ${y + h}V${y + r}q0-${r} ${r}-${r}h${w - 2 * r}q${r} 0 ${r} ${r}V${y + h}Z`;
  };
  const labelOf = (s) => (s.bucket ? t.earlierBar : monthLabel(s.k, lang));
  const titleOf = (s) => (s.bucket ? t.earlierLong.replace('{m}', monthLong(months[0], lang)) : monthLong(s.k, lang));

  return `
<section class="card">
  <div class="card__head"><h2>${esc(t.projectsByMonth)}</h2>
    <span class="muted small">${esc(t.allProjects.replace('{n}', shown))}</span></div>
  <div class="chartwrap">
    <svg viewBox="0 0 ${W} ${H}" class="chart" role="img"
         aria-label="${esc(t.projectsByMonth)}">
      <g class="grid"><line x1="${PAD_L}" x2="${W - PAD_R}" y1="${base}" y2="${base}"/></g>
      ${series.map((s, i) => {
        const x = PAD_L + i * step + (step - barW) / 2;
        const y = yOf(s.n), h = base - y;
        return `<g><title>${esc(titleOf(s))} — ${s.n}</title>
          <path d="${barPath(x, y, barW, h)}" fill="${s.bucket ? 'var(--ink3)' : 'var(--brand)'}"/>
          ${s.n ? `<text x="${x + barW / 2}" y="${y - 7}" class="axis axis--val" text-anchor="middle">${s.n}</text>` : ''}
        </g>`;
      }).join('')}
      ${series.map((s, i) => `<text x="${PAD_L + i * step + step / 2}" y="${H - 12}" class="axis${s.bucket ? ' axis--bucket' : ''}" text-anchor="middle">${esc(labelOf(s))}</text>`).join('')}
    </svg>
  </div>
  <p class="note">${esc(t.byStartNote)}</p>
</section>`;
}

/* Who carried it. 21 managers over 12 months is a grid, not a series set — a
   stacked bar would need 21 hues and the palette tops out at 8. A heatmap
   answers "how many, who, when" in one read with a single hue, and the row
   labels carry the totals so magnitude is never colour-alone. */
export function managerMonthChart(lang, projects, months) {
  const t = DSTR[lang];
  if (months.length < 2) return '';

  /* Same bucket as the bar chart beside it, for the same reason and by the same
     rule: a project that started outside the window is still that manager's
     project. Without this the two cards sit side by side reconciling to
     different totals — 369 on the left, 355 on the right — which is worse than
     either number being wrong on its own, because nothing on screen says why. */
  const inWindow = new Set(months);
  const rows = new Map();
  let spill = 0;
  for (const p of projects) {
    if (!p.start_on) continue;
    const m = monthKey(parse(p.start_on));
    const k = inWindow.has(m) ? m : '~earlier';
    if (k === '~earlier') spill++;
    const who = p.owner?.full_name || t.unassignedOwner;
    if (!rows.has(who)) rows.set(who, { who, total: 0, by: new Map() });
    const r = rows.get(who);
    r.total++; r.by.set(k, (r.by.get(k) || 0) + 1);
  }
  const list = [...rows.values()].sort((a, b) => b.total - a.total || a.who.localeCompare(b.who));
  if (!list.length) return '';
  const cols = spill ? ['~earlier', ...months] : months;

  /* Sequential, single hue, light→dark flipped for a dark surface so more is
     brighter. Four steps rather than five: validated on #101014, five could
     not keep both a 2:1 floor against the panel and a readable step gap.
       node scripts/validate_palette.js — ordinal mode, ALL CHECKS PASS */
  const RAMP = ['#6a27a5', '#824cbc', '#9c6dd3', '#b68ee9'];

  /* Bands by quantile, not by an equal slice of the range. Project counts per
     manager-month are heavily skewed — most cells are 1–3 while one busy month
     hits 13 — and cutting the range into four equal parts drops ~85% of the
     grid into the darkest band, so the whole thing reads as one flat colour
     and the encoding does no work. Quantiles put the cuts where the data
     actually is. Duplicate cuts are dropped rather than drawn as two
     indistinguishable steps that claim to mean different things. */
  /* The bucket's cells are deliberately kept OUT of the quantile maths and off
     the ramp. It spans years while every other column spans a month, so a
     shared colour scale would compare two different things and skew the cuts
     for the months that actually matter. It gets the same grey the bar chart
     gives it. */
  const vals = list.flatMap(r => [...r.by.entries()].filter(([k]) => k !== '~earlier').map(([, n]) => n))
    .filter(n => n > 0).sort((a, b) => a - b);
  const cuts = [...new Set([0.25, 0.5, 0.75]
    .map(q => vals[Math.floor(q * (vals.length - 1))]))]
    .filter(v => v < vals[vals.length - 1]);
  const steps = RAMP.slice(0, cuts.length + 1);
  const bandOf = (n) => {
    if (n <= 0) return -1;
    for (let i = 0; i < cuts.length; i++) if (n <= cuts[i]) return i;
    return steps.length - 1;
  };
  const fillOf = (n, k) => (n <= 0 ? 'var(--s-2)' : k === '~earlier' ? 'var(--ink3)' : steps[bandOf(n)]);
  const colShort = (k) => (k === '~earlier' ? t.earlierBar : monthLabel(k, lang));
  const colLong = (k) => (k === '~earlier' ? t.earlierLong.replace('{m}', monthLong(months[0], lang)) : monthLong(k, lang));
  // What each step starts at, so the legend states the scale rather than
  // asking the reader to guess what "brighter" is worth.
  const bandLow = (i) => (i === 0 ? 1 : cuts[i - 1] + 1);

  return `
<section class="card">
  <div class="card__head"><h2>${esc(t.byManager)}</h2>
    <span class="muted small">${list.length} · ${esc(t.perMonth)}</span></div>
  <div class="tblwrap">
    <table class="heat">
      <thead><tr><th class="heat__rowh">${esc(t.owner)}</th>
        ${cols.map(k => `<th class="heat__colh${k === '~earlier' ? ' heat__colh--bucket' : ''}">${esc(colShort(k))}</th>`).join('')}
        <th class="heat__tot">${esc(t.total_)}</th></tr></thead>
      <tbody>
        ${list.map(r => `<tr>
          <td class="heat__rowh">${esc(r.who)}</td>
          ${cols.map(k => {
            const n = r.by.get(k) || 0;
            return `<td class="heat__c${k === '~earlier' ? ' heat__c--bucket' : ''}"><span class="heat__box" style="background:${fillOf(n, k)}"
              title="${esc(r.who)} — ${esc(colLong(k))} — ${n}"
              aria-label="${esc(r.who)} — ${esc(colLong(k))} — ${n}">${n ? n : ''}</span></td>`;
          }).join('')}
          <td class="heat__tot">${r.total}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  <div class="heatkey">
    <span class="muted small">${esc(t.fewer)}</span>
    <span class="heat__box heat__box--key" style="background:var(--s-2)" title="0">0</span>
    ${steps.map((c, i) => `<span class="heat__box heat__box--key" style="background:${c}"
      title="${bandLow(i)}+">${bandLow(i)}${i === steps.length - 1 ? '+' : ''}</span>`).join('')}
    <span class="muted small">${esc(t.more)}</span>
    ${spill ? `<span class="heat__box heat__box--key" style="background:var(--ink3)"
      title="${esc(t.earlierLong.replace('{m}', monthLong(months[0], lang)))}">·</span>
    <span class="muted small">${esc(t.earlierBar)}</span>` : ''}
  </div>
</section>`;
}

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

/* The stage table the live app schedules with, read from the database rather
   than from the engine's defaults. departments.days_s/days_m/days_l is the
   editable copy; a department with no figures is deliberately not estimated
   (pricing and production have none, and a guessed number on pricing would be
   the most misleading one on the screen). */
export function stageTable(departments = db.state.departments || []) {
  const out = {};
  for (const d of departments) {
    if (!d.is_stage) continue;
    const days = { S: Number(d.days_s), M: Number(d.days_m), L: Number(d.days_l) };
    if (!days.M) continue;                       // no stated effort -> not priced
    out[d.id] = { label: d.name_en || d.id, team: d.id, days };
  }
  return out;
}

/* The size picker. It used to print the multiplier — "M ×1", "XL ×2.6" — which
   told a project manager nothing they could check. It now prints the range of
   working days that size costs across the priced stages, read from the same
   table the engine schedules with, so the dropdown and the estimate can never
   disagree. */
export function sizeOptionsHtml(lang, selected = 'M', stages = null) {
  const t = DSTR[lang];
  const table = stages || stageTable();
  const priced = Object.values(table).map(s => s.days).filter(Boolean);
  return SIZES.map(k => {
    const ds = priced.map(d => Number(d[k])).filter(n => n > 0);
    const lo = ds.length ? Math.min(...ds) : 0, hi = ds.length ? Math.max(...ds) : 0;
    const range = !ds.length ? '' : lo === hi ? `${lo} ${t.daysWord}` : `${lo}–${hi} ${t.daysWord}`;
    return `<option value="${k}"${k === selected ? ' selected' : ''}>${esc(t.sizes[k])}${range ? ` · ${esc(range)}` : ''}</option>`;
  }).join('');
}

export function buildScheduler(people, openStages, projects = []) {
  const stages = stageTable();
  const members = people
    .filter(p => p.department_id && stages[p.department_id])
    .map(p => ({ id: p.id, name: p.full_name || p.email, team: p.department_id }));

  const sched = new Scheduler({ members, stages, calendar: CAL });

  /* Replay committed work so a new project queues behind what is already
     promised. Three things this gets right that it used to get wrong, and
     between them they were most of the reason a medium project came back at
     eighteen days:

     SIZE. Every committed project was replayed as Medium regardless of what it
     actually is, so 105 large projects were priced as medium and 11 small ones
     were too. Each now uses its own size.

     LATE WORK. A stage whose planned start is in the past was replayed from
     that past date, and the scheduler happily booked capacity in weeks that
     have already gone — so 47 stages that are late and still to do consumed no
     present capacity at all and vanished from the queue. Starts are clamped to
     today: work that has not happened yet competes for the days that are left,
     whatever its paperwork says.

     UNDATED WORK. 110 of 157 open stages carry no planned start. They are real
     work, so they stay in the ledger from today — but they are counted once,
     at their project's real size, rather than every project being assumed
     medium and every stage being assumed to start this morning at full price. */
  const now = today();
  const sizeOf = new Map((projects || []).map(p => [p.id, p.size || 'M']));
  const byProject = new Map();
  for (const s of openStages) {
    if (s.status === 'done') continue;
    if (!stages[s.department_id]) continue;      // unpriced stage, no capacity claim
    if (!byProject.has(s.project_id)) byProject.set(s.project_id, { start: null, stages: [] });
    const e = byProject.get(s.project_id);
    e.stages.push(s.department_id);
    if (s.planned_start && (!e.start || s.planned_start < e.start)) e.start = s.planned_start;
  }
  let n = 0, undated = 0, pulledForward = 0;
  for (const [pid, e] of byProject) {
    if (!e.stages.length) continue;
    if (!e.start) undated++;
    else if (e.start < now) pulledForward++;
    const start = !e.start || e.start < now ? now : e.start;
    try {
      sched.scheduleProject({
        id: 'live-' + pid, name: 'committed', size: sizeOf.get(pid) || 'M',
        earliestStart: start, stages: e.stages, commit: true,
      });
      n++;
    } catch { /* a project the engine cannot place must not block the estimate */ }
  }
  /* How deep each team's backlog is, in working days: the person-days of open
     work divided by the people who can do it. This is plain arithmetic on rows
     that exist, not a scheduler output, and it is the honest answer to "why is
     the date so far away" — a team 64 days deep cannot start tomorrow however
     the estimate is phrased. */
  const depth = {};
  for (const key of Object.keys(stages)) {
    const heads = members.filter(m => m.team === key).length;
    let days = 0, count = 0;
    for (const [pid, e] of byProject) {
      for (const d of e.stages) {
        if (d !== key) continue;
        days += Number(stages[key].days[sizeOf.get(pid) || 'M']) || 0;
        count++;
      }
    }
    depth[key] = { stages: count, people: heads, days: Math.round(days),
                   workingDays: heads ? Math.round(days / heads) : null };
  }
  return { sched, committed: n, members, undated, pulledForward, stages, depth };
}

/* ========================== THE WORKLOAD CALENDAR =========================

   "When can I submit the next one?" is a different question from "when does
   this one land", and the estimator only ever answered the second. This
   answers the first: for each team, month by month, how many person-days
   exist and how many are already spoken for.

   It reads the SAME ledger the estimate reads — the scheduler returned by
   buildScheduler(), with every committed stage already booked into it. That
   is the whole reason it is computed here and not from a separate query. A
   calendar assembled from its own SQL would drift from the date beside it
   within a week, and then neither could be trusted.

   Capacity is people × working days, and working days come from the Saudi
   calendar: Friday and Saturday are weekend, Eid and National Day are
   holidays. September has a national day in it, so September is a shorter
   month than August whatever the wall calendar says.
   ========================================================================== */

/** First and last day of the month `n` months after `from`.
    Not `monthWindow` — that one already exists above and means the months a
    chart spans, which is a different thing that happens to sound the same. */
export function capacityMonth(from, n = 0) {
  const d = parse(from);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + n;
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(y, m + 1, 0));
  return { key: iso(first).slice(0, 7), first: iso(first), last: iso(last) };
}

/* Month AND year. Six months forward from August crosses into next year, and
   a column headed "Jan" beside one headed "Dec" is ambiguous exactly where
   the decision gets made. */
export function capacityMonthLabel(key, lang) {
  return parse(key + '-01').toLocaleDateString(
    lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB',
    { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

/**
 * Per team, per month: capacity, what is committed, and what is left.
 *
 * @param sched   the scheduler from buildScheduler(), work already booked
 * @param months  how many months forward, including the current one
 * @param fromISO today, normally
 */
export function monthlyLoad(sched, months = 6, fromISO = today()) {
  /* Teams come from the STAGE TABLE, not from the roster. A team with nobody
     in it has no members and would drop out of the calendar entirely — which
     renders as absence, and absence reads as "fine". Content has had zero
     active people for most of this year; that is the single most important
     thing this screen can tell anyone, and it is exactly the row that
     disappears if you enumerate people instead of teams. */
  const teams = [...new Set(Object.values(sched.stages || {}).map(s => s.team))];
  if (!teams.length) teams.push(...new Set((sched.members || []).map(m => m.team)));
  const out = [];
  for (let n = 0; n < months; n++) {
    const w = capacityMonth(fromISO, n);
    /* The current month starts TODAY, not on the 1st. Days that have already
       gone are not free slots, and counting them would report a comfortable
       month on the 28th of it. */
    const from = n === 0 && fromISO > w.first ? fromISO : w.first;
    const u = sched.utilisation(from, w.last);
    const row = { key: w.key, from, to: w.last, partial: from !== w.first, teams: {} };
    for (const team of teams) {
      const v = u[team] || { committed: 0, capacity: 0, headcount: 0 };
      const capacity = Math.round(v.capacity);
      const committed = Math.round(v.committed);
      row.teams[team] = {
        capacity, committed,
        free: Math.max(0, capacity - committed),
        /* Over-committed months exist and must be allowed to read above 100%.
           Clamping them to "full" hides the difference between a team with
           nothing left and a team three weeks past what it can hold. */
        pct: capacity ? Math.round((committed / capacity) * 100) : 0,
        headcount: v.headcount || 0,
      };
    }
    out.push(row);
  }
  return out;
}

/**
 * The first month each team could actually take a project of `size`, and the
 * first month they ALL could — which is the answer to "when do I submit".
 * A month counts only if the free days cover the whole stage; half a stage's
 * worth of room is not a slot, it is a split.
 */
export function firstFreeMonth(load, stages, size = 'M') {
  const per = {};
  /* A team nobody is on is a different failure from a team that is busy, and
     collapsing them loses the only one you can fix this afternoon. "No month
     has room" invites hiring or waiting; "nobody is on Content" invites
     assigning somebody, which takes a minute. */
  const staffless = [];
  for (const [team, st] of Object.entries(stages || {})) {
    const need = Number(st.days?.[size]) || 0;
    if (load.every(m => !(m.teams[team]?.capacity))) { staffless.push(team); per[team] = null; continue; }
    per[team] = load.find(m => (m.teams[team]?.free ?? 0) >= need)?.key || null;
  }
  const keys = Object.values(per);
  const all = keys.length && keys.every(Boolean)
    ? keys.reduce((a, b) => (a > b ? a : b))     // everyone free = the latest of them
    : null;
  return { per, all, staffless };
}

export function estimateFor(sched, { name, size, start, deadline, stages }, depth = null) {
  /* The new project's start is clamped to today, exactly as committed work is
     in buildScheduler. Without this, a proposal dated last week is scheduled
     into days that have already gone — and because the committed queue starts
     at today, it jumps in FRONT of it and comes back with the same date as the
     empty-team answer. The estimator was quietly promising delivery on
     capacity that no longer exists, and the two numbers whose difference is
     the whole point of the screen collapsed into one. */
  const from = !start || start < today() ? today() : start;
  const real = sched.scheduleProject({
    id: '__new__', name, size, earliestStart: from, deadline: deadline || null,
    stages, commit: false,
  });
  const naive = new Scheduler({ members: sched.members ?? [], calendar: CAL })
    .scheduleProject({ id: 'n', name, size, earliestStart: from, stages, commit: false });
  return { real, naive, depth };
}

/* ================================ SIGN IN ================================= */

/* How many seconds the resend button stays shut, measured from when the code
   was sent. Matches the server's own cooldown: before it elapses a resend does
   nothing anyway, so an enabled button would be lying \u2014 and holding it shut is
   the point, since the trap was a reflex resend that mints a new code and kills
   the one already in the inbox. Pure and clamped so a stale timer never shows a
   negative or a jitter past the window. */
export const RESEND_HOLD_MS = 120_000;
export const resendLeft = (sentAt, now) =>
  Math.max(0, Math.ceil((RESEND_HOLD_MS - (now - (sentAt || 0))) / 1000));

export function signInView(lang, mode = 'in', msg = '', authErr = null, addr = '') {
  const t = DSTR[lang];
  const title = mode === 'up' ? t.firstTimeTitle
              : mode === 'forgot' ? t.forgot
              : mode === 'reset' ? t.newPassword
              : mode === 'code' ? t.codeTitle
              : t.signIn;

  /* 'up' and 'forgot' ask for an address and send a code; 'code' takes the
     code back; only 'in' and 'reset' involve a password at all. The
     first-time screen used to take a password too, which meant whoever typed
     an address first owned it — and an address is what decides a role here. */
  const wantsPassword = mode === 'in' || mode === 'reset';
  /* The code step normally already knows the address — it was just typed on
     the previous screen. But a person can also arrive on it cold, from the
     link in an emailed code, and then there is no address to carry, so the
     email field comes back and they enter both together. */
  const coldCode = mode === 'code' && !addr;
  const wantsEmail = mode !== 'reset' && (mode !== 'code' || coldCode);
  const prompt = mode === 'up' ? t.firstTimePrompt
               : mode === 'forgot' ? t.forgotPrompt
               : mode === 'code' ? (coldCode ? t.codePromptCold : t.codePrompt.replace('{e}', addr))
               : '';
  const go = mode === 'reset' ? t.setIt
           : mode === 'up' ? t.emailMeLink
           : mode === 'forgot' ? t.sendReset
           : mode === 'code' ? t.codeGo
           : t.signIn;

  /* A dead link is still the most likely way to arrive here — old emails
     stay in inboxes — and the only useful response is a code, so the panel
     carries the button rather than telling the user to go and find it. */
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
      ${mode === 'reset' ? `<p class="small muted">${esc(t.recoverPrompt)}</p>` : ''}
      ${prompt ? `<p class="small muted">${esc(prompt)}</p>` : ''}
      ${!wantsEmail ? '' : `
      <label class="f f--wide">
        <span>${esc(t.email)}</span>
        <input id="aEmail" type="email" name="email" required autocomplete="username"
               placeholder="you@expandexpo.com" value="${esc(addr)}" />
      </label>`}
      ${mode !== 'code' ? '' : `
      <label class="f f--wide">
        <span>${esc(t.codeLabel)}</span>
        <!-- inputmode numeric brings up the digits keypad on a phone, and
             one-time-code lets iOS and Android offer the code straight from
             the notification, so it never has to be memorised across apps. -->
        <input id="aCode" class="codein" name="one-time-code" required
               type="text" inputmode="numeric" pattern="[0-9]*" maxlength="8"
               autocomplete="one-time-code" autofocus placeholder="00000000" />
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
          : mode === 'code'
          ? `<button type="button" class="link" data-resend="1">${esc(t.codeResend)}</button>
             <button type="button" class="link" data-auth="in">${esc(t.codeWrongAddr)}</button>`
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

/* ==========================================================================
   BUSINESS HIGHLIGHTS — the management screen.

   This screen used to be a card on the landing page, which meant a stranger
   with the URL and no password could read staff names, work emails and task
   counts. That version is gone: the data it drew came from a file compiled
   into the bundle, and the file has been deleted. Everything below is read
   live, over RLS, by somebody who has signed in and whom canPlan() allows.

   The other rule this screen keeps: NOTHING HERE IS DERIVED FROM A COLUMN
   THAT IS MOSTLY EMPTY. `effort_days` is set on 6 stages out of 629 and
   `started_at`/`completed_at` on none, so utilisation, cycle time and "days
   of capacity left" would be arithmetic performed on absence. They are not
   here. Every figure below counts rows that exist, and where a denominator
   is partial the card says so out loud rather than presenting a share of
   what it happened to have as a share of the business.
   ========================================================================== */

const dayDiff = (a, b) => Math.round((parse(a) - parse(b)) / DAY);

/** Did we deliver when we said we would? Judged only on projects that carry
    both a deadline and a delivery date — the rest are unknown, and counting
    unknown as "on time" is how an on-time rate becomes a compliment. */
export function deliveryRecord(projects) {
  const judged = [];
  for (const p of projects) {
    if (!p.due_on || !p.delivered_on) continue;
    judged.push({ id: p.id, name: p.name, late: dayDiff(p.delivered_on, p.due_on) });
  }
  const late = judged.filter(j => j.late > 0);
  const onTime = judged.length - late.length;

  /* Median, not mean. One project came in 708 days after its deadline; an
     average built on it reports a typical delay nobody has ever seen. */
  const sorted = late.map(j => j.late).sort((a, b) => a - b);
  const medianLate = sorted.length
    ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2]
       : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2))
    : 0;

  const bands = [0, 0, 0, 0];
  for (const j of late) {
    bands[j.late <= 7 ? 0 : j.late <= 28 ? 1 : j.late <= 90 ? 2 : 3]++;
  }

  /* Separately: what is late RIGHT NOW and has not been delivered at all.
     A delivery record is history; this is the bill still outstanding. */
  const now = today();
  const open = projects.filter(p => !CLOSED_STATUS.includes(p.status));
  const stillLate = open
    .filter(p => p.due_on && p.due_on < now)
    .map(p => ({ id: p.id, name: p.name, by: dayDiff(now, p.due_on) }))
    .sort((a, b) => b.by - a.by);

  return {
    judged: judged.length, onTime, late: late.length, medianLate, bands,
    unjudged: projects.length - judged.length,
    rate: judged.length ? Math.round((onTime / judged.length) * 100) : null,
    stillLate: stillLate.length, worst: stillLate[0] || null,
  };
}

/** Open stages on open projects, by the person holding them. Unassigned is a
    row, not a footnote — it is usually the largest one, and hiding it would
    make the roster look busier than it is. */
export function workloadByPerson(projects) {
  const live = projects
    .filter(p => !CLOSED_STATUS.includes(p.status))
    .flatMap(p => (p.project_stages || []).filter(s => s.status !== 'done'));

  const by = new Map();
  let unassigned = 0;
  for (const s of live) {
    if (!s.assignee_id) { unassigned++; continue; }
    const k = s.assignee_id;
    const row = by.get(k) || { id: k, name: s.assignee?.full_name || '', dept: s.assignee?.department_id || s.department_id, n: 0 };
    row.n++;
    by.set(k, row);
  }
  const rows = [...by.values()].sort((a, b) => b.n - a.n || String(a.name).localeCompare(String(b.name)));
  return { rows, unassigned, total: live.length, people: rows.length };
}

/** Where the business depends on one person. Per team: how much of its
    ASSIGNED open work the busiest single person holds. The denominator is
    assigned work rather than all work, because dividing by a total that is
    half unassigned makes every team look comfortably spread. */
export function keyPersonRisk(projects) {
  const live = projects
    .filter(p => !CLOSED_STATUS.includes(p.status))
    .flatMap(p => (p.project_stages || []).filter(s => s.status !== 'done'));

  const teams = new Map();
  for (const s of live) {
    const d = s.department_id || '—';
    const team = teams.get(d) || { dept: d, total: 0, unassigned: 0, holders: new Map() };
    team.total++;
    if (!s.assignee_id) team.unassigned++;
    else team.holders.set(s.assignee_id,
      { name: s.assignee?.full_name || '', n: (team.holders.get(s.assignee_id)?.n || 0) + 1 });
    teams.set(d, team);
  }

  return [...teams.values()].map(team => {
    const holders = [...team.holders.values()].sort((a, b) => b.n - a.n);
    const assigned = holders.reduce((a, h) => a + h.n, 0);
    const top = holders[0] || null;
    const share = assigned ? top.n / assigned : 0;
    return {
      dept: team.dept, total: team.total, unassigned: team.unassigned,
      assigned, holders: holders.length, top, share,
      /* Two people and one of them holds everything is a real dependency;
         one stage held by one person is not a finding, it is a stage. */
      risk: assigned >= 3 && share >= 0.6,
      sole: assigned >= 3 && holders.length === 1,
    };
  }).sort((a, b) => b.total - a.total);
}

/** What is waiting on a human. Every figure is a row that exists today. */
export function pipelinePressure(projects, leads) {
  const now = today();
  const live = (leads || []).filter(l => !['won', 'lost'].includes(l.status));
  const open = projects.filter(p => !CLOSED_STATUS.includes(p.status));
  return {
    leadsTotal: (leads || []).length,
    leadsNoOwner: (leads || []).filter(l => !l.owner_id).length,
    followOverdue: live.filter(l => l.next_follow_up_on && l.next_follow_up_on < now).length,
    followTotal: live.filter(l => l.next_follow_up_on).length,
    atEtemad: projects.filter(p => p.status === 'submitted').length,
    projNoOwner: open.filter(p => !p.owner_id).length,
    projOpen: open.length,
  };
}

/* A horizontal bar row. HTML rather than SVG: the labels are people's names,
   they are long, half of them are Arabic, and a <div> mirrors under dir="rtl"
   for free where an SVG's absolute coordinates do not. The number sits at the
   end of its own bar, so there is no axis to read across to. */
const hbar = (label, n, max, { colour = 'var(--brand)', muted = false, sub = '' } = {}) => `
  <li class="hb${muted ? ' hb--muted' : ''}">
    <span class="hb__l" title="${esc(label)}">${esc(label)}${sub ? `<span class="hb__sub">${esc(sub)}</span>` : ''}</span>
    <span class="hb__track"><span class="hb__fill" style="width:${max ? Math.max(1.5, (n / max) * 100) : 0}%;background:${colour}"></span></span>
    <span class="hb__n">${n}</span>
  </li>`;

export function highlightsView(lang, ctx) {
  const t = DSTR[lang];
  const projects = (ctx.projects || []).filter(p => !p.is_crm_list);
  if (!projects.length) {
    return `<section class="card"><p class="muted">${esc(t.hlEmpty)}</p></section>`;
  }

  const D = deliveryRecord(projects);
  const L = workloadByPerson(projects);
  const R = keyPersonRisk(projects);
  const P = pipelinePressure(projects, ctx.leads || []);

  /* ---------------------------------------------------- 1. delivery record */
  const bandLabels = [t.band0, t.band1, t.band2, t.band3];
  /* Sequential, one hue: these bands are ordered severity, not four different
     things. It runs dim → bright rather than light → dark because the surface
     is dark — the same direction the manager heatmap uses, so "more" means the
     same thing on both screens. Status red is NOT used: it is reserved, and
     every band here is already late, so painting them all red says nothing. */
  const bandRamp = ['#6a27a5', '#824cbc', '#9c6dd3', '#b68ee9'];
  const bandMax = Math.max(...D.bands, 1);

  const delivery = `
<section class="card">
  <div class="card__head"><h2>${esc(t.hlDelivery)}</h2>
    <span class="muted small">${esc(t.hlJudged.replace('{n}', D.judged))}</span></div>
  <div class="kpis kpis--in">
    ${kpi(D.rate === null ? '—' : `${D.rate}%`, t.hlOnTimeRate, { colour: 'var(--ok)',
      sub: `${D.onTime} ${lang === 'ar' ? 'من' : 'of'} ${D.judged}` })}
    ${kpi(D.late, t.hlLate, { colour: 'var(--warn)', bad: D.late > D.onTime,
      sub: D.medianLate ? `${t.hlMedianLate}: ${D.medianLate} ${t.hlDays}` : '' })}
    ${kpi(D.stillLate, t.hlStillLate, { colour: 'var(--critical)', bad: D.stillLate > 0,
      sub: D.worst ? `${t.hlWorstLate}: ${D.worst.by} ${t.hlDays}` : '' })}
  </div>
  ${D.late ? `
  <h3 class="subhead">${esc(t.hlLateBands)}</h3>
  <ul class="hbars">
    ${D.bands.map((n, i) => hbar(bandLabels[i], n, bandMax, { colour: bandRamp[i] })).join('')}
  </ul>
  <p class="note">${esc(t.hlLateBandsNote)}</p>` : ''}
  <p class="note">${esc(t.hlDeliveryNote)} ${esc(t.hlUnjudged.replace('{n}', D.unjudged))}.</p>
</section>`;

  /* ------------------------------------------------- 2. who is carrying what */
  const loadMax = Math.max(L.unassigned, ...L.rows.map(r => r.n), 1);
  const load = `
<section class="card">
  <div class="card__head"><h2>${esc(t.hlLoad)}</h2>
    <span class="muted small">${L.total} ${esc(t.hlStages)} · ${L.people} ${esc(t.hlPeople)}</span></div>
  <ul class="hbars">
    ${L.unassigned ? hbar(t.unassignedOwner, L.unassigned, loadMax, {
      colour: 'var(--ink3)', muted: true,
      sub: `${Math.round((L.unassigned / (L.total || 1)) * 100)}% ${t.hlShareOfAll}` }) : ''}
    ${L.rows.map(r => hbar(r.name || '—', r.n, loadMax, {
      colour: db.dept(r.dept)?.colour || 'var(--brand)',
      sub: deptName(r.dept, lang) })).join('')}
  </ul>
  <p class="note">${esc(t.hlLoadNote)}</p>
</section>`;

  /* ------------------------------------------- 3. single points of failure */
  const risk = `
<section class="card">
  <div class="card__head"><h2>${esc(t.hlRisk)}</h2></div>
  <div class="tblwrap">
    <table class="tbl">
      <thead><tr>
        <th>${esc(t.hlTeam)}</th>
        <th class="num">${esc(t.hlTeamStages)}</th>
        <th>${esc(t.hlBusiest)}</th>
        <th>${esc(t.hlConcentration)}</th>
        <th class="num">${esc(t.status)}</th>
      </tr></thead>
      <tbody>
        ${R.map(r => `<tr>
          <td><span class="pill" style="--c:${esc(db.dept(r.dept)?.colour || '#555')}">${esc(deptName(r.dept, lang))}</span></td>
          <td class="num">${r.total}${r.unassigned ? `<span class="block small muted">${r.unassigned} ${esc(t.hlUnowned)}</span>` : ''}</td>
          <td class="small ${r.top ? '' : 'muted'}">${esc(r.top?.name || t.hlNobody)}
            ${r.top ? `<span class="block small muted">${esc(t.hlHolds)} ${r.top.n} ${esc(t.hlOfTeam)}</span>` : ''}</td>
          <td>
            <span class="conc"><span class="conc__f${r.risk ? ' conc__f--bad' : ''}" style="width:${Math.round(r.share * 100)}%"></span></span>
            <span class="conc__n">${r.assigned ? `${Math.round(r.share * 100)}%` : '—'}</span>
          </td>
          <td class="num">${r.risk
            ? `<span class="tag tag--bad">${esc(r.sole ? t.hlSole : t.hlRiskHigh)}</span>`
            : `<span class="tag">${esc(t.hlRiskOk)}</span>`}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>
  <p class="note">${esc(t.hlRiskNote)}</p>
</section>`;

  /* ---------------------------------------------------- 4. pipeline pressure */
  const pipeline = `
<section class="card">
  <div class="card__head"><h2>${esc(t.hlPipeline)}</h2></div>
  <div class="kpis kpis--in">
    ${kpi(P.leadsNoOwner, t.hlLeadsNoOwner, { colour: 'var(--warn)', bad: P.leadsNoOwner > 0,
      sub: t.hlOfLeads.replace('{n}', P.leadsTotal) })}
    ${kpi(P.followOverdue, t.hlFollowOverdue, { colour: 'var(--critical)', bad: P.followOverdue > 0,
      sub: `${lang === 'ar' ? 'من' : 'of'} ${P.followTotal} ${lang === 'ar' ? 'لها موعد متابعة' : 'with a date set'}` })}
    ${kpi(P.atEtemad, t.hlAtEtemad, { colour: 'var(--s1)', sub: t.hlAtEtemadSub })}
    ${kpi(P.projNoOwner, t.hlProjNoOwner, { colour: 'var(--s4)', bad: P.projNoOwner > 0,
      sub: t.hlOfProjects.replace('{n}', P.projOpen) })}
  </div>
  <p class="note">${esc(t.hlPipelineNote)}</p>
</section>`;

  return delivery + load + risk + pipeline;
}

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
    const { sched } = buildScheduler(ctx.people || [], liveStages, projects);
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

${(() => {
  /* Both charts get the SAME months, so a spike on the left can be traced to a
     row on the right. Computed once from the whole portfolio, not from the
     filtered set: these two answer "what does the year look like", and
     re-cutting them on every filter would make them a second, quieter table. */
  const months = monthWindow(projects);
  return `<div class="chartrow">
  ${monthlyProjectsChart(lang, projects, months)}
  ${managerMonthChart(lang, projects, months)}
</div>`;
})()}

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
  // The procurement + production sections open once a project is accepted.
  const inProd = ['won', 'in_production'].includes(p.status);
  // Their files live in the same table, so keep them out of the general
  // Documents list where they would just be noise.
  const docFiles = files.filter(f => !['procurement', 'production'].includes(f.purpose));

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
    ${p.lead ? fact(t.fromLead,
      `<button class="link" data-act="go" data-route="#/l/${esc(p.lead.id)}">${esc(p.lead.name)}${p.lead.company ? ` · ${esc(p.lead.company)}` : ''}</button>`) : ''}
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

${inProd ? productionSections(lang, ctx) : ''}

<section class="card">
  <div class="card__head"><h2>${esc(t.documents)}</h2><span class="muted small">${docFiles.length}</span></div>
  ${docFiles.length ? `<ul class="filelist">${docFiles.map(f => `
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

/* ========================================================================
   The two sections that open on an accepted project: the procurement team's
   shopping list, and the production team's schedule, delivery date and files.
   Pure function of (lang, ctx) like every other view; controller.js owns the
   writes. Rendered only when the project is `won` or `in_production`.
   ======================================================================== */

export function productionSections(lang, ctx) {
  const t = DSTR[lang];
  const p = ctx.project;
  const items = ctx.procurementItems || [];
  const prod = ctx.productionInfo || null;
  const files = ctx.projectFiles || [];
  const canEdit = canEditProduction();

  const itemFile = (id) => files.find(f => f.procurement_item_id === id) || null;
  const procListFiles = files.filter(f => f.purpose === 'procurement' && !f.procurement_item_id);
  const prodFiles = files.filter(f => f.purpose === 'production');
  const PROC_ST = ['pending', 'in_process', 'done', 'not_available', 'expensive'];

  const fileRow = (f) => `
    <li class="filerow">
      <button class="link" data-file="${esc(f.id)}">${esc(f.title || f.filename)}</button>
      <span class="muted small">${f.size_bytes ? `${Math.max(1, Math.round(f.size_bytes / 1024))} KB` : ''}${f.uploader?.full_name ? ` · ${esc(t.uploadedBy.replace('{who}', f.uploader.full_name))}` : ''}</span>
    </li>`;

  const refCell = (it) => {
    const f = itemFile(it.id);
    const parts = [];
    if (f) parts.push(`<button class="link" data-file="${esc(f.id)}">${esc(t.procView)}</button>`);
    if (canEdit) parts.push(`<label class="miniup">${f ? '↺' : esc(t.procPhoto)}<input type="file" data-pi-photo="${esc(it.id)}" accept="image/*,.pdf" /></label>`);
    if (!parts.length) return '<span class="muted">—</span>';
    return `<span class="procref">${parts.join('')}</span>`;
  };

  const statusSelect = (it) => `
    <select class="procsel" data-pi-status="${esc(it.id)}">
      ${PROC_ST.map(s => `<option value="${s}"${s === it.status ? ' selected' : ''}>${esc(t.procSt[s])}</option>`).join('')}
    </select>`;

  const editRow = (it) => `<tr>
    <td><input class="cellinput" data-pi="${esc(it.id)}" data-field="name" value="${esc(it.name || '')}" placeholder="${esc(t.procItem)}" /></td>
    <td><input class="cellinput" data-pi="${esc(it.id)}" data-field="description" value="${esc(it.description || '')}" placeholder="${esc(t.description)}" /></td>
    <td>${refCell(it)}</td>
    <td>${statusSelect(it)}</td>
    <td class="proc-actions"><button class="x" data-pi-del="${esc(it.id)}" title="${esc(t.remove)}" aria-label="${esc(t.remove)}">✕</button></td>
  </tr>`;

  const viewRow = (it) => `<tr>
    <td>${esc(it.name || '—')}</td>
    <td class="${it.description ? '' : 'muted'}">${esc(it.description || '—')}</td>
    <td>${itemFile(it.id) ? `<button class="link" data-file="${esc(itemFile(it.id).id)}">${esc(t.procView)}</button>` : '<span class="muted">—</span>'}</td>
    <td>${procStatusPill(it.status, lang)}</td>
  </tr>`;

  const cols = canEdit ? 5 : 4;

  const procurement = `
<section class="card">
  <div class="card__head"><h2>${esc(t.procHead)}</h2><span class="muted small">${items.length}</span></div>
  <div class="tblwrap"><table class="tbl tbl--tight tbl--proc">
    <thead><tr>
      <th>${esc(t.procItem)}</th><th>${esc(t.description)}</th>
      <th>${esc(t.procRef)}</th><th>${esc(t.status)}</th>${canEdit ? '<th></th>' : ''}
    </tr></thead>
    <tbody>
      ${items.length
        ? items.map(canEdit ? editRow : viewRow).join('')
        : `<tr><td class="tbl__empty" colspan="${cols}">${esc(t.procNone)}</td></tr>`}
    </tbody>
  </table></div>
  ${canEdit ? `<div class="actions"><button type="button" class="btn btn--sm" data-pi-add>${esc(t.procAdd)}</button></div>` : ''}
  ${canEdit ? `<form id="procFileForm" class="inlineform" style="border-bottom:0">
    ${dropField('procFiles', t.procList, t.procListHint, { accept: 'image/*,.pdf,.xls,.xlsx,.csv,.doc,.docx', multiple: true })}
    <div class="actions"><button type="submit" class="btn btn--sm">${esc(t.save)}</button></div>
  </form>` : ''}
  ${procListFiles.length ? `<ul class="filelist">${procListFiles.map(fileRow).join('')}</ul>` : ''}
  ${canEdit ? '' : `<p class="note">${esc(t.prodOnlyTeam)}</p>`}
</section>`;

  const production = `
<section class="card">
  <div class="card__head"><h2>${esc(t.prodHead)}</h2></div>
  <form id="prodForm" class="inlineform" style="border-bottom:0">
    <div class="fields">
      <label class="f f--wide"><span>${esc(t.prodSchedule)}</span>
        <textarea id="prodSched" rows="5" placeholder="${esc(t.prodScheduleHint)}"${canEdit ? '' : ' disabled'}>${esc(prod?.schedule || '')}</textarea></label>
      <label class="f"><span>${esc(t.prodDelivery)}</span>
        <input id="prodDelivery" type="date" value="${esc(prod?.site_delivery_on || '')}"${canEdit ? '' : ' disabled'} /></label>
    </div>
    ${canEdit ? `<h3 class="subhead">${esc(t.prodFiles)}</h3>
      ${dropField('prodFiles', t.prodFiles, t.prodFilesHint, { accept: 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.dwg,.dxf', multiple: true })}
      <div class="actions"><button type="submit" class="btn btn--primary btn--sm">${esc(t.save)}</button></div>` : ''}
  </form>
  <div style="padding:0 16px 14px">
    <h3 class="subhead">${esc(t.prodFilesHead)}</h3>
    ${prodFiles.length ? `<ul class="filelist">${prodFiles.map(fileRow).join('')}</ul>` : `<p class="note">${esc(t.prodNoFiles)}</p>`}
  </div>
</section>`;

  return procurement + '\n' + production;
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
        <select id="pSize">${sizeOptionsHtml(lang, 'M')}</select></label>
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
      ${dropField('pRfp', t.rfp, t.rfpHint, { accept: '.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt', multiple: true, tall: true })}
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

/**
 * Teams down the side, months across the top, free days in the cells.
 *
 * The free-day count is the headline in every cell and the colour only
 * repeats it, because a calendar whose meaning lives in a red square is
 * unreadable to a colourblind manager and unprintable in black and white.
 */
export function workloadCalendar(lang, load, stages, size = 'M', opts = {}) {
  const t = DSTR[lang];
  if (!load || !load.length) return '';
  const teams = Object.keys(stages || {}).filter(k => k in (load[0].teams || {}));
  if (!teams.length) return '';
  const free = firstFreeMonth(load, stages, size);

  const cell = (m, team) => {
    const c = m.teams[team] || { free: 0, capacity: 0, pct: 0 };
    const need = Number(stages[team]?.days?.[size]) || 0;
    /* Three states, and the middle one is the useful one: room, but not
       enough for a whole project of this size. A manager who sees "3 free"
       and submits anyway is the person this column is for. */
    const state = !c.capacity ? 'none' : c.free >= need ? 'ok' : c.free > 0 ? 'tight' : 'full';
    /* The caption says "free of 63", not "of 63". Without the word, a big
       number over a long bar is ambiguous — 15 over a three-quarters-full bar
       could be read as fifteen days of work booked. It is fifteen days left. */
    const label = c.capacity ? `${c.free} ${t.wcFreeOf.replace('{n}', c.capacity)}` : t.wcNoPeople;
    return `
      <td class="wc__c wc__c--${state}" title="${esc(`${deptName(team, lang)} · ${capacityMonthLabel(m.key, lang)} — ${c.committed}/${c.capacity} ${t.wcPersonDays} (${c.pct}%)`)}">
        <span class="wc__free">${c.capacity ? c.free : '—'}</span>
        <span class="wc__of">${esc(c.capacity ? t.wcFreeOf.replace('{n}', c.capacity) : t.wcNoPeople)}</span>
        <!-- The bar is the FREE share, not the used one, so its length agrees
             with the number above it. Drawn the other way round, October's
             "15 free of 63" carried a three-quarters-full green bar, and the
             bar is the thing people read first. -->
        <span class="wc__bar"><i style="width:${
          c.capacity ? Math.max(0, Math.min(100, Math.round((c.free / c.capacity) * 100))) : 0}%"></i></span>
        <span class="sr">${esc(label)}</span>
      </td>`;
  };

  /* Three answers, in order of what a reader can do about it. An empty team
     is named first because it is the one that is fixable today and the one
     that would otherwise be reported as "we are simply full for six months". */
  const answer = free.staffless?.length
    ? t.wcAnswerNobody.replace('{teams}',
        free.staffless.map(x => deptName(x, lang)).join(lang === 'ar' ? '، ' : ', '))
    : free.all
      ? t.wcAnswer.replace('{m}', capacityMonthLabel(free.all, lang)).replace('{size}', t.sizes[size])
      : t.wcAnswerNone.replace('{size}', t.sizes[size]).replace('{n}', load.length);

  /* The headline is about the whole project, so one empty team makes it read
     "never" — and that would bury the fact that 2D opens up in October and 3D
     in December, which is what you actually plan around. Print the per-team
     months underneath, always. */
  const perTeamLine = teams.length < 2 ? '' : t.wcPerTeam
    .replace('{size}', t.sizes[size])
    .replace('{list}', teams.map(team => `${deptName(team, lang)} — ${
      free.per[team] ? capacityMonthLabel(free.per[team], lang)
                     : free.staffless?.includes(team) ? t.wcNoPeople
                     : t.wcNever.replace('{n}', load.length)}`)
      .join(lang === 'ar' ? '، ' : '; '));

  return `
<section class="card">
  <div class="card__head">
    <h2>${esc(t.wcTitle)}</h2>
    <span class="muted small">${esc(t.wcSub)}</span>
  </div>
  <div class="wc">
    <table class="wc__t">
      <thead>
        <tr>
          <th class="wc__corner">${esc(t.teamsCol)}</th>
          ${load.map(m => `<th class="wc__m${m.partial ? ' is-part' : ''}">
            ${esc(capacityMonthLabel(m.key, lang))}
            ${m.partial ? `<span class="wc__part">${esc(t.wcRestOf)}</span>` : ''}
          </th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${teams.map(team => {
          const heads = load[0].teams[team]?.headcount || 0;
          /* "0 people" is a sentence no one writes; in Arabic it is also
             ungrammatical. Zero is the case that matters most here, so it
             gets its own wording rather than a plural with a nought in it. */
          const sub = (heads === 0 ? t.wcHead0 : heads === 1 ? t.wcHead1 : t.wcHead)
            .replace('{p}', heads)
            .replace('{d}', stages[team]?.days?.[size] ?? '—')
            .replace('{size}', t.sizes[size]);
          return `
          <tr>
            <th class="wc__team">
              <i style="background:${esc(db.dept(team)?.colour || 'var(--ink3)')}"></i>
              <span>${esc(deptName(team, lang))}</span>
              <span class="muted small">${esc(sub)}</span>
            </th>
            ${heads === 0
              /* Six identical "no one on this team" cells is noise standing in
                 for one fact. Say it once, across the row, where it reads as
                 the finding it is instead of a pattern in the wallpaper. */
              ? `<td class="wc__c wc__c--none wc__c--row" colspan="${load.length}">
                   <span class="wc__nobody">${esc(t.wcNobodyRow)}</span>
                 </td>`
              : load.map(m => cell(m, team)).join('')}
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>
  <p class="note note--lead">${esc(answer)}</p>
  ${perTeamLine ? `<p class="note">${esc(perTeamLine)}</p>` : ''}
  ${opts.staleHolidays ? `<p class="note note--warn">${esc(t.wcStale)}</p>` : ''}
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
  </div>
  ${(() => {
    /* Naming the bottleneck turns an unarguable date into something a manager
       can act on. "Delivers in November" invites a shrug; "3D is 64 working
       days deep — 36 open stages between 2 people" points at the two levers
       that actually move it. */
    const team = real.bottleneck?.team;
    const d = est.depth?.[team];
    if (!d || !d.workingDays || gap <= 0) return '';
    return `<p class="note">${esc(t.whyLate
      .replace('{team}', deptName(team, lang))
      .replace('{days}', d.workingDays)
      .replace('{stages}', d.stages)
      .replace('{people}', d.people))}</p>`;
  })()}`;
}

/* ----------------------------------- leads -------------------------------- */

/* The company we can honestly show. `company` when somebody recorded one,
   otherwise the host of the website — "aramco.com" tells a reader what they
   need. Never `source`: that is the name of an Asana list, and printing it
   here is what made all 70 Sales Leads claim to work at a company called
   "Sales Leads". */
export const leadCompany = (l) => {
  if (l?.company) return l.company;
  if (!l?.website) return '';
  try { return new URL(l.website).host.replace(/^www\./, ''); }
  catch { return String(l.website).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]; }
};

export const LF_DEFAULT = { owner: '', status: '', source: '', follow: '', sort: 'follow' };

/* One rule for which leads are shown, read by the table and by the count
   above it, for the same reason the projects filter has one. */
export function filterLeads(leads, lf = {}) {
  const f = { ...LF_DEFAULT, ...lf };
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const inDays = (d) => Math.round((parse(d) - midnight) / 86400000);

  let rows = (leads || []).slice();
  if (f.status) rows = rows.filter(l => l.status === f.status);
  if (f.source) rows = rows.filter(l => l.source === f.source);
  if (f.owner) rows = f.owner === '~none'
    ? rows.filter(l => !l.owner_id)
    : rows.filter(l => l.owner_id === f.owner);

  if (f.follow === 'overdue') rows = rows.filter(l => l.next_follow_up_on && inDays(l.next_follow_up_on) < 0);
  else if (f.follow === 'd7')  rows = rows.filter(l => l.next_follow_up_on && inDays(l.next_follow_up_on) >= 0 && inDays(l.next_follow_up_on) <= 7);
  else if (f.follow === 'd30') rows = rows.filter(l => l.next_follow_up_on && inDays(l.next_follow_up_on) >= 0 && inDays(l.next_follow_up_on) <= 30);
  else if (f.follow === 'none') rows = rows.filter(l => !l.next_follow_up_on);

  const sorters = {
    // Undated last: 326 leads have no follow-up date and they must not bury
    // the 94 that do.
    follow: (a, b) => {
      if (!a.next_follow_up_on && !b.next_follow_up_on) return 0;
      if (!a.next_follow_up_on) return 1;
      if (!b.next_follow_up_on) return -1;
      return parse(a.next_follow_up_on) - parse(b.next_follow_up_on);
    },
    added:   (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
    name:    (a, b) => String(a.name).localeCompare(String(b.name)),
    company: (a, b) => leadCompany(a).localeCompare(leadCompany(b)),
  };
  return rows.sort(sorters[f.sort] || sorters.follow);
}

function leadFilterBar(lang, ctx, all) {
  const t = DSTR[lang];
  const f = { ...LF_DEFAULT, ...(ctx.lf || {}) };
  const people = ctx.people || [];

  const tally = (fn) => {
    const m = new Map();
    all.forEach(l => { const k = fn(l); if (k) m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const owners = tally(l => l.owner_id)
    .map(([id, n]) => ({ id, n, name: people.find(p => p.id === id)?.full_name
                                   || all.find(l => l.owner_id === id)?.owner?.full_name || id }));
  const noOwner = all.filter(l => !l.owner_id).length;
  const statuses = tally(l => l.status);
  const sources  = tally(l => l.source);

  const sel = (key, label, options) => `
    <label class="f f--sm"><span>${esc(label)}</span>
      <select data-lf="${esc(key)}">
        ${options.map(o => `<option value="${esc(o.v)}"${o.v === f[key] ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}
      </select></label>`;

  const active = ['owner', 'status', 'source', 'follow'].some(k => f[k]) || f.sort !== 'follow';

  return `
<div class="filterbar">
  ${sel('owner', t.owner, [{ v: '', l: t.anyOwner },
    ...owners.map(o => ({ v: o.id, l: `${o.name} (${o.n})` })),
    ...(noOwner ? [{ v: '~none', l: `${t.unassignedOwner} (${noOwner})` }] : [])])}
  ${sel('status', t.status, [{ v: '', l: t.anyStatus },
    ...statuses.map(([s, n]) => ({ v: s, l: `${t.st[s] || String(s).replace(/_/g, ' ')} (${n})` }))])}
  ${sel('source', t.source_, [{ v: '', l: t.anySource },
    ...sources.map(([s, n]) => ({ v: s, l: `${s} (${n})` }))])}
  ${sel('follow', t.followUp, [{ v: '', l: t.anyFollow },
    { v: 'overdue', l: t.followOverdue }, { v: 'd7', l: t.follow7 },
    { v: 'd30', l: t.follow30 }, { v: 'none', l: t.followNone }])}
  ${sel('sort', t.sortBy, [{ v: 'follow', l: t.sortFollow }, { v: 'added', l: t.sortAdded },
    { v: 'name', l: t.sortName }, { v: 'company', l: t.sortCompany }])}
  ${active ? `<button class="btn btn--sm" data-lf-clear="1">${esc(t.clearFilters)}</button>` : ''}
</div>`;
}

/* ========================= THE BUSINESS PIPELINE =========================

   420 leads across ten raw statuses, as four columns you can act on. The
   table on the Leads screen answers "tell me about this lead"; this answers
   "where is the business", which is a different question and wants a
   different shape.

   The mapping is the whole design, so it is stated once, here, and read by
   the board, the counts and the tests:

   NEW is its own column rather than folded into contacted. 211 of 420 leads
   have never been touched — the largest single fact in this pipeline — and
   burying it inside "contacted" would hide exactly the distinction that
   decides who gets called today.

   CONTACTED holds the four "we tried and could not reach them" outcomes
   alongside plain contacted, because from a reader's point of view they are
   the same event: somebody attempted contact. They are drawn muted, since
   nothing more will happen to them without new contact details.

   CLOSED is won only, as asked. `not_interested` is therefore not closed —
   but it is not live either, so it sits in Contacted wearing the same muted
   treatment rather than padding "in progress" with work that will never
   move. A column that overstates live work is the one failure this screen
   cannot afford.
   ========================================================================= */

export const PIPE_STAGES = [
  { key: 'new',        statuses: ['new', 'not_contacted'] },
  { key: 'contacted',  statuses: ['contacted', 'wrong_number', 'no_answer',
                                  'not_delivered', 'address_not_found', 'not_interested'] },
  { key: 'progress',   statuses: ['interested', 'follow_up', 'qualified', 'proposal'] },
  { key: 'closed',     statuses: ['won'] },
];

/* Statuses that will not move again without something changing outside this
   app. They stay in their column but read as settled, not as work in hand. */
const SPENT = new Set(['wrong_number', 'no_answer', 'not_delivered',
                       'address_not_found', 'not_interested']);

export function pipelineStages(leads = []) {
  const seen = new Set();
  const cols = PIPE_STAGES.map(st => {
    const rows = (leads || []).filter(l => st.statuses.includes(l.status));
    rows.forEach(l => seen.add(l.id));
    return { ...st, leads: rows, spent: rows.filter(l => SPENT.has(l.status)).length };
  });
  /* Anything the mapping does not name. A status added to the database next
     month must appear somewhere rather than silently vanishing from a board
     people use to decide what to work on. */
  const rest = (leads || []).filter(l => !seen.has(l.id));
  return { cols, unmapped: rest };
}

/* ========================== PERFORMANCE SCORING ==========================

   One score per person per quarter, out of 100.

   For Business development and Project management it is 60 automatic + 40
   from the supervisor's form. For every other team the automatic half has no
   meaning, so the form is the whole score — inventing a metric for a 3D
   designer just to keep the arithmetic symmetrical would be worse than
   having none.

   THE AUTOMATIC HALF SCORES ZERO WHEN THERE IS NO DATA. That is a deliberate
   instruction and not an accident, but it is a loaded one right now: no
   project in the database has ever been marked won or lost, so today every
   project manager's automatic 60 is zero through no fault of their own.
   Every automatic figure therefore carries its own coverage — how many rows
   it was computed from — and the screen prints it beside the number. A zero
   that explains itself can be argued with; a bare zero on an appraisal
   cannot.
   ========================================================================= */

/* The fourteen KPIs from the company's evaluation sheet, in the sheet's own
   order. Arabic is the original; the English is a translation for the other
   half of the interface, not a second source of truth. */
export const KPI_ROWS = [
  { k: 'accuracy',    ar: 'دقة إنجاز المهام',                                    en: 'Accuracy of task completion' },
  { k: 'comms',       ar: 'مهارات التواصل والتفاعل',                              en: 'Communication and interaction' },
  { k: 'resilience',  ar: 'المرونه وتحمل الضغط',                                  en: 'Flexibility and working under pressure' },
  { k: 'values',      ar: 'الالتزام بقيم وأخلاقيات المؤسسة',                       en: 'Commitment to company values and ethics' },
  { k: 'timemgmt',    ar: 'القدرة على إدارة الوقت وتنظيم العمل',                    en: 'Time management and organisation' },
  { k: 'attendance',  ar: 'الالتزام بمواعيد الحضور والانصراف',                      en: 'Punctuality of arrival and departure' },
  { k: 'satisfaction',ar: 'معدل رضا العملاء والمستخدمين',                          en: 'Client and user satisfaction' },
  { k: 'technical',   ar: 'استخدام المهارات التقنية الحديثة',                       en: 'Use of current technical skills' },
  { k: 'reqdata',     ar: 'الالتزام بمتطلبات تنفيذ المشروع (توفير البيانات)',        en: 'Project requirements — providing data' },
  { k: 'reqstruct',   ar: 'الالتزام بمتطلبات تنفيذ المشروع (الهيكليات)',            en: 'Project requirements — structures' },
  { k: 'sitework',    ar: 'الالتزام بمتابعة تنفيذ المشروع (التنفيذ الميداني)',       en: 'Delivery follow-up — on-site execution' },
  { k: 'certs',       ar: 'الالتزام بمتابعة تنفيذ المشروع (شهادات الانجاز)',        en: 'Delivery follow-up — completion certificates' },
  { k: 'invoices',    ar: 'تصدير ومتابعة الفواتير',                                en: 'Issuing and following up invoices' },
  { k: 'collections', ar: 'التحصيل',                                            en: 'Collections' },
];

/* The sheet weights all fourteen at 10%, which totals 140% and caps its own
   "total" at 7 rather than 100. Rather than carry that arithmetic forward,
   the score is the share of the achievable maximum: every KPI at 5 is 100%,
   every KPI at 3 is 60%. Equal weighting is preserved — only the scale moves.
   Unrated rows are excluded from both halves of the fraction, so a partly
   filled form reads as what it is instead of scoring the blanks as zero. */
export function formScore(ratings = {}) {
  let got = 0, max = 0, answered = 0;
  for (const row of KPI_ROWS) {
    const v = Number(ratings?.[row.k]);
    if (!Number.isFinite(v) || v < 1 || v > 5) continue;
    got += v; max += 5; answered++;
  }
  return {
    answered, of: KPI_ROWS.length,
    pct: max ? Math.round((got / max) * 100) : null,
  };
}

/* Leads this person owns that reached "won", over the leads they own. The
   denominator is ownership, not activity: a lead nobody was given is not a
   conversion anyone failed to make. 363 of 420 leads currently have no owner
   at all, which is why `covered` travels with the number. */
export function salesConversion(personId, leads = []) {
  const mine = (leads || []).filter(l => l.owner_id === personId);
  const won = mine.filter(l => l.status === 'won').length;
  return {
    kind: 'sales', covered: mine.length, hit: won,
    pct: mine.length ? Math.round((won / mine.length) * 100) : 0,
    measurable: mine.length > 0,
  };
}

/* Proposals this person owns that came back won, over the ones that got a
   verdict either way. Projects still sitting at "submitted" are excluded:
   Etemad not having answered yet is not a loss, and counting it as one would
   punish a PM for somebody else's silence. */
export function rfpWinRate(personId, projects = []) {
  const mine = (projects || []).filter(p => p.owner_id === personId);
  const decided = mine.filter(p => p.status === 'won' || p.status === 'lost');
  const won = decided.filter(p => p.status === 'won').length;
  return {
    kind: 'rfp', covered: decided.length, hit: won,
    awaiting: mine.filter(p => p.status === 'submitted').length,
    pct: decided.length ? Math.round((won / decided.length) * 100) : 0,
    measurable: decided.length > 0,
  };
}

/** Which half-and-half applies to a person, by department. */
export const AUTO_WEIGHT = 60, FORM_WEIGHT = 40;
export const autoKindFor = (dept) =>
  dept === 'bd' ? 'sales' : dept === 'pm' ? 'rfp' : null;

/**
 * The whole score for one person.
 * @param person  a profile row
 * @param review  their review row for the period, or null
 * @param ctx     { leads, projects }
 */
export function personScore(person, review, ctx = {}) {
  const form = formScore(review?.ratings);
  const kind = autoKindFor(person?.department_id);
  const auto = kind === 'sales' ? salesConversion(person.id, ctx.leads)
             : kind === 'rfp'   ? rfpWinRate(person.id, ctx.projects)
             : null;

  /* No automatic half: the form is the whole score, and a person with no
     review yet has no score rather than a zero. Those are different facts and
     the screen says so. */
  if (!auto) {
    return { kind: null, auto: null, form,
             formPoints: form.pct, autoPoints: null,
             total: form.pct, reviewed: form.answered > 0 };
  }
  const autoPoints = Math.round((auto.pct / 100) * AUTO_WEIGHT);
  const formPoints = form.pct === null ? null : Math.round((form.pct / 100) * FORM_WEIGHT);
  return {
    kind, auto, form, autoPoints, formPoints,
    /* An unfilled form contributes nothing rather than blocking the score —
       the automatic half is real on its own and a supervisor who has not got
       to the form yet should not make the number disappear. */
    total: autoPoints + (formPoints ?? 0),
    reviewed: form.answered > 0,
  };
}

/**
 * Whether a score is a real number rather than an absence.
 *
 * scoreCard and teamScore MUST agree on this. A card that reads "no score yet"
 * while that same person sits inside the team average is a contradiction the
 * supervisor can see on one screen, so both ask this one question.
 */
export const hasScore = (sc) => sc && sc.total !== null && (sc.reviewed || !!sc.auto);

/**
 * The roll-up for one supervisor's people.
 *
 * The average is over their REPORTS only \u2014 the supervisor's own score stays at
 * the top of the screen, because it is their appraisal, not their team's result.
 * People with no score at all are left out of the average rather than counted as
 * zero, and the count is returned so the screen can say so out loud; an average
 * that quietly skips people is worse than no average.
 *
 * `blank` is the number of scores that ARE counted but rest on nothing recorded
 * \u2014 no verdict, no review. Those are genuine zeros, as instructed, but a
 * supervisor reading a low team number deserves to know it is a records problem
 * and not a people problem.
 */
export function teamScore(scores = []) {
  const counted = scores.filter(hasScore);
  const blank = counted.filter(sc => !sc.reviewed && sc.auto && !sc.auto.measurable).length;
  return {
    total: counted.length
      ? Math.round(counted.reduce((n, sc) => n + sc.total, 0) / counted.length)
      : null,
    scored: counted.length,
    of: scores.length,
    blank,
  };
}

/** '2026-Q3' for a date. Reviews are quarterly, as on the company's sheet. */
export function quarterOf(d = new Date()) {
  const x = d instanceof Date ? d : parse(d);
  return `${x.getUTCFullYear()}-Q${Math.floor(x.getUTCMonth() / 3) + 1}`;
}

/**
 * One person's score, as a card. Used for yourself at the top of the screen
 * and for each of your reports below it.
 */
function scoreCard(lang, person, sc, opts = {}) {
  const t = DSTR[lang];
  const mine = opts.mine;
  const shown = sc.total === null ? null : sc.total;

  /* The automatic half always states what it was computed from. A "0" beside
     "from 0 proposals with a verdict" is a fact about the records; a bare "0"
     on somebody's appraisal is an accusation. */
  const autoLine = !sc.auto
    ? `<p class="muted small">${esc(mine ? t.perfFormOnly : t.perfFormOnlyOther)}</p>`
    : (() => {
    const a = sc.auto;
    const label = a.kind === 'sales' ? t.perfSales : t.perfRfp;
    const cov = a.kind === 'sales'
      ? (mine ? t.perfCovSales : t.perfCovSalesOther).replace('{n}', a.covered)
      : t.perfCovRfp.replace('{n}', a.covered);
    const warn = a.measurable ? '' : (a.kind === 'sales'
      ? (mine ? t.perfNoSales : t.perfNoSalesOther)
      : (mine ? t.perfNoRfp : t.perfNoRfpOther).replace('{a}', a.awaiting || 0));
    return `
      <div class="pscore__part">
        <span class="pscore__k">${esc(label)}</span>
        <span class="pscore__v">${a.pct}%</span>
        <span class="pscore__n">${esc(cov)}</span>
        <span class="pscore__pts">${sc.autoPoints} ${esc(t.perfOf)} ${AUTO_WEIGHT} ${esc(t.perfPts)}</span>
      </div>
      ${warn ? `<p class="note note--warn">${esc(warn)}</p>` : ''}`;
  })();

  const formLine = `
    <div class="pscore__part">
      <span class="pscore__k">${esc(mine ? t.perfForm : t.perfFormOther)}</span>
      <span class="pscore__v">${sc.form.pct === null ? esc(t.perfUnrated) : sc.form.pct + '%'}</span>
      <span class="pscore__n">${sc.form.answered}/${sc.form.of}</span>
      <span class="pscore__pts">${sc.formPoints === null ? esc(t.perfNotFilled)
        : `${sc.formPoints} ${esc(t.perfOf)} ${sc.auto ? FORM_WEIGHT : 100} ${esc(t.perfPts)}`}</span>
    </div>`;

  return `
  <div class="pscore${mine ? ' pscore--mine' : ''}">
    <div class="pscore__head">
      <span class="pscore__who">${esc(mine ? t.perfMine : (person.full_name || person.email || ''))}</span>
      ${!mine ? `<span class="muted small">${esc(deptName(person.department_id, lang))}</span>` : ''}
    </div>
    ${!hasScore(sc)
      ? `<div class="pscore__big pscore__big--none">${esc(t.perfNoScore)}</div>
         <p class="muted small">${esc(mine ? t.perfNoScoreSub : t.perfNoScoreSubOther)}</p>`
      : `<div class="pscore__big"><b>${shown}</b><i>/100</i></div>
         <div class="pscore__bar"><span style="width:${Math.min(shown, 100)}%"></span></div>`}
    ${autoLine}
    ${formLine}
  </div>`;
}

/** The 14-row form a supervisor fills in for one person. */
function reviewForm(lang, person, review) {
  const t = DSTR[lang];
  const r = review?.ratings || {};
  return `
  <form class="revform" data-review="${esc(person.id)}">
    <table class="tbl tbl--tight">
      <thead><tr><th>${esc(t.perfKpi)}</th><th class="num">${esc(t.perfRate)}</th></tr></thead>
      <tbody>
        ${KPI_ROWS.map(row => `<tr>
          <td class="small">${esc(lang === 'ar' ? row.ar : row.en)}</td>
          <td class="num">
            <select class="btn--sm rk" data-k="${esc(row.k)}">
              <option value=""${r[row.k] ? '' : ' selected'}>—</option>
              ${[1, 2, 3, 4, 5].map(n =>
                `<option value="${n}"${Number(r[row.k]) === n ? ' selected' : ''}>${n}</option>`).join('')}
            </select>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
    <label class="f"><span>${esc(t.perfStrengths)}</span>
      <textarea class="rstr" rows="2">${esc(review?.strengths || '')}</textarea></label>
    <label class="f"><span>${esc(t.perfImprove)}</span>
      <textarea class="rimp" rows="2">${esc(review?.improvements || '')}</textarea></label>
    <div class="actions actions--end">
      <button class="btn btn--primary btn--sm" type="submit">${esc(t.perfSave)}</button>
    </div>
  </form>`;
}

export function performanceView(lang, ctx) {
  const t = DSTR[lang];
  const me = db.state.me;
  if (!me) return '';
  const period = ctx.period || quarterOf();
  const bySubject = new Map((ctx.reviews || []).map(r => [r.subject_id, r]));
  const scoreCtx = { leads: ctx.leads || [], projects: ctx.projects || [] };

  const mine = personScore(me, bySubject.get(me.id), scoreCtx);

  /* Only the people currently assigned to me. This mirrors the read policy
     rather than reimplementing it: the rows simply are not there for anyone
     else, so a bug here cannot widen what a supervisor sees. */
  const team = (ctx.people || []).filter(p => p.supervisor_id === me.id && p.is_active);
  /* Scored once, then used for both the roll-up and the cards, so the total can
     never be an average of numbers different from the ones printed under it. */
  const teamScores = team.map(p => personScore(p, bySubject.get(p.id), scoreCtx));
  const roll = teamScore(teamScores);

  return `
<section class="card">
  <div class="card__head">
    <h2>${esc(t.perf)}</h2>
    <span class="muted small">${esc(t.perfQuarter)} ${esc(period)}</span>
  </div>
  <div class="pgrid">${scoreCard(lang, me, mine, { mine: true })}</div>
  <p class="note">${esc(t.perfPrivate)}</p>
</section>

${team.length ? `
<section class="card">
  <div class="card__head">
    <h2>${esc(t.perfMyTeam)}</h2><span class="muted small">${team.length}</span>
  </div>
  <div class="pteam">
    <div class="pteam__k">${esc(t.perfTeamTotal)}</div>
    ${roll.total === null
      ? `<div class="pteam__big pteam__big--none">${esc(t.perfTeamNone)}</div>`
      : `<div class="pteam__big"><b>${roll.total}</b><i>/100</i></div>
         <div class="pscore__bar"><span style="width:${Math.min(roll.total, 100)}%"></span></div>`}
    <div class="pteam__cov muted small">${esc(t.perfTeamCov.replace('{n}', roll.scored).replace('{m}', roll.of))}</div>
    ${roll.blank ? `<p class="note note--warn">${esc(t.perfTeamBlank.replace('{n}', roll.blank))}</p>` : ''}
  </div>
  ${team.map((p, i) => {
    const sc = teamScores[i];
    return `
    <div class="preview">
      ${scoreCard(lang, p, sc)}
      <details class="pdet"${ctx.openReview === p.id ? ' open' : ''}>
        <summary>${esc(t.perfReview)}</summary>
        ${reviewForm(lang, p, bySubject.get(p.id))}
      </details>
    </div>`;
  }).join('')}
</section>` : ''}`;
}

export function pipelineView(lang, ctx) {
  const t = DSTR[lang];
  const leads = ctx.leads || [];
  const { cols, unmapped } = pipelineStages(leads);
  const live = cols.slice(0, 3).reduce((n, c) => n + c.leads.length - c.spent, 0);

  const card = (l) => {
    const late = lateBy(l.next_follow_up_on);
    const co = leadCompany(l);
    const spent = SPENT.has(l.status);
    return `
      <button class="deal deal--btn${spent ? ' is-spent' : ''}" data-act="go" data-route="#/l/${esc(l.id)}">
        <span class="deal__name">${esc(l.name)}</span>
        ${co ? `<span class="muted small">${esc(co)}</span>` : ''}
        <span class="deal__meta">
          <span class="muted small">${esc(l.owner?.full_name || t.unassigned)}</span>
          <span class="small ${late ? 'bad' : 'muted'}">${esc(fmt(l.next_follow_up_on, lang))}</span>
        </span>
        <!-- Only on settled cards, and only because the reason matters:
             "wrong number" and "not interested" are different problems. A
             pill on a won card would just repeat its own column heading in
             different words — the shared vocabulary calls won "Accepted".
             (No backticks in this comment: it lives inside a template
             literal, and one would end the string.) -->
        ${spent ? statusPill(l.status, lang) : ''}
      </button>`;
  };

  /* A column of 176 cards is a scroll, not a screen. Show the ones a person
     could act on and say plainly how many are behind them, rather than
     rendering everything and calling that thoroughness. */
  const CAP = 40;

  return `
<div class="kpis kpis--5">
  ${kpi(live, t.pipeLive, { colour: 'var(--brand)',
    sub: `${leads.length} ${lang === 'ar' ? 'في القائمة' : 'in the list'}` })}
  ${cols.map(c => kpi(c.leads.length, t.pipe[c.key], {
    colour: c.key === 'closed' ? 'var(--ok)' : c.key === 'new' ? 'var(--ink3)' : 'var(--warn)',
    sub: c.spent ? t.pipeSpent.replace('{n}', c.spent) : '',
  })).join('')}
</div>

<section class="card">
  <div class="card__head">
    <h2>${esc(t.pipeline)}</h2>
    <span class="muted small">${esc(t.pipelineSub)}</span>
  </div>
  <div class="board">
    ${cols.map(c => `
      <div class="bcol">
        <div class="bcol__title"><span>${esc(t.pipe[c.key])}</span><span>${c.leads.length}</span></div>
        ${c.leads.length
          ? c.leads.slice(0, CAP).map(card).join('') +
            (c.leads.length > CAP
              ? `<p class="muted small">${esc(t.pipeMore
                  .replace('{n}', c.leads.length - CAP))}</p>` : '')
          : `<p class="muted small">${esc(t.pipeNone)}</p>`}
      </div>`).join('')}
  </div>
  ${unmapped.length ? `<p class="note note--warn">${esc(t.pipeUnmapped
      .replace('{n}', unmapped.length)
      .replace('{s}', [...new Set(unmapped.map(l => l.status))].join(', ')))}</p>` : ''}
</section>`;
}

export function leadsView(lang, ctx) {
  const t = DSTR[lang];
  const leads = ctx.leads || [];
  /* Only the statuses that actually occur, in pipeline order, so the tile row
     does not carry four permanent zeroes. */
  const ORDER = ['new', 'not_contacted', 'contacted', 'interested', 'follow_up',
                 'qualified', 'proposal', 'won', 'not_interested', 'lost',
                 'wrong_number', 'no_answer', 'not_delivered', 'address_not_found'];
  const STATUSES = ORDER.filter(s => leads.some(l => l.status === s)).slice(0, 6);
  const counts = Object.fromEntries(STATUSES.map(s => [s, leads.filter(l => l.status === s).length]));
  const stale = leads.filter(l => l.status !== 'won' && l.status !== 'lost' && lateBy(l.next_follow_up_on)).length;
  const open = leads.filter(l => !['won', 'lost'].includes(l.status)).length;
  const matched = filterLeads(leads, ctx.lf);
  const rows = matched.slice(0, 200);
  const anyTitle = rows.some(l => l.title);

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
    <span class="muted small">${esc(t.showingN.replace('{n}', matched.length).replace('{t}', leads.length))}</span>
    <button class="btn btn--primary btn--sm" style="margin-inline-start:auto" data-act="newlead">${esc(t.addLead)}</button>
  </div>
  <div id="leadForm"></div>
  ${leadFilterBar(lang, ctx, leads)}
  <div class="tblwrap">
  <table class="tbl">
    <thead><tr>
      <th>${esc(t.name)}</th>
      ${anyTitle ? `<th>${esc(t.jobTitle)}</th>` : ''}
      <th>${esc(t.company)}</th><th>${esc(t.status)}</th>
      <th class="num">${esc(t.followUp)}</th><th>${esc(t.owner)}</th><th></th>
    </tr></thead>
    <tbody>
      ${rows.length ? rows.map(l => {
        const late = lateBy(l.next_follow_up_on);
        const co = leadCompany(l);
        /* The status dropdown offers this lead's own value plus the full
           vocabulary, so a row already marked "Address not found" does not
           silently reset to something else the moment anyone touches it. */
        const opts = [...new Set([...ORDER, l.status])].filter(Boolean);
        return `<tr>
          <td><button class="link" data-act="go" data-route="#/l/${esc(l.id)}">${esc(l.name)}</button>
            ${l.email ? `<span class="muted small block">${esc(l.email)}</span>` : ''}</td>
          ${anyTitle ? `<td class="small ${l.title ? '' : 'muted'}">${esc(l.title || '—')}</td>` : ''}
          <td class="small ${co ? '' : 'muted'}">${esc(co || '—')}</td>
          <td>
            <select class="leadStatus btn--sm" data-lead="${esc(l.id)}">
              ${opts.map(s => `<option value="${s}"${s === l.status ? ' selected' : ''}>${esc(t.st[s] || String(s).replace(/_/g, ' '))}</option>`).join('')}
            </select>
          </td>
          <td class="num ${late ? 'bad' : 'muted'}">${esc(fmt(l.next_follow_up_on, lang))}</td>
          <td class="muted small">${esc(l.owner?.full_name || t.unassigned)}</td>
          <td class="num"><button class="link small" data-note="${esc(l.id)}">${esc(t.logNote)}</button></td>
        </tr>`;
      }).join('')
      : `<tr><td class="tbl__empty" colspan="7">${esc(t.noLeadMatch)}</td></tr>`}
    </tbody>
  </table>
  </div>
  ${matched.length > rows.length ? `<p class="note">${esc(lang === 'ar'
    ? `تعرض ${rows.length} من ${matched.length}. ضيّق التصفية للوصول إلى البقية.`
    : `Showing ${rows.length} of ${matched.length}. Narrow the filters to reach the rest.`)}</p>` : ''}
</section>`;
}

/* ========================================================================
   One lead: who they are, how to reach them, what was said, and whether a
   proposal ever went out for them.
   ======================================================================== */

export function leadView(lang, ctx) {
  const t = DSTR[lang];
  const l = ctx.lead;
  if (!l) {
    return `
<nav class="crumb"><button class="link" data-act="go" data-route="#/leads">← ${esc(t.backToLeads)}</button></nav>
<section class="card"><div class="card__head"><h2>${esc(t.leadNotFound)}</h2></div></section>`;
  }

  const co = leadCompany(l);
  const events = ctx.leadEvents || [];
  const proposals = ctx.leadProposals || [];
  const hits = ctx.projectHits || [];
  const late = lateBy(l.next_follow_up_on);
  const mayEdit = canPlan() || db.state.me?.department_id === 'bd';

  const fact = (label, value, cls = '') =>
    `<div class="fact"><span class="fact__l">${esc(label)}</span><span class="fact__v ${cls}">${value}</span></div>`;

  return `
<nav class="crumb"><button class="link" data-act="go" data-route="#/leads">← ${esc(t.backToLeads)}</button></nav>

<section class="card">
  <div class="card__head">
    <h2>${esc(l.name)}</h2>
    ${statusPill(l.status, lang)}
    ${l.source ? `<span class="chip">${esc(l.source)}</span>` : ''}
  </div>
  <div class="factgrid">
    ${fact(t.company, esc(co || t.companyUnknown), co ? '' : 'muted')}
    ${fact(t.jobTitle, esc(l.title || '—'), l.title ? '' : 'muted')}
    ${fact(t.email, l.email ? `<a class="link" href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : '—', l.email ? '' : 'muted')}
    ${fact(t.phone, l.phone ? `<a class="link" href="tel:${esc(String(l.phone).split(',')[0].replace(/\s/g, ''))}">${esc(l.phone)}</a>` : '—', l.phone ? '' : 'muted')}
    ${fact(t.website, l.website ? `<a class="link" href="${esc(l.website)}" target="_blank" rel="noopener">${esc(co || l.website)} ↗</a>` : '—', l.website ? '' : 'muted')}
    ${fact(t.owner, esc(l.owner?.full_name || t.unassigned), l.owner ? '' : 'muted')}
    ${fact(t.followUp, `${esc(fmt(l.next_follow_up_on, lang))}${late ? ` <span class="bad small">${late} ${esc(t.overdue)}</span>` : ''}`)}
    ${fact(t.createdOn, esc(fmt((l.created_at || '').slice(0, 10), lang)))}
  </div>
  ${l.notes ? `<h3 class="subhead">${esc(t.notes)}</h3><p class="prose">${esc(l.notes)}</p>` : ''}
</section>

<section class="card">
  <div class="card__head"><h2>${esc(t.proposalsHead)}</h2><span class="muted small">${proposals.length}</span></div>
  ${proposals.length ? `<div class="tblwrap"><table class="tbl tbl--tight">
    <thead><tr><th>${esc(t.name)}</th><th>${esc(t.status)}</th>
      <th class="num">${esc(t.due)}</th><th>${esc(t.owner)}</th><th></th></tr></thead>
    <tbody>${proposals.map(p => `<tr>
      <td><button class="link" data-act="go" data-route="#/p/${esc(p.id)}">${esc(p.name)}</button></td>
      <td>${statusPill(p.status, lang)}</td>
      <td class="num muted">${esc(fmt(p.due_on, lang))}</td>
      <td class="small muted">${esc(p.owner?.full_name || t.unassigned)}</td>
      <td class="num">${mayEdit ? `<button class="link small" data-unlink="${esc(p.id)}">${esc(t.unlink)}</button>` : ''}</td>
    </tr>`).join('')}</tbody>
  </table></div>` : `<p class="note">${esc(t.noProposals)}</p>`}

  ${mayEdit ? `
  <form id="linkForm" class="inlineform">
    <div class="fields">
      <label class="f f--wide"><span>${esc(t.linkProposal)}</span>
        <input id="linkQ" placeholder="${esc(t.searchProjects)}" autocomplete="off" /></label>
    </div>
    ${hits.length ? `<ul class="filelist">${hits.map(p => `
      <li class="filerow">
        <span>${esc(p.name)} ${statusPill(p.status, lang)}</span>
        ${p.lead_id && p.lead_id !== l.id
          ? `<span class="muted small">${esc(t.alreadyLinked)}</span>`
          : `<button type="button" class="btn btn--sm" data-link="${esc(p.id)}">${esc(t.link)}</button>`}
      </li>`).join('')}</ul>`
    : (ctx.projectQuery ? `<p class="note">${esc(t.noProjectMatch)}</p>` : '')}
  </form>` : ''}
</section>

<section class="card">
  <div class="card__head"><h2>${esc(t.leadHistory)}</h2></div>
  ${mayEdit ? `<form id="leadNoteForm" class="inlineform">
    <div class="fields">
      <label class="f f--wide"><span>${esc(t.addNote)}</span><input id="leadNoteBody" required /></label>
    </div>
    <div class="actions"><button type="submit" class="btn btn--sm">${esc(t.post)}</button></div>
  </form>` : ''}
  ${events.length ? `<ul class="timeline">${events.map(e => `
    <li class="timeline__i">
      <span class="timeline__d">${esc(sinceText(e.occurred_at, lang, t))}</span>
      <span class="timeline__b"><b>${esc(e.author?.full_name || '—')}</b> — ${esc(e.body || e.kind)}</span>
    </li>`).join('')}</ul>` : `<p class="note">${esc(t.noLeadHistory)}</p>`}
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
  const all = ctx.files || [];
  const f = ctx.docf || 'all';
  const rows = f === 'all' ? all
             : f === 'document' ? all.filter(x => x.purpose === 'document')
             : all.filter(x => x.purpose !== 'document');
  const counts = {
    all: all.length,
    document: all.filter(x => x.purpose === 'document').length,
    project: all.filter(x => x.purpose !== 'document').length,
  };
  /* The count beside the title is now "showing / total", because the filter
     can hide rows and a bare number next to an empty-looking table is the
     kind of thing that gets read as "we have lost the files". */
  const shown = rows.length === all.length ? `${all.length}` : `${rows.length} ${esc(t.ofTotal)} ${all.length}`;
  return `
<section class="card">
  <div class="card__head">
    <h2>${esc(t.library)}</h2><span class="muted small">${shown}</span>
    <div class="segbar">
      ${[['all', t.docAll], ['document', t.docLibrary], ['project', t.docFromProjects]].map(([k, label]) =>
        `<button class="seg${f === k ? ' is-on' : ''}" data-docf="${k}">${esc(label)} <span class="seg__n">${counts[k]}</span></button>`).join('')}
    </div>
  </div>
  <form id="docForm" class="uploader">
    <!-- The two fields are one column, not two grid rows the picker has to
         span. A row-spanning item cannot share an auto-sized track with
         anything else without the browser handing that track the spanning
         item's whole height, which is what prised Description away from
         Title. -->
    <div class="uploader__fields">
      <label class="f"><span>${esc(t.title)}</span>
        <input id="dTitle" autocomplete="off" placeholder="${esc(t.titleHint)}" /></label>
      <label class="f"><span>${esc(t.description)}</span>
        <textarea id="dDesc" rows="3" placeholder="${esc(t.descHint)}"></textarea></label>
    </div>

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
      <thead><tr>
        <th>${esc(t.name)}</th><th>${esc(t.title)}</th><th>${esc(t.docWhere)}</th>
        <th class="num">${esc(lang === 'ar' ? 'الحجم' : 'Size')}</th><th></th>
      </tr></thead>
      <tbody>
        ${rows.length ? rows.map(x => `<tr>
          <td>${esc(x.filename)}<span class="muted small block">${esc(x.uploader?.full_name || '')}</span></td>
          <td class="muted small">${esc(x.title || '')}</td>
          <!-- Where the file came from. A project attachment is only findable
               if the row says which project, and the kind (RFP, reference)
               is what tells a reader whether it is worth opening. -->
          <td class="small">
            ${x.project?.name
              ? `<button class="link small" data-act="go" data-route="#/project/${esc(x.project.id)}">${esc(x.project.name)}</button>`
              : `<span class="muted">${esc(t.docLibrary)}</span>`}
            <span class="muted small block">${esc(t.purposes?.[x.purpose] || x.purpose || '')}</span>
          </td>
          <!-- dir=ltr because bidi reorders "4.0 MB" into "MB 4.0" in an
               Arabic paragraph; the unit belongs after the number. -->
          <td class="num muted small" dir="ltr">${x.size_bytes ? (x.size_bytes / 1048576).toFixed(1) + ' MB' : '—'}</td>
          <td class="num"><button class="link small" data-open="${esc(x.id)}">${esc(lang === 'ar' ? 'فتح' : 'Open')}</button></td>
        </tr>`).join('')
        : `<tr><td class="tbl__empty" colspan="5">${esc(all.length ? t.noDocsInFilter : t.noDocsYet)}</td></tr>`}
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

  /* Anyone who could be given the job, not a hard-coded list of four names.
     Who supervises whom changes; a constant in the source would have to be
     edited and redeployed every time somebody is promoted or leaves. */
  const supervisors = people.filter(p => p.is_active && ['lead', 'manager', 'admin'].includes(p.role));

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
    /* Removing is destructive and irreversible, so it is a quiet danger button
       rather than anything you could hit by reflex, and never offered on your
       own row — an admin locking themselves out is the one mistake this screen
       must not make easy. */
    const remove = (p.id !== (db.state.me && db.state.me.id))
      ? `<button class="btn btn--sm btn--danger" data-remove="${esc(p.id)}">${esc(t.remove)}</button>` : '';
    const action = `<span class="rowacts">${access}${link}${remove}</span>`;
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
        <th>${esc(t.role)}</th><th>${esc(t.perfSupervisor)}</th><th>${esc(t.lastSeen)}</th><th class="num"></th>
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
            <!-- Who reviews this person. Explicit rather than derived from
                 department, and admin-only: the database guard rejects the
                 change from anyone else, so this select is the interface to a
                 rule rather than the rule itself. -->
            <td><select class="btn--sm" data-supervisor="${esc(p.id)}">
              <option value="">${esc(t.perfNoSupervisor)}</option>
              ${supervisors.filter(sv => sv.id !== p.id).map(sv =>
                `<option value="${esc(sv.id)}"${sv.id === p.supervisor_id ? ' selected' : ''}>${esc(sv.full_name || sv.email)}</option>`).join('')}
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

/* ==========================================================================
   HR — the workforce dashboard.

   Admins and the HR department see everyone; a supervisor who is not HR sees
   the same screens scoped to their own reports. That scoping is RLS's job —
   these views only decide which controls to draw. ID numbers and ID copies
   live in hr_employee_private and the private 'hr' bucket, which nobody but
   HR can read, so a supervisor's screen cannot show them even by accident.
   ========================================================================== */

const DAY_MS = 86400000;
const pad2 = (n) => String(n).padStart(2, '0');
/** Today as a calendar date where the person is, not in UTC — at 1am in
    Riyadh, UTC is still "yesterday" and a leave starting today would not
    count as today's. */
export const localToday = (d = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const asDate = (x) => (x instanceof Date ? x : parse(x));
const addYears = (d, n) => new Date(Date.UTC(d.getUTCFullYear() + n, d.getUTCMonth(), d.getUTCDate()));
const round1 = (n) => Math.round(n * 10) / 10;

/** Full years of service on `asOf`. */
export function yearsOfService(joining, asOf = localToday()) {
  if (!joining) return null;
  const j = asDate(joining), a = asDate(asOf);
  if (a < j) return 0;
  let y = a.getUTCFullYear() - j.getUTCFullYear();
  if (addYears(j, y) > a) y--;
  return Math.max(0, y);
}

/** Days of annual leave a year. Saudi Labor Law art. 109: 21 days, rising to
    30 once the employee has completed five years. HR can override per person
    (a contract that grants more, for example). */
export function annualEntitlement(joining, override = null, asOf = localToday()) {
  if (override !== null && override !== undefined && override !== '') return Number(override);
  const y = yearsOfService(joining, asOf);
  return y !== null && y >= 5 ? 30 : 21;
}

/** Inclusive calendar days from start to end; 0 if either is missing or the
    range runs backwards. */
export function leaveDays(start, end) {
  if (!start || !end) return 0;
  const n = Math.round((asDate(end) - asDate(start)) / DAY_MS) + 1;
  return n > 0 ? n : 0;
}

/**
 * This calendar year's leave position for one employee.
 * Accrues daily from 1 January (or the joining date, if later) to `asOf`, at
 * 21/365 a day — switching to 30/365 on the fifth anniversary if it falls this
 * year. `taken` counts annual leave that starts this year. No carry-over is
 * modelled: an unused balance from last year is HR's to record as needed.
 */
export function leaveSummary(emp, leaves = [], asOf = localToday()) {
  const a = asDate(asOf);
  const year = a.getUTCFullYear();
  const inYear = (l) => l.start_date && l.start_date.slice(0, 4) === String(year);
  const sum = (kind) => round1((leaves || []).filter(l => l.kind === kind && inYear(l))
    .reduce((s, l) => s + Number(l.days || 0), 0));
  const out = {
    year, taken: sum('annual'), sick: sum('sick'), unpaid: sum('unpaid'), other: sum('other'),
    entitlement: null, accrued: null, balance: null, years: null,
  };
  const joining = emp?.joining_date;
  if (!joining) return out;
  const j = asDate(joining);
  const override = emp.annual_leave_override;
  out.years = yearsOfService(joining, a);
  out.entitlement = annualEntitlement(joining, override, a);

  const jan1 = new Date(Date.UTC(year, 0, 1));
  const from = j > jan1 ? j : jan1;
  const yearDays = leaveDays(jan1, new Date(Date.UTC(year, 11, 31)));
  let accrued = 0;
  if (from <= a) {
    const hasOverride = override !== null && override !== undefined && override !== '';
    if (hasOverride) {
      accrued = Number(override) * leaveDays(from, a) / yearDays;
    } else {
      const fifth = addYears(j, 5);
      const before = fifth <= from ? 0 : leaveDays(from, fifth > a ? a : new Date(fifth - DAY_MS));
      const after = leaveDays(from, a) - before;
      accrued = (21 * before + 30 * after) / yearDays;
    }
  }
  out.accrued = round1(accrued);
  out.balance = round1(accrued - out.taken);
  return out;
}

/** Is the person on leave on `day`? */
export const onLeave = (leaves, employeeId, day = localToday()) =>
  (leaves || []).some(l => l.employee_id === employeeId && l.start_date <= day && l.end_date >= day);

function serviceText(joining, lang, asOf = localToday()) {
  if (!joining) return '—';
  const t = DSTR[lang];
  const j = asDate(joining), a = asDate(asOf);
  if (j > a) return fmt(joining, lang);
  const y = yearsOfService(joining, a);
  const anniv = addYears(j, y);
  let m = (a.getUTCFullYear() - anniv.getUTCFullYear()) * 12 + a.getUTCMonth() - anniv.getUTCMonth();
  if (a.getUTCDate() < anniv.getUTCDate()) m--;
  m = Math.max(0, m);
  if (y > 0) return `${t.hrYears.replace('{n}', y)}${m ? ' ' + t.hrMonths.replace('{n}', m) : ''}`;
  if (m > 0) return t.hrMonths.replace('{n}', m);
  return t.hrDays.replace('{n}', leaveDays(j, a) - 1);
}

const HR_REQ_COLOUR = { requested: 'var(--warn)', approved: 'var(--info)', rejected: 'var(--critical)', hired: 'var(--ok)' };
const HR_EMP_COLOUR = { probation: 'var(--warn)', active: 'var(--ok)', on_leave: 'var(--info)', terminated: 'var(--ink4)' };
function hrPill(map, colours, key, lang) {
  if (!key) return '';
  const label = DSTR[lang][map]?.[key] || key;
  return `<span class="st" style="--c:${colours[key] || 'var(--ink3)'}"><i></i>${esc(label)}</span>`;
}
export const hrReqPill = (s, lang) => hrPill('hrSt', HR_REQ_COLOUR, s, lang);
export const hrEmpPill = (s, lang) => hrPill('hrEmpSt', HR_EMP_COLOUR, s, lang);

/** Latest review per subject, by period ('2026-Q3' sorts as text). */
function latestReviews(reviews = []) {
  const m = new Map();
  for (const r of reviews) {
    const cur = m.get(r.subject_id);
    if (!cur || String(r.period) > String(cur.period)) m.set(r.subject_id, r);
  }
  return m;
}

const hrCrumb = (lang) => `<nav class="crumb"><button class="link" data-act="go" data-route="#/hr">← ${esc(DSTR[lang].hrBack)}</button></nav>`;
const hrDenied = (lang) => `<section class="card"><p class="note">${esc(DSTR[lang].hrNoAccess)}</p></section>`;
const hrFact = (label, value, cls = '') =>
  `<div class="fact"><span class="fact__l">${esc(label)}</span><span class="fact__v ${cls}">${value}</span></div>`;
const personName = (people, id) => {
  const p = (people || []).find(x => x.id === id);
  return p ? (p.full_name || p.email || '—') : '—';
};

/* ------------------------------------------------------------ the dashboard */

export function hrView(lang, ctx) {
  const t = DSTR[lang];
  const me = db.state.me;
  if (!me) return '';
  const hr = isHR(me);
  const people = ctx.people || [];
  const emps = new Map((ctx.hrEmployees || []).map(e => [e.profile_id, e]));
  if (!hr && !people.some(p => p.supervisor_id === me.id)) return hrDenied(lang);

  const day = localToday();
  const leaves = ctx.hrLeaves || [];
  const oos = ctx.hrOneOnOnes || [];
  const latest = latestReviews(ctx.hrReviews || []);
  const hiring = hr ? (ctx.hiring || []) : [];

  /* The roster: everyone signed in, plus anyone with an HR file who has not
     been given a login yet (a new hire before their invitation). A supervisor
     sees only their own reports. */
  let roster = people.filter(p => p.is_active || emps.has(p.id));
  if (!hr) roster = roster.filter(p => p.supervisor_id === me.id);
  const status = (p) => emps.get(p.id)?.employment_status || (p.is_active ? 'active' : 'probation');
  const current = roster.filter(p => status(p) !== 'terminated');
  const shown = (ctx.hrShowLeft ? roster : current)
    .slice().sort((a, b) => String(a.full_name || a.email).localeCompare(String(b.full_name || b.email)));

  const in30 = iso(new Date(parse(day).getTime() + 30 * DAY_MS));
  const joiningSoon = current.filter(p => { const d = emps.get(p.id)?.joining_date; return d && d >= day && d <= in30; }).length
    + hiring.filter(h => h.status === 'approved' && h.joining_date && h.joining_date >= day && h.joining_date <= in30).length;
  const openReq = hiring.filter(h => ['requested', 'approved'].includes(h.status));
  const noFile = current.filter(p => !emps.get(p.id)?.joining_date).length;
  const leaveToday = current.filter(p => onLeave(leaves, p.id, day)).length;
  const probation = current.filter(p => status(p) === 'probation').length;

  const lastOO = new Map();
  for (const o of oos) if (!lastOO.has(o.employee_id)) lastOO.set(o.employee_id, o.held_on);

  const kpis = hr ? `
<div class="kpis kpis--5">
  ${kpi(current.length, t.hrKHead, { colour: 'var(--brand)', sub: t.hrKHeadSub.replace('{p}', probation) })}
  ${kpi(leaveToday, t.hrKLeave, { colour: 'var(--info)' })}
  ${kpi(openReq.length, t.hrKOpen, { colour: 'var(--warn)',
      sub: t.hrKOpenSub.replace('{a}', openReq.filter(h => h.status === 'approved').length) })}
  ${kpi(joiningSoon, t.hrKJoin, { colour: 'var(--ok)' })}
  ${kpi(noFile, t.hrKNoFile, { colour: 'var(--critical)', bad: noFile > 0, sub: t.hrKNoFileSub })}
</div>` : '';

  const reqOrder = { requested: 0, approved: 1, hired: 2, rejected: 3 };
  const reqRows = hiring.slice().sort((a, b) =>
    (reqOrder[a.status] ?? 9) - (reqOrder[b.status] ?? 9) || String(b.created_at).localeCompare(String(a.created_at)));
  const kit = (h) => [h.needs_laptop ? '💻' : '', h.equipment || ''].filter(Boolean).join(' ') || '—';

  const requests = hr ? `
<section class="card">
  <div class="card__head">
    <h2>${esc(t.hrReqHead)}</h2><span class="muted small">${openReq.length} / ${hiring.length}</span>
    <button class="btn btn--primary btn--sm" style="margin-inline-start:auto" data-act="go" data-route="#/hr/new">${esc(t.hrNewHire)}</button>
  </div>
  ${reqRows.length ? `<div class="tblwrap"><table class="tbl tbl--tight">
    <thead><tr><th>${esc(t.hrName)}</th><th>${esc(t.hrPosition)}</th><th>${esc(t.hrDept)}</th>
      <th class="num">${esc(t.hrJoining)}</th><th>${esc(t.hrKit)}</th><th>${esc(t.status)}</th>
      <th class="num">${esc(t.hrRequestedOn)}</th></tr></thead>
    <tbody>${reqRows.map(h => `<tr>
      <td><button class="link" data-act="go" data-route="#/hr/r/${esc(h.id)}">${esc(h.full_name)}</button></td>
      <td class="small">${esc(h.position || '—')}</td>
      <td class="small muted">${h.department_id ? esc(deptName(h.department_id, lang)) : '—'}</td>
      <td class="num muted">${esc(fmt(h.joining_date, lang))}</td>
      <td class="small">${esc(kit(h))}</td>
      <td>${hrReqPill(h.status, lang)}</td>
      <td class="num muted">${esc(fmt((h.created_at || '').slice(0, 10), lang))}</td></tr>`).join('')}</tbody>
  </table></div>` : `<p class="note">${esc(t.hrReqNone)}</p>`}
</section>` : '';

  const employees = `
<section class="card">
  <div class="card__head">
    <h2>${esc(hr ? t.hrEmpHead : t.hrTeamHead)}</h2><span class="muted small">${shown.length}</span>
    <label class="chk chk--inline" style="margin-inline-start:auto"><input type="checkbox" data-hr-left${ctx.hrShowLeft ? ' checked' : ''} /> ${esc(t.hrShowLeft)}</label>
  </div>
  ${shown.length ? `<div class="tblwrap"><table class="tbl tbl--tight">
    <thead><tr><th>${esc(t.hrName)}</th><th>${esc(t.hrDept)}</th><th>${esc(t.hrPosition)}</th><th>${esc(t.status)}</th>
      <th class="num">${esc(t.hrJoined)}</th><th class="num">${esc(t.hrService)}</th><th class="num">${esc(t.hrBalance)}</th>
      <th class="num">${esc(t.hrSick)}</th><th class="num">${esc(t.hrLastOO)}</th><th class="num">${esc(t.hrScore)}</th></tr></thead>
    <tbody>${shown.map(p => {
      const e = emps.get(p.id) || null;
      const mine = leaves.filter(l => l.employee_id === p.id);
      const ls = leaveSummary(e, mine, day);
      const rv = latest.get(p.id);
      const sc = rv ? formScore(rv.ratings).pct : null;
      const away = onLeave(leaves, p.id, day);
      return `<tr>
      <td><button class="link" data-act="go" data-route="#/hr/e/${esc(p.id)}">${esc(p.full_name || p.email || '—')}</button>
        ${away ? `<span class="chip">${esc(t.hrEmpSt.on_leave)}</span>` : ''}</td>
      <td class="small muted">${p.department_id ? esc(deptName(p.department_id, lang)) : '—'}</td>
      <td class="small">${esc(e?.position || '—')}</td>
      <td>${hrEmpPill(status(p), lang)}</td>
      <td class="num muted">${esc(fmt(e?.joining_date, lang))}</td>
      <td class="num muted">${esc(serviceText(e?.joining_date, lang, day))}</td>
      <td class="num${ls.balance !== null && ls.balance < 0 ? ' bad' : ''}">${ls.balance === null ? '—' : esc(t.hrDaysShort.replace('{n}', ls.balance))}</td>
      <td class="num">${ls.sick ? esc(t.hrDaysShort.replace('{n}', ls.sick)) : '<span class="muted">0</span>'}</td>
      <td class="num muted">${esc(fmt(lastOO.get(p.id), lang))}</td>
      <td class="num">${sc === null ? '<span class="muted">—</span>' : `${sc}% <span class="muted small">${esc(rv.period)}</span>`}</td>
    </tr>`;
    }).join('')}</tbody>
  </table></div>` : `<p class="note">${esc(t.hrEmpNone)}</p>`}
  <p class="note">${esc(t.hrLegal)}</p>
</section>`;

  return `
<div class="card__head" style="border:0;padding:0 0 12px"><h2 style="font-size:17px">${esc(hr ? t.hrHead : t.hrTeamHead)}</h2></div>
${kpis}
${requests}
${employees}`;
}

/* ------------------------------------------------------- new hiring request */

export function hrHireView(lang, ctx) {
  const t = DSTR[lang];
  if (!isHR()) return hrDenied(lang);
  const depts = db.state.departments || [];
  return `
${hrCrumb(lang)}
<section class="card">
  <div class="card__head"><h2>${esc(t.hrHireTitle)}</h2></div>
  <p class="note note--lead">${esc(t.hrHireLead)}</p>
  <form id="hireForm" class="projform">
    <div class="fields">
      <label class="f"><span>${esc(t.hrName)} *</span><input id="hName" required maxlength="200" autocomplete="off" /></label>
      <label class="f"><span>${esc(t.hrPhone)}</span><input id="hPhone" type="tel" maxlength="40" autocomplete="off" /></label>
      <label class="f"><span>${esc(t.hrNatId)}</span><input id="hNatId" maxlength="40" autocomplete="off" /></label>
      <label class="f"><span>${esc(t.hrEmail)}</span><input id="hEmail" type="email" maxlength="200" autocomplete="off" title="${esc(t.hrEmailHint)}" /></label>
      <label class="f"><span>${esc(t.hrJoining)}</span><input id="hJoin" type="date" /></label>
      <label class="f"><span>${esc(t.hrPosition)}</span><input id="hPos" maxlength="200" /></label>
      <label class="f"><span>${esc(t.hrDept)}</span>
        <select id="hDept"><option value="">${esc(t.hrPickDept)}</option>
          ${depts.map(d => `<option value="${esc(d.id)}">${esc(lang === 'ar' ? d.name_ar : d.name_en)}</option>`).join('')}
        </select></label>
      <label class="f f--wide"><span>${esc(t.hrJobDesc)}</span><textarea id="hJob" rows="4"></textarea></label>
      <label class="f f--wide"><span>${esc(t.hrTools)}</span><textarea id="hTools" rows="2" placeholder="${esc(t.hrToolsHint)}"></textarea></label>
      <label class="chk"><input type="checkbox" id="hLaptop" /> ${esc(t.hrLaptop)}</label>
      <label class="f f--wide"><span>${esc(t.hrEquip)}</span><input id="hEquip" maxlength="500" placeholder="${esc(t.hrEquipHint)}" /></label>
      <label class="f f--wide"><span>${esc(t.hrFeedback)}</span><textarea id="hFb" rows="4" placeholder="${esc(t.hrFeedbackHint)}"></textarea></label>
    </div>
    ${dropField('hIdDoc', t.hrIdCopy, t.hrIdCopyHint, { accept: 'image/*,.pdf' })}
    <div class="actions actions--end"><button type="submit" class="btn btn--primary">${esc(t.hrSubmit)}</button></div>
  </form>
</section>`;
}

/* -------------------------------------------------------- one hiring request */

export function hrRequestView(lang, ctx) {
  const t = DSTR[lang];
  if (!isHR()) return hrDenied(lang);
  const r = ctx.hireReq;
  if (!r) return `${hrCrumb(lang)}<section class="card"><div class="card__head"><h2>${esc(t.hrReqNotFound)}</h2></div></section>`;
  const people = ctx.people || [];
  const v = (x) => x ? esc(x) : `<span class="muted">—</span>`;

  const actions = {
    requested: `<button class="btn btn--primary btn--sm" data-hr-decide="approved">${esc(t.hrApprove)}</button>
                <button class="btn btn--danger btn--sm" data-hr-decide="rejected">${esc(t.hrReject)}</button>`,
    approved: `<button class="btn btn--primary btn--sm" data-hr-hire="${esc(r.id)}">${esc(t.hrMarkHired)}</button>
               <button class="btn btn--danger btn--sm" data-hr-decide="rejected">${esc(t.hrReject)}</button>`,
    rejected: `<button class="btn btn--sm" data-hr-decide="requested">${esc(t.hrReopen)}</button>`,
    hired: r.hired_profile_id ? `<button class="btn btn--primary btn--sm" data-act="go" data-route="#/hr/e/${esc(r.hired_profile_id)}">${esc(t.hrOpenEmp)}</button>` : '',
  }[r.status] || '';

  return `
${hrCrumb(lang)}
<section class="card">
  <div class="card__head"><h2>${esc(r.full_name)}</h2>${hrReqPill(r.status, lang)}</div>
  <div class="factgrid">
    ${hrFact(t.hrPosition, v(r.position))}
    ${hrFact(t.hrDept, r.department_id ? esc(deptName(r.department_id, lang)) : '—')}
    ${hrFact(t.hrJoining, esc(fmt(r.joining_date, lang)))}
    ${hrFact(t.hrPhone, v(r.phone))}
    ${hrFact(t.hrEmail, v(r.email))}
    ${hrFact(t.hrNatId, v(r.national_id))}
    ${hrFact(t.hrLaptop, r.needs_laptop ? '✓' : '—')}
    ${hrFact(t.hrEquip, v(r.equipment))}
    ${hrFact(t.hrRequestedBy, esc(personName(people, r.requested_by)))}
    ${hrFact(t.hrRequestedOn, esc(fmt((r.created_at || '').slice(0, 10), lang)))}
  </div>
  <h3 class="subhead">${esc(t.hrJobDesc)}</h3>
  <p class="prose${r.job_description ? '' : ' muted'}">${esc(r.job_description || '—')}</p>
  <h3 class="subhead">${esc(t.hrTools)}</h3>
  <p class="prose${r.needed_tools ? '' : ' muted'}">${esc(r.needed_tools || '—')}</p>
  <h3 class="subhead">${esc(t.hrIdCopy)}</h3>
  <p class="prose">${r.id_doc_path
    ? `<button class="link" data-hr-doc="${esc(r.id_doc_path)}">${esc(t.hrViewId)}</button> <span class="muted small">${esc(r.id_doc_name || '')}</span>`
    : `<span class="muted">${esc(t.hrNoId)}</span>`}</p>
  ${r.decided_at ? `<p class="note">${esc(t.hrDecided.replace('{s}', t.hrSt[r.status] || r.status)
      .replace('{who}', personName(people, r.decided_by)).replace('{d}', fmt(r.decided_at.slice(0, 10), lang)))}</p>` : ''}
  ${actions ? `<div class="actions">${actions}</div>` : ''}
  ${r.status === 'approved' ? `<p class="note">${esc(t.hrHireNote)}</p>` : ''}
</section>

<section class="card">
  <div class="card__head"><h2>${esc(t.hrFeedback)}</h2></div>
  <form id="hrFbForm" class="inlineform" style="border-bottom:0">
    <div class="fields">
      <label class="f f--wide"><span>${esc(t.hrFeedback)}</span>
        <textarea id="hrFbBody" rows="5" placeholder="${esc(t.hrFeedbackHint)}">${esc(r.feedback || '')}</textarea></label>
    </div>
    <div class="actions"><button type="submit" class="btn btn--sm">${esc(t.hrSaveFb)}</button></div>
  </form>
</section>`;
}

/* ------------------------------------------------------------- one employee */

export function hrEmployeeView(lang, ctx) {
  const t = DSTR[lang];
  const me = db.state.me;
  const hr = isHR(me);
  const people = ctx.people || [];
  const p = people.find(x => x.id === ctx.hrId);
  if (!p) return `${hrCrumb(lang)}<section class="card"><div class="card__head"><h2>${esc(t.hrEmpNotFound)}</h2></div></section>`;
  const sup = !hr && p.supervisor_id === me?.id;
  if (!hr && !sup) return hrDenied(lang);

  const e = ctx.hrEmp || null;
  const priv = hr ? (ctx.hrPriv || null) : null;
  const leaves = ctx.hrLeaves || [];
  const oos = ctx.hrOneOnOnes || [];
  const reviews = (ctx.hrReviews || []).slice().sort((a, b) => String(b.period).localeCompare(String(a.period)));
  const day = localToday();
  const ls = leaveSummary(e, leaves, day);
  const status = e?.employment_status || (p.is_active ? 'active' : 'probation');
  const lastRv = reviews[0] || null;
  const lastSc = lastRv ? formScore(lastRv.ratings) : null;
  const dis = hr ? '' : ' disabled';
  const canOO = hr || sup;
  const v = (x) => x ? esc(x) : `<span class="muted">—</span>`;

  const header = `
<section class="card">
  <div class="card__head"><h2>${esc(p.full_name || p.email || '—')}</h2>${hrEmpPill(status, lang)}
    ${onLeave(leaves, p.id, day) ? `<span class="chip">${esc(t.hrEmpSt.on_leave)}</span>` : ''}</div>
  <div class="factgrid">
    ${hrFact(t.hrDept, p.department_id ? esc(deptName(p.department_id, lang)) : '—')}
    ${hrFact(t.hrPosition, v(e?.position))}
    ${hrFact(t.hrSupervisor, esc(p.supervisor_id ? personName(people, p.supervisor_id) : '—'))}
    ${hrFact(t.hrJoined, esc(fmt(e?.joining_date, lang)))}
    ${hrFact(t.hrService, esc(serviceText(e?.joining_date, lang, day)))}
    ${hrFact(t.email, v(p.email))}
    ${hrFact(t.hrPhone, v(e?.phone))}
  </div>
</section>`;

  const scorecard = `
<section class="card">
  <div class="card__head"><h2>${esc(t.hrScorecard)}</h2><span class="muted small">${ls.year}</span></div>
  <div class="kpis kpis--in kpis--5">
    ${kpi(ls.balance === null ? '—' : ls.balance, t.hrKBalance, { colour: 'var(--ok)', bad: ls.balance !== null && ls.balance < 0,
        sub: ls.entitlement === null ? t.hrNoJoinDate : `${ls.accrued} / ${ls.entitlement}` })}
    ${kpi(ls.taken, t.hrKTaken.replace('{y}', ls.year), { colour: 'var(--info)' })}
    ${kpi(ls.sick, t.hrKSick.replace('{y}', ls.year), { colour: 'var(--warn)' })}
    ${kpi(lastSc && lastSc.pct !== null ? `${lastSc.pct}%` : '—', t.hrKLast, { colour: 'var(--brand)', sub: lastRv ? lastRv.period : '' })}
    ${kpi(oos.length, t.hrKOO, { colour: 'var(--ink3)', sub: oos[0] ? t.hrKOOSub.replace('{d}', fmt(oos[0].held_on, lang)) : '' })}
  </div>
  ${ls.entitlement !== null ? `<p class="note">${esc(t.hrBalanceNote.replace('{year}', ls.year).replace('{ent}', ls.entitlement)
      .replace('{acc}', ls.accrued).replace('{taken}', ls.taken))}</p>` : `<p class="note note--warn">${esc(t.hrNoJoinDate)}</p>`}
</section>`;

  const reviewsCard = `
<section class="card">
  <div class="card__head"><h2>${esc(t.hrReviews)}</h2><span class="muted small">${reviews.length}</span></div>
  ${reviews.length ? `<div class="tblwrap"><table class="tbl tbl--tight">
    <thead><tr><th>${esc(t.hrPeriod)}</th><th>${esc(t.hrBy)}</th><th class="num">${esc(t.hrScoreCol)}</th>
      <th>${esc(t.hrStrengths)}</th><th>${esc(t.hrImprove)}</th></tr></thead>
    <tbody>${reviews.map(r => { const s = formScore(r.ratings); return `<tr>
      <td>${esc(r.period)}</td>
      <td class="small muted">${esc(personName(people, r.author_id))}</td>
      <td class="num">${s.pct === null ? '—' : `${s.pct}%`} <span class="muted small">${s.answered}/${s.of}</span></td>
      <td class="small">${esc(r.strengths || '—')}</td>
      <td class="small">${esc(r.improvements || '—')}</td></tr>`; }).join('')}</tbody>
  </table></div>` : `<p class="note">${esc(t.hrNoReviews)}</p>`}
</section>`;

  const ooCard = `
<section class="card">
  <div class="card__head"><h2>${esc(t.hrOO)}</h2><span class="muted small">${oos.length}</span></div>
  ${canOO ? `<details class="pdet"><summary style="margin-inline:16px">${esc(t.hrOOAdd)}</summary><form id="hrOoForm" class="inlineform">
    <div class="fields">
      <label class="f"><span>${esc(t.hrOODate)}</span><input id="ooDate" type="date" value="${esc(day)}" required /></label>
      <label class="f f--wide"><span>${esc(t.hrOONotes)}</span><textarea id="ooNotes" rows="3" required></textarea></label>
      <label class="f f--wide"><span>${esc(t.hrOOActions)}</span><textarea id="ooActions" rows="2"></textarea></label>
    </div>
    <div class="actions"><button type="submit" class="btn btn--sm">${esc(t.hrOOAdd)}</button></div>
  </form></details>` : ''}
  ${oos.length ? `<ul class="timeline">${oos.map(o => `
    <li class="timeline__i">
      <span class="timeline__d">${esc(fmt(o.held_on, lang))}</span>
      <span class="timeline__b"><b>${esc(o.by?.full_name || personName(people, o.conducted_by))}</b> — ${esc(o.notes || '')}
        ${o.action_items ? `<span class="block muted small">${esc(t.hrOOActions)}: ${esc(o.action_items)}</span>` : ''}
        ${hr || o.conducted_by === me?.id ? `<button class="x" data-hr-oo-del="${esc(o.id)}" title="${esc(t.remove)}" aria-label="${esc(t.remove)}">✕</button>` : ''}</span>
    </li>`).join('')}</ul>` : `<p class="note">${esc(t.hrNoOO)}</p>`}
</section>`;

  const leaveCard = `
<section class="card">
  <div class="card__head"><h2>${esc(t.hrLeaves)}</h2><span class="muted small">${leaves.length}</span></div>
  ${hr ? `<details class="pdet"><summary style="margin-inline:16px">${esc(t.hrLeaveAdd)}</summary><form id="hrLeaveForm" class="inlineform">
    <div class="fields">
      <label class="f"><span>${esc(t.hrLeaveType)}</span><select id="lvKind">
        ${['annual', 'sick', 'unpaid', 'other'].map(k => `<option value="${k}">${esc(t.hrLeaveKind[k])}</option>`).join('')}
      </select></label>
      <label class="f"><span>${esc(t.hrFrom)}</span><input id="lvFrom" type="date" required /></label>
      <label class="f"><span>${esc(t.hrTo)}</span><input id="lvTo" type="date" required /></label>
      <label class="f"><span>${esc(t.hrDaysCol)}</span><input id="lvDays" type="number" min="0.5" max="366" step="0.5" required /></label>
      <label class="f f--wide"><span>${esc(t.hrNote)}</span><input id="lvNote" maxlength="500" /></label>
    </div>
    <div class="actions"><button type="submit" class="btn btn--sm">${esc(t.hrLeaveAdd)}</button></div>
  </form></details>` : ''}
  ${leaves.length ? `<div class="tblwrap"><table class="tbl tbl--tight">
    <thead><tr><th>${esc(t.hrLeaveType)}</th><th class="num">${esc(t.hrFrom)}</th><th class="num">${esc(t.hrTo)}</th>
      <th class="num">${esc(t.hrDaysCol)}</th><th>${esc(t.hrNote)}</th>${hr ? '<th></th>' : ''}</tr></thead>
    <tbody>${leaves.map(l => `<tr>
      <td>${esc(t.hrLeaveKind[l.kind] || l.kind)}</td>
      <td class="num muted">${esc(fmt(l.start_date, lang))}</td>
      <td class="num muted">${esc(fmt(l.end_date, lang))}</td>
      <td class="num">${esc(Number(l.days))}</td>
      <td class="small">${esc(l.note || '')}</td>
      ${hr ? `<td class="proc-actions"><button class="x" data-hr-leave-del="${esc(l.id)}" title="${esc(t.remove)}" aria-label="${esc(t.remove)}">✕</button></td>` : ''}
    </tr>`).join('')}</tbody>
  </table></div>` : `<p class="note">${esc(t.hrNoLeaves)}</p>`}
  <p class="note">${esc(t.hrLegal)}</p>
</section>`;

  const EMP_ST = ['probation', 'active', 'on_leave', 'terminated'];
  const fileCard = `
<section class="card">
  <div class="card__head"><h2>${esc(t.hrFile)}</h2></div>
  <form id="hrFileForm" class="inlineform" style="border-bottom:0">
    <div class="fields">
      <label class="f"><span>${esc(t.hrPosition)}</span><input id="efPos" maxlength="200" value="${esc(e?.position || '')}"${dis} /></label>
      <label class="f"><span>${esc(t.hrJoining)}</span><input id="efJoin" type="date" value="${esc(e?.joining_date || '')}"${dis} /></label>
      <label class="f"><span>${esc(t.hrStatusL)}</span><select id="efStatus"${dis}>
        ${EMP_ST.map(s => `<option value="${s}"${s === status ? ' selected' : ''}>${esc(t.hrEmpSt[s])}</option>`).join('')}
      </select></label>
      <label class="f"><span>${esc(t.hrPhone)}</span><input id="efPhone" type="tel" maxlength="40" value="${esc(e?.phone || '')}"${dis} /></label>
      <label class="f"><span>${esc(t.hrOverride)}</span><input id="efOverride" type="number" min="0" max="365" step="0.5"
        value="${esc(e?.annual_leave_override ?? '')}" placeholder="${esc(String(annualEntitlement(e?.joining_date, null, day)))}"
        title="${esc(t.hrOverrideHint)}"${dis} /></label>
      <label class="f f--wide"><span>${esc(t.hrJobDesc)}</span><textarea id="efJob" rows="3"${dis}>${esc(e?.job_description || '')}</textarea></label>
    </div>
    ${hr ? `<div class="actions"><button type="submit" class="btn btn--primary btn--sm">${esc(t.save)}</button></div>`
         : `<p class="note">${esc(t.hrReadOnly)}</p>`}
  </form>
</section>`;

  const idCard = hr ? `
<section class="card">
  <div class="card__head"><h2>${esc(t.hrIdentity)}</h2></div>
  <form id="hrPrivForm" class="inlineform" style="border-bottom:0">
    <div class="fields">
      <label class="f"><span>${esc(t.hrNatId)}</span><input id="pvNat" maxlength="40" autocomplete="off" value="${esc(priv?.national_id || '')}" /></label>
      <label class="f f--wide"><span>${esc(t.hrHrNotes)}</span><textarea id="pvNotes" rows="3">${esc(priv?.hr_notes || '')}</textarea></label>
    </div>
    <p class="prose">${priv?.id_doc_path
      ? `<button type="button" class="link" data-hr-doc="${esc(priv.id_doc_path)}">${esc(t.hrViewId)}</button> <span class="muted small">${esc(priv.id_doc_name || '')}</span>`
      : `<span class="muted">${esc(t.hrNoId)}</span>`}</p>
    ${dropField('pvDoc', t.hrReplaceId, t.hrIdCopyHint, { accept: 'image/*,.pdf' })}
    <div class="actions"><button type="submit" class="btn btn--sm">${esc(t.save)}</button></div>
  </form>
</section>` : '';

  /* Everything above, on one line of time. */
  const events = [];
  if (e?.joining_date) events.push({ d: e.joining_date, b: t.hrTlJoined.replace('{p}', e.position || '—') });
  for (const l of leaves) events.push({ d: l.start_date, b: t.hrTlLeave.replace('{k}', t.hrLeaveKind[l.kind] || l.kind).replace('{n}', Number(l.days)) });
  for (const o of oos) events.push({ d: o.held_on, b: t.hrTlOO.replace('{who}', o.by?.full_name || personName(people, o.conducted_by)) });
  for (const r of reviews) {
    const s = formScore(r.ratings);
    if (s.pct !== null) events.push({ d: (r.updated_at || r.submitted_at || '').slice(0, 10), b: t.hrTlReview.replace('{q}', r.period).replace('{s}', s.pct) });
  }
  if (ctx.hrReqFor?.decided_at) events.push({ d: ctx.hrReqFor.decided_at.slice(0, 10), b: t.hrTlHired, route: `#/hr/r/${ctx.hrReqFor.id}` });
  events.sort((a, b) => String(b.d).localeCompare(String(a.d)));

  const timeline = `
<section class="card">
  <div class="card__head"><h2>${esc(t.hrTimeline)}</h2></div>
  ${events.length ? `<ul class="timeline">${events.map(x => `
    <li class="timeline__i">
      <span class="timeline__d">${esc(fmt(x.d, lang))}</span>
      <span class="timeline__b">${x.route ? `<button class="link" data-act="go" data-route="${esc(x.route)}">${esc(x.b)}</button>` : esc(x.b)}</span>
    </li>`).join('')}</ul>` : `<p class="note">${esc(t.noHistory)}</p>`}
</section>`;

  return `${hrCrumb(lang)}${header}${scorecard}${leaveCard}${ooCard}${reviewsCard}${fileCard}${idCard}${timeline}`;
}
