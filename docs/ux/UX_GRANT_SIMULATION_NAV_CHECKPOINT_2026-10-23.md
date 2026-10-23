# UX simulation-only grant navigation checkpoint — 2026-10-23

Figma `jOfuk31i2BrJmMvXs25B59`: edited existing WordPress grant frame `49:91` row `49:106` and existing YouTube frame `49:119` row `49:134`. Both now have an `ON_CLICK → 49:171` prototype navigation to the existing Verification Pending example. Heading and body nodes `49:107`/`49:108`, `49:135`/`49:136` explicitly say `查看模擬驗證狀態 →` and `僅原型導覽；未授權、未送出修改`. All six affected nodes returned; destinations read back.

Separate visible decline CTA paths remain intact: `49:115`→`49:145`, `49:143`→`49:145`; existing denied state and pending state can return to platform selection. No consent is granted, no platform action is performed, and no success state is asserted. This is a clickable demonstration only, **NOT** acceptance of scoped consent or remote write verification.

Still required: real selectable account/asset/scope/expiry review states, affirmative consent prototype with confirmation and clear distinction from public publishing, permission expired/revoked, true three-way diff and restore choice, responsive screenshot and T01–T12 walkthrough evidence. PR #35 docs-only Draft. No product code, merge, deployment or credentials.
