"""Read-only Auth + Data API tenant isolation check for synthetic Staging fixtures.

Use two real, email-confirmed Supabase Auth test accounts with one organization
each. Do not run against customer accounts. No credentials or response rows are
printed. This complements, but does not replace, tenant_rls_staging.sql.
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from uuid import UUID


TABLES = (
    "organizations",
    "organization_members",
    "sites",
    "scans",
    "findings",
    "import_batches",
    "funnel_daily",
    "recommendations",
    "actions",
    "audit_events",
    "business_profiles",
    "growth_opportunities",
    "opportunity_sources",
    "opportunity_decisions",
)


def required(name):
    value = os.environ.get(name, "")
    if not value:
        raise ValueError(f"Missing {name}")
    return value


def request_json(url, *, method="GET", headers=None, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(
        url, data=data, method=method, headers=headers or {}
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        # Do not echo response bodies: Auth and REST errors may contain private data.
        raise RuntimeError(f"HTTP {exc.code} at {urllib.parse.urlsplit(url).path}") from None


def sign_in(base_url, key, email, password):
    response = request_json(
        base_url + "/auth/v1/token?grant_type=password",
        method="POST",
        headers={"apikey": key, "Content-Type": "application/json"},
        payload={"email": email, "password": password},
    )
    token = response.get("access_token")
    if not token:
        raise RuntimeError("Auth did not return an access token")
    return token


def visible_ids(base_url, key, token, table, org_id):
    column = "id" if table == "organizations" else "organization_id"
    query = urllib.parse.urlencode(
        {"select": column, column: f"eq.{org_id}", "limit": "2"}
    )
    rows = request_json(
        f"{base_url}/rest/v1/{table}?{query}",
        headers={"apikey": key, "Authorization": f"Bearer {token}"},
    )
    if not isinstance(rows, list):
        raise RuntimeError(f"Data API returned a non-list for {table}")
    return len(rows)


def main():
    base_url = required("SUPABASE_URL").rstrip("/")
    parsed = urllib.parse.urlsplit(base_url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.path:
        raise ValueError("SUPABASE_URL must be an HTTPS origin")
    key = required("SUPABASE_PUBLISHABLE_KEY")
    a_org = str(UUID(required("TEST_A_ORG_ID")))
    b_org = str(UUID(required("TEST_B_ORG_ID")))
    if a_org == b_org:
        raise ValueError("Test organizations must differ")

    tokens = {
        "A": sign_in(base_url, key, required("TEST_A_EMAIL"), required("TEST_A_PASSWORD")),
        "B": sign_in(base_url, key, required("TEST_B_EMAIL"), required("TEST_B_PASSWORD")),
    }
    for actor, own, other in (("A", a_org, b_org), ("B", b_org, a_org)):
        for table in TABLES:
            own_count = visible_ids(base_url, key, tokens[actor], table, own)
            other_count = visible_ids(base_url, key, tokens[actor], table, other)
            expected_own = 0 if actor == "B" and table in (
                "audit_events", "opportunity_decisions"
            ) else 1
            if own_count != expected_own or other_count != 0:
                raise AssertionError(
                    f"{actor} {table}: own={own_count}, cross={other_count}; "
                    f"expected own={expected_own}, cross=0"
                )
    print("PASS: real Auth sessions and Data API isolate 14 synthetic tenant tables")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, AssertionError, urllib.error.URLError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        sys.exit(1)
