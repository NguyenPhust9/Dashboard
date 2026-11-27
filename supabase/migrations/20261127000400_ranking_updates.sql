-- Browser subscribers may see versions, never the underlying CRM snapshots.
create table public.amis_ranking_updates (
  period_month date not null,
  kind text not null check (kind in ('staff', 'customers')),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (period_month, kind),
  constraint amis_ranking_updates_month_start check (extract(day from period_month) = 1)
);

alter table public.amis_ranking_updates enable row level security;
alter table public.amis_ranking_updates force row level security;
revoke all on public.amis_ranking_updates from public, anon, authenticated;
grant select on public.amis_ranking_updates to anon, authenticated;
grant select, insert, update on public.amis_ranking_updates to service_role;
create policy "Read ranking update metadata" on public.amis_ranking_updates
  for select to anon, authenticated using (true);

create function public.publish_ranking_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.amis_ranking_updates (period_month, kind)
  values (new.period_month, tg_argv[0])
  on conflict (period_month, kind) do update
    set revision = public.amis_ranking_updates.revision + 1,
        updated_at = clock_timestamp();
  return new;
end;
$$;
revoke all on function public.publish_ranking_update() from public, anon, authenticated;

create trigger publish_excellent_staff_update
after insert or update on public.amis_excellent_staff_snapshots
for each row execute function public.publish_ranking_update('staff');

create trigger publish_top_customers_update
after insert or update on public.amis_top_customers_snapshots
for each row execute function public.publish_ranking_update('customers');

insert into public.amis_ranking_updates (period_month, kind, updated_at)
select period_month, 'staff', updated_at from public.amis_excellent_staff_snapshots
union all
select period_month, 'customers', updated_at from public.amis_top_customers_snapshots;

-- Do not add the financial snapshot tables to the public realtime publication.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'amis_ranking_updates'
    ) then
    alter publication supabase_realtime add table public.amis_ranking_updates;
  end if;
end;
$$;
