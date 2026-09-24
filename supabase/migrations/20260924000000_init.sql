-- Atteno_Sync: initial schema
-- All timestamps are timestamptz (UTC on disk); work_date is the factory-local calendar date.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Global payroll / attendance rules (single row)
-- ---------------------------------------------------------------------------
create table public.settings (
  id                   smallint primary key default 1 check (id = 1),
  timezone             text         not null default 'Asia/Kolkata',
  late_grace_minutes   int          not null default 5 check (late_grace_minutes between 0 and 60),
  overtime_multiplier  numeric(4,2) not null default 1.50 check (overtime_multiplier >= 1),
  currency             text         not null default 'INR',
  updated_at           timestamptz  not null default now()
);
insert into public.settings (id) values (1);

-- ---------------------------------------------------------------------------
-- Shift patterns. standard_hours = paid base hours per day AND the daily overtime threshold.
-- 08:00-17:15 = 9h15m on site - 75 min unpaid break = 8h standard.
-- ---------------------------------------------------------------------------
create table public.shifts (
  code            text primary key check (code ~ '^[A-Z]$'),
  name            text         not null,
  start_time      time         not null,
  end_time        time         not null,
  break_minutes   int          not null default 75 check (break_minutes >= 0),
  standard_hours  numeric(4,2) not null default 8.00 check (standard_hours > 0),
  check (end_time > start_time)
);
insert into public.shifts (code, name, start_time, end_time, break_minutes, standard_hours) values
  ('A', 'Shift A 08:00-17:15', '08:00', '17:15', 75, 8.00),
  ('B', 'Shift B 09:00-18:15', '09:00', '18:15', 75, 8.00);

-- ---------------------------------------------------------------------------
-- Employees. fingerprint_hash = SHA-256 of the enrolled template (audit only).
-- The template itself never leaves the kiosk; see README "Biometric data handling".
-- ---------------------------------------------------------------------------
create table public.employees (
  id                       uuid primary key default gen_random_uuid(),
  employee_code            text          not null unique,
  full_name                text          not null,
  full_name_hi             text,
  shift_code               text references public.shifts(code), -- null = auto-detect from clock-in time
  hourly_rate              numeric(10,2) not null check (hourly_rate >= 0),
  status                   text          not null default 'active' check (status in ('active', 'inactive')),
  fingerprint_hash         text check (fingerprint_hash ~ '^[0-9a-f]{64}$'),
  fingerprint_enrolled_at  timestamptz,
  created_at               timestamptz   not null default now(),
  updated_at               timestamptz   not null default now()
);
create index employees_status_idx on public.employees (status);

-- ---------------------------------------------------------------------------
-- Admin users (rows reference Supabase Auth users)
-- ---------------------------------------------------------------------------
create table public.admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Registered kiosk devices. Only the ECDSA P-256 public key is stored;
-- the private key is non-exportable inside the kiosk's Android Keystore.
-- ---------------------------------------------------------------------------
create table public.devices (
  id               uuid primary key default gen_random_uuid(),
  name             text        not null,
  public_key_spki  text        not null unique,
  status           text        not null default 'active' check (status in ('active', 'revoked')),
  registered_by    uuid references auth.users(id),
  last_seen_at     timestamptz,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Attendance events (append-only; corrections are made by voiding)
-- ---------------------------------------------------------------------------
create table public.attendance_events (
  id              bigint generated always as identity primary key,
  employee_id     uuid        not null references public.employees(id) on delete restrict,
  event_type      text        not null check (event_type in ('in', 'out')),
  captured_at     timestamptz not null,                 -- when the finger was scanned
  received_at     timestamptz not null default now(),   -- when the server accepted it
  work_date       date        not null,                 -- factory-local date of the matching clock-in
  shift_code      text        not null references public.shifts(code),
  was_late        boolean     not null default false,
  was_early       boolean     not null default false,
  device_id       uuid references public.devices(id),
  nonce           uuid        not null unique default gen_random_uuid(), -- replay protection
  match_score     int,
  source          text        not null default 'kiosk' check (source in ('kiosk', 'admin')),
  synced_offline  boolean     not null default false,
  voided          boolean     not null default false,
  voided_by       uuid references auth.users(id),
  voided_at       timestamptz,
  note            text
);
create index attendance_events_date_idx         on public.attendance_events (work_date);
create index attendance_events_emp_date_idx     on public.attendance_events (employee_id, work_date);
create index attendance_events_emp_captured_idx on public.attendance_events (employee_id, captured_at desc);

-- ---------------------------------------------------------------------------
-- Monthly payroll snapshot (regenerating a month overwrites it)
-- ---------------------------------------------------------------------------
create table public.payroll (
  id                   bigint generated always as identity primary key,
  employee_id          uuid          not null references public.employees(id) on delete restrict,
  year                 int           not null check (year between 2000 and 2100),
  month                int           not null check (month between 1 and 12),
  days_worked          int           not null,
  incomplete_days      int           not null default 0,
  base_hours           numeric(8,2)  not null,
  overtime_hours       numeric(8,2)  not null,
  hourly_rate          numeric(10,2) not null,
  overtime_multiplier  numeric(4,2)  not null,
  base_pay             numeric(12,2) not null,
  overtime_pay         numeric(12,2) not null,
  total_pay            numeric(12,2) not null,
  daily_breakdown      jsonb         not null default '[]',
  generated_at         timestamptz   not null default now(),
  generated_by         uuid references auth.users(id),
  unique (employee_id, year, month)
);
create index payroll_period_idx on public.payroll (year, month);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger employees_touch before update on public.employees
  for each row execute function public.touch_updated_at();

-- Only void/note columns may change after insert, so the audit trail cannot be rewritten.
create or replace function public.attendance_events_guard() returns trigger
language plpgsql as $$
begin
  if (new.employee_id, new.event_type, new.captured_at, new.work_date, new.shift_code, new.nonce, new.device_id, new.source)
     is distinct from
     (old.employee_id, old.event_type, old.captured_at, old.work_date, old.shift_code, old.nonce, old.device_id, old.source) then
    raise exception 'attendance_events is append-only: void the row instead of editing it';
  end if;
  return new;
end $$;

create trigger attendance_events_guard before update on public.attendance_events
  for each row execute function public.attendance_events_guard();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Admins get access through the web dashboard. Kiosks never talk to tables directly;
-- they call Edge Functions that verify the device signature and use the service role.
-- If an admin has enrolled a TOTP factor, the session must be aal2 (2FA verified).
-- ---------------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid())
     and (
       coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
       or not exists (
         select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'
       )
     );
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

alter table public.settings          enable row level security;
alter table public.shifts            enable row level security;
alter table public.employees         enable row level security;
alter table public.admins            enable row level security;
alter table public.devices           enable row level security;
alter table public.attendance_events enable row level security;
alter table public.payroll           enable row level security;

create policy settings_admin  on public.settings  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy shifts_admin    on public.shifts    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy employees_admin on public.employees for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy devices_admin   on public.devices   for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admins_read     on public.admins    for select to authenticated using (public.is_admin());

-- Attendance: read + void only (no hard delete from the dashboard)
create policy attendance_read   on public.attendance_events for select to authenticated using (public.is_admin());
create policy attendance_insert on public.attendance_events for insert to authenticated with check (public.is_admin() and source = 'admin');
create policy attendance_void   on public.attendance_events for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Payroll rows are written only by the generate-payroll function (service role)
create policy payroll_read on public.payroll for select to authenticated using (public.is_admin());


