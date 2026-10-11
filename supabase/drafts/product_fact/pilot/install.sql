-- W1 candidate only. Never applied to a hosted database. Pilot candidate: installation grants no application access.
begin;
do $$begin
 if current_user<>'postgres' or to_regclass('public.r7_members') is null or to_regprocedure('auth.uid()') is null then raise exception 'Verified pilot native Auth/membership required';end if;
 if not exists(select 1 from pg_class where oid='public.r7_members'::regclass and relkind='v' and relowner='postgres'::regrole and reloptions @> array['security_invoker=true']) or not exists(select 1 from pg_class where oid='r7_private.members'::regclass and relrowsecurity) then raise exception 'R7 membership catalog mismatch';end if;
 if not has_table_privilege('authenticated','public.r7_members','SELECT') or not has_table_privilege('authenticated','r7_private.members','SELECT') or not has_function_privilege('authenticated','auth.uid()','EXECUTE') then raise exception 'Existing membership readonly ACL required';end if;
 if exists(select 1 from r7_private.write_gate where enabled or expires_at>clock_timestamp()) or (select count(*) from r7_private.write_gate)<>1 then raise exception 'R7 must remain closed';end if;
 if exists(select 1 from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid in ('public.r7_members'::regclass,'r7_private.members'::regclass) and a.grantee in (0,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole) and (a.privilege_type<>'SELECT' or a.grantee<>'authenticated'::regrole)) then raise exception 'Unexpected membership API ACL; stop without correction';end if;
 if to_regnamespace('w1_private') is not null or to_regclass('public.w1_products') is not null then raise exception 'W1 already exists; stop without reset';end if;
 if exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a where d.defaclrole='postgres'::regrole and d.defaclobjtype='r' and d.defaclnamespace in (0,'public'::regnamespace) and a.grantee in (0,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole)) then raise exception 'Unsafe future table defaults; no automatic correction';end if;
end$$;
create schema w1_private;
revoke all on schema w1_private from public,anon,authenticated,service_role;
create function w1_private.has_org_role(org uuid,roles text[]) returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and exists(select 1 from public.r7_members m where m.user_id=auth.uid() and m.organization_id=org and m.role=any(roles))$$;
revoke all on function w1_private.has_org_role(uuid,text[]) from public,anon,authenticated,service_role;
create table w1_private.gate(singleton boolean primary key default true check(singleton),enabled boolean not null default false,actor_id uuid references auth.users(id),organization_id uuid,product_id uuid,source_version integer,expires_at timestamptz not null default '-infinity',answers integer not null default 0 check(answers between 0 and 2),reviews integer not null default 0 check(reviews between 0 and 2));
alter table w1_private.gate enable row level security;
revoke all on w1_private.gate from public,anon,authenticated,service_role;
insert into w1_private.gate(singleton) values(true);
create function w1_private.admit(org uuid,product uuid,kind text) returns void language plpgsql security definer set search_path='' as $$declare g w1_private.gate;begin
 select * into g from w1_private.gate where singleton for update;
 if not g.enabled or g.expires_at<=clock_timestamp() or g.actor_id is distinct from auth.uid() or g.organization_id is distinct from org or g.product_id is distinct from product or not w1_private.has_org_role(org,array['owner'])
 or not exists(select 1 from public.w1_products p where p.id=product and p.organization_id=org and p.source_version=g.source_version)
 or (kind='answer' and g.answers>=2) or (kind='review' and g.reviews>=2) then raise exception 'W1 write gate closed or scope/quota expired' using errcode='42501';end if;
end$$;
revoke all on function w1_private.admit(uuid,uuid,text) from public,anon,authenticated,service_role;

create table public.w1_products (
 id uuid primary key, organization_id uuid not null ,
 name text not null, market text not null, channel text not null default 'website',
 source_url text not null, source_quote text not null, source_version integer not null check(source_version>0),
 observed_outdoor text not null check(observed_outdoor in ('unknown','yes','no')),
 unique(organization_id,id)
);
create table public.w1_facts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, product_id uuid not null,
 version integer not null check(version>0), value text not null check(value in ('unknown','yes','no')),
 source_kind text not null check(source_kind in ('merchant_confirmed','skipped_unknown')),
 source_version integer not null, source_url text not null, source_quote text not null,
 market text not null, channel text not null, created_by uuid not null references auth.users(id),
 confirmed_by uuid references auth.users(id),
 check ((value='unknown' and source_kind='skipped_unknown' and confirmed_by is null) or (value<>'unknown' and source_kind='merchant_confirmed' and confirmed_by=created_by)),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,product_id) references public.w1_products(organization_id,id),
 unique(product_id,version)
);
create table public.w1_drafts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, product_id uuid not null,
 fact_id uuid not null references public.w1_facts(id), version integer not null,
 source_version integer not null, body text not null, created_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,product_id) references public.w1_products(organization_id,id), unique(product_id,version)
);
create table public.w1_reviews (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 draft_id uuid not null unique references public.w1_drafts(id), actor uuid not null references auth.users(id),
 created_at timestamptz not null default clock_timestamp()
);
create table public.w1_requests (
 request_id uuid primary key, organization_id uuid not null, actor uuid not null references auth.users(id),
 input jsonb not null, result jsonb not null, created_at timestamptz not null default clock_timestamp()
);
-- No direct write privileges. History and review rows remain immutable to application roles.
alter table public.w1_products enable row level security;
alter table public.w1_facts enable row level security;
alter table public.w1_drafts enable row level security;
alter table public.w1_reviews enable row level security;
alter table public.w1_requests enable row level security;
create policy w1_products_read on public.w1_products for select to authenticated using(w1_private.has_org_role(organization_id,array['owner','viewer']));
create policy w1_facts_read on public.w1_facts for select to authenticated using(w1_private.has_org_role(organization_id,array['owner','viewer']));
create policy w1_drafts_read on public.w1_drafts for select to authenticated using(w1_private.has_org_role(organization_id,array['owner','viewer']));
create policy w1_reviews_read on public.w1_reviews for select to authenticated using(w1_private.has_org_role(organization_id,array['owner','viewer']));
create policy w1_requests_read on public.w1_requests for select to authenticated using(actor=auth.uid() and w1_private.has_org_role(organization_id,array['owner']));

-- One authoritative view: old reviews remain historical receipts, never current approval.
create view public.w1_state with (security_invoker=true) as
select p.*, f.id fact_id, coalesce(f.version,0) fact_version, coalesce(f.value,'unknown') answer,
 f.source_kind, f.confirmed_by, case when f.confirmed_by is not null then f.created_at end confirmed_at, f.source_version fact_source_version,
 f.source_url fact_source_url, f.source_quote fact_source_quote, f.market fact_market, f.channel fact_channel,
 d.id draft_id, d.version draft_version, d.body,
 (f.value in ('yes','no') and p.observed_outdoor in ('yes','no') and f.value<>p.observed_outdoor) is_conflict,
 (f.source_version is not null and f.source_version<>p.source_version) source_changed,
 (r.id is not null and d.source_version=p.source_version and f.source_version=p.source_version
 and not(f.value in ('yes','no') and p.observed_outdoor in ('yes','no') and f.value<>p.observed_outdoor)) review_valid,
 r.id review_id
from public.w1_products p
left join lateral(select * from public.w1_facts x where x.product_id=p.id order by version desc limit 1) f on true
left join public.w1_drafts d on d.fact_id=f.id
left join public.w1_reviews r on r.draft_id=d.id;

create function w1_private.w1_change_impl(p_org uuid,p_product uuid,p_request uuid,p_expected integer,p_source integer,p_value text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.w1_products; old public.w1_requests; f uuid; d uuid; v integer; a uuid:=auth.uid(); j jsonb; result jsonb;
begin
 if a is null or not w1_private.has_org_role(p_org,array['owner']) then raise exception 'Owner required' using errcode='42501';end if;
 if p_request is null or p_expected is null or p_source is null or p_value is null or p_value not in ('unknown','yes','no') then raise exception 'Invalid answer' using errcode='22023';end if;
 -- Request lock first for cross-product UUID reuse; product row lock serializes answer/review/source changes.
 perform w1_private.admit(p_org,p_product,'answer');
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,421));
 select * into p from public.w1_products where id=p_product and organization_id=p_org for update;
 if not found then raise exception 'Product not accessible' using errcode='42501';end if;
 if not w1_private.has_org_role(p_org,array['owner']) then raise exception 'Owner required' using errcode='42501';end if;
 j:=jsonb_build_object('kind','answer','product',p_product,'expected',p_expected,'source',p_source,'value',p_value);
 select * into old from public.w1_requests where request_id=p_request;
 if found then
  if old.actor<>a or old.organization_id<>p_org or old.input<>j then raise exception 'Request reuse differs' using errcode='22023';end if;
  perform w1_private.admit(p_org,p_product,'answer');
  return old.result;
 end if;
 select coalesce(max(version),0) into v from public.w1_facts where product_id=p_product;
 if v<>p_expected or p.source_version<>p_source then raise exception 'Base changed; read current version' using errcode='PT409';end if;
 -- Skip never deletes a previously confirmed fact. It is only valid while the answer is still unknown.
 if p_value='unknown' and exists(select 1 from public.w1_facts where product_id=p_product and version=v and value<>'unknown') then raise exception 'Skip cannot erase a confirmed answer' using errcode='22023';end if;
 insert into public.w1_facts(organization_id,product_id,version,value,source_kind,source_version,source_url,source_quote,market,channel,created_by,confirmed_by)
 values(p_org,p_product,v+1,p_value,case when p_value='unknown' then 'skipped_unknown' else 'merchant_confirmed' end,p.source_version,p.source_url,p.source_quote,p.market,p.channel,a,case when p_value<>'unknown' then a end) returning id into f;
 insert into public.w1_drafts(organization_id,product_id,fact_id,version,source_version,body)
 values(p_org,p_product,f,v+1,p.source_version,p.name||'：'||case
 when p_value='yes' and p.observed_outdoor<>'no' then '依商家確認，支援戶外使用。'
 when p_value='no' then '依商家確認，不支援戶外使用。'
 else '戶外適用性尚未確認，本候選不含戶外使用宣稱。' end) returning id into d;
 result:=jsonb_build_object('request_id',p_request,'fact_id',f,'draft_id',d,'version',v+1);
 insert into public.w1_requests(request_id,organization_id,actor,input,result) values(p_request,p_org,a,j,result);
 perform w1_private.admit(p_org,p_product,'answer');
 update w1_private.gate set answers=answers+1 where singleton;
 return result;
end $$;

create function w1_private.w1_review_impl(p_org uuid,p_product uuid,p_request uuid,p_draft uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.w1_products; f public.w1_facts; d public.w1_drafts; old public.w1_requests; a uuid:=auth.uid(); j jsonb; result jsonb; rid uuid;
begin
 if a is null or not w1_private.has_org_role(p_org,array['owner']) then raise exception 'Owner required' using errcode='42501';end if;
 if p_request is null or p_draft is null then raise exception 'Exact draft required' using errcode='22023';end if;
 perform w1_private.admit(p_org,p_product,'review');
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,421));
 select * into p from public.w1_products where id=p_product and organization_id=p_org for update;
 if not found or not w1_private.has_org_role(p_org,array['owner']) then raise exception 'Product not accessible' using errcode='42501';end if;
 j:=jsonb_build_object('kind','review','product',p_product,'draft',p_draft);
 select * into old from public.w1_requests where request_id=p_request;
 if found then
  if old.actor<>a or old.organization_id<>p_org or old.input<>j then raise exception 'Request reuse differs' using errcode='22023';end if;
  perform w1_private.admit(p_org,p_product,'review');
  return old.result; -- Historical receipt only; callers must read current w1_state before claiming valid.
 end if;
 select * into f from public.w1_facts where product_id=p_product order by version desc limit 1;
 select * into d from public.w1_drafts where id=p_draft and product_id=p_product and fact_id=f.id;
 if d.id is null or d.source_version<>p.source_version or f.source_version<>p.source_version
 or (f.value in ('yes','no') and p.observed_outdoor in ('yes','no') and f.value<>p.observed_outdoor)
 then raise exception 'Draft dependency is stale or conflicting' using errcode='PT409';end if;
 insert into public.w1_reviews(organization_id,draft_id,actor) values(p_org,d.id,a) returning id into rid;
 result:=jsonb_build_object('request_id',p_request,'review_id',rid,'draft_id',d.id);
 insert into public.w1_requests(request_id,organization_id,actor,input,result) values(p_request,p_org,a,j,result);
 perform w1_private.admit(p_org,p_product,'review');
 update w1_private.gate set reviews=reviews+1 where singleton;
 return result;
end $$;
create function public.w1_change(p_org uuid,p_product uuid,p_request uuid,p_expected integer,p_source integer,p_value text)
returns jsonb language sql security invoker set search_path='' as $$select w1_private.w1_change_impl($1,$2,$3,$4,$5,$6)$$;
create function public.w1_review(p_org uuid,p_product uuid,p_request uuid,p_draft uuid)
returns jsonb language sql security invoker set search_path='' as $$select w1_private.w1_review_impl($1,$2,$3,$4)$$;
revoke all on function w1_private.w1_change_impl(uuid,uuid,uuid,integer,integer,text),w1_private.w1_review_impl(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on public.w1_products,public.w1_facts,public.w1_drafts,public.w1_reviews,public.w1_requests,public.w1_state from public,anon,authenticated,service_role;
revoke all on function public.w1_change(uuid,uuid,uuid,integer,integer,text),public.w1_review(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
