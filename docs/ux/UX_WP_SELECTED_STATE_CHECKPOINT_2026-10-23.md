# Growth-OS UX — WordPress selected-state prototype (2026-10-23)

## Changed Figma
Existing picker frame `76:99` is preserved. A distinct **selected-state variant** `78:99` named `WP · Selected single-use review` was created for the simulated account and article selection, avoiding the earlier practice of cloning identically named screens.

- `76:103` example account row `ON_CLICK → 78:99`.
- `76:106` example article row `ON_CLICK → 78:99`.
- Variant `78:99` shows selected sample website and article, a *simulated* one-use scope, explicitly unconfigured expiry and no remote-write permission.
- `78:112` `ON_CLICK → 76:99` allows reversal to unselected picker. All destinations and sample labels independently read back.

## Acceptance limitations
This variant demonstrates click-to-select and a reversible displayed state, **not independent account and article selections, persistent data binding, a functioning expiry selector, or affirmative authorization**. In particular, both click targets currently navigate to the same combined selected-state variant, so P0 positive-consent flow remains incomplete. No actual account linkage, external platform write, deployment or credentials.

Next: independent selection variants (account only, asset only), bounded duration selection, guarded affirmative review screen, separate YouTube equivalents, then screenshots and T01–T12. PR #35 docs-only Draft. No product source edits, merge or deployment.
