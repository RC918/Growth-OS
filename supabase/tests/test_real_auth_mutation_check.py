"""Checks the live acceptance runner's gate order and draft restoration offline."""

import sys
import io
import urllib.error
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import real_auth_mutation_check as acceptance


class RunnerTest(unittest.TestCase):
    def test_expected_database_denial_and_redacted_unexpected_error(self):
        def rejected(code):
            return urllib.error.HTTPError(
                acceptance.ORIGIN + "/rest/v1/rpc/approve_business_profile", 403,
                "Forbidden", {}, io.BytesIO(
                    ('{"code":"' + code + '","message":"private detail"}').encode()))
        with patch.object(acceptance.urllib.request, "urlopen", side_effect=rejected("42501")):
            self.assertIsNone(acceptance.rpc("synthetic-token", "approve_business_profile",
                                             {"p_organization_id": "fixture-b"}, denied_code="42501"))
        with patch.object(acceptance.urllib.request, "urlopen", side_effect=rejected("23514")):
            with self.assertRaises(AssertionError) as context:
                acceptance.rpc("synthetic-token", "approve_business_profile",
                               {"p_organization_id": "fixture-b"}, denied_code="42501")
            self.assertNotIn("private detail", str(context.exception))

    def exercise(self, fail_review=False):
        profile = {
            "display_name": "Synthetic Shop A", "audience_summary": "Synthetic buyers",
            "offering_summary": "Synthetic goods", "primary_outcome": "order",
            "target_market": "Taiwan", "review_status": "draft",
        }
        calls = []
        opportunity = {"status": None, "decision": None, "audits": []}
        org_a, org_b = "fixture-a", "fixture-b"

        def fake_org(origin, key, token, role):
            self.assertEqual((token, role), ("token-a", "owner") if token == "token-a" else ("token-b", "viewer"))
            return org_a if token == "token-a" else org_b

        def fake_rows(origin, key, token, table, params):
            organization = params.get("organization_id", params.get("id", ""))[3:]
            if table == "organizations":
                return [{"name": acceptance.FIXTURE_NAMES["A" if token == "token-a" else "B"]}]
            if organization != (org_a if token == "token-a" else org_b):
                return []
            if table == "business_profiles":
                return [profile.copy()] if organization == org_a else [dict(profile, review_status="draft")]
            if table == "growth_opportunities" and opportunity["status"]:
                return [{"status": opportunity["status"]}]
            if table == "opportunity_sources" and opportunity["status"]:
                return [{"source_kind": "owner_question"}]
            if table == "opportunity_decisions" and opportunity["decision"]:
                return [{"decision": opportunity["decision"]}]
            if table == "audit_events":
                return [{"event_type": value} for value in opportunity["audits"]]
            return []

        def fake_rpc(token, name, payload, *, denied_code=None):
            calls.append((token, name, denied_code))
            if denied_code:
                self.assertIn(denied_code, ("23514", "42501"))
                return None
            if name == "save_business_profile":
                profile.update({name: payload["p_" + name] for name in acceptance.PROFILE_FIELDS})
                profile["review_status"] = "draft"
            elif name == "approve_business_profile":
                profile["review_status"] = "owner_approved"
            elif name == "create_growth_opportunity":
                opportunity["status"] = "candidate"
                opportunity["audits"].append("growth_opportunity_created")
            elif name == "review_growth_opportunity":
                if fail_review:
                    raise RuntimeError("synthetic review failure")
                opportunity["status"] = "approved"
                opportunity["decision"] = "approved"
                opportunity["audits"].append("growth_opportunity_reviewed")
            return "synthetic-id"

        with patch.object(acceptance, "org_for", side_effect=fake_org), \
             patch.object(acceptance, "rows", side_effect=fake_rows), \
             patch.object(acceptance, "rpc", side_effect=fake_rpc):
            if fail_review:
                with self.assertRaisesRegex(RuntimeError, "synthetic review failure"):
                    acceptance.check({"A": "token-a", "B": "token-b"})
            else:
                acceptance.check({"A": "token-a", "B": "token-b"})
        self.assertEqual(profile["display_name"], "Synthetic Shop A")
        self.assertEqual(profile["review_status"], "draft")
        self.assertEqual(calls[-1][:2], ("token-a", "save_business_profile"))
        self.assertEqual([call[2] for call in calls[:4]], ["23514", "42501", "42501", "42501"])

    def test_owner_mutation_chain_and_restoration(self):
        self.exercise()

    def test_failure_after_mutation_still_restores_profile(self):
        self.exercise(fail_review=True)


if __name__ == "__main__":
    unittest.main()
