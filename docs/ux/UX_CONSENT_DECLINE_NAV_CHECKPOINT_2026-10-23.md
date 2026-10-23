# Growth-OS UX — consent defer paths (2026-10-23)

Figma file `jOfuk31i2BrJmMvXs25B59`: modified **existing shared CTA instances** on two existing screens, no frames added.

- WordPress confirmation `49:91`, CTA `49:115`, shared label `I49:115;42:80`: set label to `暫不授權，保留草稿`, opacity 1, ON_CLICK NAVIGATE → `49:145` Grant Declined.
- YouTube confirmation `49:119`, CTA `49:143`, shared label `I49:143;42:80`: same label, opacity and ON_CLICK → `49:145`.
- Post-edit readback verified label and target for each.

**Important:** These actions intentionally **defer authorization**; they do not grant consent, write to WordPress or YouTube, or authorize publication. The full positive consent flow, permission scopes/expiration, remote verification and clickable recovery still need design and acceptance. The declined-state CTA `49:169` navigates back to selection `38:151` per earlier verification. Existing desktop A/B/C comparison is still prototype copy rather than a functional diff.

PR #35 remains docs-only Draft. No product code, merge, deployment or production credentials.
