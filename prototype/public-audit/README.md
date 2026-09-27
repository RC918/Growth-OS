# Commerce Growth — Sprint 1 local prototype

This runnable public landing-page audit uses only Python 3 standard libraries. It is a pilot implementing the first slice of the system design; no GA4, ads, GSC, orders, or Ahrefs are connected. The findings are clues from static public HTML, never conversion measurements.

Run:

```bash
python3 app.py
```

Open `http://127.0.0.1:8080`. The default server binds only to localhost. Run the tests:

```bash
python3 -m unittest -v test_scanner.py test_app.py
```

The first request queues a scan; a background thread checks `robots.txt`, then fetches at most one HTTPS HTML page. Every DNS result must be public and the TCP connection is pinned to a checked address with certificate validation. Redirects are limited to the same host. Requests have a five-second timeout and 1 MB response cap. Queries are stripped to avoid retaining URL tokens. The anonymous API limits each IP to ten scans per hour in this process. Findings are saved to local `scans.sqlite3` with an opaque scan ID.

**Deployment gate:** This is not ready for an internet-facing production deployment. Before Staging, add durable queue/rate limits, worker sandbox and egress control, domain verification for saved reports, row-level policies, lifecycle deletion, observability, independent security review, and full integration tests. A host firewall must block internal/metadata destinations as defense in depth. The planned Next.js/Postgres implementation and connected funnel belong to later Sprint work.

The screen deliberately marks the product as a pilot, and shows no sample growth numbers or claims of measured abandonment.
