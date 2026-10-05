-- CANDIDATE ONLY: one invoker DO statement; NOT in migrations/auto-deploy.
-- No remote approval. PostgreSQL statement atomicity is tested separately from
-- the UNKNOWN hosted schema + migration-history transaction boundary.
DO $closed_package$
<<closed_package>>
DECLARE
 org_a constant uuid := '93a88055-0a0b-40c0-b22f-a6d312320001';
 org_b constant uuid := '93a88055-0a0b-40c0-b22f-a6d312320002';
 owner_actor constant uuid := 'e85f1a90-3565-4fc1-a7e0-3b7d08830d0e';
 viewer_actor constant uuid := '5d14dbf9-e9ef-453b-8760-e48a20fa63ad';
 parent_id constant uuid := 'a6f7775d-501f-45e6-b15e-6e8d74a26c09';
 goal_id constant uuid := '5055ca31-40cc-435d-9f52-cdf19166440c';
 request_id constant uuid := 'a82815b2-efc3-4a95-9d40-fbccd9b94001';
 conflict_id constant uuid := 'a82815b2-efc3-4a95-9d40-fbccd9b94002';
 payload constant jsonb := $fixture_payload${"snapshot":{"schema_version":1,"id":"3c4d7df5-cf79-4788-ba86-f9d871e0447b","original_url":"https://example.com/products/bolt","final_url":"https://example.com/products/bolt","fetched_at":"2026-10-03T00:00:00Z","content_fingerprint":"sha256:8ca0a58dd453a35f7ad39f3715c2b1afdb621115f22c145586a2faac18158056","version":"8ca0a58dd453a35f7ad39f3715c2b1afdb621115f22c145586a2faac18158056","encoding":"utf-8-with-replacement","html":"<html><head><title>Workshop - Bolt A | Shop</title><meta name=\"description\" content=\"Old generic catalog\">\n<script type=\"application/ld+json\">{\"@type\":\"Product\",\"name\":\"Bolt A\",\"price\":\"FAKE\",\"description\":\"UNSUPPORTED SECRET CLAIM\"}</script>\n</head><body><main itemscope itemtype=\"https://schema.org/Product\"><h1 itemprop=\"name\">Bolt A</h1><p itemprop=\"description\">Public steel bolt for workshop assembly.</p>\n<ul><li itemprop=\"additionalProperty\">Hexagonal head</li><li itemprop=\"additionalProperty\">Reusable package</li></ul></main></body></html>","content_base64":"PGh0bWw+PGhlYWQ+PHRpdGxlPldvcmtzaG9wIC0gQm9sdCBBIHwgU2hvcDwvdGl0bGU+PG1ldGEgbmFtZT0iZGVzY3JpcHRpb24iIGNvbnRlbnQ9Ik9sZCBnZW5lcmljIGNhdGFsb2ciPgo8c2NyaXB0IHR5cGU9ImFwcGxpY2F0aW9uL2xkK2pzb24iPnsiQHR5cGUiOiJQcm9kdWN0IiwibmFtZSI6IkJvbHQgQSIsInByaWNlIjoiRkFLRSIsImRlc2NyaXB0aW9uIjoiVU5TVVBQT1JURUQgU0VDUkVUIENMQUlNIn08L3NjcmlwdD4KPC9oZWFkPjxib2R5PjxtYWluIGl0ZW1zY29wZSBpdGVtdHlwZT0iaHR0cHM6Ly9zY2hlbWEub3JnL1Byb2R1Y3QiPjxoMSBpdGVtcHJvcD0ibmFtZSI+Qm9sdCBBPC9oMT48cCBpdGVtcHJvcD0iZGVzY3JpcHRpb24iPlB1YmxpYyBzdGVlbCBib2x0IGZvciB3b3Jrc2hvcCBhc3NlbWJseS48L3A+Cjx1bD48bGkgaXRlbXByb3A9ImFkZGl0aW9uYWxQcm9wZXJ0eSI+SGV4YWdvbmFsIGhlYWQ8L2xpPjxsaSBpdGVtcHJvcD0iYWRkaXRpb25hbFByb3BlcnR5Ij5SZXVzYWJsZSBwYWNrYWdlPC9saT48L3VsPjwvbWFpbj48L2JvZHk+PC9odG1sPg==","citations":[{"id":"s1","snapshot_id":"3c4d7df5-cf79-4788-ba86-f9d871e0447b","source_version":"8ca0a58dd453a35f7ad39f3715c2b1afdb621115f22c145586a2faac18158056","url":"https://example.com/products/bolt","locator":"jsonld[1].@type","quote":"Product"},{"id":"s2","snapshot_id":"3c4d7df5-cf79-4788-ba86-f9d871e0447b","source_version":"8ca0a58dd453a35f7ad39f3715c2b1afdb621115f22c145586a2faac18158056","url":"https://example.com/products/bolt","locator":"h1[8]","quote":"Bolt A"},{"id":"s3","snapshot_id":"3c4d7df5-cf79-4788-ba86-f9d871e0447b","source_version":"8ca0a58dd453a35f7ad39f3715c2b1afdb621115f22c145586a2faac18158056","url":"https://example.com/products/bolt","locator":"title","quote":"Workshop - Bolt A | Shop"},{"id":"s4","snapshot_id":"3c4d7df5-cf79-4788-ba86-f9d871e0447b","source_version":"8ca0a58dd453a35f7ad39f3715c2b1afdb621115f22c145586a2faac18158056","url":"https://example.com/products/bolt","locator":"meta[name=description]","quote":"Old generic catalog"},{"id":"s5","snapshot_id":"3c4d7df5-cf79-4788-ba86-f9d871e0447b","source_version":"8ca0a58dd453a35f7ad39f3715c2b1afdb621115f22c145586a2faac18158056","url":"https://example.com/products/bolt","locator":"p[9]","quote":"Public steel bolt for workshop assembly."},{"id":"s6","snapshot_id":"3c4d7df5-cf79-4788-ba86-f9d871e0447b","source_version":"8ca0a58dd453a35f7ad39f3715c2b1afdb621115f22c145586a2faac18158056","url":"https://example.com/products/bolt","locator":"li[11]","quote":"Hexagonal head"},{"id":"s7","snapshot_id":"3c4d7df5-cf79-4788-ba86-f9d871e0447b","source_version":"8ca0a58dd453a35f7ad39f3715c2b1afdb621115f22c145586a2faac18158056","url":"https://example.com/products/bolt","locator":"li[12]","quote":"Reusable package"}],"limitations":["Public static HTML only.","Source assertions, not independent factual verification.","No cookies, login, JavaScript execution or model calls."]},"page_type":"product","facts":{"product_name":{"kind":"fact","verification":"source_asserted","value":"Bolt A","citations":["s2"]},"title":{"kind":"fact","verification":"source_asserted","value":"Workshop - Bolt A | Shop","citations":["s3"]},"meta_description":{"kind":"fact","verification":"source_asserted","value":"Old generic catalog","citations":["s4"]},"description":{"kind":"fact","verification":"source_asserted","value":"Public steel bolt for workshop assembly.","citations":["s5","s2"],"product_scope":{"locator":"main[7]","name_locator":"h1[8]","product_name":"Bolt A"}},"features":[{"kind":"fact","verification":"source_asserted","value":"Hexagonal head","citations":["s6","s2"],"product_scope":{"locator":"main[7]","name_locator":"h1[8]","product_name":"Bolt A"}},{"kind":"fact","verification":"source_asserted","value":"Reusable package","citations":["s7","s2"],"product_scope":{"locator":"main[7]","name_locator":"h1[8]","product_name":"Bolt A"}}],"use":null},"extraction":{"method":"explicit_product_microdata","limitations":["Source assertions only; no independent verification.","WooCommerce support requires one main#main product-N container, direct summary/title/short-description, and consistent optional description tab; arbitrary layouts and lists are not supported."]},"inferences":[{"kind":"inference","value":"Supported single product page","basis":"Visible name agrees with Product structured data","citations":["s2","s1"]}],"missing":["use","specifications","price","certifications","performance","comparisons","guarantees"],"preview":{"generation":"extractive_rules","status":"locally_confirmed","published":false,"source_snapshot_id":"3c4d7df5-cf79-4788-ba86-f9d871e0447b","source_version":"8ca0a58dd453a35f7ad39f3715c2b1afdb621115f22c145586a2faac18158056","fields":{"title":{"original":"Workshop - Bolt A | Shop","suggested":" 保留 \"引號\" \\ slash\n é é 🧪    ","citations":["s2"],"reason":"Make the existing product name the focused page title.","user_edited":true,"citation_role":"reference_only_for_user_edit"},"meta_description":{"original":"Old generic catalog","suggested":"Public steel bolt for workshop assembly.","citations":["s5","s2"],"reason":"Use a concise excerpt of the public product description.","user_edited":false,"citation_role":"source_support"},"description":{"original":"Public steel bolt for workshop assembly.","suggested":"Bolt A. Public steel bolt for workshop assembly. Hexagonal head Reusable package","citations":["s2","s5","s6","s7"],"reason":"Group the existing name, description and stated features without inventing claims.","user_edited":false,"citation_role":"source_support"}},"pending_confirmation":["Confirm source assertions and suitability before applying.","use","specifications","price","certifications","performance","comparisons","guarantees"]},"review":{"schema_version":1,"scope":"page_only","persisted":false,"original_url":"https://example.com/products/bolt","final_url":"https://example.com/products/bolt","snapshot_id":"3c4d7df5-cf79-4788-ba86-f9d871e0447b","source_version":"8ca0a58dd453a35f7ad39f3715c2b1afdb621115f22c145586a2faac18158056","revision":1,"content_digest":"sha256:cb73d3426a4c61378ffa03a26236419e04e853d4c1b55806ce726a06763acda9","original_suggestions":{"title":"Bolt A","meta_description":"Public steel bolt for workshop assembly.","description":"Bolt A. Public steel bolt for workshop assembly. Hexagonal head Reusable package"},"edited":{"title":true,"meta_description":false,"description":false},"fact_checks":{"title":true,"meta_description":true,"description":true},"confirmation":{"scope":"page_only","original_url":"https://example.com/products/bolt","final_url":"https://example.com/products/bolt","snapshot_id":"3c4d7df5-cf79-4788-ba86-f9d871e0447b","source_version":"8ca0a58dd453a35f7ad39f3715c2b1afdb621115f22c145586a2faac18158056","revision":1,"content_digest":"sha256:cb73d3426a4c61378ffa03a26236419e04e853d4c1b55806ce726a06763acda9","fact_checks":{"title":true,"meta_description":true,"description":true}}}}$fixture_payload$::jsonb;
 expected_review constant text := $legacy_review$
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
$legacy_review$;
 business_tables constant text[] := array['actions','audit_events','business_profiles','content_action_plans','content_reviews','content_versions','findings','funnel_daily','growth_goal_turns','growth_goals','growth_opportunities','import_batches','opportunity_decisions','opportunity_sources','organization_members','organizations','recommendations','scans','search_observation_versions','sites'];
 new_names constant text[] := array['fr_require','fr_keys','fr_text','fr_strings','fr_utf16_length','fr_url','fr_decode_utf8','fr_content_digest','fr_refs','fr_fact','fr_json_bounds','fr_valid_payload','fr_request_digest','save_first_result_draft_impl','save_first_result_draft'];
 manager name := current_user;
 old_role text := current_setting('role');
 old_lock_timeout text := current_setting('lock_timeout');
 old_sub text := coalesce(current_setting('request.jwt.claim.sub',true),'');
 old_claims text := coalesce(current_setting('request.jwt.claims',true),'');
 before_rows jsonb := '{}'::jsonb; after_rows jsonb := '{}'::jsonb;
 before_security jsonb; after_security jsonb;
 baseline_versions bigint; baseline_audits bigint;
 table_name text; schema_name text; projection text; proof jsonb; pass integer;
 fn record; client_role text; saved_id uuid; row_value jsonb; tests_passed boolean := false;
 caught_message text;
BEGIN
 -- No session-level changes, transaction control, network, login or history edits.
 PERFORM set_config('lock_timeout','3s',true);
 IF manager <> (select pg_get_userbyid(proowner) from pg_proc where oid='private.review_content_draft_impl(uuid,uuid,text,text)'::regprocedure)
 OR (select prosrc from pg_proc where oid='private.review_content_draft_impl(uuid,uuid,text,text)'::regprocedure) IS DISTINCT FROM expected_review THEN
  RAISE EXCEPTION 'PREFLIGHT_REVIEW_OR_MANAGER_DRIFT';
 END IF;
 IF (select array_agg(tablename::text order by tablename) from pg_tables where schemaname='public') IS DISTINCT FROM business_tables
 OR EXISTS(select 1 from pg_tables where schemaname='public' and not rowsecurity)
 OR EXISTS(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname=any(new_names))
 OR EXISTS(select 1 from pg_attribute where attrelid='public.content_versions'::regclass and not attisdropped and attname like 'first_result_%')
 OR EXISTS(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal)
 OR EXISTS(select 1 from pg_rewrite r join pg_class c on c.oid=r.ev_class join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r')
 OR EXISTS(select 1 from pg_depend d join pg_class seq on seq.oid=d.refobjid and seq.relkind='S' join pg_attrdef a on a.oid=d.objid where d.classid='pg_attrdef'::regclass and d.refclassid='pg_class'::regclass and a.adrelid in ('public.content_versions'::regclass,'public.audit_events'::regclass)) THEN
  RAISE EXCEPTION 'PREFLIGHT_SCHEMA_DRIFT';
 END IF;
 IF NOT EXISTS(select 1 from public.organization_members where organization_id=org_a and user_id=owner_actor and role='owner')
 OR NOT EXISTS(select 1 from public.organization_members where organization_id=org_b and user_id=viewer_actor and role='viewer')
 OR EXISTS(select 1 from public.organization_members where organization_id=org_a and user_id=viewer_actor)
 OR NOT EXISTS(select 1 from public.growth_opportunities where id=parent_id and organization_id=org_a and status='approved')
 OR (select count(*) from public.opportunity_sources where organization_id=org_a and opportunity_id=parent_id)<>1
 OR (select count(*) from public.opportunity_decisions where organization_id=org_a and opportunity_id=parent_id)<>1
 OR NOT EXISTS(select 1 from public.opportunity_decisions where organization_id=org_a and opportunity_id=parent_id and decision='approved')
 OR EXISTS(select 1 from public.content_versions where organization_id=org_a and opportunity_id=parent_id)
 OR (select count(*) from public.growth_goal_turns t where t.goal_id=closed_package.goal_id)<>13
 OR (select max(version_number) from public.growth_goal_turns t where t.goal_id=closed_package.goal_id) IS DISTINCT FROM 13 THEN
  RAISE EXCEPTION 'PREFLIGHT_FIXED_FIXTURE_DRIFT';
 END IF;
 -- Comparison loops bracket all DDL and the test subtransaction. Only aggregate
 -- hashes/counts are retained in local variables; no customer rows are emitted.
 FOR pass IN 1..2 LOOP
  proof := '{}'::jsonb;
  FOREACH table_name IN ARRAY business_tables || array['model_trial','model_trial_attempts'] LOOP
   schema_name := case when table_name in ('model_trial','model_trial_attempts') then 'private' else 'public' end;
   projection := case when table_name='content_versions' then 'to_jsonb(t)-array[''first_result_payload'',''first_result_request_id'',''first_result_expected_version'',''first_result_request_digest'']' else 'to_jsonb(t)' end;
   EXECUTE format('select jsonb_build_object(''count'',count(*),''hash'',encode(sha256(convert_to(coalesce(jsonb_agg(%s order by (%s)::text)::text,''[]''),''UTF8'')),''hex'')) from %I.%I t',projection,projection,schema_name,table_name) INTO row_value;
   proof := proof || jsonb_build_object(schema_name||'.'||table_name,row_value);
  END LOOP;
  SELECT jsonb_build_object(
   'tables',(select jsonb_agg(jsonb_build_array(c.oid,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity) order by c.oid) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r'),
   'policies',(select jsonb_agg(to_jsonb(p) order by p.oid) from pg_policy p),
   'memberships',(select jsonb_agg(to_jsonb(m) order by roleid,member,grantor) from pg_auth_members m),
   'functions',(select jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl,p.proconfig,p.prosecdef,case when p.oid='private.review_content_draft_impl(uuid,uuid,text,text)'::regprocedure then null else p.prosrc end) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and not p.proname=any(new_names))
  ) INTO row_value;
  IF pass=2 THEN after_rows:=proof; after_security:=row_value; EXIT; END IF;
  before_rows:=proof; before_security:=row_value;
  SELECT count(*) INTO baseline_versions FROM public.content_versions;
  SELECT count(*) INTO baseline_audits FROM public.audit_events;
  EXECUTE $candidate_ddl$
-- UNDEPLOYED CANDIDATE. Explicit offline harness only; never migration discovery.
-- No Auth/session setup, site ownership claim, content approval, or publishing.

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
$candidate_ddl$;
  -- Persisted baseline is closed. Grant only INSIDE the rollback subtransaction.
  BEGIN
   -- PREMATURE_MARKER_TEST_POINT
   GRANT EXECUTE ON FUNCTION public.save_first_result_draft(uuid,uuid,uuid,integer,jsonb) TO authenticated;
   GRANT EXECUTE ON FUNCTION private.save_first_result_draft_impl(uuid,uuid,uuid,integer,jsonb) TO authenticated;
   PERFORM set_config('request.jwt.claim.sub',owner_actor::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_actor,'role','authenticated')::text,true);
   SET LOCAL ROLE authenticated;
   IF current_user<>'authenticated' OR auth.uid() IS DISTINCT FROM owner_actor THEN RAISE EXCEPTION 'OWNER_CONTEXT_NOT_ACTIVE'; END IF;
   -- AUTHENTICATED_FAILURE_TEST_POINT
   saved_id:=public.save_first_result_draft(org_a,parent_id,request_id,0,payload);
   SELECT to_jsonb(v) INTO row_value FROM public.content_versions v WHERE organization_id=org_a AND id=saved_id;
   IF saved_id IS NULL OR row_value IS NULL OR row_value->'first_result_payload' IS DISTINCT FROM payload
   OR row_value->>'title' IS DISTINCT FROM payload#>>'{preview,fields,title,suggested}'
   OR row_value->>'draft_body' IS DISTINCT FROM payload#>>'{preview,fields,description,suggested}'
   OR (row_value->>'version_number')::integer IS DISTINCT FROM 1
   OR row_value->>'created_by' IS DISTINCT FROM owner_actor::text
   OR row_value->>'first_result_request_id' IS DISTINCT FROM request_id::text
   OR (row_value->>'first_result_expected_version')::integer IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'ROUNDTRIP_MISMATCH'; END IF;
   IF public.save_first_result_draft(org_a,parent_id,request_id,0,payload) IS DISTINCT FROM saved_id THEN RAISE EXCEPTION 'REPLAY_ID_MISMATCH'; END IF;
   BEGIN
    PERFORM public.save_first_result_draft(org_a,parent_id,request_id,0,jsonb_set(payload,'{review,revision}','99'));
    RAISE EXCEPTION 'EXPECTED_REQUEST_CONFLICT';
   EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
   BEGIN
    PERFORM public.save_first_result_draft(org_a,parent_id,conflict_id,0,payload);
    RAISE EXCEPTION 'EXPECTED_VERSION_CONFLICT';
   EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
   BEGIN
    PERFORM public.review_content_draft(org_a,saved_id,'approved','Synthetic closed-package check');
    RAISE EXCEPTION 'EXPECTED_TYPED_REVIEW_DENIAL';
   EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;
   BEGIN
    PERFORM public.plan_content_action(org_a,saved_id,'/synthetic','Synthetic','Synthetic');
    RAISE EXCEPTION 'EXPECTED_TYPED_PLAN_DENIAL';
   EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;
   BEGIN
    UPDATE public.content_versions SET title='forbidden' WHERE id=saved_id;
    RAISE EXCEPTION 'EXPECTED_DIRECT_WRITE_DENIAL';
   EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
   PERFORM set_config('request.jwt.claim.sub',viewer_actor::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',viewer_actor,'role','authenticated')::text,true);
   IF auth.uid() IS DISTINCT FROM viewer_actor THEN RAISE EXCEPTION 'VIEWER_CONTEXT_NOT_ACTIVE'; END IF;
   IF EXISTS(select 1 from public.content_versions where id=saved_id) THEN RAISE EXCEPTION 'CROSS_TENANT_READ_LEAK'; END IF;
   BEGIN
    PERFORM public.save_first_result_draft(org_a,parent_id,request_id,0,payload);
    RAISE EXCEPTION 'EXPECTED_FOREIGN_OWNER_DENIAL';
   EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
   BEGIN
    PERFORM public.save_first_result_draft(org_b,parent_id,request_id,0,payload);
    RAISE EXCEPTION 'EXPECTED_VIEWER_WRITE_DENIAL';
   EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
   -- Reset just for aggregate verification; the subtransaction rollback restores
   -- the ORIGINAL manager role/claims, including a nonempty prior claims value.
   EXECUTE format('SET LOCAL ROLE %I',manager);
   IF (select count(*) from public.content_versions)<>baseline_versions+1 OR (select count(*) from public.audit_events)<>baseline_audits+1
   OR EXISTS(select 1 from public.content_reviews where version_id=saved_id)
   OR EXISTS(select 1 from public.content_action_plans where version_id=saved_id)
   OR (select count(*) from public.audit_events where event_type='first_result_draft_saved' and object_id=saved_id and organization_id=org_a and actor_user_id=owner_actor
     and details->>'request_id'=request_id::text and details->>'approval'='none'
     and details->>'provenance'='caller_supplied_unverified'
     and details->>'source_digest'=payload#>>'{snapshot,content_fingerprint}'
     and details->>'content_digest'=payload#>>'{review,content_digest}'
     and details->>'request_digest'=private.fr_request_digest(org_a,parent_id,owner_actor,request_id,0,payload))<>1
   OR (select first_result_request_digest from public.content_versions where id=saved_id) IS DISTINCT FROM private.fr_request_digest(org_a,parent_id,owner_actor,request_id,0,payload)
   THEN RAISE EXCEPTION 'VERSION_AUDIT_BUDGET_OR_DIGEST_MISMATCH'; END IF;
   -- NONMARKER_FAILURE_TEST_POINT
   tests_passed:=true;
   RAISE EXCEPTION USING ERRCODE='ZFR01', MESSAGE='CLOSED_PACKAGE_TESTS_COMPLETE_ROLLBACK';
  EXCEPTION WHEN SQLSTATE 'ZFR01' THEN
   GET STACKED DIAGNOSTICS caught_message=MESSAGE_TEXT;
   IF NOT tests_passed OR caught_message<>'CLOSED_PACKAGE_TESTS_COMPLETE_ROLLBACK' THEN RAISE; END IF;
  END;
  IF NOT tests_passed OR current_user IS DISTINCT FROM manager OR current_setting('role') IS DISTINCT FROM old_role
  OR coalesce(current_setting('request.jwt.claim.sub',true),'') IS DISTINCT FROM old_sub
  OR coalesce(current_setting('request.jwt.claims',true),'') IS DISTINCT FROM old_claims THEN RAISE EXCEPTION 'SUBTRANSACTION_CONTEXT_LEAK'; END IF;
  -- FINAL_FAILURE_TEST_POINT
  IF (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname=any(new_names))<>15 THEN RAISE EXCEPTION 'FUNCTION_SET_MISMATCH'; END IF;
  FOR fn IN SELECT p.* FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.proname=any(new_names) LOOP
   IF pg_get_userbyid(fn.proowner)<>manager OR fn.proconfig IS DISTINCT FROM array['search_path=""']::text[]
   OR fn.prosecdef IS DISTINCT FROM (fn.proname='save_first_result_draft_impl')
   OR EXISTS(select 1 from aclexplode(coalesce(fn.proacl,acldefault('f',fn.proowner))) where grantee=0 and privilege_type='EXECUTE') THEN RAISE EXCEPTION 'FUNCTION_SECURITY_DRIFT'; END IF;
   FOREACH client_role IN ARRAY array['anon','authenticated','service_role'] LOOP
    IF has_function_privilege(client_role,fn.oid,'EXECUTE') THEN RAISE EXCEPTION 'EFFECTIVE_EXECUTE_LEAK: % %',client_role,fn.proname; END IF;
   END LOOP;
   IF EXISTS(select 1 from aclexplode(coalesce(fn.proacl,acldefault('f',fn.proowner))) where grantee<>fn.proowner and privilege_type='EXECUTE') THEN RAISE EXCEPTION 'UNEXPECTED_EXECUTE_GRANTEE'; END IF;
  END LOOP;
  BEGIN
   SET LOCAL ROLE authenticated;
   PERFORM public.save_first_result_draft(org_a,parent_id,request_id,0,payload);
   RAISE EXCEPTION 'EXPECTED_CLOSED_PUBLIC_ENTRY';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN
   SET LOCAL ROLE authenticated;
   PERFORM private.save_first_result_draft_impl(org_a,parent_id,request_id,0,payload);
   RAISE EXCEPTION 'EXPECTED_CLOSED_PRIVATE_ENTRY';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 END LOOP;
 IF before_rows IS DISTINCT FROM after_rows OR before_security IS DISTINCT FROM after_security THEN RAISE EXCEPTION 'PROTECTED_DATA_OR_SECURITY_CHANGED'; END IF;
 IF current_user IS DISTINCT FROM manager OR current_setting('role') IS DISTINCT FROM old_role
 OR coalesce(current_setting('request.jwt.claim.sub',true),'') IS DISTINCT FROM old_sub
 OR coalesce(current_setting('request.jwt.claims',true),'') IS DISTINCT FROM old_claims THEN RAISE EXCEPTION 'FINAL_CONTEXT_LEAK'; END IF;
 PERFORM set_config('lock_timeout',old_lock_timeout,true);
 -- SQL success is silent. Hosted migration-history outcome MUST be read back.
END
$closed_package$;
