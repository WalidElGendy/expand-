-- =========================================================================
-- Row-level security test.
--
-- Run this in the Supabase SQL editor after ANY change to policies, roles or
-- the profile/login split. It impersonates real signed-in users by setting
-- the same JWT claims the API sets, attempts writes that must fail and writes
-- that must succeed, and reports both.
--
-- The whole thing runs inside one transaction that ends in a deliberate
-- exception, so every row it creates -- including two throwaway auth users --
-- is rolled back. A security test that leaves accounts behind is itself a
-- security problem.
--
-- It has already earned its keep once: it caught policies comparing a PROFILE
-- id against a LOGIN id after those two were separated, which silently denied
-- every designer the one write they have.
-- =========================================================================
do $$
declare
  du uuid := '11111111-1111-1111-1111-111111111111';
  bu uuid := '22222222-2222-2222-2222-222222222222';
  dpid uuid; bpid uuid; sid uuid; tid uuid; r text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (du, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-designer@test.invalid', now(), now()),
         (bu, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-bd@test.invalid', now(), now());
  update profiles set department_id='2d', role='member', is_active=true where user_id=du returning id into dpid;
  update profiles set department_id='bd', role='member', is_active=true where user_id=bu returning id into bpid;

  select id into sid from project_stages limit 1;
  update project_stages set assignee_id = dpid, status='pending', started_at=null where id = sid;
  select id into tid from tasks where completed = false limit 1;
  update tasks set assignee_id = dpid where id = tid;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', du, 'role','authenticated')::text, true);

  begin insert into projects (name) values ('blocked');
        r := r || 'FAIL  designer created a project' || E'\n';
  exception when others then r := r || 'PASS  designer cannot create a project' || E'\n'; end;

  begin insert into leads (name) values ('blocked');
        r := r || 'FAIL  designer created a lead' || E'\n';
  exception when others then r := r || 'PASS  designer cannot create a lead' || E'\n'; end;

  begin update profiles set role='admin' where id = dpid;
        r := r || 'FAIL  designer self-promoted' || E'\n';
  exception when others then r := r || 'PASS  designer cannot self-promote' || E'\n'; end;

  begin update profiles set full_name='Renamed' where id = dpid;
        if found then r := r || 'PASS  designer CAN rename themselves' || E'\n';
        else r := r || 'FAIL  designer cannot edit own name' || E'\n'; end if;
  exception when others then r := r || 'FAIL  designer cannot edit own name' || E'\n'; end;

  begin update project_stages set status='in_progress', started_at=now() where id = sid;
        if found then r := r || 'PASS  designer CAN start their own stage' || E'\n';
        else r := r || 'FAIL  designer blocked from own stage' || E'\n'; end if;
  exception when others then r := r || 'FAIL  designer blocked from own stage' || E'\n'; end;

  begin update project_stages set status='done'
        where id <> sid and id in (select id from project_stages where assignee_id is distinct from dpid limit 1);
        if found then r := r || 'FAIL  designer changed another stage' || E'\n';
        else r := r || 'PASS  designer cannot touch another stage' || E'\n'; end if;
  exception when others then r := r || 'PASS  designer cannot touch another stage' || E'\n'; end;

  begin update tasks set completed = true where id = tid;
        if found then r := r || 'PASS  designer CAN complete their own task' || E'\n';
        else r := r || 'FAIL  designer cannot complete own task' || E'\n'; end if;
  exception when others then r := r || 'FAIL  designer cannot complete own task' || E'\n'; end;

  if (select count(*) from invitations) = 0 then r := r || 'PASS  invitations hidden from non-admin' || E'\n';
  else r := r || 'FAIL  designer read invitations' || E'\n'; end if;

  if (select count(*) from projects) > 100 then r := r || 'PASS  designer CAN read the workspace' || E'\n';
  else r := r || 'FAIL  designer cannot read projects' || E'\n'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', bu, 'role','authenticated')::text, true);
  begin insert into leads (name, status) values ('allowed','new');
        r := r || 'PASS  BD CAN create a lead' || E'\n';
  exception when others then r := r || 'FAIL  BD blocked from lead' || E'\n'; end;
  begin insert into projects (name) values ('blocked');
        r := r || 'FAIL  BD created a project' || E'\n';
  exception when others then r := r || 'PASS  BD cannot create a project' || E'\n'; end;

  reset role; set local role anon;
  perform set_config('request.jwt.claims', null, true);
  if (select count(*) from projects) = 0 then r := r || 'PASS  anon sees no projects' || E'\n';
  else r := r || 'FAIL  anon reads projects' || E'\n'; end if;
  if (select count(*) from profiles) = 0 then r := r || 'PASS  anon sees no people' || E'\n';
  else r := r || 'FAIL  anon reads the roster' || E'\n'; end if;

  reset role;
  raise exception E'\n=== RLS TEST ===\n%(rolled back)', r;
end $$;

-- =========================================================================
-- Performance reviews.
--
-- Same shape as above, and the same rollback-by-exception ending. This one
-- guards a promise made to every person in the company: your score is yours
-- and your supervisor's, and nobody else's. That promise lives in the
-- policies, not in the screen that hides the numbers, so this is the only
-- place it can actually be proven.
--
-- The self-supervisor check at the end is the subtle one. `prof_update_self`
-- lets a person edit their own row, and the review policies grant write to
-- "the supervisor of this row's subject" — so without supervisor_id in the
-- self-edit guard, anyone could point that column at themselves and author
-- their own appraisal.
-- =========================================================================
do $$
declare
  bossu uuid := '33333333-3333-3333-3333-333333333333';   -- the supervisor
  staffu uuid := '44444444-4444-4444-4444-444444444444';  -- their report
  otheru uuid := '55555555-5555-5555-5555-555555555555';  -- an unrelated colleague
  bp uuid; sp uuid; op uuid; rid uuid; r text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
    (bossu,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-boss@test.invalid',now(),now()),
    (staffu,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-staff@test.invalid',now(),now()),
    (otheru,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-other@test.invalid',now(),now());
  update profiles set department_id='pm', role='manager', is_active=true where user_id=bossu returning id into bp;
  update profiles set department_id='pm', role='member',  is_active=true where user_id=staffu returning id into sp;
  update profiles set department_id='pm', role='member',  is_active=true where user_id=otheru returning id into op;
  update profiles set supervisor_id = bp where id = sp;

  set local role authenticated;

  perform set_config('request.jwt.claims', json_build_object('sub', bossu, 'role','authenticated')::text, true);
  begin insert into reviews (subject_id, author_id, period, ratings)
        values (sp, bp, '2026-Q3', '{"a":5}'::jsonb) returning id into rid;
        r := r || 'PASS  supervisor CAN review their own report' || E'\n';
  exception when others then r := r || 'FAIL  supervisor blocked from own report: ' || sqlerrm || E'\n'; end;

  begin insert into reviews (subject_id, author_id, period, ratings) values (op, bp, '2026-Q3', '{"a":1}'::jsonb);
        r := r || 'FAIL  supervisor reviewed somebody NOT assigned to them' || E'\n';
  exception when others then r := r || 'PASS  supervisor cannot review outside their own people' || E'\n'; end;

  begin insert into reviews (subject_id, author_id, period, ratings) values (bp, bp, '2026-Q3', '{"a":5}'::jsonb);
        r := r || 'FAIL  supervisor reviewed THEMSELVES' || E'\n';
  exception when others then r := r || 'PASS  nobody can review themselves' || E'\n'; end;

  if (select count(*) from reviews where subject_id = sp) = 1
    then r := r || 'PASS  supervisor CAN read their own report''s review' || E'\n';
    else r := r || 'FAIL  supervisor cannot read the review they wrote' || E'\n'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', staffu, 'role','authenticated')::text, true);
  if (select count(*) from reviews where subject_id = sp) = 1
    then r := r || 'PASS  a person CAN read their own score' || E'\n';
    else r := r || 'FAIL  a person cannot read their own score' || E'\n'; end if;
  begin update reviews set ratings = '{"a":5,"b":5}'::jsonb where id = rid;
        if found then r := r || 'FAIL  the subject edited their own review' || E'\n';
        else r := r || 'PASS  the subject cannot edit their own review' || E'\n'; end if;
  exception when others then r := r || 'PASS  the subject cannot edit their own review' || E'\n'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', otheru, 'role','authenticated')::text, true);
  if (select count(*) from reviews) = 0
    then r := r || 'PASS  a colleague sees NO reviews at all' || E'\n';
    else r := r || 'FAIL  a colleague read somebody else''s review' || E'\n'; end if;

  begin update profiles set supervisor_id = op where id = op;
        r := r || 'FAIL  a member made THEMSELVES their own supervisor' || E'\n';
  exception when others then r := r || 'PASS  a member cannot set their own supervisor' || E'\n'; end;

  reset role; set local role anon;
  perform set_config('request.jwt.claims', null, true);
  if (select count(*) from reviews) = 0 then r := r || 'PASS  anon sees no reviews' || E'\n';
  else r := r || 'FAIL  anon read reviews' || E'\n'; end if;

  reset role;
  raise exception E'\n=== REVIEW RLS ===\n%(rolled back)', r;
end $$;
