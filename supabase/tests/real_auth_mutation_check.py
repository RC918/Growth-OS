"""Live Staging RPC acceptance using two real Auth sessions and synthetic fixtures.

Run only from the operator's own interactive terminal. Passwords are hidden and
sent directly to this isolated Supabase Auth project. No credentials, tokens,
row contents, or response bodies are printed or stored in files.
"""

import getpass
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

from real_auth_growth_check import login, org_for, rows


ORIGIN = "https://vhzryhibmpvglzcmfnaa.supabase.co"
KEY = "sb_publishable_B9pMiED8jrCoxuy2kC0HoA_LmzKex9r"
EMAIL_A = "test1@example.com"
EMAIL_B = "test2@example.com"
FIXTURE_NAMES = {"A": "Growth OS Auth Fixture A", "B": "Growth OS Auth Fixture B"}
PROFILE_FIELDS = (
    "display_name", "audience_summary", "offering_summary",
    "primary_outcome", "target_market",
)


def rpc(token, name, payload, *, denied_code=None):
    request = urllib.request.Request(
        f"{ORIGIN}/rest/v1/rpc/{name}",
        data=json.dumps(payload).encode(),
        method="POST",
        headers={"apikey": KEY, "Authorization": f"Bearer {token}",
                 "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        if denied_code is None:
            raise RuntimeError(f"{name}: HTTP {error.code}") from None
        try:
            body = json.load(error)
        except (ValueError, OSError):
            raise AssertionError(f"{name}: rejection lacked a database error code") from None
        if body.get("code") != denied_code:
            raise AssertionError(f"{name}: unexpected rejection code (HTTP {error.code})")
        return None
    if denied_code is not None:
        raise AssertionError(f"{name}: unauthorized mutation was accepted")
    if not isinstance(result, str) or not result:
        raise AssertionError(f"{name}: expected an ID")
    return result


def selected(token, table, organization, columns, *, extra=None):
    params = {"select": columns, "organization_id": f"eq.{organization}", "limit": "20"}
    if extra:
        params.update(extra)
    return rows(ORIGIN, KEY, token, table, params)


def sole_profile(token, organization):
    profiles = selected(token, "business_profiles", organization,
                        ",".join(PROFILE_FIELDS) + ",site_id,review_status")
    if len(profiles) != 1:
        raise AssertionError("Expected exactly one synthetic business profile")
    return profiles[0]


def save_payload(organization, values):
    return {"p_organization_id": organization, "p_site_id": values["site_id"],
            **{f"p_{name}": values[name] for name in PROFILE_FIELDS}}


def candidate_payload(organization):
    return {"p_organization_id": organization, "p_site_id": None,
            "p_channel": "organic_search",
            "p_audience_need": "Synthetic owner question for live RPC acceptance",
            "p_proposed_action": "Draft a synthetic answer page for live RPC acceptance",
            "p_rationale": "Synthetic first-party research note, not measured demand",
            "p_source_kind": "owner_question",
            "p_evidence_note": "Synthetic fixture only; no customer information"}


def check(tokens):
    org_a = org_for(ORIGIN, KEY, tokens["A"], "owner")
    org_b = org_for(ORIGIN, KEY, tokens["B"], "viewer")
    if org_a == org_b:
        raise AssertionError("Fixture organizations must differ")
    for actor, organization in (("A", org_a), ("B", org_b)):
        names = rows(ORIGIN, KEY, tokens[actor], "organizations",
                     {"select": "name", "id": f"eq.{organization}", "limit": "2"})
        if len(names) != 1 or names[0]["name"] != FIXTURE_NAMES[actor]:
            raise AssertionError("Unexpected organization: only named synthetic fixtures are allowed")

    original = sole_profile(tokens["A"], org_a)
    if original["review_status"] != "draft" or sole_profile(tokens["B"], org_b)["review_status"] != "draft":
        raise AssertionError("Expected fresh draft profiles in both fixtures")
    linked_site = selected(tokens["A"], "sites", org_a, "id,verified_at",
                           extra={"id": f"eq.{original['site_id']}"})
    if len(linked_site) != 1 or linked_site[0]["verified_at"] is not None:
        raise AssertionError("Expected the synthetic profile to link one unverified fixture site")

    # All denial checks precede the first authorized mutation.
    rpc(tokens["A"], "create_growth_opportunity", candidate_payload(org_a), denied_code="23514")
    rpc(tokens["B"], "approve_business_profile", {"p_organization_id": org_b}, denied_code="42501")
    rpc(tokens["A"], "approve_business_profile", {"p_organization_id": org_b}, denied_code="42501")
    rpc(tokens["B"], "create_growth_opportunity", candidate_payload(org_b), denied_code="42501")
    rpc(tokens["A"], "save_business_profile", save_payload(org_a, original), denied_code="23514")
    rpc(tokens["A"], "approve_business_profile", {"p_organization_id": org_a})
    if sole_profile(tokens["A"], org_a)["review_status"] != "owner_approved":
        raise AssertionError("Owner approval was not visible")

    opportunity = rpc(tokens["A"], "create_growth_opportunity", candidate_payload(org_a))
    created = selected(tokens["A"], "growth_opportunities", org_a, "id,status",
                       extra={"id": f"eq.{opportunity}"})
    sources = selected(tokens["A"], "opportunity_sources", org_a, "opportunity_id,source_kind",
                       extra={"opportunity_id": f"eq.{opportunity}"})
    if len(created) != 1 or created[0]["status"] != "candidate" or len(sources) != 1:
        raise AssertionError("Candidate/source transaction was incomplete")
    rpc(tokens["B"], "review_growth_opportunity",
        {"p_organization_id": org_a, "p_opportunity_id": opportunity,
         "p_decision": "approved", "p_reason": "Synthetic viewer denial"}, denied_code="42501")
    rpc(tokens["A"], "review_growth_opportunity",
        {"p_organization_id": org_a, "p_opportunity_id": opportunity,
         "p_decision": "approved", "p_reason": "Synthetic owner-approved acceptance"})
    reviewed = selected(tokens["A"], "growth_opportunities", org_a, "id,status",
                        extra={"id": f"eq.{opportunity}"})
    decisions = selected(tokens["A"], "opportunity_decisions", org_a, "opportunity_id,decision",
                         extra={"opportunity_id": f"eq.{opportunity}"})
    audits = selected(tokens["A"], "audit_events", org_a, "event_type,object_id",
                      extra={"object_id": f"eq.{opportunity}"})
    if (len(reviewed) != 1 or reviewed[0]["status"] != "approved"
            or len(decisions) != 1 or decisions[0]["decision"] != "approved"
            or sorted(item["event_type"] for item in audits)
               != ["growth_opportunity_created", "growth_opportunity_reviewed"]):
        raise AssertionError("Owner review, decision, or audit chain was incomplete")
    if selected(tokens["B"], "growth_opportunities", org_a, "id",
                extra={"id": f"eq.{opportunity}"}):
        raise AssertionError("Viewer could read the owner's opportunity")


def main():
    if not sys.stdin.isatty() or not sys.stderr.isatty():
        raise RuntimeError("Run in your own interactive terminal for hidden password input")
    print("Growth OS isolated Staging: two hidden passwords required. Synthetic fixture writes only.")
    tokens = {}
    for actor, email in (("A", EMAIL_A), ("B", EMAIL_B)):
        password = getpass.getpass(f"{email} password (hidden): ")
        try:
            tokens[actor] = login(ORIGIN, KEY, email, password)
        finally:
            password = None
    check(tokens)
    print("PASS: real Auth owner/viewer RPC gate, profile approval, candidate, decision, audit, tenant isolation")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, AssertionError, urllib.error.URLError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        sys.exit(1)
