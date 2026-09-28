# Staging acceptance checks

`tenant_rls_staging.sql` is the database-side, rollback-only check already run on the isolated Growth OS Supabase Staging project. It impersonates JWT claims; it does not mint a real Auth session.

`auth_data_api_acceptance.py` is the next read-only gate. It requires **two separate, email-confirmed test accounts issued by Supabase Auth**, each with exactly one synthetic organization and one row in every tenant table. A is owner, B is viewer. B's own `audit_events` row is intentionally hidden. The script signs in through Auth and calls the Data API using the project publishable key and each actual session JWT. It never prints passwords, tokens, keys, or response rows.

Run only against isolated Staging after creating and documenting the fixtures through a trusted administrative path. Use a secure local environment for the following variables, never a committed `.env` or chat message:

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

A PASS covers signed-in SELECT isolation. It does not cover token refresh, membership revocation after login, direct writes, server-side mutations, DNS proof, or CSV import. Record those separately before allowing customer data.
