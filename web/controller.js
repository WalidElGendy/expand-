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
  loading: false, error: null, authMode: 'in', authMsg: '', est: null,
  inviteMsg: null,      // what actually happened to the last invitation
  authErr: null,        // whatever Supabase sent back in the URL fragment
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

export async function loadFor(route) {
  if (!db.sb) return;
  ctx.loading = true; ctx.error = null;
  try {
    if (!db.state.departments.length) await db.loadDepartments();
    const me = db.state.me;
    if (!me) return;

    const jobs = [];
    const wantsProjects = ['home', 'new', 'project'].includes(route) &&
      (me.department_id === 'pm' || ['admin', 'manager'].includes(me.role));
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

  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#aGo'); const email = $('#aEmail')?.value; const pass = $('#aPass')?.value;
    btn.disabled = true;
    try {
      if (ctx.authMode === 'reset') {
        // Arriving here means Supabase already exchanged the recovery link for
        // a session, so updateUser is authenticated. No email needed.
        await db.updatePassword(pass);
        ctx.authErr = null;
        ctx.authMsg = V.DSTR[lang].passwordSaved;
        location.hash = '#/home';
      } else if (ctx.authMode === 'forgot') {
        await db.resetPassword(email);
        ctx.authErr = null;
        ctx.authMsg = V.DSTR[lang].checkInbox;
      } else if (ctx.authMode === 'up') {
        await db.signUp(email, pass);
        ctx.authMsg = V.DSTR[lang].checkInbox;
        ctx.authMode = 'in';
      } else {
        await db.signIn(email, pass);
        location.hash = '#/home';
      }
    } catch (err) {
      ctx.authMsg = '!' + err.message;
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
    const drop = input.closest('.drop');
    const hintEl = drop?.querySelector('[data-hint]');
    if (!hintEl) return;
    const hint = hintEl.textContent;
    input.onchange = () => {
      const picked = [...input.files];
      drop.classList.toggle('is-set', picked.length > 0);
      hintEl.textContent = !picked.length ? hint
        : picked.length === 1 ? picked[0].name
        : `${picked.length} ${V.DSTR[lang].filesPicked} — ${picked.map(f => f.name).join(', ')}`;
    };
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
      const { sched } = V.buildScheduler(ctx.people, ctx.stages);
      ctx.est = V.estimateFor(sched, f);
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
      // project to hang off is not.
      const rfp = $('#pRfp').files[0];
      if (rfp) await db.uploadFile('rfps', rfp, { purpose: 'rfp', project_id: project.id });
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

export function appBody(lang, route) {
  if (ctx.error) {
    return `<section class="card"><div class="card__head"><h2>Error</h2></div>
      <p class="note bad">${String(ctx.error).replace(/[&<>]/g, '')}</p></section>`
      + bodyFor(lang, route);
  }
  return bodyFor(lang, route);
}

function bodyFor(lang, route) {
  if (route === 'new')   return V.newProjectView(lang, ctx);
  if (route === 'leads') return V.leadsView(lang, ctx);
  if (route === 'docs')  return V.docsView(lang, ctx);
  if (route === 'admin') return V.adminView(lang, ctx);
  return V.homeView(lang, ctx);
}
