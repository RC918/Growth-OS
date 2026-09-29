# Staging acceptance checks

`tenant_rls_staging.sql` is the database-side, rollback-only check already run on the isolated Growth OS Supabase Staging project. It impersonates JWT claims; it does not mint a real Auth session.

`growth_opportunities_staging.sql` checks the four traffic-first tables with rolled-back synthetic data. `review_growth_opportunity_staging.sql` exercises the owner-only RPC, tenant and viewer denial, missing source, invalid and duplicate decisions, and status/decision/audit consistency. Both have run on isolated Staging and rolled back. These simulated claims do not replace real Auth session and Data API checks.

`create_growth_opportunity_staging.sql` exercises the owner-only self-reported candidate RPC, verified site restriction, source-kind restrictions, and create-to-review transaction path. It also runs with synthetic claims and rolls back all fixtures.

`growth_auth_fixture_setup.sql.template` extends the existing real Auth fixtures with one row per organization in business_profiles, growth_opportunities, and opportunity_sources, plus a decision by A owner. It looks up the disposable fixture organizations and owner without embedding account IDs. The B viewer has no decision row. Remove the fixture with the existing organization-scoped `auth_fixture_cleanup.sql` after testing. The Python runner checks all 14 tables, expecting B's own audit and decision counts to be zero. A preview credential form was removed after browser security review; do not ask testers to enter Supabase passwords on a Vercel preview.

`auth_data_api_acceptance.py` is the next read-only gate. It requires **two separate, email-confirmed test accounts issued by Supabase Auth**, each with exactly one synthetic organization and one row in each of the original 10 tenant tables. A is owner, B is viewer. Extend with `growth_auth_fixture_setup.sql` for four more tables; B has no decision row, and its own `audit_events` row is hidden. The script signs in through Auth and calls the Data API using the project publishable key and each actual session JWT. It never prints passwords, tokens, keys, or response rows.

For a human operator, run `python3 supabase/tests/real_auth_growth_check.py` in an interactive terminal. Enter the isolated Staging project's HTTPS origin and publishable key, then each test email and its password when prompted. Password entry is hidden; the script sends credentials directly to that project's Supabase Auth endpoint and makes read-only Data API calls. It discovers each account's single organization membership and verifies own/cross visibility on all 14 tables. Never enter passwords in a preview page, chat, shell command, or committed environment file. A pass here covers real sessions and SELECT isolation, but does not constitute a browser end-to-end test of the authenticated product UI.

Run only against isolated Staging after creating the two Auth test users. An operator with privileged Staging SQL access can replace `__A_USER_UUID__` and `__B_USER_UUID__` in `auth_fixture_setup.sql.template` with the confirmed users' UUIDs, inspect the resulting SQL, and execute it once. The fixed organization IDs are `93a88055-0a0b-40c0-b22f-a6d312320001` and `93a88055-0a0b-40c0-b22f-a6d312320002`. The setup asserts the two users exist and are email-confirmed before writing any fixture rows. The original setup and growth extension were applied to two disposable existing test accounts in isolated Staging on 2026-09-29; remove both fixture organizations with the cleanup SQL after real-session checks.

Use a secure local environment for the following variables, never a committed `.env` or chat message:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
TEST_A_EMAIL
TEST_A_PASSWORD
TEST_A_ORG_ID
TEST_B_EMAIL
TEST_B_PASSWORD
TEST_B_ORG_ID
```

Then run `python3 supabase/tests/auth_data_api_acceptance.py` from a network that can reach the project. The script is read-only; fixture creation and cleanup are separate administrative steps. If the Data API is not exposed, configure only the necessary `public` tables and grants, with RLS still enabled, then repeat the test. Do not use real customers or disable RLS to make it pass.

A PASS covers signed-in SELECT isolation. It does not cover token refresh, membership revocation after login, direct writes, server-side mutations, DNS proof, or CSV import. Record those separately before allowing customer data. After the checks, run `auth_fixture_cleanup.sql` against this Staging project; it checks both exact organization names and IDs before cascading their rows. Delete or disable the two test Auth users through the Auth admin UI after revoking their sessions. Never run fixture cleanup against customer organizations.

`real_auth_mutation_check.py` is the next **write** acceptance gate on the same disposable Staging fixture. It pins the isolated project URL and its publishable key, and prompts only for the two confirmed test account passwords in a private terminal. It rejects non-fixture organization names, checks profile-approval and viewer/cross-tenant denials, saves and approves an owner profile, creates a sourced candidate, reviews it, verifies the decision/audit chain and cross-tenant invisibility, then restores the original owner profile fields and draft status even if a later check fails. The new synthetic opportunity, source, decision, and audit entries persist until the existing fixture cleanup. Never run this against customer data. Run `python3 supabase/tests/real_auth_mutation_check.py` from a trusted computer; send only the terminal PASS/FAIL line, never passwords or tokens. The offline logic checks run with `python3 -m unittest -v supabase/tests/test_real_auth_mutation_check.py` and do not replace a live result.
