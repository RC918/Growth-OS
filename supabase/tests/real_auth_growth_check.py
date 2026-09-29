"""Interactive, read-only 14-table Growth OS Staging acceptance.

Run in your own terminal. The two test passwords are requested without echo and
are sent directly to the supplied Supabase Auth HTTPS endpoint. No credentials,
tokens, row contents, or local files are printed or saved.
"""

import getpass
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request


TABLES = (
    "organizations", "organization_members", "sites", "scans", "findings",
    "import_batches", "funnel_daily", "recommendations", "actions",
    "audit_events", "business_profiles", "growth_opportunities",
    "opportunity_sources", "opportunity_decisions",
)


def project_origin(value):
    parsed = urllib.parse.urlsplit(value.strip().rstrip("/"))
    if (parsed.scheme != "https" or not re.fullmatch(r"[a-z0-9-]+\.supabase\.co", parsed.hostname or "")
            or parsed.port is not None or parsed.path or parsed.query or parsed.fragment
            or parsed.username or parsed.password):
        raise ValueError("Use the HTTPS origin of the isolated Supabase project")
    return f"https://{parsed.hostname}"


def request_json(url, key, *, token=None, payload=None):
    headers = {"apikey": key}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if payload is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        url, data=json.dumps(payload).encode() if payload is not None else None,
        method="POST" if payload is not None else "GET", headers=headers,
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Auth error bodies may contain account information. Never print them.
        raise RuntimeError(f"HTTP {error.code} at {urllib.parse.urlsplit(url).path}") from None


def login(origin, key, email, password):
    response = request_json(
        f"{origin}/auth/v1/token?grant_type=password", key,
        payload={"email": email, "password": password},
    )
    if not response.get("access_token"):
        raise RuntimeError("Auth did not return a session")
    return response["access_token"]


def rows(origin, key, token, table, params):
    query = urllib.parse.urlencode(params)
    data = request_json(f"{origin}/rest/v1/{table}?{query}", key, token=token)
    if not isinstance(data, list):
        raise RuntimeError(f"Unexpected Data API response for {table}")
    return data


def org_for(origin, key, token, expected_role):
    memberships = rows(origin, key, token, "organization_members",
                       {"select": "organization_id,role", "limit": "2"})
    if len(memberships) != 1 or memberships[0].get("role") != expected_role:
        raise AssertionError(f"Expected exactly one {expected_role} fixture membership")
    return memberships[0]["organization_id"]


def check(origin, key, tokens):
    own_org = {
        "A": org_for(origin, key, tokens["A"], "owner"),
        "B": org_for(origin, key, tokens["B"], "viewer"),
    }
    if own_org["A"] == own_org["B"]:
        raise AssertionError("The two test accounts share an organization")
    for actor, other in (("A", "B"), ("B", "A")):
        for table in TABLES:
            column = "id" if table == "organizations" else "organization_id"
            counts = []
            for organization in (own_org[actor], own_org[other]):
                counts.append(len(rows(origin, key, tokens[actor], table,
                                       {"select": column, column: f"eq.{organization}", "limit": "2"})))
            expected = 0 if actor == "B" and table in ("audit_events", "opportunity_decisions") else 1
            if counts != [expected, 0]:
                raise AssertionError(f"{actor} {table}: own/cross counts {counts}; expected {[expected, 0]}")


def main():
    if not sys.stdin.isatty() or not sys.stderr.isatty():
        raise RuntimeError("Run from an interactive terminal for hidden password input")
    origin = project_origin(input("Growth OS Supabase project URL: "))
    key = input("Growth OS publishable key: ").strip()
    if not key.startswith("sb_publishable_"):
        raise ValueError("Expected a publishable key; never enter a service-role key")
    emails = {actor: input(f"Test {actor} email: ").strip() for actor in ("A", "B")}
    if not all(emails.values()) or emails["A"] == emails["B"]:
        raise ValueError("Provide two distinct test account emails")
    tokens = {}
    for actor in ("A", "B"):
        password = getpass.getpass(f"Test {actor} password (hidden): ")
        try:
            tokens[actor] = login(origin, key, emails[actor], password)
        finally:
            password = None
    check(origin, key, tokens)
    print("PASS: two real Auth sessions isolate all 14 Growth OS tenant tables")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, AssertionError, urllib.error.URLError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        sys.exit(1)
