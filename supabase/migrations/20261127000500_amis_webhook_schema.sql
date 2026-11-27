-- Private, bounded schema diagnostics: field names/types, row counts and known
-- layout/action enums only. Raw webhook bodies and customer values are not kept.
alter table public.amis_webhook_receipts add column payload_schema jsonb;
alter table public.amis_webhook_receipts add constraint amis_webhook_schema_metadata
  check (payload_schema is null or (
    jsonb_typeof(payload_schema) = 'object' and octet_length(payload_schema::text) <= 32768
  ));
comment on column public.amis_webhook_receipts.payload_schema is
  'Allowlisted field paths/types and enum metadata only; no customer values, dynamic field names or raw webhook body.';

-- A single defaulted signature accepts both the existing two-argument callers
-- and the receiver that supplies sanitized schema metadata.
drop function public.amis_webhook_enqueue(text, date[]);
create function public.amis_webhook_enqueue(event_digest text, event_months date[], event_schema jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  accepted boolean;
  event_month date;
begin
  if event_digest is null or event_digest !~ '^[0-9a-f]{64}$'
    or event_months is null or cardinality(event_months) not between 1 and 12 then
    raise exception 'Invalid event metadata';
  end if;
  if event_schema is not null and (jsonb_typeof(event_schema) <> 'object' or octet_length(event_schema::text) > 32768) then
    raise exception 'Invalid schema metadata';
  end if;
  foreach event_month in array event_months loop
    if event_month is null or extract(day from event_month) <> 1
      or event_month > date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh')::date then
      raise exception 'Invalid event month';
    end if;
  end loop;

  -- Preserve the existing seven-day receipt cleanup and private RLS/grants.
  delete from public.amis_webhook_receipts where digest in (
    select digest from public.amis_webhook_receipts
    where received_at < now() - interval '7 days' order by received_at limit 1000
  );
  insert into public.amis_webhook_receipts (digest, received_at, payload_schema)
    values (event_digest, now(), event_schema)
  on conflict (digest) do update set
    received_at = excluded.received_at,
    payload_schema = coalesce(excluded.payload_schema, public.amis_webhook_receipts.payload_schema)
    where public.amis_webhook_receipts.received_at <= now() - interval '30 seconds'
  returning true into accepted;
  if accepted is not true then
    if event_schema is not null then
      update public.amis_webhook_receipts set payload_schema = event_schema
      where digest = event_digest and payload_schema is null;
    end if;
    return jsonb_build_object('duplicate', true);
  end if;

  foreach event_month in array event_months loop
    insert into public.amis_webhook_jobs as existing
      (period_month, dirty_since, next_attempt_at) values (event_month, now(), now() + interval '5 seconds')
    on conflict (period_month) do update set
      revision = existing.revision + 1,
      dirty_since = coalesce(existing.dirty_since, now()),
      last_received_at = now(),
      next_attempt_at = least(now() + interval '5 seconds', coalesce(existing.dirty_since, now()) + interval '30 seconds');
  end loop;
  return jsonb_build_object('duplicate', false);
end;
$$;

revoke all on function public.amis_webhook_enqueue(text, date[], jsonb) from public, anon, authenticated;
grant execute on function public.amis_webhook_enqueue(text, date[], jsonb) to service_role;
notify pgrst, 'reload schema';
