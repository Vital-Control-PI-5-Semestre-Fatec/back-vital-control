-- =============================================================================
-- Vital Control - Schema PostgreSQL para Supabase
-- Execute este script no SQL Editor do painel do Supabase
-- =============================================================================

create extension if not exists "pgcrypto";

-- Função automática para atualizar o campo updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 1. users
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('PATIENT', 'CAREGIVER', 'CARE_MANAGER', 'RESPONSIBLE')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED', 'INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users enable row level security;

create or replace trigger trg_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

-- 2. patient_profiles
create table if not exists public.patient_profiles (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null unique references public.users(id) on delete cascade,
  blood_type text,
  weight_kg numeric check (weight_kg >= 0),
  height_cm numeric check (height_cm >= 0),
  allergies text[] not null default '{}',
  pre_existing_conditions text[] not null default '{}',
  default_address jsonb,
  emergency_contacts jsonb not null default '[]'::jsonb,
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.patient_profiles enable row level security;

create or replace trigger trg_patient_profiles_updated_at
before update on public.patient_profiles
for each row execute function public.set_updated_at();

-- 3. medications
create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  dosage_description text not null,
  barcode text,
  brand text,
  image_url text,
  notes text,
  registration_source text not null default 'MANUAL' check (registration_source in ('MANUAL', 'COSMOS', 'ANVISA', 'COSMOS_ANVISA')),
  stock jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.medications enable row level security;

create index if not exists idx_medications_patient_active on public.medications(patient_id, active);
create index if not exists idx_medications_patient_barcode on public.medications(patient_id, barcode);

create or replace trigger trg_medications_updated_at
before update on public.medications
for each row execute function public.set_updated_at();

-- 4. stock_movements
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.users(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete cascade,
  type text not null,
  direction text not null check (direction in ('IN', 'OUT')),
  quantity numeric not null check (quantity >= 0),
  stock_before numeric not null,
  stock_after numeric not null,
  administration_id uuid unique,
  reason text,
  performed_by_user_id uuid not null references public.users(id),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stock_movements enable row level security;

create index if not exists idx_stock_movements_medication_occurred on public.stock_movements(medication_id, occurred_at desc);

create or replace trigger trg_stock_movements_updated_at
before update on public.stock_movements
for each row execute function public.set_updated_at();

-- 5. medication_schedules
create table if not exists public.medication_schedules (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.users(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete cascade,
  title text not null,
  dose jsonb not null,
  times text[] not null,
  recurrence jsonb not null,
  start_date timestamptz not null,
  end_date timestamptz,
  timezone text not null default 'America/Sao_Paulo',
  instructions text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.medication_schedules enable row level security;

create index if not exists idx_medication_schedules_patient_active on public.medication_schedules(patient_id, active);

create or replace trigger trg_medication_schedules_updated_at
before update on public.medication_schedules
for each row execute function public.set_updated_at();

-- 6. medication_administrations
create table if not exists public.medication_administrations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.users(id) on delete cascade,
  schedule_id uuid not null references public.medication_schedules(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete cascade,
  scheduled_for timestamptz not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'TAKEN_ON_TIME', 'TAKEN_LATE', 'MISSED', 'SKIPPED')),
  completed_at timestamptz,
  performed_by_user_id uuid references public.users(id),
  justification text,
  notes text,
  medication_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_id, scheduled_for)
);

alter table public.medication_administrations enable row level security;

create index if not exists idx_medication_administrations_patient_scheduled on public.medication_administrations(patient_id, scheduled_for desc);

create or replace trigger trg_medication_administrations_updated_at
before update on public.medication_administrations
for each row execute function public.set_updated_at();

-- 7. care_groups
create table if not exists public.care_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  patient_ids uuid[] not null default '{}',
  manager_id uuid not null references public.users(id),
  caregiver_ids uuid[] not null default '{}',
  responsible_ids uuid[] not null default '{}',
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.care_groups enable row level security;

create index if not exists idx_care_groups_manager on public.care_groups(manager_id);
create index if not exists idx_care_groups_patients on public.care_groups using gin (patient_ids);
create index if not exists idx_care_groups_caregivers on public.care_groups using gin (caregiver_ids);
create index if not exists idx_care_groups_responsibles on public.care_groups using gin (responsible_ids);

create or replace trigger trg_care_groups_updated_at
before update on public.care_groups
for each row execute function public.set_updated_at();

-- 8. home_visits
create table if not exists public.home_visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.users(id),
  care_group_id uuid references public.care_groups(id),
  manager_id uuid references public.users(id),
  assigned_caregiver_id uuid references public.users(id),
  reason text not null,
  patient_notes text,
  caregiver_notes text,
  requested_window jsonb not null,
  scheduled_window jsonb,
  address_snapshot jsonb not null,
  status text not null default 'REQUESTED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.home_visits enable row level security;

create index if not exists idx_home_visits_patient on public.home_visits(patient_id);
create index if not exists idx_home_visits_caregiver on public.home_visits(assigned_caregiver_id);
create index if not exists idx_home_visits_manager on public.home_visits(manager_id);

create or replace trigger trg_home_visits_updated_at
before update on public.home_visits
for each row execute function public.set_updated_at();

-- 9. home_visit_events
create table if not exists public.home_visit_events (
  id uuid primary key default gen_random_uuid(),
  home_visit_id uuid not null references public.home_visits(id) on delete cascade,
  type text not null,
  performed_by_user_id uuid not null references public.users(id),
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);

alter table public.home_visit_events enable row level security;

create index if not exists idx_home_visit_events_visit on public.home_visit_events(home_visit_id);

-- 10. notification_devices
create table if not exists public.notification_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  push_token text not null unique,
  platform text not null check (platform in ('ANDROID', 'IOS', 'WEB')),
  device_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_devices enable row level security;

create index if not exists idx_notification_devices_user on public.notification_devices(user_id);

create or replace trigger trg_notification_devices_updated_at
before update on public.notification_devices
for each row execute function public.set_updated_at();

-- 11. audit_logs
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.users(id),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  patient_id uuid,
  occurred_at timestamptz not null default now(),
  metadata jsonb
);

alter table public.audit_logs enable row level security;

create index if not exists idx_audit_logs_actor on public.audit_logs(actor_user_id);
create index if not exists idx_audit_logs_patient on public.audit_logs(patient_id);
