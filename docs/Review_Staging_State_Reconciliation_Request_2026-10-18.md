# Staging Review 一次性唯讀對帳請求（交合法連接器執行者）

目的：完成 Review 持續啟用前的 SQL 層對帳。本文件所有查詢均為唯讀 SELECT，不得據此執行任何 DDL、GRANT、REVOKE 或啟用；對帳回傳後由 Muse 比對並另送獨立 Reviewer，Owner 再核准啟用。

## 目標專案（務必核對，勿用其他專案）

- Project ref：`vhzryhibmpvglzcmfnaa`（Growth-OS 隔離 Staging，Singapore）
- 不是 Production：`qevmlbsunnwgrsdibdoi`（morningai）嚴禁使用。

## 執行方式

以具合法連接權限的 Supabase 連接器／SQL 介面開啟唯讀交易（`BEGIN; SET TRANSACTION READ ONLY;`），依序執行下列查詢，將完整結果（文字或 JSON）回傳。不得貼上任何金鑰、密碼或連線字串。

## 查詢（與候選 state.sql 等價，另加 Save 本體雜湊）

```sql
-- 0) Migration history 全列（比對 url_review* 紀錄與總數，不只計數）
select version,name,statements from supabase_migrations.schema_migrations order by version;

-- 2) Review schema：欄位、constraints、兩函數本體雜湊
select jsonb_build_object('columns',(select jsonb_agg(jsonb_build_object('name',column_name,'type',data_type,'nullable',is_nullable,'default',column_default) order by column_name) from information_schema.columns where table_schema='public' and table_name='content_reviews' and column_name like 'url_review_%'),'constraints',(select jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid),'validated',convalidated) order by conname) from pg_constraint where conrelid='public.content_reviews'::regclass and conname in ('content_reviews_url_request_unique','content_reviews_url_shape')),'functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'body_sha256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'definer',p.prosecdef,'config',p.proconfig,'owner',pg_get_userbyid(p.proowner),'language',l.lanname,'returns',p.prorettype::regtype::text,'volatility',p.provolatile,'strict',p.proisstrict,'leakproof',p.proleakproof) order by p.proname) from pg_proc p join pg_language l on l.oid=p.prolang where p.oid in (to_regprocedure('public.review_url_result(uuid,uuid,uuid,text,text,text,jsonb)'),to_regprocedure('private.review_url_result_impl(uuid,uuid,uuid,text,text,text,jsonb)')))) as review_schema;

-- 3) Save 一般版與 Review 函數本體雜湊
select p.oid::regprocedure::text as signature, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as body_sha256 from pg_proc p where p.oid in (to_regprocedure('private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb)'),to_regprocedure('public.review_url_result(uuid,uuid,uuid,text,text,text,jsonb)'),to_regprocedure('private.review_url_result_impl(uuid,uuid,uuid,text,text,text,jsonb)')) order by 1;

-- 4) 六個 entry 的有效 EXECUTE（authenticated/anon/service_role）
select r.name role,f.name signature,has_function_privilege(r.name,to_regprocedure(f.name),'execute') effective_execute from (values('authenticated'),('anon'),('service_role')) r(name) cross join (values('public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb)'),('private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb)'),('public.save_first_result_draft(uuid,uuid,uuid,integer,jsonb)'),('private.save_first_result_draft_impl(uuid,uuid,uuid,integer,jsonb)'),('public.review_url_result(uuid,uuid,uuid,text,text,text,jsonb)'),('private.review_url_result_impl(uuid,uuid,uuid,text,text,text,jsonb)')) f(name) order by 2,1;

-- 5) 六個 entry 的原始 ACL
select p.oid::regprocedure::text signature,a.grantee,a.privilege_type,a.is_grantable from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid in (to_regprocedure('public.save_url_result_draft(uuid,uuid,uuid,integer,jsonb)'),to_regprocedure('private.save_url_result_draft_impl(uuid,uuid,uuid,integer,jsonb)'),to_regprocedure('public.save_first_result_draft(uuid,uuid,uuid,integer,jsonb)'),to_regprocedure('private.save_first_result_draft_impl(uuid,uuid,uuid,integer,jsonb)'),to_regprocedure('public.review_url_result(uuid,uuid,uuid,text,text,text,jsonb)'),to_regprocedure('private.review_url_result_impl(uuid,uuid,uuid,text,text,text,jsonb)')) order by 1,2;

-- 6) 五張表的有效權限與 RLS policies
select r.name role,t.name relation,has_table_privilege(r.name,t.name,'SELECT') can_read,has_table_privilege(r.name,t.name,'INSERT') can_insert,has_table_privilege(r.name,t.name,'UPDATE') can_update,has_table_privilege(r.name,t.name,'DELETE') can_delete,has_table_privilege(r.name,t.name,'TRUNCATE') can_truncate from (values('anon'),('authenticated'),('service_role')) r(name) cross join (values('public.content_reviews'),('public.content_versions'),('public.growth_opportunities'),('public.audit_events'),('public.organization_members')) t(name) order by 2,1;
select policyname,tablename,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname;
select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c where c.oid in ('public.content_reviews'::regclass,'public.content_versions'::regclass,'public.growth_opportunities'::regclass,'public.audit_events'::regclass,'public.organization_members'::regclass) order by 1;
```

## 預期值（Commit `988a0aa` 候選，逐項比對）

| 項目 | 預期 |
|---|---|
| Save 一般版本體 | `private.save_url_result_draft_impl` SHA256 = `3966372346e8d063278b3ef59ba7c8e68349a0b0a5b00f3e8188e357e79e1f6b` |
| Review 函數本體 | public `c8fefc0ff1ae18363b69c0b42dd6d9857cf6e70e8e6cbc653a6ed30f124d9996`；private impl `94fdd9395dbf272fd68629af8260f1bf0e430622b220713ae9b8d844516e927b` |
| Review 欄位 | `url_review_checks/content_digest/request_id/source_digest/version_digest` 五欄，型別與 `expected-schema.json` 一致 |
| Constraints | `content_reviews_url_request_unique`、`content_reviews_url_shape` 均存在且已 validated |
| Save EXECUTE | url pair：authenticated=true、anon/service_role=false；first-result pair：三者皆 false |
| Review EXECUTE（啟用前） | 三個角色皆 false（閉鎖） |
| Authority 兩表 | `audit_events`、`organization_members` 對 anon/authenticated 的 INSERT/UPDATE/DELETE/TRUNCATE 皆 false，SELECT 保留 |
| History | 含 bounded 時代的 authority revoke／install／enable／disable 紀錄；總數以實際讀回為準（候選 23→26 計數守衛已過時，啟用僅用 `enable.sql` 自身守衛，不重放 install） |

## 回傳與後續

請回傳上述 6 組查詢的完整輸出（勿含任何憑證）。Muse 將逐項比對：全部一致才會把精確啟用包（`enable.sql` ＋ enabled config ＋ disable 回復）送獨立 Reviewer 並請 Owner 最終核准；任一不一致即停止並提交差異，不自行放寬或修復遠端。
