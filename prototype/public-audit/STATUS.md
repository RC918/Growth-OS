# Sprint 1 status — 2026-09-27

## Completed locally

- Responsive English pilot landing screen; URL and ecommerce/trade selection.
- `POST /api/v1/scans` queues a scan, `GET /api/v1/scans/{id}` returns status and report.
- Two-worker queue, SQLite persistence, ten requests per IP per hour (in-process).
- Public HTTPS only, pinned resolved public IP, TLS certificate validation, same-host redirects, robots check, 1 MB maximum response, five-second request timeout.
- Static HTML findings: missing title, h1, meta description, visible password field, and absent common commerce CTA. Each contains evidence URL, excerpt, confidence, limitations.
- Six local tests pass; no real visitor, ad, order, AI citation, or revenue data used.

## Not complete

- Current UI/API is a standard-library Python pilot to make the vertical slice runnable without external package downloads. It is not the planned Next.js/Postgres/Supabase implementation.
- No sandboxed browser rendering, JS page scan, mobile screenshot, domain ownership verification, OAuth or CSV import, GA4 funnel, recommendations, action approval, or multi-tenant accounts.
- SQLite is local pilot persistence; no cloud staging, DNS, database migration, load test, or production deployment.
- Anonymous scan reports have opaque IDs but are not an authenticated document store. Do not put private information in submitted URLs. Query strings are stripped.

## Next engineering gate

1. Set up a separate project repository and CI; port this proven behavior into the chosen app/API stack.
2. Add domain verification, authentication, tenant isolation/RLS, durable queue and worker network sandbox.
3. Deploy staging and collect Deployment/API/DB/E2E evidence before adding real integrations.
4. Then implement consent-aware GA4/ad/order data import and the actual funnel diagnosis.
