create table public.amis_report26_sync_jobs (
  period_month date primary key,
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  constraint amis_report26_sync_jobs_period_month_day check (extract(day from period_month) = 1)
);

alter table public.amis_report26_sync_jobs enable row level security;
alter table public.amis_report26_sync_jobs force row level security;

revoke all on public.amis_report26_sync_jobs from anon, authenticated;
grant select, insert, update on public.amis_report26_sync_jobs to service_role;
