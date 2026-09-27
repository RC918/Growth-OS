"""Offline, source-aware action-to-outcome report. No network or credentials."""
import argparse
import csv
import json
from datetime import date, timedelta
from pathlib import Path


def rows(path):
    with open(path, encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def numeric(value, field):
    result = int(value)
    if result < 0:
        raise ValueError(f"{field} must be nonnegative")
    return result


def build(actions, metrics, events):
    report = []
    for action in actions:
        if action["status"] != "published":
            continue
        start = date.fromisoformat(action["published_at"])
        page = action["page"]
        relevant = [m for m in metrics if m["page"] == page]
        before = [m for m in relevant if start - timedelta(days=7) <= date.fromisoformat(m["date"]) < start]
        after = [m for m in relevant if start < date.fromisoformat(m["date"]) <= start + timedelta(days=7)]
        if len(before) != 7 or len(after) != 7:
            observation = None
            caveat = "Seven complete days on both sides are required; publication day omitted."
        else:
            fields = ("gsc_impressions", "gsc_clicks", "ga4_organic_sessions")
            observation = {key: {"before": sum(numeric(m[key], key) for m in before),
                                 "after": sum(numeric(m[key], key) for m in after)} for key in fields}
            for value in observation.values():
                value["difference"] = value["after"] - value["before"]
            caveat = "Temporal association only; no control or causal attribution."
        leads = [e for e in events if e["page"] == page and e["event_type"] == "qualified_lead"
                 and start < date.fromisoformat(e["date"]) <= start + timedelta(days=30)]
        sales = [e for e in events if e["event_type"] == "sale" and e["action_id"] == action["action_id"]
                 and e["page"] == page and start < date.fromisoformat(e["date"]) <= start + timedelta(days=30)]
        currencies = {e["currency"] for e in sales}
        if len(currencies) > 1:
            raise ValueError("Cannot sum different currencies")
        if len({e["event_id"] for e in events}) != len(events):
            raise ValueError("Duplicate event_id")
        report.append({"action_id": action["action_id"], "page": page, "published_at": action["published_at"],
                       "action": action["description"], "metrics": observation,
                       "metric_sources": sorted({m["source"] for m in before + after}),
                       "latest_metric_observed_at": max((m["observed_at"] for m in before + after), default=None),
                       "qualified_leads_on_page_30d": len(leads), "leads_evidence_type": "associated",
                       "action_linked_revenue": sum(float(e["amount"]) for e in sales) if sales else None,
                       "currency": next(iter(currencies), None),
                       "revenue_evidence_type": "explicit_action_link_not_causal_proof" if sales else "unknown",
                       "sales_event_ids": [e["event_id"] for e in sales], "limitations": caveat})
    return {"status": "SIMULATED_EXAMPLE" if any("SIMULATED" in m["source"] for m in metrics) else "DATA_REQUIRES_REVIEW",
            "generated_from": "local CSV inputs", "actions": report}


def main():
    parser = argparse.ArgumentParser()
    for name in ("actions", "metrics", "events", "output"):
        parser.add_argument("--" + name, required=True)
    args = parser.parse_args()
    result = build(rows(args.actions), rows(args.metrics), rows(args.events))
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{args.output}: {len(result['actions'])} published action(s); {result['status']}")


if __name__ == "__main__":
    main()
