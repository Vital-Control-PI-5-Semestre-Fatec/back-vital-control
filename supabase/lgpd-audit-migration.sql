-- =============================================================================
-- Vital Control - Migração LGPD, Privacidade e Trilha de Auditoria
-- Atende aos 9 requisitos de ALTA PRIORIDADE do Projeto Integrador:
--   RF01 (Consentimento e Revogação)
--   RF02 (Solicitações do Titular: Acesso, Correção, Exclusão)
--   RF03 (Política de Privacidade)
--   RF05 (RBAC / Controle de Acesso)
--   RF06 (Criptografia / Repouso)
--   RF08 (Trilha de Ações Críticas)
--   RF09 (Imutabilidade de Logs de Auditoria)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabela de Consentimentos do Titular (RF01)
-- -----------------------------------------------------------------------------
create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  purpose text not null, -- ex: 'TRATAMENTO_DADOS_SAUDE', 'COMPARTILHAMENTO_CUIDADOR', 'NOTIFICACOES_LEMBRETES'
  consented boolean not null default true,
  version text not null default '1.0',
  consented_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_consents enable row level security;

create index if not exists idx_user_consents_user on public.user_consents(user_id);
create index if not exists idx_user_consents_purpose on public.user_consents(user_id, purpose);

create or replace trigger trg_user_consents_updated_at
before update on public.user_consents
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Tabela de Solicitações do Titular - Art. 18 LGPD (RF02)
-- -----------------------------------------------------------------------------
create table if not exists public.lgpd_data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  request_type text not null check (request_type in ('ACCESS_EXPORT', 'CORRECTION', 'DELETION')),
  details text,
  status text not null default 'PENDING' check (status in ('PENDING', 'IN_REVIEW', 'COMPLETED', 'REJECTED')),
  response_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lgpd_data_requests enable row level security;

create index if not exists idx_lgpd_requests_user on public.lgpd_data_requests(user_id);
create index if not exists idx_lgpd_requests_status on public.lgpd_data_requests(status);

create or replace trigger trg_lgpd_requests_updated_at
before update on public.lgpd_data_requests
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Imutabilidade da Trilha de Auditoria (RF09)
-- Impede estritamente edições e exclusões na tabela audit_logs (append-only)
-- -----------------------------------------------------------------------------
create or replace function public.prevent_audit_log_modification()
returns trigger as $$
begin
  raise exception 'Violação de Imutabilidade LGPD (RF09): Registros da trilha de auditoria são estritamente imutáveis e não podem ser alterados ou excluídos.';
end;
$$ language plpgsql;

drop trigger if exists trg_audit_logs_immutable on public.audit_logs;

create trigger trg_audit_logs_immutable
before update or delete on public.audit_logs
for each row execute function public.prevent_audit_log_modification();

