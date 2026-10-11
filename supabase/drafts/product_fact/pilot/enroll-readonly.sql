-- Candidate only. Operator supplies verified IDs via session settings, never from browser.
begin;
do $$declare a uuid:=current_setting('w1.actor_id')::uuid;o uuid:=current_setting('w1.organization_id')::uuid;p uuid:=current_setting('w1.product_id')::uuid;begin
 if (select enabled from w1_private.gate where singleton) or exists(select 1 from public.w1_products) then raise exception 'Expected closed empty W1; no overwrite';end if;
 if not exists(select 1 from public.r7_members where user_id=a and organization_id=o and role='owner') then raise exception 'Existing verified membership required';end if;
 insert into public.w1_products(id,organization_id,name,market,channel,source_url,source_quote,source_version,observed_outdoor)
 values(p,o,'合成產品 A（工程驗證，非商家事實）','SYNTHETIC','website','https://fixture.example.invalid/w1','Synthetic：戶外適用性未知；非真網站來源。',1,'unknown');
 update w1_private.gate set actor_id=a,organization_id=o,product_id=p,source_version=1 where singleton;
end$$;
grant usage on schema w1_private to authenticated;
grant execute on function w1_private.has_org_role(uuid,text[]) to authenticated;
grant select on public.w1_products,public.w1_facts,public.w1_drafts,public.w1_reviews,public.w1_requests,public.w1_state to authenticated;
notify pgrst,'reload schema';
commit;
