create table public.amis_top_customers_snapshots (
  period_month date primary key,
  generated_at timestamptz not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  constraint amis_top_customers_month_start check (extract(day from period_month) = 1)
);

alter table public.amis_top_customers_snapshots enable row level security;
alter table public.amis_top_customers_snapshots force row level security;
revoke all on public.amis_top_customers_snapshots from anon, authenticated;
grant select, insert, update on public.amis_top_customers_snapshots to service_role;

-- A delayed worker must not replace a newer CRM response for the same month.
create function public.keep_latest_top_customers_snapshot()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.generated_at < old.generated_at then return null; end if;
  return new;
end;
$$;

create trigger keep_latest_top_customers_snapshot
before update on public.amis_top_customers_snapshots
for each row execute function public.keep_latest_top_customers_snapshot();
