# Growth-OS UX — Account/asset gate checkpoint (2026-10-23)

Existing Figma file `jOfuk31i2BrJmMvXs25B59`, no cloned/new frames. Added prototype `ON_CLICK → 38:151` to WordPress account/asset row `49:100` and YouTube row `49:128`. Existing text headings `49:101`/`49:129` now say `帳號／資產未確認 · 返回選擇 →`, and existing body text `49:102`/`49:130` says `未連線，尚不能授權或修改任何內容`. Six existing nodes mutated.

Readback confirmed exact destinations and existing defer-consent shared CTAs remain `49:115` and `49:143` → declined screen `49:145`, with opacity 1. No affirmative grant flow created, no actual account or asset picker, no scope expiry selector, no API actions. This is a safe re-selection shortcut, not completed positive consent acceptance.

Outstanding P0: actual account/asset selector, scope/expiry variants and affirmative confirmation; expired/revoked state click paths, three-way revision diff and safe restore; real screenshots, accessibility and T01–T12. Docs-only Draft PR #35, no runtime changes, deployment, merge or production credentials.
