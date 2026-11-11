create table public.amis_report26_snapshots (
  period_month date primary key,
  generated_at timestamptz not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  constraint amis_report26_snapshots_period_month_day check (extract(day from period_month) = 1)
);

alter table public.amis_report26_snapshots enable row level security;
alter table public.amis_report26_snapshots force row level security;

revoke all on public.amis_report26_snapshots from anon, authenticated;
grant select, insert, update on public.amis_report26_snapshots to service_role;
