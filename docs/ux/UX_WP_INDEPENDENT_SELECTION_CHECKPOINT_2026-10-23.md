# WordPress independent selection prototype checkpoint — 2026-10-23

Figma `jOfuk31i2BrJmMvXs25B59`. Kept existing base picker `76:99` and combined state `78:99`; added distinct state variants `81:99` **account chosen only** and `81:114` **article chosen only**. This specifically corrects the earlier premature combined selection state.

Verified action routes via Figma readback:
- Base account `76:103` → `81:99`.
- Base article `76:106` → `81:114`.
- Account-only article `81:106` → combined `78:99`.
- Article-only account `81:118` → combined `78:99`.
- Account-only return `81:112` and article-only return `81:127` → base `76:99`.

**Limitations:** Sample identities are synthetic; frame-state variants represent selection, not stored production data or real accounts. Selection is still linear/static rather than a persistent interactive data model; account connection is absent, duration/expiry is not selectable, and positive authorization is not implemented. No real remote write is allowed. Remaining P0: duration/revocation states, affirmative confirmation, YouTube equivalents, restore decision, screenshots and T01–T12. Scope remains docs-only Draft PR #35; no code, merge, deploy or secrets.
