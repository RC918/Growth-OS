# Growth-OS UX — WordPress duration return checkpoint (2026-10-23)

Figma file `jOfuk31i2BrJmMvXs25B59`: existing single-use option frame `82:99` and example expiry frame `82:114` have corrected return control routes: `82:112 → 78:99` and `82:127 → 78:99`, so neither sends the user all the way back to unselected account state.

Existing text nodes `82:111`, `82:126` clarify a selected single-use choice still requires account/asset review and affirmative authorization; expiry is demonstrative, and expired/revoked consent must block remote writes.

Figma readback confirmed both return destinations. **No authorization action is active**. This is not a live expiry picker, saved authorization state, or positive grant; those remain P0. No code, production secrets, merge, or deployment. PR #35 remains docs-only Draft.
