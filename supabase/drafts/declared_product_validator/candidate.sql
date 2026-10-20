-- Declared-Product DB validator candidate (ISOLATED TEST STACK ONLY).
--
-- Owner authorization 2026-10-20: inside the ephemeral CI
-- PostgreSQL/GoTrue/PostgREST stack only, allow the already-approved
-- declared_product_dom extraction method in private.fr_valid_payload.
-- This file is a new traceable candidate artifact: it does NOT modify
-- proposal.sql, the historical closed-package.sql, any executed
-- migration, or any hosted database. Its body is byte-identical to
-- proposal.sql's fr_valid_payload except for the one-line method
-- allowlist addition below. Staging deployment needs a separate
-- forward migration and Owner approval (see decision package).
begin;

create or replace function private.fr_valid_payload(p jsonb) returns boolean
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
 perform private.fr_require(p->>'page_type'='product' and p#>>'{extraction,method}' in ('explicit_product_microdata','woocommerce_single_product','declared_product_dom')
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

commit;
