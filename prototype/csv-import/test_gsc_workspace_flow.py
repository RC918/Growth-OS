"""Actual Workspace usage-flow acceptance for Measure.

Stored GSC readback -> Workspace snapshot v2 -> the existing Workspace
snapshot loader and growth report renderer (prototype/owner-workspace, the
same code the logged-in Workspace uses) must produce a readable, trusted
result. Cross-language and file-based on purpose: this exercises the real
presentation path, not a reimplementation of it.
"""
import json
import sqlite3
import subprocess
import tempfile
import unittest
from pathlib import Path

from gsc_store import get_gsc_import, import_gsc_daily, initialize_gsc
from gsc_workspace import to_workspace_snapshot

ROOT = Path(__file__).resolve().parents[2]
RAW = b"date,clicks,impressions\n2026-09-01,2,10\n2026-09-02,0,0\n"


class WorkspaceFlowTests(unittest.TestCase):
    def test_stored_measure_renders_through_workspace_report(self):
        path = Path(tempfile.mkdtemp()) / "flow.sqlite3"
        initialize_gsc(path)
        with sqlite3.connect(path) as db:
            db.execute("INSERT INTO organizations(id) VALUES ('org-a')")
            db.execute("INSERT INTO sites(id, organization_id) VALUES ('site-a', 'org-a')")
        batch = import_gsc_daily(path, "org-a", "site-a", "flow-1", RAW,
                                 property_origin="https://example.com", search_type="web",
                                 coverage_start="2026-09-01", coverage_end="2026-09-02",
                                 exported_at="2026-09-03T00:00:00+00:00")
        snapshot = to_workspace_snapshot(get_gsc_import(path, "org-a", batch["id"]), sample=False)
        snap_path = Path(tempfile.mkdtemp()) / "snapshot.json"
        snap_path.write_text(json.dumps(snapshot), encoding="utf-8")
        script = (
            "import {loadSnapshot} from './prototype/owner-workspace/baseline-snapshot.mjs';"
            "import {growthReport} from './prototype/owner-workspace/baseline-report.mjs';"
            "import {readFileSync} from 'node:fs';"
            "const loaded = loadSnapshot(readFileSync(process.argv[1], 'utf8'));"
            "const report = growthReport(loaded.a.result, loaded.b ? loaded.b.result : null, {a: loaded.a.sample, b: false}, loaded.actions);"
            "console.log(JSON.stringify(report));"
        )
        out = subprocess.run(["node", "--input-type=module", "-e", script, str(snap_path)],
                             cwd=ROOT, capture_output=True, text=True, timeout=30)
        self.assertEqual(out.returncode, 0, out.stderr[-500:])
        report = json.loads(out.stdout)
        text = json.dumps(report, ensure_ascii=False)
        self.assertIn("尚未向 Google 核實", text)  # trusted-source disclosure survives to the Workspace view
        self.assertIn("觀察到點擊 2", text)        # read-back totals are what the user sees
        self.assertNotIn("歸因於內容或行銷措施", text.replace("無法將差異歸因於內容或行銷措施", ""))


if __name__ == "__main__":
    unittest.main()
