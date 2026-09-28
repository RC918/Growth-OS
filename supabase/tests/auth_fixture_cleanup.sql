-- Only after the real Auth/Data API checks finish, in Growth OS Staging.
-- Exact ID + name assertions prevent deleting a different organization's rows.
begin;
do $$
begin
  if (select count(*) from public.organizations
      where (id='93a88055-0a0b-40c0-b22f-a6d312320001' and name='Growth OS Auth Fixture A')
         or (id='93a88055-0a0b-40c0-b22f-a6d312320002' and name='Growth OS Auth Fixture B')) <> 2 then
    raise exception 'Expected fixture organizations not found; no cleanup performed';
  end if;
end $$;
delete from public.organizations where id in
  ('93a88055-0a0b-40c0-b22f-a6d312320001','93a88055-0a0b-40c0-b22f-a6d312320002');
commit;
select count(*) as remaining_fixture_organizations from public.organizations where id in
  ('93a88055-0a0b-40c0-b22f-a6d312320001','93a88055-0a0b-40c0-b22f-a6d312320002');
