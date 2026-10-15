-- =========================================================================
-- Applied 2026-10-15 to project ookiupgocavjbxcxquwl.
-- HR system: employee file, documents, attendance, requests with
-- manager -> HR approval, payroll (salaries, runs, payslips, advances, GOSI),
-- goals, holidays and company letters.
--
-- Access model (enforced here, mirrored in the UI):
--   HR (is_hr: admin or HR department) .... everything
--   supervisor (supervises) ............... their reports' attendance, leave,
--                                           requests (manager stage), goals
--   employee (self) ....................... own file, attendance, requests,
--                                           leave, salary, payslips, goals
-- =========================================================================

-- ------------------------------------------------------------ employee file
alter table hr_employees
  add column if not exists nationality text,
  add column if not exists is_saudi boolean not null default false,
  add column if not exists gender text check (gender in ('male','female')),
  add column if not exists birth_date date,
  add column if not exists marital_status text,
  add column if not exists address text,
  add column if not exists emergency_name text,
  add column if not exists emergency_phone text,
  add column if not exists grade text,
  add column if not exists contract_type text check (contract_type in ('unlimited','fixed','part_time','temporary')),
  add column if not exists contract_start date,
  add column if not exists contract_end date,
  add column if not exists probation_end date,
  add column if not exists work_location text,
  add column if not exists gosi_scheme text check (gosi_scheme in ('saudi_legacy','saudi_new','non_saudi','exempt')),
  add column if not exists end_date date,
  add column if not exists end_reason text;

alter table hr_employee_private
  add column if not exists id_expiry date,
  add column if not exists passport_no text,
  add column if not exists passport_expiry date,
  add column if not exists iban text,
  add column if not exists bank_name text;

-- An employee can read their own employment file (never the private one).
alter policy hre_read on hr_employees
  using (is_hr() or supervises(profile_id) or profile_id = (select my_profile_id()));

alter policy hrl_read on hr_leaves
  using (is_hr() or supervises(employee_id) or employee_id = (select my_profile_id()));

-- HR may also file performance reviews (never for themselves).
create policy rev_write_hr on reviews for insert
  with check (is_hr() and subject_id <> my_profile_id());
create policy rev_update_hr on reviews for update
  using (is_hr() and subject_id <> my_profile_id())
  with check (is_hr() and subject_id <> my_profile_id());

-- ------------------------------------------------------------ settings
create table if not exists hr_settings (
  id int primary key default 1 check (id = 1),
  timezone text not null default 'Asia/Riyadh',
  office_lat double precision,
  office_lng double precision,
  office_radius_m int not null default 200 check (office_radius_m between 20 and 5000),
  work_start time not null default '09:00',
  work_end time not null default '17:00',
  grace_minutes int not null default 15 check (grace_minutes between 0 and 240),
  work_days int[] not null default '{0,1,2,3,4}',          -- 0 = Sunday
  deduct_absence boolean not null default true,
  deduct_late boolean not null default false,
  gosi jsonb not null default '{"cap":45000,
     "saudi_legacy":{"employee":9.75,"employer":11.75},
     "saudi_new":{"employee":10.75,"employer":12.75},
     "non_saudi":{"employee":0,"employer":2}}',
  approval_alert_hours int not null default 48,
  contract_alert_days int not null default 60,
  doc_alert_days int not null default 30,
  company_en text default 'Expand',
  company_ar text default 'إكسباند',
  company_cr text,
  company_address text,
  letter_footer text,
  signatory_name text,
  signatory_title text,
  signature_path text,
  stamp_path text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);
insert into hr_settings (id) values (1) on conflict do nothing;
-- Absences only count from the day clocking in began (set on launch).
alter table hr_settings add column if not exists attendance_start date not null
  default ((now() at time zone 'Asia/Riyadh')::date);

create table if not exists hr_holidays (
  day date primary key,
  name text not null
);

-- ------------------------------------------------------------ documents
create table if not exists hr_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles(id) on delete cascade,
  kind text not null default 'other' check (kind in
    ('contract','id','passport','iqama','visa','certificate','medical','bank','offer','other')),
  title text,
  path text not null,
  file_name text,
  size_bytes bigint,
  expires_on date,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists hr_documents_emp on hr_documents(employee_id);

-- ------------------------------------------------------------ attendance
create table if not exists hr_attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles(id) on delete cascade,
  day date not null,
  clock_in timestamptz,
  clock_out timestamptz,
  in_lat double precision, in_lng double precision, in_accuracy double precision,
  in_distance_m int, in_remote boolean not null default false,
  out_lat double precision, out_lng double precision, out_accuracy double precision,
  out_distance_m int, out_remote boolean not null default false,
  late_minutes int not null default 0,
  early_minutes int not null default 0,
  note text,
  edited_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (employee_id, day)
);
create index if not exists hr_attendance_day on hr_attendance(day);

-- ------------------------------------------------------------ requests
create table if not exists hr_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('annual_leave','sick_leave','unpaid_leave','other_leave',
    'early_leave','advance','salary_certificate','letter','payslip','data_update','other')),
  status text not null default 'pending_hr' check (status in
    ('pending_manager','pending_hr','approved','rejected','cancelled','completed')),
  start_date date,
  end_date date,
  days numeric check (days is null or (days > 0 and days <= 366)),
  leave_time time,                       -- early leave: leaving at
  amount numeric check (amount is null or amount >= 0),
  instalments int check (instalments is null or instalments between 1 and 24),
  addressee text,                        -- certificate / letter: to whom
  details text,
  attachment_path text, attachment_name text,
  result_path text, result_name text,
  manager_id uuid references profiles(id),
  manager_decided_at timestamptz, manager_note text,
  hr_decided_by uuid references profiles(id), hr_decided_at timestamptz, hr_note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hr_requests_emp on hr_requests(employee_id);
create index if not exists hr_requests_status on hr_requests(status);

-- ------------------------------------------------------------ payroll
create table if not exists hr_salaries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles(id) on delete cascade,
  effective_from date not null,
  basic numeric not null default 0 check (basic >= 0),
  housing numeric not null default 0 check (housing >= 0),
  transport numeric not null default 0 check (transport >= 0),
  other_allowances numeric not null default 0 check (other_allowances >= 0),
  reason text not null default 'adjustment' check (reason in ('hire','raise','promotion','adjustment')),
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (employee_id, effective_from)
);

create table if not exists hr_advances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles(id) on delete cascade,
  request_id uuid references hr_requests(id) on delete set null,
  amount numeric not null check (amount > 0),
  instalments int not null default 1 check (instalments between 1 and 24),
  monthly_amount numeric not null check (monthly_amount > 0),
  start_period text not null check (start_period ~ '^\d{4}-\d{2}$'),
  remaining numeric not null check (remaining >= 0),
  status text not null default 'active' check (status in ('active','repaid','cancelled')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists hr_payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period text not null unique check (period ~ '^\d{4}-\d{2}$'),
  status text not null default 'draft' check (status in ('draft','approved','paid')),
  notes text,
  created_by uuid references profiles(id),
  approved_by uuid references profiles(id), approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists hr_payslips (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references hr_payroll_runs(id) on delete cascade,
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  employee_id uuid not null references profiles(id) on delete cascade,
  basic numeric not null default 0, housing numeric not null default 0,
  transport numeric not null default 0, other_allowances numeric not null default 0,
  additions numeric not null default 0, additions_note text,
  gross numeric not null default 0,
  gosi_employee numeric not null default 0, gosi_employer numeric not null default 0,
  absence_days numeric not null default 0, absence_deduction numeric not null default 0,
  late_minutes int not null default 0, late_deduction numeric not null default 0,
  unpaid_days numeric not null default 0, unpaid_deduction numeric not null default 0,
  advance_deduction numeric not null default 0,
  other_deductions numeric not null default 0, deductions_note text,
  net numeric not null default 0,
  details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (run_id, employee_id)
);

-- ------------------------------------------------------------ performance
create table if not exists hr_goals (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text,
  period text,
  due_date date,
  weight numeric check (weight is null or (weight >= 0 and weight <= 100)),
  progress int not null default 0 check (progress between 0 and 100),
  status text not null default 'open' check (status in ('open','done','dropped')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------ letters
create table if not exists hr_letter_counters (
  direction text not null, year int not null, last int not null default 0,
  primary key (direction, year)
);

create table if not exists hr_letters (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('internal','external')),
  number text unique,
  letter_date date not null default current_date,
  kind text not null default 'other' check (kind in ('memo','circular','salary_certificate',
    'employment_certificate','experience','embassy','bank','to_whom','warning','other')),
  lang text not null default 'ar' check (lang in ('ar','en')),
  to_department text references departments(id),
  recipient text,
  recipient_attn text,
  subject text not null,
  body text not null default '',
  employee_id uuid references profiles(id) on delete set null,
  request_id uuid references hr_requests(id) on delete set null,
  attachments jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft','review','approved','sent')),
  signatory_name text, signatory_title text,
  approved_by uuid references profiles(id), approved_at timestamptz,
  sent_at timestamptz, sent_via text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hr_letters_date on hr_letters(letter_date desc);

-- ========================================================== functions

-- Clock in, or clock out if already in today. Server time, office distance
-- computed here so the browser can neither pick the time nor the verdict.
create or replace function hr_clock(p_lat double precision default null,
                                    p_lng double precision default null,
                                    p_accuracy double precision default null)
returns hr_attendance language plpgsql security definer set search_path = public as $$
declare
  me uuid := my_profile_id();
  s hr_settings;
  nowl timestamp;
  d date;
  dist int;
  remote boolean;
  r hr_attendance;
  mins int;
begin
  if me is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into s from hr_settings where id = 1;
  nowl := now() at time zone coalesce(s.timezone, 'Asia/Riyadh');
  d := nowl::date;
  if p_lat is not null and p_lng is not null and s.office_lat is not null then
    dist := round(6371000 * 2 * asin(sqrt(
              power(sin(radians(p_lat - s.office_lat) / 2), 2) +
              cos(radians(s.office_lat)) * cos(radians(p_lat)) *
              power(sin(radians(p_lng - s.office_lng) / 2), 2))));
    remote := dist > s.office_radius_m + least(coalesce(p_accuracy, 0), 150);
  else
    dist := null;
    remote := s.office_lat is not null;   -- location unknown counts as away
  end if;

  select * into r from hr_attendance where employee_id = me and day = d for update;
  if not found then
    mins := greatest(0, floor(extract(epoch from (nowl::time - s.work_start)) / 60))::int;
    if mins <= s.grace_minutes then mins := 0; end if;
    insert into hr_attendance (employee_id, day, clock_in, in_lat, in_lng, in_accuracy,
                               in_distance_m, in_remote, late_minutes)
    values (me, d, now(), p_lat, p_lng, p_accuracy, dist, remote, mins)
    returning * into r;
  else
    mins := greatest(0, floor(extract(epoch from (s.work_end - nowl::time)) / 60))::int;
    update hr_attendance set clock_out = now(), out_lat = p_lat, out_lng = p_lng,
           out_accuracy = p_accuracy, out_distance_m = dist, out_remote = remote,
           early_minutes = mins
     where id = r.id returning * into r;
  end if;
  return r;
end $$;

-- Requests: route on creation. Leave, early leave and advances go to the
-- direct supervisor first; document requests go straight to HR.
create or replace function hr_request_route() returns trigger
language plpgsql security definer set search_path = public as $$
declare sup uuid;
begin
  if new.employee_id is null then new.employee_id := my_profile_id(); end if;
  if not (is_hr() or new.employee_id = my_profile_id()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if new.type in ('annual_leave','sick_leave','unpaid_leave','other_leave') then
    if new.start_date is null or new.end_date is null or new.end_date < new.start_date then
      raise exception 'dates_required';
    end if;
    if new.days is null then new.days := new.end_date - new.start_date + 1; end if;
  elsif new.type = 'early_leave' and (new.start_date is null or new.leave_time is null) then
    raise exception 'date_and_time_required';
  elsif new.type = 'advance' and coalesce(new.amount, 0) <= 0 then
    raise exception 'amount_required';
  end if;

  select p.supervisor_id into sup from profiles p where p.id = new.employee_id;
  if new.type in ('annual_leave','sick_leave','unpaid_leave','other_leave','early_leave','advance')
     and sup is not null and sup <> new.employee_id
     and exists (select 1 from profiles where id = sup and is_active) then
    new.manager_id := sup;
    new.status := 'pending_manager';
  else
    new.manager_id := null;
    new.status := 'pending_hr';
  end if;
  new.manager_decided_at := null; new.manager_note := null;
  new.hr_decided_by := null; new.hr_decided_at := null; new.hr_note := null;
  new.result_path := null; new.result_name := null;
  new.created_by := my_profile_id();
  new.created_at := now(); new.updated_at := now();
  return new;
end $$;
create trigger hr_request_route before insert on hr_requests
  for each row execute function hr_request_route();

-- Approve or reject. The supervisor decides first; HR gives the final word
-- (and may decide at the manager stage on the supervisor's behalf). Nobody
-- decides their own request. Final approval files the leave or the advance.
create or replace function hr_request_decide(p_id uuid, p_approve boolean, p_note text default null)
returns hr_requests language plpgsql security definer set search_path = public as $$
declare
  r hr_requests;
  me uuid := my_profile_id();
  final boolean := false;
  per text;
begin
  select * into r from hr_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if me is null or r.employee_id = me then raise exception 'not_allowed' using errcode = '42501'; end if;

  if r.status = 'pending_manager' then
    if r.manager_id = me and not is_hr() then
      update hr_requests set manager_decided_at = now(), manager_note = p_note,
             status = case when p_approve then 'pending_hr' else 'rejected' end,
             updated_at = now()
       where id = p_id returning * into r;
      return r;
    elsif is_hr() then
      if r.manager_id = me then
        update hr_requests set manager_decided_at = now(), manager_note = p_note where id = p_id;
      end if;
      final := true;
    else
      raise exception 'not_allowed' using errcode = '42501';
    end if;
  elsif r.status = 'pending_hr' then
    if not is_hr() then raise exception 'not_allowed' using errcode = '42501'; end if;
    final := true;
  else
    raise exception 'not_pending';
  end if;

  if final then
    update hr_requests set status = case when p_approve then 'approved' else 'rejected' end,
           hr_decided_by = me, hr_decided_at = now(), hr_note = p_note, updated_at = now()
     where id = p_id returning * into r;
    if p_approve then
      if r.type in ('annual_leave','sick_leave','unpaid_leave','other_leave') then
        insert into hr_leaves (employee_id, kind, start_date, end_date, days, note, created_by)
        values (r.employee_id,
                (case r.type when 'annual_leave' then 'annual' when 'sick_leave' then 'sick'
                             when 'unpaid_leave' then 'unpaid' else 'other' end)::hr_leave_kind,
                r.start_date, r.end_date, r.days,
                left(coalesce(r.details, '') , 400), me);
      elsif r.type = 'advance' then
        per := to_char((date_trunc('month', now() at time zone 'Asia/Riyadh') + interval '1 month'), 'YYYY-MM');
        insert into hr_advances (employee_id, request_id, amount, instalments, monthly_amount,
                                 start_period, remaining, created_by)
        values (r.employee_id, r.id, r.amount, coalesce(r.instalments, 1),
                round(r.amount / coalesce(r.instalments, 1), 2), per, r.amount, me);
      end if;
    end if;
  end if;
  return r;
end $$;

create or replace function hr_request_cancel(p_id uuid) returns hr_requests
language plpgsql security definer set search_path = public as $$
declare r hr_requests;
begin
  update hr_requests set status = 'cancelled', updated_at = now()
   where id = p_id and employee_id = my_profile_id()
     and status in ('pending_manager','pending_hr')
  returning * into r;
  if not found then raise exception 'not_cancellable'; end if;
  return r;
end $$;

create or replace function hr_request_complete(p_id uuid, p_path text default null,
                                               p_name text default null, p_note text default null)
returns hr_requests language plpgsql security definer set search_path = public as $$
declare r hr_requests;
begin
  if not is_hr() then raise exception 'not_allowed' using errcode = '42501'; end if;
  update hr_requests set status = 'completed',
         result_path = coalesce(p_path, result_path), result_name = coalesce(p_name, result_name),
         hr_note = coalesce(p_note, hr_note),
         hr_decided_by = coalesce(hr_decided_by, my_profile_id()),
         hr_decided_at = coalesce(hr_decided_at, now()), updated_at = now()
   where id = p_id and status in ('approved','pending_hr')
  returning * into r;
  if not found then raise exception 'not_completable'; end if;
  return r;
end $$;

-- Payroll: once approved, payslips are frozen. Paying a run takes the
-- advance instalments it deducted off the outstanding balances.
create or replace function hr_payslip_lock() returns trigger
language plpgsql security definer set search_path = public as $$
declare st text;
begin
  select status into st from hr_payroll_runs where id = coalesce(new.run_id, old.run_id);
  if st is not null and st <> 'draft' then raise exception 'run_locked'; end if;
  return coalesce(new, old);
end $$;
create trigger hr_payslip_lock before insert or update or delete on hr_payslips
  for each row execute function hr_payslip_lock();

create or replace function hr_payroll_set_status(p_run uuid, p_status text) returns hr_payroll_runs
language plpgsql security definer set search_path = public as $$
declare
  r hr_payroll_runs;
  ps record;
  a record;
  left_ numeric;
  take numeric;
begin
  if not is_hr() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into r from hr_payroll_runs where id = p_run for update;
  if not found then raise exception 'not_found'; end if;
  if not ((r.status = 'draft' and p_status = 'approved') or
          (r.status = 'approved' and p_status in ('paid','draft'))) then
    raise exception 'bad_transition';
  end if;
  if p_status = 'approved' then
    update hr_payroll_runs set status = 'approved', approved_by = my_profile_id(), approved_at = now()
     where id = p_run returning * into r;
  elsif p_status = 'draft' then
    update hr_payroll_runs set status = 'draft', approved_by = null, approved_at = null
     where id = p_run returning * into r;
  else
    for ps in select employee_id, advance_deduction from hr_payslips
               where run_id = p_run and advance_deduction > 0 loop
      left_ := ps.advance_deduction;
      for a in select * from hr_advances
                where employee_id = ps.employee_id and status = 'active' and start_period <= r.period
                order by created_at for update loop
        exit when left_ <= 0;
        take := least(left_, a.remaining);
        update hr_advances set remaining = remaining - take,
               status = case when remaining - take <= 0 then 'repaid' else status end
         where id = a.id;
        left_ := left_ - take;
      end loop;
    end loop;
    update hr_payroll_runs set status = 'paid', paid_at = now() where id = p_run returning * into r;
  end if;
  return r;
end $$;

-- Letters: automatic number per direction and year; only an admin approves;
-- an approved letter cannot be edited, only marked as sent.
create or replace function hr_letter_number() returns trigger
language plpgsql security definer set search_path = public as $$
declare y int; n int;
begin
  if not is_hr() then raise exception 'not_allowed' using errcode = '42501'; end if;
  y := extract(year from coalesce(new.letter_date, current_date))::int;
  insert into hr_letter_counters (direction, year, last) values (new.direction, y, 1)
  on conflict (direction, year) do update set last = hr_letter_counters.last + 1
  returning last into n;
  new.number := (case new.direction when 'internal' then 'INT' else 'OUT' end)
                || '-' || y || '-' || lpad(n::text, 4, '0');
  if new.status not in ('draft','review') then new.status := 'draft'; end if;
  new.approved_by := null; new.approved_at := null; new.sent_at := null;
  new.created_by := my_profile_id();
  new.created_at := now(); new.updated_at := now();
  return new;
end $$;
create trigger hr_letter_number before insert on hr_letters
  for each row execute function hr_letter_number();

create or replace function hr_letter_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare s hr_settings;
begin
  if new.number is distinct from old.number or new.direction is distinct from old.direction then
    raise exception 'number_locked';
  end if;
  if old.status in ('approved','sent') then
    if (new.subject, new.body, new.recipient, new.recipient_attn, new.to_department, new.kind,
        new.letter_date, new.employee_id, new.attachments, new.lang, new.signatory_name,
        new.signatory_title)
       is distinct from
       (old.subject, old.body, old.recipient, old.recipient_attn, old.to_department, old.kind,
        old.letter_date, old.employee_id, old.attachments, old.lang, old.signatory_name,
        old.signatory_title) then
      raise exception 'letter_locked';
    end if;
    if not (new.status = old.status or (old.status = 'approved' and new.status = 'sent')) then
      raise exception 'bad_transition';
    end if;
    if new.status = 'sent' and old.status = 'approved' then new.sent_at := coalesce(new.sent_at, now()); end if;
  else
    if new.status = 'approved' then
      if not is_admin() then raise exception 'only_admin_approves' using errcode = '42501'; end if;
      if old.status <> 'review' then raise exception 'review_first'; end if;
      select * into s from hr_settings where id = 1;
      new.approved_by := my_profile_id(); new.approved_at := now();
      new.signatory_name := coalesce(new.signatory_name, s.signatory_name);
      new.signatory_title := coalesce(new.signatory_title, s.signatory_title);
    elsif new.status = 'sent' then
      raise exception 'approve_first';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger hr_letter_guard before update on hr_letters
  for each row execute function hr_letter_guard();

-- ========================================================== access

-- A payslip is visible to its employee once its run is approved. Asked
-- through a definer function so the payslip policy does not have to read
-- hr_payroll_runs under the employee's own (empty) view of it.
create or replace function hr_run_released(p_run uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from hr_payroll_runs where id = p_run and status in ('approved','paid'))
$$;
revoke execute on function hr_run_released(uuid) from public, anon;
grant execute on function hr_run_released(uuid) to authenticated;

alter table hr_settings enable row level security;
alter table hr_holidays enable row level security;
alter table hr_documents enable row level security;
alter table hr_attendance enable row level security;
alter table hr_requests enable row level security;
alter table hr_salaries enable row level security;
alter table hr_advances enable row level security;
alter table hr_payroll_runs enable row level security;
alter table hr_payslips enable row level security;
alter table hr_goals enable row level security;
alter table hr_letter_counters enable row level security;
alter table hr_letters enable row level security;

revoke all on hr_settings, hr_holidays, hr_documents, hr_attendance, hr_requests, hr_salaries,
  hr_advances, hr_payroll_runs, hr_payslips, hr_goals, hr_letter_counters, hr_letters from anon;
revoke all on hr_letter_counters from authenticated;

-- settings & holidays: everyone signed in reads (the clock needs the hours);
-- only HR writes. No secrets live here — signature/stamp files are in the
-- private bucket and only HR can open them.
create policy hrs_read on hr_settings for select using (is_active_user());
create policy hrs_write on hr_settings for update using (is_hr()) with check (is_hr());
create policy hrhol_read on hr_holidays for select using (is_active_user());
create policy hrhol_write on hr_holidays for all using (is_hr()) with check (is_hr());

create policy hrdoc_read on hr_documents for select
  using (is_hr() or employee_id = (select my_profile_id()));
create policy hrdoc_write on hr_documents for all using (is_hr()) with check (is_hr());

create policy hratt_read on hr_attendance for select
  using (is_hr() or employee_id = (select my_profile_id()) or supervises(employee_id));
create policy hratt_write on hr_attendance for all using (is_hr()) with check (is_hr());

create policy hrreq_read on hr_requests for select
  using (is_hr() or employee_id = (select my_profile_id())
         or manager_id = (select my_profile_id()) or supervises(employee_id));
create policy hrreq_insert on hr_requests for insert
  with check (is_hr() or employee_id = (select my_profile_id()));
create policy hrreq_hr_update on hr_requests for update using (is_hr()) with check (is_hr());
create policy hrreq_hr_delete on hr_requests for delete using (is_hr());

create policy hrsal_read on hr_salaries for select
  using (is_hr() or employee_id = (select my_profile_id()));
create policy hrsal_write on hr_salaries for all using (is_hr()) with check (is_hr());

create policy hradv_read on hr_advances for select
  using (is_hr() or employee_id = (select my_profile_id()));
create policy hradv_write on hr_advances for all using (is_hr()) with check (is_hr());

create policy hrrun_all on hr_payroll_runs for all using (is_hr()) with check (is_hr());

create policy hrslip_all on hr_payslips for all using (is_hr()) with check (is_hr());
create policy hrslip_self on hr_payslips for select
  using (employee_id = (select my_profile_id()) and hr_run_released(run_id));

create policy hrgoal_read on hr_goals for select
  using (is_hr() or employee_id = (select my_profile_id()) or supervises(employee_id));
create policy hrgoal_write on hr_goals for all
  using (is_hr() or supervises(employee_id)) with check (is_hr() or supervises(employee_id));

create policy hrlet_read on hr_letters for select using (is_hr());
create policy hrlet_insert on hr_letters for insert with check (is_hr());
create policy hrlet_update on hr_letters for update using (is_hr()) with check (is_hr());
create policy hrlet_delete on hr_letters for delete using (is_hr() and status = 'draft');

-- Private bucket: an employee reads their own files (employees/<me>/...,
-- requests/<me>/...) and uploads request attachments under requests/<me>/;
-- a supervisor reads their reports' request attachments (sick notes).
create policy hr_self_read on storage.objects for select to authenticated
  using (bucket_id = 'hr'
         and (storage.foldername(name))[1] in ('employees','requests')
         and (storage.foldername(name))[2] = (select my_profile_id())::text);
create policy hr_sup_read on storage.objects for select to authenticated
  using (bucket_id = 'hr' and (storage.foldername(name))[1] = 'requests'
         and exists (select 1 from profiles p
                      where p.id::text = (storage.foldername(name))[2]
                        and p.supervisor_id = (select my_profile_id())));
create policy hr_self_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'hr' and (storage.foldername(name))[1] = 'requests'
              and (storage.foldername(name))[2] = (select my_profile_id())::text);

revoke execute on function hr_clock(double precision, double precision, double precision),
  hr_request_decide(uuid, boolean, text), hr_request_cancel(uuid),
  hr_request_complete(uuid, text, text, text), hr_payroll_set_status(uuid, text)
  from public, anon;
grant execute on function hr_clock(double precision, double precision, double precision),
  hr_request_decide(uuid, boolean, text), hr_request_cancel(uuid),
  hr_request_complete(uuid, text, text, text), hr_payroll_set_status(uuid, text)
  to authenticated;
revoke execute on function hr_request_route(), hr_payslip_lock(), hr_letter_number(),
  hr_letter_guard() from public, anon, authenticated;
