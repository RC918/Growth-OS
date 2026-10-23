# Growth-OS UX — WordPress account picker checkpoint (2026-10-23)

In Figma file `jOfuk31i2BrJmMvXs25B59`, added a **distinct** 390×844 frame `76:99` named `WP · Example Account Asset Picker` (not a clone of an existing frame). It shows synthetic example account/site, article, allowed fields, single-use limitation and an unconfigured expiry option. Explicitly states no real connection, no real consent and no publication.

Existing WordPress authorization frame account row `49:100` now has `ON_CLICK → 76:99`; picker return control `76:112` has `ON_CLICK → 49:91` without granting access. Both destinations read back. No product code or API action.

**Important:** The displayed radio-like entries are NOT yet selectable and do not persist selection, so this is the first interactive navigation step, NOT an operative account/asset/expiry selector or affirmative authorization. Do not mark P0 consent PASS. YouTube equivalent, selection variants, expiry, positively confirmed consent, revoked/expired state, true 3-way diff and screenshots/T01–T12 remain open. PR #35 Draft docs-only; no merge/deployment/secrets.
