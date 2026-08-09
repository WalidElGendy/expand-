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
