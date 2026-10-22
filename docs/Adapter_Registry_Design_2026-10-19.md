# Adapter Registry — feasibility note (2026-10-19, design + non-frozen prototype)

## Problem

Every new extraction method currently needs a frozen-validator
allowlist exception (see the v1/v2/v3 history). That does not scale to
custom WooCommerce themes, Shopify, and other platforms.

## Dependency analysis

- The frozen payload validator accepts `extraction.method` from a
  fixed allowlist in two byte-identical reviewed files plus a deploy
  hash manifest (three sync points, now guarded by
  `tools/frozen-preflight.mjs`).
- Adapters themselves live outside the frozen set
  (`prototype/public-audit/declared_product.py`) and already emit the
  full evidence contract: same snapshot + SHA, `source_asserted`
  facts, bound citations, single-product scope.

## Registry design (prototype: `prototype/public-audit/adapter_registry.py`)

- `adapter_id -> (method, builder)`; builders receive the pre-rescue
  report and return a product report or `None` (fail-closed).
- The registry re-validates every output against the evidence contract
  (method match, snapshot SHA present, asserted facts carry citations,
  description carries product scope) and rejects unregistered adapters.
- Tests: `test_adapter_registry.py` — Landyachtz fixture rescues
  through the registered adapter, unknown adapters are rejected, and
  evidence-free pages stay fail-closed (3/3 PASS).

## What a future frozen exception would look like (Owner-gated)

One generic exception: the validator accepts a method only when it is
registry-attested and the payload carries the registry contract proof,
instead of one allowlist line per platform. That change is NOT made
here; it needs its own Owner decision package.

## Cross-site reusability (P4)

- A live second-site fetch was attempted from this environment and
  timed out (external network restricted): **ENV_BLOCKED** for a real
  second site in this run.
- Offline, the existing WooCommerce product path (different structure
  from the Landyachtz custom theme) still passes the full Python suite,
  and the declared-product adapter does not interfere with it.
- A real second-site recording remains **NOT_TESTED** and is the first
  P4 follow-up when a reachable public product page is available.
