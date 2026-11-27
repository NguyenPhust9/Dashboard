-- Store delivery fingerprints and month invalidations, never the CRM payload.
create table public.amis_webhook_receipts (
  digest text primary key check (digest ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default now()
);
create index amis_webhook_receipts_received_at on public.amis_webhook_receipts (received_at);

create table public.amis_webhook_jobs (
  period_month date primary key check (extract(day from period_month) = 1),
  revision bigint not null default 1 check (revision > 0),
  completed_revision bigint not null default 0 check (completed_revision >= 0 and completed_revision <= revision),
  dirty_since timestamptz,
  last_received_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_revision bigint,
  lease_expires_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_completed_at timestamptz,
  last_failed_at timestamptz,
  constraint amis_webhook_lease_consistent check (
    (lease_token is null and lease_revision is null and lease_expires_at is null)
    or (lease_token is not null and lease_revision > 0 and lease_revision <= revision and lease_expires_at is not null)
  )
);

alter table public.amis_webhook_receipts enable row level security;
alter table public.amis_webhook_receipts force row level security;
alter table public.amis_webhook_jobs enable row level security;
alter table public.amis_webhook_jobs force row level security;
revoke all on public.amis_webhook_receipts, public.amis_webhook_jobs from anon, authenticated;
grant select, insert, update, delete on public.amis_webhook_receipts, public.amis_webhook_jobs to service_role;

create function public.amis_webhook_enqueue(event_digest text, event_months date[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  accepted boolean;
  event_month date;
begin
  if event_digest is null or event_digest !~ '^[0-9a-f]{64}$'
    or event_months is null or cardinality(event_months) not between 1 and 12 then
    raise exception 'Invalid event metadata';
  end if;
  foreach event_month in array event_months loop
    if event_month is null or extract(day from event_month) <> 1
      or event_month > date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh')::date then
      raise exception 'Invalid event month';
    end if;
  end loop;

  -- Keep the receipt table bounded without deleting event or customer records.
  delete from public.amis_webhook_receipts where digest in (
    select digest from public.amis_webhook_receipts
    where received_at < now() - interval '7 days' order by received_at limit 1000
  );
  insert into public.amis_webhook_receipts (digest, received_at) values (event_digest, now())
  on conflict (digest) do update set received_at = excluded.received_at
    where public.amis_webhook_receipts.received_at <= now() - interval '30 seconds'
  returning true into accepted;
  if accepted is not true then return jsonb_build_object('duplicate', true); end if;

  foreach event_month in array event_months loop
    insert into public.amis_webhook_jobs as existing
      (period_month, dirty_since, next_attempt_at) values (event_month, now(), now() + interval '5 seconds')
    on conflict (period_month) do update set
      revision = existing.revision + 1,
      dirty_since = coalesce(existing.dirty_since, now()),
      last_received_at = now(),
      -- Debounce bursts for 5s but never indefinitely postpone a busy CRM.
      next_attempt_at = least(now() + interval '5 seconds', coalesce(existing.dirty_since, now()) + interval '30 seconds');
  end loop;
  return jsonb_build_object('duplicate', false);
end;
$$;

create function public.amis_webhook_claim()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  selected public.amis_webhook_jobs%rowtype;
begin
  select * into selected from public.amis_webhook_jobs
  where revision > completed_revision and next_attempt_at <= now()
    and (lease_expires_at is null or lease_expires_at <= now())
  order by dirty_since, period_month
  limit 1 for update skip locked;
  if not found then return null; end if;

  update public.amis_webhook_jobs set
    lease_token = gen_random_uuid(), lease_revision = revision,
    lease_expires_at = now() + interval '10 minutes', attempts = attempts + 1
  where period_month = selected.period_month returning * into selected;
  return jsonb_build_object(
    'month', to_char(selected.period_month, 'YYYY-MM'),
    'leaseToken', selected.lease_token, 'revision', selected.lease_revision, 'attempt', selected.attempts
  );
end;
$$;

create function public.amis_webhook_finish(job_month date, job_lease uuid, job_revision bigint, job_success boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  selected public.amis_webhook_jobs%rowtype;
begin
  select * into selected from public.amis_webhook_jobs
    where period_month = job_month and lease_token = job_lease and lease_revision = job_revision
      and lease_expires_at > now() for update;
  if not found or job_success is null then return false; end if;

  if job_success then
    update public.amis_webhook_jobs set
      completed_revision = job_revision, lease_token = null, lease_revision = null, lease_expires_at = null,
      attempts = 0, last_completed_at = now(),
      dirty_since = case when revision > job_revision then dirty_since else null end,
      -- Events that arrived during the lease must trigger a second refresh.
      next_attempt_at = case when revision > job_revision then greatest(next_attempt_at, now() + interval '5 seconds') else now() end
    where period_month = job_month;
  else
    update public.amis_webhook_jobs set
      lease_token = null, lease_revision = null, lease_expires_at = null, last_failed_at = now(),
      next_attempt_at = now() + make_interval(secs => least(300, 5 * power(2, least(attempts, 6)))::double precision)
    where period_month = job_month;
  end if;
  return true;
end;
$$;

revoke all on function public.amis_webhook_enqueue(text, date[]) from public, anon, authenticated;
revoke all on function public.amis_webhook_claim() from public, anon, authenticated;
revoke all on function public.amis_webhook_finish(date, uuid, bigint, boolean) from public, anon, authenticated;
grant execute on function public.amis_webhook_enqueue(text, date[]) to service_role;
grant execute on function public.amis_webhook_claim() to service_role;
grant execute on function public.amis_webhook_finish(date, uuid, bigint, boolean) to service_role;
