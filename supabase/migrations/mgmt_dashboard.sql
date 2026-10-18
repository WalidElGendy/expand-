-- ==========================================================================
-- Applied 2026-10-18 to project ookiupgocavjbxcxquwl.
-- Management dashboard on Home (admins and managers).
--
--   · projects.contract_value_sar — what a project is worth. Filled from the
--     tender value when a tender is approved; editable on the project page.
--   · mgmt_tenders() — the tender rows the dashboard needs, for admins,
--     managers and tender staff (RLS on tenders only lets tender staff and
--     the assigned PM read them).
--   · mgmt_hr() — company-wide HR figures as one JSON object: counts only,
--     no names, no salaries except a payroll total for admins and HR.
-- ==========================================================================

alter table projects add column if not exists contract_value_sar numeric
  check (contract_value_sar is null or contract_value_sar >= 0);

create or replace function is_management() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_active and role in ('admin','manager') from profiles where user_id = auth.uid()), false)
$$;

create or replace function mgmt_tenders() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_management() or tender_staff()) then raise exception 'not_allowed' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', id, 'ref', ref, 'title', title, 'client', client, 'status', status, 'value_sar', value_sar,
    'reject_reason', reject_reason, 'pm_id', pm_id, 'submission_due', submission_due,
    'created_at', created_at, 'sent_at', sent_at, 'decided_at', decided_at)) from tenders), '[]'::jsonb);
end $$;

create or replace function mgmt_hr() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Riyadh')::date;
        m0 date := (date_trunc('month', (now() at time zone 'Asia/Riyadh')) - interval '11 months')::date;
        r jsonb;
begin
  if not (is_management() or is_hr()) then raise exception 'not_allowed' using errcode = '42501'; end if;
  with staff as (
    select p.id, p.department_id, e.is_saudi, e.nationality, e.joining_date, e.contract_end, e.probation_end
      from profiles p left join hr_employees e on e.profile_id = p.id
     where p.is_active and coalesce(e.employment_status::text, 'active') <> 'terminated')
  select jsonb_build_object(
    'today', d,
    'active', (select count(*) from staff),
    'by_dept', (select coalesce(jsonb_agg(jsonb_build_object('dept', department_id, 'n', n) order by n desc), '[]'::jsonb)
                  from (select department_id, count(*) n from staff group by 1) x),
    'saudi', (select count(*) from staff where is_saudi),
    'non_saudi', (select count(*) from staff where not coalesce(is_saudi, false) and nullif(btrim(coalesce(nationality, '')), '') is not null),
    'nat_unknown', (select count(*) from staff where not coalesce(is_saudi, false) and nullif(btrim(coalesce(nationality, '')), '') is null),
    'no_file', (select count(*) from staff where joining_date is null),
    'on_leave_today', (select count(distinct l.employee_id) from hr_leaves l join staff s on s.id = l.employee_id
                        where d between l.start_date and l.end_date and l.kind::text <> 'sick'),
    'sick_today', (select count(distinct l.employee_id) from hr_leaves l join staff s on s.id = l.employee_id
                    where d between l.start_date and l.end_date and l.kind::text = 'sick'),
    'present_today', (select count(distinct a.employee_id) from hr_attendance a where a.day = d and a.clock_in is not null),
    'pending_requests', (select count(*) from hr_requests where status in ('pending_manager','pending_hr')),
    'contracts_ending', (select count(*) from staff where contract_end between d and d + 60),
    'contracts_expired', (select count(*) from staff where contract_end < d),
    'probation_ending', (select count(*) from staff where probation_end between d and d + 30),
    'joined_ytd', (select count(*) from staff where joining_date >= date_trunc('year', d)::date),
    'left_ytd', (select count(*) from hr_employees where employment_status::text = 'terminated'
                   and coalesce(end_date, updated_at::date) >= date_trunc('year', d)::date),
    'leave_by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', m, 'annual', a, 'sick', s, 'other', o) order by m), '[]'::jsonb) from (
        select to_char(g, 'YYYY-MM') m,
               count(*) filter (where l.kind::text = 'annual') a,
               count(*) filter (where l.kind::text = 'sick') s,
               count(*) filter (where l.kind::text not in ('annual','sick')) o
          from hr_leaves l,
               generate_series(greatest(l.start_date, m0), least(l.end_date, d), interval '1 day') g
         where l.end_date >= m0 and l.start_date <= d
         group by 1) x),
    'present_by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'n', n) order by day), '[]'::jsonb) from (
        select day, count(distinct employee_id) n from hr_attendance
         where day > d - 30 and day <= d and clock_in is not null group by day) x),
    'payroll', case when is_admin() or is_hr() then (
        select jsonb_build_object('period', r.period, 'status', r.status, 'people', count(ps.id),
               'gross', coalesce(sum(ps.gross), 0), 'net', coalesce(sum(ps.net), 0), 'gosi_employer', coalesce(sum(ps.gosi_employer), 0))
          from hr_payroll_runs r left join hr_payslips ps on ps.run_id = r.id
         where r.id = (select id from hr_payroll_runs where status in ('approved','paid') order by period desc limit 1)
         group by r.period, r.status) else null end
  ) into r;
  return r;
end $$;

-- Approving a tender now also records the project's contract value.
-- (tender_decide is otherwise unchanged; see tenders.sql.)
--   insert into projects (..., contract_value_sar) values (..., t.value_sar)

-- run separately:
-- revoke execute on function mgmt_tenders() from public, anon;
-- revoke execute on function mgmt_hr() from public, anon;
-- revoke execute on function is_management() from public, anon;
