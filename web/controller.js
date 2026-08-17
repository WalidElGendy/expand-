/* ==========================================================================
   The signed-in application: data loading, routing and event wiring.

   Views in dash.js are pure functions of (lang, ctx) and return HTML. They
   never fetch and never mutate. Everything with a side effect is here, which
   is what makes the views trivially testable and keeps "what does this screen
   show" separate from "what happens when you click".
   ========================================================================== */

import * as db from './db.js';
import * as V from './dash.js';


const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const ctx = {
  projects: [], stages: [], people: [], leads: [], files: [], invites: [],
  loading: false, error: null, authMode: 'in', authMsg: '', authAddr: '', est: null,
  inviteMsg: null,      // what actually happened to the last invitation
  authErr: null,        // whatever Supabase sent back in the URL fragment

  // One project, its attachments, its tasks and its history.
  project: null, projectFiles: [], projectTasks: [], projectEvents: [],

  // One lead, its activity, the proposals linked to it, and the search
  // results behind the "link a proposal" box.
  lead: null, leadEvents: [], leadProposals: [], projectHits: [], projectQuery: '',
  lf: { ...V.LF_DEFAULT },

  /* Filter state for the Projects table. It lives here rather than in the
     URL because these are a working session's questions, not addresses worth
     sharing — and rather than inside the view because the view is a pure
     function of (lang, ctx) and re-runs on every render. */
  pf: { ...V.PF_DEFAULT },
};

let rerender = () => {};
export const bindRender = (fn) => { rerender = fn; };

const fail = (e) => {
  // Show the server's own words. "new row violates row-level security" tells
  // a user something real; "Something went wrong" tells them nothing and
  // tells me nothing either.
  ctx.error = e?.message || String(e);
  rerender();
};

/* ------------------------------------------------------------------ loading */

export async function loadFor(route, id) {
  if (!db.sb) return;
  ctx.loading = true; ctx.error = null;
  try {
    if (!db.state.departments.length) await db.loadDepartments();
    const me = db.state.me;
    if (!me) return;

    const jobs = [];

    /* One project. Fetched by id rather than picked out of ctx.projects,
       because a deep link arrives with that list empty and finding nothing
       in it would render "not here" for a project that exists. The four
       requests go together: a detail page that paints its header and then
       pops in its documents a second later reads as broken. */
    if (route === 'project' && id) {
      ctx.project = null; ctx.projectFiles = []; ctx.projectTasks = []; ctx.projectEvents = [];
      jobs.push(db.getProject(id).then(p => { ctx.project = p; }).catch(() => { ctx.project = null; }));
      jobs.push(db.listFiles({ project_id: id }).then(f => { ctx.projectFiles = f; }).catch(() => {}));
      jobs.push(db.listProjectTasks(id).then(x => { ctx.projectTasks = x; }).catch(() => {}));
      jobs.push(db.listProjectEvents(id).then(e => { ctx.projectEvents = e; }).catch(() => {}));
      jobs.push(db.listPeople().then(p => { ctx.people = p; }).catch(() => {}));
    }

    /* One lead. Same reasoning as the project page: fetched by id so a deep
       link works, and the proposals come with it because "did we bid for
       them" is the question the page exists to answer. */
    if (route === 'lead' && id) {
      ctx.lead = null; ctx.leadEvents = []; ctx.leadProposals = [];
      ctx.projectHits = []; ctx.projectQuery = '';
      jobs.push(db.getLead(id).then(l => { ctx.lead = l; }).catch(() => { ctx.lead = null; }));
      jobs.push(db.listLeadEvents(id).then(e => { ctx.leadEvents = e; }).catch(() => {}));
      jobs.push(db.proposalsForLead(id).then(p => { ctx.leadProposals = p; }).catch(() => {}));
      jobs.push(db.listPeople().then(p => { ctx.people = p; }).catch(() => {}));
    }
    /* The Projects screen is open to everyone, so it needs the projects,
       the roster (the free-capacity tile runs the scheduler over it) and the
       leads (there is an open-leads tile). Loading only some of that renders
       a confident zero, which is a lie an absent tile would not tell. */
    const wantsProjects = route === 'projects' || route === 'highlights' ||
      (['home', 'new'].includes(route) && V.canPlan(me));
    const isDesigner = !['pm', 'bd', 'content'].includes(me.department_id);

    if (wantsProjects || route === 'new') {
      jobs.push(db.listProjects().then(p => { ctx.projects = p; }));
      jobs.push(db.listPeople().then(p => { ctx.people = p; }));
    }
    if (isDesigner || wantsProjects) {
      jobs.push(db.listProjects().then(ps => {
        ctx.projects = ps;
        // Flatten stages once, carrying the project name, so the queue view
        // does not have to join in the template.
        ctx.stages = ps.flatMap(p => (p.project_stages || [])
          .map(s => ({ ...s, project_id: p.id, project_name: p.name })));
      }));
    }
    // The PM dashboard shows an open-leads tile, so it needs the leads too.
    // Without this the tile renders a confident zero, which is a lie a
    // missing tile would not have told.
    if (route === 'leads' || me.department_id === 'bd' || wantsProjects) {
      jobs.push(db.listLeads().then(l => { ctx.leads = l; }).catch(() => { ctx.leads = []; }));
      jobs.push(db.listPeople().then(p => { ctx.people = p; }));
    }
    if (route === 'docs' || me.department_id === 'content') {
      jobs.push(db.listFiles({ purpose: 'document' }).then(f => { ctx.files = f; }));
    }
    if (route === 'admin') {
      jobs.push(db.listPeople().then(p => { ctx.people = p; }));
      jobs.push(db.listInvitations().then(i => { ctx.invites = i; }).catch(() => { ctx.invites = []; }));
    }
    await Promise.all(jobs);
  } catch (e) {
    ctx.error = e.message;
  } finally {
    ctx.loading = false;
  }
}

/* -------------------------------------------------------------------- wire */

export function wireAuth(lang) {
  const form = $('#authForm');
  if (!form) return;

  $$('[data-auth]').forEach(b => b.onclick = () => {
    ctx.authMode = b.dataset.auth; ctx.authMsg = ''; ctx.authErr = null; rerender();
  });

  /* "Send another code" from the code step. It keeps the address rather than
     bouncing back to the email field: the whole failure this replaces was
     somebody being sent away from the page and returning through a stale
     email, and making them retype their address is a smaller version of the
     same mistake. The server's own two-minute cooldown still applies. */
  $$('[data-resend]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try {
      await db.requestAccess(ctx.authAddr);
      ctx.authMsg = V.DSTR[lang].linkOnTheWay;
    } catch (err) { ctx.authMsg = '!' + err.message; }
    finally { rerender(); }
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#aGo'); const email = $('#aEmail')?.value; const pass = $('#aPass')?.value;
    const code = $('#aCode')?.value;
    btn.disabled = true;
    try {
      if (ctx.authMode === 'reset') {
        // Arriving here means Supabase already exchanged the recovery link for
        // a session, so updateUser is authenticated. No email needed.
        await db.updatePassword(pass);
        ctx.authErr = null;
        ctx.authMsg = V.DSTR[lang].passwordSaved;
        /* The one moment "your account is ready" is a true sentence. Not
           awaited: the person is already signed in and looking at the app, so
           a courtesy email must not be able to hold up the door. */
        db.announceAccount();
        location.hash = '#/home';
      } else if (ctx.authMode === 'code') {
        /* The code buys a session; the password screen comes next, exactly as
           it did when a link bought the session. Nothing downstream of here
           had to change. */
        await db.verifyCode(ctx.authAddr, code);
        ctx.authErr = null; ctx.authMsg = '';
        ctx.authMode = 'reset';
        location.hash = '#/reset';
      } else if (ctx.authMode === 'forgot' || ctx.authMode === 'up') {
        /* Both buttons ask the same question — is this address known here —
           and get the same answer whether or not it is. A different reply for
           an unknown address would turn this box into a way to find out who
           works at Expand. */
        await db.requestAccess(email);
        ctx.authErr = null;
        ctx.authMsg = V.DSTR[lang].linkOnTheWay;
        /* Straight to the code box, with the address carried over. This is
           the load-bearing half of the fix: the person never leaves the page,
           so there is no stale tab to come back through and no older email to
           open by mistake. */
        ctx.authAddr = String(email || '').trim().toLowerCase();
        ctx.authMode = 'code';
      } else {
        await db.signIn(email, pass);
        location.hash = '#/home';
      }
    } catch (err) {
      /* Supabase says "Token has expired or is invalid" for a wrong code, and
         those are the exact words that cost somebody four days — seeing them
         again would read as "nothing changed", when what actually happened is
         usually that they are reading a superseded email. Say that instead.
         Every other failure keeps the server's own wording, which is almost
         always more useful than anything generic. */
      ctx.authMsg = '!' + (ctx.authMode === 'code'
        ? V.DSTR[lang].codeBad
        : err.message);
    } finally {
      btn.disabled = false; rerender();
    }
  };
}

export function wireApp(lang) {
  /* --- "needs review" row filter ---
     A view concern, so it toggles rows in place rather than re-rendering and
     re-fetching. Rows the top-bar search has hidden stay hidden: the two
     filters compose instead of fighting. */
  const chips = $$('[data-rows]');
  chips.forEach(c => c.onclick = () => {
    chips.forEach(x => x.classList.toggle('is-on', x === c));
    const onlyFlagged = c.dataset.rows === 'flagged';
    $$('.tbl tbody tr').forEach(tr => {
      if (tr.dataset.empty) return;
      tr.dataset.chipHidden = onlyFlagged && !tr.dataset.flagged ? '1' : '';
      tr.hidden = !!tr.dataset.chipHidden || tr.dataset.searchHidden === '1';
    });
  });

  /* --- Projects: the filter bar ---
     Re-render only. The whole project list is already in memory, so a filter
     that went back to the server would be slower AND would show a different
     set than the tiles above it were computed from. */
  $$('[data-pf]').forEach(el => {
    const key = el.dataset.pf;
    const read = () => (el.type === 'checkbox' ? el.checked : el.value);
    el.onchange = () => { ctx.pf = { ...ctx.pf, [key]: read() }; rerender(); };
  });
  const clearPf = $('[data-pf-clear]');
  if (clearPf) clearPf.onclick = () => { ctx.pf = { ...V.PF_DEFAULT }; rerender(); };

  /* --- Leads: the same filter bar, over the leads already in memory --- */
  $$('[data-lf]').forEach(el => {
    const key = el.dataset.lf;
    el.onchange = () => { ctx.lf = { ...ctx.lf, [key]: el.value }; rerender(); };
  });
  const clearLf = $('[data-lf-clear]');
  if (clearLf) clearLf.onclick = () => { ctx.lf = { ...V.LF_DEFAULT }; rerender(); };

  /* --- one lead: link a proposal ---
     Searches on the server rather than filtering a list this screen never
     loaded. Debounced, because a keystroke is not a question. */
  const linkQ = $('#linkQ');
  if (linkQ) {
    let timer = null;
    linkQ.oninput = () => {
      clearTimeout(timer);
      const term = linkQ.value.trim();
      timer = setTimeout(async () => {
        ctx.projectQuery = term;
        if (term.length < 2) { ctx.projectHits = []; rerender(); return; }
        try { ctx.projectHits = await db.findProjects(term); }
        catch { ctx.projectHits = []; }
        rerender();
        // Re-focus and restore the caret: the whole screen re-rendered under
        // the person's hands and a search box that loses focus mid-word is
        // unusable.
        const box = $('#linkQ');
        if (box) { box.focus(); box.value = term; box.setSelectionRange(term.length, term.length); }
      }, 300);
    };
    $('#linkForm').onsubmit = (e) => e.preventDefault();
  }

  $$('[data-link]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try {
      await db.linkProposal(b.dataset.link, ctx.lead.id);
      await loadFor('lead', ctx.lead.id);
      rerender();
    } catch (e) { fail(e); b.disabled = false; }
  });

  $$('[data-unlink]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try {
      await db.unlinkProposal(b.dataset.unlink);
      await loadFor('lead', ctx.lead.id);
      rerender();
    } catch (e) { fail(e); b.disabled = false; }
  });

  const leadNote = $('#leadNoteForm');
  if (leadNote) leadNote.onsubmit = async (e) => {
    e.preventDefault();
    const body = $('#leadNoteBody').value.trim();
    if (!body) return;
    const btn = leadNote.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await db.addLeadEvent({ lead_id: ctx.lead.id, kind: 'note', body });
      ctx.leadEvents = await db.listLeadEvents(ctx.lead.id);
      rerender();
    } catch (err) { fail(err); btn.disabled = false; }
  };

  /* --- one project: move it along the Etemad flow --- */
  const stForm = $('#stForm');
  if (stForm) stForm.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#stGo'); const to = $('#stNext').value;
    const from = ctx.project?.status || null;
    btn.disabled = true;
    try {
      await db.setProjectStatus(ctx.project.id, to, { from, note: $('#stNote').value.trim() });
      // Reload rather than patch in place: moving to production creates a
      // stage row, and a screen that shows the new status but not the new
      // stage is telling half the truth.
      await loadFor('project', ctx.project.id);
      rerender();
    } catch (err) { fail(err); btn.disabled = false; }
  };

  const noteForm = $('#noteForm');
  if (noteForm) noteForm.onsubmit = async (e) => {
    e.preventDefault();
    const body = $('#noteBody').value.trim();
    if (!body) return;
    const btn = noteForm.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await db.addProjectNote(ctx.project.id, body);
      ctx.projectEvents = await db.listProjectEvents(ctx.project.id);
      rerender();
    } catch (err) { fail(err); btn.disabled = false; }
  };

  // The detail page has its own file list, held in a different slice of ctx
  // than the Documents screen's.
  $$('[data-file]').forEach(b => b.onclick = async () => {
    const f = (ctx.projectFiles || []).find(x => x.id === b.dataset.file);
    if (!f) return;
    try { window.open(await db.fileUrl(f.bucket, f.path), '_blank', 'noopener'); }
    catch (e) { fail(e); }
  });

  /* --- designer: move a stage along --- */
  $$('[data-stage]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { await db.setStageStatus(b.dataset.stage, b.dataset.to); await loadFor('home'); rerender(); }
    catch (e) { fail(e); }
  });

  /* --- leads --- */
  const lf = $('#leadForm');
  const showLeadForm = (on) => {
    if (!lf) return;
    lf.innerHTML = on ? V.leadFormHtml(lang, ctx.people) : '';
    if (on) {
      $('#newLead').onsubmit = async (e) => {
        e.preventDefault();
        try {
          await db.createLead({
            name: $('#lName').value.trim(),
            company: $('#lCompany').value.trim() || null,
            email: $('#lEmail').value.trim() || null,
            phone: $('#lPhone').value.trim() || null,
            next_follow_up_on: $('#lFollow').value || null,
            value_sar: $('#lValue').value ? Number($('#lValue').value) : null,
            notes: $('#lNotes').value.trim() || null,
            status: 'new',
          });
          await loadFor('leads'); rerender();
        } catch (err) { fail(err); }
      };
      $('[data-act="cancellead"]').onclick = () => showLeadForm(false);
    }
  };
  const nl = $('[data-act="newlead"]');
  if (nl) nl.onclick = () => showLeadForm(true);

  $$('.leadStatus').forEach(sel => sel.onchange = async () => {
    try {
      await db.updateLead(sel.dataset.lead, { status: sel.value });
      await db.addLeadEvent({ lead_id: sel.dataset.lead, kind: 'status_change', body: `→ ${sel.value}` });
    } catch (e) { fail(e); }
  });

  $$('[data-note]').forEach(b => b.onclick = async () => {
    const body = prompt(V.DSTR[lang].logNote);
    if (!body) return;
    try { await db.addLeadEvent({ lead_id: b.dataset.note, kind: 'note', body }); }
    catch (e) { fail(e); }
  });

  /* --- file pickers, wherever they appear ---
     The native control's own "No file chosen" is hidden along with it, so the
     label has to say what was picked. Without this the target looks identical
     before and after choosing and people click it twice. Bound by class so
     every screen that uses dropField() gets it — the documents library and
     the two on the new-project form alike. */
  $$('.drop input[type="file"]').forEach(input => {
    const wrap = input.closest('.dropwrap');
    const drop = input.closest('.drop');
    const hintEl = drop?.querySelector('[data-hint]');
    const pendBox = wrap?.querySelector(`[data-pend-for="${CSS.escape(input.id)}"]`);
    if (!hintEl) return;
    const hint = hintEl.textContent;

    /* A FileList is read-only, so a queue you can add to and remove from has
       to be rebuilt through a DataTransfer and assigned back. This is the
       whole trick, and it is why the list on screen and the thing that gets
       uploaded are the same object rather than two that agree until they
       don't. */
    const setQueue = (files) => {
      const dt = new DataTransfer();
      files.forEach(f => dt.items.add(f));
      input.files = dt.files;   // assignment fires no change event, so no loop
      input.__prev = files;     // written here and nowhere else
      paint();
    };

    /* Same name, size and mtime is the same file. Without this, someone who
       opens the picker twice because they forgot what they chose the first
       time silently uploads two copies of the brief. */
    /* U+0000 written as an escape, not as a literal. A raw NUL in the source
       makes git and grep classify this file as binary, which silently costs
       every diff, every `git format-patch` and every code review on it —
       for a separator nobody can see. Same value, plain-text file. */
    const key = (f) => `${f.name}\u0000${f.size}\u0000${f.lastModified}`;

    const paint = () => {
      const picked = [...input.files];
      drop.classList.toggle('is-set', picked.length > 0);
      // The hint says what the field takes; the list below says what is in it.
      // Repeating the file names in both is noise on a field that now holds
      // ten of them.
      hintEl.textContent = hint;
      if (pendBox) pendBox.innerHTML = V.pendingFiles(lang, input.id, picked);
    };

    input.onchange = () => {
      /* Picking again ADDS. The native control replaces, which on a field
         that accepts many files means the second trip to the picker silently
         throws away the first — and the only way to attach two documents
         would be to remember to ctrl-click both in one go. */
      if (!input.multiple) { input.__prev = [...input.files]; paint(); return; }
      /* `__prev` is a memory of the last queue, needed because by the time
         `change` fires the control has already replaced `files` with the new
         pick alone. */
      const merged = [...(input.__prev || [])];
      const seen = new Set(merged.map(key));
      for (const f of input.files) if (!seen.has(key(f))) { seen.add(key(f)); merged.push(f); }
      setQueue(merged);
    };

    /* Bound on the wrapper, not on the buttons: the list is re-rendered on
       every change, so a handler attached to a button dies with it. Assigned
       rather than addEventListener, so re-wiring the same DOM cannot stack up
       duplicate handlers and remove two files per click. */
    if (wrap) wrap.onclick = (e) => {
      const btn = e.target.closest('[data-drop-rm]');
      if (!btn || btn.dataset.dropRm !== input.id) return;
      e.preventDefault();
      const gone = Number(btn.dataset.i);
      setQueue([...input.files].filter((_, i) => i !== gone));
      /* Focus has to land somewhere deliberate — the button that had it was
         just destroyed, and focus dumped on <body> strands a keyboard user
         back at the top of the form. Take the row that slid into this slot,
         or the last one if the removed row was the last. */
      const left = wrap.querySelectorAll('[data-drop-rm]');
      (left[Math.min(gone, left.length - 1)] || input).focus();
    };

    input.__prev = [...input.files];
    paint();
  });

  const df = $('#docForm');
  if (df) df.onsubmit = async (e) => {
    e.preventDefault();
    const btn = df.querySelector('button[type=submit]');
    const files = [...$('#dFiles').files];
    btn.disabled = true; btn.textContent = V.DSTR[lang].uploading;
    try {
      for (const f of files) {
        await db.uploadFile('docs', f, {
          purpose: 'document',
          title: $('#dTitle').value.trim() || null,
          description: $('#dDesc').value.trim() || null,
          department_id: db.state.me?.department_id || null,
        });
      }
      await loadFor('docs'); rerender();
    } catch (err) { fail(err); btn.disabled = false; }
  };

  $$('[data-open]').forEach(b => b.onclick = async () => {
    const f = ctx.files.find(x => x.id === b.dataset.open);
    if (!f) return;
    try { window.open(await db.fileUrl(f.bucket, f.path), '_blank', 'noopener'); }
    catch (e) { fail(e); }
  });

  /* --- admin --- */
  const inv = $('#inviteForm');
  if (inv) inv.onsubmit = async (e) => {
    e.preventDefault();
    const btn = inv.querySelector('button[type=submit]');
    const d = V.DSTR[lang];
    const email = $('#iEmail').value.trim();
    btn.disabled = true; btn.textContent = d.sending;
    ctx.inviteMsg = null;
    try {
      const r = await db.invite({
        email, full_name: $('#iName').value.trim() || null,
        department_id: $('#iDept').value, role: $('#iRole').value,
      });
      /* Three different outcomes, and they are not the same news. Reporting
         all of them as success is what made a silent failure look like a
         working feature for as long as it did. */
      ctx.inviteMsg = r?.emailed
        ? { ok: true, text: (r.kind === 'reset' ? d.inviteResent : d.inviteSent).replace('{email}', r.email || email) }
        : { ok: false, text: d.inviteNoMail.replace('{email}', r?.email || email)
                              .replace('{reason}', r?.reason || d.inviteNoReason) };
      $('#iEmail').value = ''; $('#iName').value = '';
      await loadFor('admin'); rerender();
    } catch (err) {
      ctx.inviteMsg = { ok: false, text: err.message };
      rerender();
    } finally {
      const b = $('#inviteForm button[type=submit]');
      if (b) { b.disabled = false; b.textContent = d.invite; }
    }
  };

  /* --- approve / revoke ---
     The one action on this screen that changes whether a person can get in,
     so it is a button rather than a checkbox nobody notices, and it reports
     back by name. Reloads because approving moves the row to a different
     group and changes four counters. */
  const setActive = async (id, on) => {
    const who = (ctx.people || []).find(p => p.id === id);
    try {
      await db.setPerson(id, { is_active: on });
      const d = V.DSTR[lang];
      ctx.inviteMsg = { ok: on, text: (on ? d.approved : d.revoked)
        .replace('{name}', who?.full_name || who?.email || '') };
      await loadFor('admin'); rerender();
    } catch (e) { fail(e); }
  };
  $$('[data-approve]').forEach(b => b.onclick = () => setActive(b.dataset.approve, true));
  $$('[data-revoke]').forEach(b => b.onclick = () => setActive(b.dataset.revoke, false));

  /* --- send somebody a link ---
     Covers both "they are locked out" and "they never got the invitation",
     because on this screen those look the same and the fix is the same. The
     outcome is reported rather than assumed: an admin who clicks this walks
     away believing a person has been emailed, and that belief has to be
     earned by the mail server, not by the button. */
  $$('[data-sendlink]').forEach(b => b.onclick = async () => {
    const d = V.DSTR[lang];
    const id = b.dataset.sendlink;
    const was = b.textContent;
    b.disabled = true; b.textContent = d.sendingLink;
    ctx.resetMsg = null;
    try {
      const r = await db.sendResetLink(id);
      ctx.resetMsg = r?.emailed
        ? { ok: true,  text: d.linkSent.replace('{email}', r.email || '') }
        : { ok: false, text: d.linkFailed.replace('{email}', r?.email || '')
                             .replace('{reason}', r?.reason || d.inviteNoReason) };
      await loadFor('admin'); rerender();
    } catch (e) {
      ctx.resetMsg = { ok: false, text: e.message };
      rerender();
    } finally {
      if (b.isConnected) { b.disabled = false; b.textContent = was; }
    }
  });

  /* Group chips on the People screen, composing with the top-bar search the
     same way the project ones do. */
  const whoChips = $$('[data-who]').filter(el => el.tagName === 'BUTTON');
  whoChips.forEach(c => c.onclick = () => {
    whoChips.forEach(x => x.classList.toggle('is-on', x === c));
    const want = c.dataset.who;
    $$('.tbl tbody tr').forEach(tr => {
      if (tr.dataset.empty) return;
      tr.dataset.chipHidden = (want !== 'all' && tr.dataset.who !== want) ? '1' : '';
      tr.hidden = !!tr.dataset.chipHidden || tr.dataset.searchHidden === '1';
    });
  });

  $$('.pDept').forEach(s => s.onchange = () =>
    db.setPerson(s.dataset.p, { department_id: s.value || null }).catch(fail));
  $$('.pRole').forEach(s => s.onchange = () =>
    db.setPerson(s.dataset.p, { role: s.value }).catch(fail));

  /* --- new project --- */
  const pf = $('#projForm');
  if (pf) wireNewProject(lang, pf);
}

function readProjectForm() {
  const stages = $$('.stageOn').filter(c => c.checked).map(c => c.value);
  const who = Object.fromEntries($$('.stageWho').map(s => [s.dataset.dept, s.value || null]));
  return {
    name: $('#pName').value.trim(),
    client: $('#pClient').value.trim() || null,
    size: $('#pSize').value,
    start: $('#pStart').value || undefined,
    deadline: $('#pDeadline').value || null,
    description: $('#pDesc').value.trim() || null,
    stages, who,
  };
}

function wireNewProject(lang, form) {
  const refresh = () => {
    const f = readProjectForm();
    if (!f.stages.length) { $('#estBox').innerHTML = ''; ctx.est = null; return; }
    try {
      const { sched, depth } = V.buildScheduler(ctx.people, ctx.stages, ctx.projects);
      ctx.est = V.estimateFor(sched, f, depth);
      $('#estBox').innerHTML = V.estimateBox(lang, ctx.est);
    } catch (e) {
      $('#estBox').innerHTML = `<p class="note bad">${e.message}</p>`;
    }
  };

  ['#pSize', '#pStart', '#pDeadline'].forEach(s => { const el = $(s); if (el) el.onchange = refresh; });
  $$('.stageOn').forEach(c => c.onchange = refresh);
  refresh();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#pGo'); btn.disabled = true; btn.textContent = V.DSTR[lang].saving;
    const f = readProjectForm();
    try {
      const project = await db.createProject({
        name: f.name, client: f.client, size: f.size, description: f.description,
        start_on: f.start || null, due_on: f.deadline,
        status: 'in_design',
        estimated_delivery: ctx.est?.real?.delivery || null,
        estimate_meta: ctx.est ? {
          computed_at: new Date().toISOString(),
          naive: ctx.est.naive?.delivery || null,
          confidence: ctx.est.real?.confidence ?? null,
        } : null,
      });

      if (f.stages.length) {
        await db.setStages(project.id, f.stages.map(d => ({
          department_id: d,
          assignee_id: f.who[d] || null,
          effort_days: db.dept(d)?.base_days ?? null,
          status: 'pending',
        })));
      }

      // Files last: a project with no RFP is recoverable, an RFP with no
      // project to hang off is not. Every file the queue holds goes up — it
      // used to read `.files[0]` and drop the rest on the floor without
      // saying so.
      for (const doc of [...$('#pRfp').files]) {
        await db.uploadFile('rfps', doc, { purpose: 'rfp', project_id: project.id });
      }
      for (const ref of [...$('#pRefs').files]) {
        await db.uploadFile('refs', ref, { purpose: 'reference', project_id: project.id });
      }

      location.hash = '#/home';
    } catch (err) {
      fail(err); btn.disabled = false; btn.textContent = V.DSTR[lang].createAndAssign;
    }
  };
}

/* --------------------------------------------------------------- rendering */

export function appBody(lang, route, id) {
  if (ctx.error) {
    return `<section class="card"><div class="card__head"><h2>Error</h2></div>
      <p class="note bad">${String(ctx.error).replace(/[&<>]/g, '')}</p></section>`
      + bodyFor(lang, route, id);
  }
  return bodyFor(lang, route, id);
}

function bodyFor(lang, route, id) {
  if (route === 'new')      return V.newProjectView(lang, ctx);
  if (route === 'projects') return V.pmView(lang, ctx);
  if (route === 'project')  return V.projectView(lang, ctx);
  if (route === 'lead')     return V.leadView(lang, ctx);
  if (route === 'leads') return V.leadsView(lang, ctx);
  if (route === 'docs')  return V.docsView(lang, ctx);
  if (route === 'admin') return V.adminView(lang, ctx);
  /* Gated in the view as well as in the sidebar. A hidden nav item is a
     decoration; this is the check that survives somebody typing the URL. */
  if (route === 'highlights') {
    return V.canPlan()
      ? V.highlightsView(lang, ctx)
      : V.homeView(lang, ctx);
  }
  return V.homeView(lang, ctx);
}
