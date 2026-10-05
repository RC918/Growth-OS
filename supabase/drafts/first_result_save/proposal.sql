-- UNDEPLOYED CANDIDATE. Explicit offline harness only; never migration discovery.
-- No Auth/session setup, site ownership claim, content approval, or publishing.
begin;

create function private.fr_require(ok boolean, code text) returns void
language plpgsql immutable set search_path='' as $$
begin if ok is distinct from true then raise exception '%',code using errcode='22023'; end if; end $$;
create function private.fr_keys(v jsonb, keys text[]) returns boolean
language sql immutable set search_path='' as $$
 select case when jsonb_typeof(v)='object' then
 (select array_agg(k order by k) from jsonb_object_keys(v) k) = (select array_agg(k order by k) from unnest(keys) k)
 else false end $$;
create function private.fr_text(v jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='string' and length(btrim(v#>>'{}',
 E' \t\n\r\f'||chr(11)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)))>0,false) $$;
create function private.fr_strings(v jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare x jsonb;
begin
 if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)=0 then return false; end if;
 for x in select value from jsonb_array_elements(v) loop if not private.fr_text(x) then return false; end if; end loop;
 return true;
end $$;
create function private.fr_utf16_length(t text) returns integer
language sql immutable strict set search_path='' as $$
 select coalesce(sum(case when ascii(substr(t,i,1))>65535 then 2 else 1 end),0)::integer from generate_series(1,length(t)) i $$;
create function private.fr_url(v jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare raw text:=v#>>'{}'; rest text; authority text; host text; port text:=''; tail text; close_at integer;
 i integer; j integer; cp integer; bytes bytea:=''::bytea; parts text[]; part text; base integer; digit integer; num numeric;
 spaces text:=E' \t\n\r\f'||chr(11)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279);
begin
 if jsonb_typeof(v) is distinct from 'string' or private.fr_utf16_length(raw)>2048 or translate(raw,spaces,'')<>raw or strpos(raw,chr(92))>0 or raw !~* '^https:' then return false; end if;
 -- HTTPS special-scheme parsing also accepts https:host / https:/host. Empty
 -- query/fragment markers have empty URL.search/hash in the accepted JS parser.
 rest:=regexp_replace(substr(raw,7),'^/+','');
 if strpos(rest,'#')>0 then if strpos(rest,'#')<>length(rest) then return false; end if; rest:=left(rest,-1); end if;
 if strpos(rest,'?')>0 then if strpos(rest,'?')<>length(rest) then return false; end if; rest:=left(rest,-1); end if;
 authority:=split_part(rest,'/',1);
 if strpos(authority,'@')>0 then
  if split_part(authority,'@',1) not in ('',':') then return false; end if;
  authority:=substr(authority,strpos(authority,'@')+1);
  if strpos(authority,'@')>0 then return false; end if;
 end if;
 if left(authority,1)='[' then
  close_at:=strpos(authority,']'); if close_at=0 then return false; end if;
  host:=substr(authority,2,close_at-2); tail:=substr(authority,close_at+1);
  if tail<>'' and left(tail,1)<>':' then return false; end if;
  port:=substr(tail,2);
  if host='' or family(host::inet)<>6 or masklen(host::inet)<>128 then return false; end if;
 else
  close_at:=strpos(authority,':');
  if close_at>0 then host:=left(authority,close_at-1); port:=substr(authority,close_at+1); else host:=authority; end if;
 end if;
 if port<>'' then
  if port !~ '^[0-9]+$' then return false; end if;
  if port::numeric>65535 then return false; end if;
 end if;
 if left(authority,1)='[' then return true; end if;
 -- Decode domain escapes before checking forbidden host characters / numeric
 -- hosts, without changing the stored URL or making any DNS/network request.
 i:=1;
 while i<=length(host) loop
  if substr(host,i,1)='%' then
   if substr(host,i+1,2) !~ '^[0-9a-fA-F]{2}$' then return false; end if;
   bytes:=bytes||decode(substr(host,i+1,2),'hex'); i:=i+3;
  else bytes:=bytes||convert_to(substr(host,i,1),'UTF8'); i:=i+1; end if;
 end loop;
 host:=convert_from(bytes,'UTF8');
 if host='' or translate(host,spaces,'')<>host then return false; end if;
 for i in 1..length(host) loop
  cp:=ascii(substr(host,i,1));
  if cp<=32 or cp=127 or strpos('/:#?@[]\^|<>%',substr(host,i,1))>0 then return false; end if;
 end loop;
 parts:=string_to_array(lower(case when right(host,1)='.' then left(host,-1) else host end),'.');
 part:=parts[array_length(parts,1)];
 -- WHATWG numeric hosts: include shortened / hex / octal IPv4 forms, but reject
 -- malformed or overflowing numeric hosts instead of treating them as DNS names.
 if part ~ '^[0-9]+$' or part ~ '^0x[0-9a-f]*$' then
  if array_length(parts,1)>4 then return false; end if;
  for i in 1..array_length(parts,1) loop
   part:=parts[i]; if part='' then return false; end if; base:=10;
   if left(part,2)='0x' then base:=16;part:=substr(part,3);
   elsif length(part)>1 and left(part,1)='0' then base:=8;part:=substr(part,2); end if;
   num:=0;
   for j in 1..length(part) loop
    digit:=strpos('0123456789abcdef',substr(part,j,1))-1;
    if digit<0 or digit>=base then return false; end if;
    num:=num*base+digit;if num>4294967295 then return false; end if;
   end loop;
   if i<array_length(parts,1) and num>255 then return false; end if;
  end loop;
  if num>=power(256::numeric,5-array_length(parts,1)) then return false; end if;
 end if;
 return true;
exception when invalid_text_representation or character_not_in_repertoire or numeric_value_out_of_range then return false;
end $$;

-- WHATWG-style replacement decoding, preserving BOM. PostgreSQL text cannot
-- represent NUL: reject rather than silently changing bytes/HTML or JSON strings.
create function private.fr_decode_utf8(b bytea) returns text
language plpgsql immutable strict set search_path='' as $$
declare i integer:=0; n integer:=octet_length(b); lead integer; cp integer; need integer;
 j integer; x integer; lo integer; hi integer; valid boolean; result text:=''; chunk text:='';
begin
 -- Valid UTF-8 is the common path; avoid a byte-by-byte SQL loop.
 begin return convert_from(b,'UTF8'); exception when character_not_in_repertoire then null; end;
 while i<n loop
  if length(chunk)>=4096 then result:=result||chunk; chunk:=''; end if;
  lead:=get_byte(b,i); i:=i+1;
  if lead<128 then
   perform private.fr_require(lead<>0,'SOURCE_NUL_UNREPRESENTABLE'); chunk:=chunk||chr(lead); continue;
  elsif lead between 194 and 223 then cp:=lead-192; need:=1;
  elsif lead between 224 and 239 then cp:=lead-224; need:=2;
  elsif lead between 240 and 244 then cp:=lead-240; need:=3;
  else chunk:=chunk||chr(65533); continue; end if;
  valid:=true;
  for j in 1..need loop
   lo:=128; hi:=191;
   if j=1 then
    if lead=224 then lo:=160; elsif lead=237 then hi:=159;
    elsif lead=240 then lo:=144; elsif lead=244 then hi:=143; end if;
   end if;
   if i>=n then valid:=false; exit; end if;
   x:=get_byte(b,i);
   if x<lo or x>hi then valid:=false; exit; end if;
   i:=i+1; cp:=cp*64+x-128;
  end loop;
  chunk:=chunk||chr(case when valid then cp else 65533 end);
 end loop;
 return result||chunk;
end $$;

create function private.fr_content_digest(p jsonb) returns text
language plpgsql immutable strict set search_path='' as $$
declare r jsonb:=p->'review'; f jsonb:=p#>'{preview,fields}'; canonical text;
begin
 -- JSON string escaping is applied to individual strings; never strip spaces
 -- from a serialized JSON object. These keys match the accepted JS Review order.
 canonical:='{"schema_version":1,"original_url":'||(r->'original_url')::text||
 ',"final_url":'||(r->'final_url')::text||',"snapshot_id":'||(r->'snapshot_id')::text||
 ',"source_version":'||(r->'source_version')::text||',"revision":'||(r->'revision')::text||
 ',"fields":{"title":'||(f#>'{title,suggested}')::text||',"meta_description":'||(f#>'{meta_description,suggested}')::text||
 ',"description":'||(f#>'{description,suggested}')::text||'}}';
 return 'sha256:'||encode(sha256(convert_to(canonical,'UTF8')),'hex');
end $$;
create function private.fr_refs(refs jsonb, ids jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare x jsonb;
begin
 perform private.fr_require(private.fr_strings(refs),'INVALID_REFERENCES');
 for x in select value from jsonb_array_elements(refs) loop
  perform private.fr_require(ids ? (x#>>'{}'),'UNKNOWN_REFERENCE');
 end loop;
end $$;
create function private.fr_fact(v jsonb, ids jsonb, product jsonb, scoped boolean) returns void
language plpgsql immutable set search_path='' as $$
declare scope jsonb:=v->'product_scope'; x jsonb;
begin
 perform private.fr_require(private.fr_keys(v,array['kind','verification','value','citations']||case when scoped then array['product_scope'] else array[]::text[] end)
 and v->>'kind'='fact' and v->>'verification'='source_asserted' and private.fr_text(v->'value'),'INVALID_FACT');
 perform private.fr_refs(v->'citations',ids);
 if scoped then
  perform private.fr_require(private.fr_keys(scope,array['locator','name_locator','product_name']) and private.fr_text(scope->'locator') and private.fr_text(scope->'name_locator')
  and scope->'product_name'=product->'value','INVALID_PRODUCT_SCOPE');
  for x in select value from jsonb_array_elements(product->'citations') loop
   perform private.fr_require(v->'citations' @> jsonb_build_array(x),'MISSING_NAME_REFERENCE');
  end loop;
 end if;
end $$;

-- Match the bounded JSON walk: each child has a key/index visit and value visit.
create function private.fr_json_bounds(p jsonb) returns boolean
language sql immutable strict set search_path='' as $$
 with recursive walk(value,depth) as (
  select p,0
  union all
  select child.value,w.depth+1 from walk w cross join lateral (
   select value from jsonb_each(case when jsonb_typeof(w.value)='object' then w.value else '{}'::jsonb end)
   union all
   select value from jsonb_array_elements(case when jsonb_typeof(w.value)='array' then w.value else '[]'::jsonb end)
  ) child where w.depth<25
 ) select max(depth)<=24 and 2*count(*)-1<=100000 from (select * from walk limit 50001) bounded $$;

create function private.fr_valid_payload(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare s jsonb:=p->'snapshot'; v jsonb:=p->'review'; preview jsonb:=p->'preview'; facts jsonb:=p->'facts';
 ids jsonb:='{}'; x jsonb; f jsonb; c jsonb; k text; missing jsonb:='[]'; bytes bytea; source_hash text; content_hash text; edited boolean;
 fields text[]:=array['title','meta_description','description'];
begin
 if p is null then return false; end if;
 perform private.fr_require(jsonb_typeof(p)='object' and octet_length(convert_to(p::text,'UTF8'))<=8388608
 and private.fr_json_bounds(p) and not (p ?| array['organization_id','opportunity_id','request_id','expected_version','fixture_context']),'INVALID_PAYLOAD');
 perform private.fr_require(s->'schema_version'='1'::jsonb and jsonb_typeof(s->'id')='string' and s->>'id' ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
 and jsonb_typeof(s->'version')='string' and s->>'version' ~ '^[0-9a-f]{64}$','INVALID_SNAPSHOT');
 perform private.fr_require(private.fr_url(s->'original_url') and private.fr_url(s->'final_url'),'INVALID_URL');
 perform private.fr_require(private.fr_text(s->'fetched_at') and s->>'fetched_at' ~ 'T.*(Z|[+-][0-9]{2}:[0-9]{2})$','INVALID_FETCH_TIME');
 perform (s->>'fetched_at')::timestamptz;
 perform private.fr_require(jsonb_typeof(s->'content_base64')='string' and length(s->>'content_base64')<=1398104
 and s->>'content_base64' ~ '^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$','INVALID_SOURCE_BYTES');
 bytes:=decode(s->>'content_base64','base64');
 perform private.fr_require(octet_length(bytes) between 1 and 1048576 and replace(encode(bytes,'base64'),E'\n','')=s->>'content_base64','INVALID_SOURCE_BYTES');
 source_hash:='sha256:'||encode(sha256(bytes),'hex');
 perform private.fr_require(source_hash=s->>'content_fingerprint' and source_hash='sha256:'||(s->>'version'),'SOURCE_HASH_MISMATCH');
 perform private.fr_require(s->>'encoding'='utf-8-with-replacement' and jsonb_typeof(s->'html')='string' and s->>'html'=private.fr_decode_utf8(bytes),'SOURCE_TEXT_MISMATCH');
 perform private.fr_require(preview->'source_snapshot_id'=s->'id' and preview->'source_version'=s->'version' and preview->'published'='false'::jsonb,'INVALID_PREVIEW_BINDING');
 perform private.fr_require(v->'schema_version'='1'::jsonb and v->>'scope'='page_only' and v->'persisted'='false'::jsonb
 and v->'snapshot_id'=s->'id' and v->'source_version'=s->'version' and v->'original_url'=s->'original_url' and v->'final_url'=s->'final_url'
 and jsonb_typeof(v->'revision')='number' and v->>'revision' ~ '^(0|[1-9][0-9]*)$','INVALID_REVIEW_BINDING');
 perform private.fr_require((v->>'revision')::numeric<=9007199254740991,'INVALID_REVISION');
 perform private.fr_require(private.fr_keys(preview->'fields',fields) and private.fr_keys(v->'original_suggestions',fields)
 and private.fr_keys(v->'edited',fields) and private.fr_keys(v->'fact_checks',fields),'INVALID_FIELDS');
 perform private.fr_require(jsonb_typeof(s->'citations')='array' and jsonb_array_length(s->'citations')>0,'INVALID_CITATIONS');
 for c in select value from jsonb_array_elements(s->'citations') loop
  perform private.fr_require(private.fr_text(c->'id') and not (ids ? (c->>'id')) and c->'snapshot_id'=s->'id' and c->'source_version'=s->'version'
  and c->'url'=s->'final_url' and private.fr_text(c->'locator') and private.fr_text(c->'quote'),'INVALID_CITATION');
  ids:=ids||jsonb_build_object(c->>'id',true);
 end loop;
 perform private.fr_require(p->>'page_type'='product' and p#>>'{extraction,method}' in ('explicit_product_microdata','woocommerce_single_product')
 and private.fr_strings(p#>'{extraction,limitations}') and private.fr_strings(s->'limitations') and preview->>'generation'='extractive_rules','INVALID_EVIDENCE_SCHEMA');
 perform private.fr_require(private.fr_keys(facts,array['product_name','title','meta_description','description','features','use']),'INVALID_FACTS');
 perform private.fr_fact(facts->'product_name',ids,null,false);
 perform private.fr_fact(facts->'description',ids,facts->'product_name',true);
 foreach k in array array['title','meta_description','use'] loop
  if facts->k='null'::jsonb then missing:=missing||jsonb_build_array(k); else perform private.fr_fact(facts->k,ids,null,false); end if;
 end loop;
 perform private.fr_require(jsonb_typeof(facts->'features')='array','INVALID_FEATURES');
 for x in select value from jsonb_array_elements(facts->'features') loop perform private.fr_fact(x,ids,facts->'product_name',true); end loop;
 if jsonb_array_length(facts->'features')=0 then missing:=missing||jsonb_build_array('features'); end if;
 missing:=missing||'["specifications","price","certifications","performance","comparisons","guarantees"]'::jsonb;
 perform private.fr_require(p->'missing'=missing and private.fr_strings(preview->'pending_confirmation')
 and ((preview->'pending_confirmation') - 0)=missing,'INVALID_UNKNOWNS');
 perform private.fr_require(jsonb_typeof(p->'inferences')='array' and jsonb_array_length(p->'inferences')>0,'INVALID_INFERENCES');
 for x in select value from jsonb_array_elements(p->'inferences') loop
  perform private.fr_require(private.fr_keys(x,array['kind','value','basis','citations']) and x->>'kind'='inference' and private.fr_text(x->'value') and private.fr_text(x->'basis'),'INVALID_INFERENCE');
  perform private.fr_refs(x->'citations',ids);
 end loop;
 foreach k in array fields loop
  f:=preview->'fields'->k;
  perform private.fr_require(private.fr_text(f->'suggested') and private.fr_utf16_length(f->>'suggested')<=2000 and jsonb_typeof(f->'original')='string'
  and private.fr_text(v->'original_suggestions'->k) and private.fr_text(f->'reason'),'INVALID_FIELD');
  perform private.fr_refs(f->'citations',ids);
  perform private.fr_require(f->>'original'=coalesce(facts->k->>'value',''),'ORIGINAL_FACT_MISMATCH');
  edited:=(f->'suggested'<>v->'original_suggestions'->k);
  perform private.fr_require(v->'edited'->k=to_jsonb(edited) and f->'user_edited'=to_jsonb(edited)
  and f->>'citation_role'=case when edited then 'reference_only_for_user_edit' else 'source_support' end and jsonb_typeof(v->'fact_checks'->k)='boolean','INVALID_EDIT_ATTRIBUTION');
 end loop;
 content_hash:=private.fr_content_digest(p);
 perform private.fr_require(v->>'content_digest'=content_hash,'CONTENT_DIGEST_MISMATCH');
 c:=v->'confirmation';
 if c is distinct from 'null'::jsonb then
  perform private.fr_require(private.fr_keys(c,array['scope','original_url','final_url','snapshot_id','source_version','revision','content_digest','fact_checks'])
  and c->>'scope'='page_only' and c->>'content_digest'=content_hash and private.fr_keys(c->'fact_checks',fields),'INVALID_PAGE_CONFIRMATION');
  foreach k in array array['original_url','final_url','snapshot_id','source_version','revision'] loop perform private.fr_require(c->k=v->k,'STALE_PAGE_CONFIRMATION'); end loop;
  foreach k in array fields loop perform private.fr_require(c->'fact_checks'->k='true'::jsonb and v->'fact_checks'->k='true'::jsonb,'STALE_FACT_CHECKS'); end loop;
 end if;
 perform private.fr_require(preview->>'status'=case when c='null'::jsonb then 'awaiting_review' else 'locally_confirmed' end,'INVALID_REVIEW_STATUS');
 return true;
end $$;

create function private.fr_request_digest(org uuid, parent uuid, actor uuid, request uuid, expected integer, payload jsonb) returns text
language sql immutable strict set search_path='' as $$
 select 'pg-jsonb-sha256:'||encode(sha256(convert_to(jsonb_build_object('schema_version',1,'organization_id',org,'opportunity_id',parent,
 'actor_user_id',actor,'request_id',request,'expected_version',expected,'payload',payload)::text,'UTF8')),'hex') $$;

alter table public.content_versions
 add column first_result_payload jsonb,
 add column first_result_request_id uuid,
 add column first_result_expected_version integer,
 add column first_result_request_digest text,
 add constraint content_versions_first_result_request_unique unique(organization_id,first_result_request_id);
alter table public.content_versions drop constraint content_versions_title_check;
alter table public.content_versions add constraint content_versions_draft_shape check (coalesce(
 (first_result_payload is null and first_result_request_id is null and first_result_expected_version is null and first_result_request_digest is null
  and length(btrim(title)) between 1 and 160)
 or
 (first_result_payload is not null and first_result_request_id is not null and first_result_expected_version between 0 and 2147483646
  and version_number=first_result_expected_version+1 and private.fr_valid_payload(first_result_payload)
  and title=first_result_payload#>>'{preview,fields,title,suggested}' and draft_body=first_result_payload#>>'{preview,fields,description,suggested}'
  and first_result_request_digest=private.fr_request_digest(organization_id,opportunity_id,created_by,first_result_request_id,first_result_expected_version,first_result_payload)),false));

create function private.save_first_result_draft_impl(p_organization_id uuid,p_opportunity_id uuid,p_request_id uuid,p_expected_version integer,p_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); old public.content_versions%rowtype; latest integer; status text; result_id uuid; fingerprint text;
begin
 if actor is null or not private.has_org_role(p_organization_id,array['owner']) then raise exception 'Owner required' using errcode='42501'; end if;
 perform private.fr_require(p_opportunity_id is not null and p_request_id is not null and p_expected_version between 0 and 2147483646 and p_payload is not null,'INVALID_REQUEST');
 -- Org first: serialize request IDs without conflicting with legacy INSERT FK KEY SHARE.
 perform 1 from public.organizations where id=p_organization_id for no key update;
 -- Recheck membership after waiting; share-lock the membership until commit so
 -- a simultaneous revocation serializes with this write instead of racing it.
 perform 1 from public.organization_members where organization_id=p_organization_id and user_id=actor and role='owner' for share;
 if not found then raise exception 'Owner membership changed' using errcode='42501'; end if;
 select o.status into status from public.growth_opportunities o where o.organization_id=p_organization_id and o.id=p_opportunity_id for update;
 if not found then raise exception 'Opportunity not found' using errcode='P0002'; end if;
 if status<>'approved' or not exists(select 1 from public.opportunity_sources where organization_id=p_organization_id and opportunity_id=p_opportunity_id)
 or not exists(select 1 from public.opportunity_decisions where organization_id=p_organization_id and opportunity_id=p_opportunity_id and decision='approved') then
  raise exception 'Approved opportunity, source and decision required' using errcode='23514'; end if;
 fingerprint:=private.fr_request_digest(p_organization_id,p_opportunity_id,actor,p_request_id,p_expected_version,p_payload);
 select * into old from public.content_versions where organization_id=p_organization_id and first_result_request_id=p_request_id;
 if found then
  if old.created_by<>actor or old.opportunity_id<>p_opportunity_id or old.first_result_expected_version<>p_expected_version
   or old.first_result_payload is distinct from p_payload or old.first_result_request_digest<>fingerprint then
   raise exception 'Request ID payload differs' using errcode='22023'; end if;
  return old.id;
 end if;
 select coalesce(max(version_number),0) into latest from public.content_versions where organization_id=p_organization_id and opportunity_id=p_opportunity_id;
 if latest<>p_expected_version then raise exception 'Content version changed; read back first' using errcode='PT409'; end if;
 perform private.fr_require(private.fr_valid_payload(p_payload),'INVALID_PAYLOAD');
 insert into public.content_versions(organization_id,opportunity_id,version_number,title,draft_body,created_by,
 first_result_payload,first_result_request_id,first_result_expected_version,first_result_request_digest)
 values(p_organization_id,p_opportunity_id,latest+1,p_payload#>>'{preview,fields,title,suggested}',p_payload#>>'{preview,fields,description,suggested}',actor,
 p_payload,p_request_id,p_expected_version,fingerprint) returning id into result_id;
 insert into public.audit_events(organization_id,actor_user_id,event_type,object_type,object_id,details)
 values(p_organization_id,actor,'first_result_draft_saved','content_version',result_id,jsonb_build_object('request_id',p_request_id,'version_number',latest+1,
 'opportunity_id',p_opportunity_id,'source_digest',p_payload#>>'{snapshot,content_fingerprint}','content_digest',private.fr_content_digest(p_payload),
 'request_digest',fingerprint,'provenance','caller_supplied_unverified','approval','none'));
 return result_id;
end $$;
create function public.save_first_result_draft(p_organization_id uuid,p_opportunity_id uuid,p_request_id uuid,p_expected_version integer,p_payload jsonb)
returns uuid language sql security invoker set search_path='' as $$
 select private.save_first_result_draft_impl($1,$2,$3,$4,$5) $$;

-- Same parent lock and legacy review behavior; typed versions cannot be reviewed.
create or replace function private.review_content_draft_impl(
  p_organization_id uuid, p_version_id uuid, p_decision text, p_reason text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_opportunity_id uuid;
  v_version_number integer;
  v_status text;
  v_review_id uuid;
begin
  if v_actor is null or not private.has_org_role(p_organization_id, array['owner']::text[]) then
    raise exception 'Not authorized to review content drafts' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approved','rejected')
     or p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then
    raise exception 'Invalid content decision or reason' using errcode = '22023';
  end if;
  select opportunity_id, version_number into v_opportunity_id, v_version_number
    from public.content_versions
   where organization_id = p_organization_id and id = p_version_id;
  if not found then
    raise exception 'Content version not found' using errcode = 'P0002';
  end if;
  -- Also used by draft creation, this parent lock serializes a review with new versions.
  select status into v_status from public.growth_opportunities
   where organization_id = p_organization_id and id = v_opportunity_id for update;
  if exists (select 1 from public.content_versions where organization_id=p_organization_id and id=p_version_id and first_result_payload is not null) then
    raise exception 'Typed first result requires a separate review contract' using errcode='23514';
  end if;
  if v_status <> 'approved' then
    raise exception 'Approved opportunity required' using errcode = '23514';
  end if;
  if exists (select 1 from public.content_reviews
             where organization_id = p_organization_id and version_id = p_version_id) then
    raise exception 'Content version already reviewed' using errcode = '23505';
  end if;
  if v_version_number <> (select max(version_number) from public.content_versions
                           where organization_id = p_organization_id and opportunity_id = v_opportunity_id) then
    raise exception 'Only the latest content version can be reviewed' using errcode = '23514';
  end if;
  insert into public.content_reviews (organization_id, version_id, actor_user_id, decision, reason)
  values (p_organization_id, p_version_id, v_actor, p_decision, btrim(p_reason))
  returning id into v_review_id;
  insert into public.audit_events
    (organization_id, actor_user_id, event_type, object_type, object_id, details)
  values (p_organization_id, v_actor, 'content_draft_reviewed', 'content_version', p_version_id,
          jsonb_build_object('decision', p_decision, 'review_id', v_review_id));
  return v_review_id;
end;
$$;


-- Exact signatures only: never change unrelated private function ACLs.
revoke all on function
 private.fr_require(boolean,text), private.fr_keys(jsonb,text[]), private.fr_text(jsonb), private.fr_strings(jsonb),
 private.fr_utf16_length(text), private.fr_url(jsonb), private.fr_decode_utf8(bytea), private.fr_content_digest(jsonb),
 private.fr_refs(jsonb,jsonb), private.fr_fact(jsonb,jsonb,jsonb,boolean), private.fr_json_bounds(jsonb), private.fr_valid_payload(jsonb),
 private.fr_request_digest(uuid,uuid,uuid,uuid,integer,jsonb), private.save_first_result_draft_impl(uuid,uuid,uuid,integer,jsonb)
from public,anon,authenticated,service_role;
revoke all on function public.save_first_result_draft(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.save_first_result_draft_impl(uuid,uuid,uuid,integer,jsonb) to authenticated;
grant execute on function public.save_first_result_draft(uuid,uuid,uuid,integer,jsonb) to authenticated;
commit;
