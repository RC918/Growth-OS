# Growth-OS UX — consent scope and expiry checkpoint (2026-10-23)

## Figma edits
Existing WordPress `49:91` and YouTube `49:119` mobile 390×844 grant frames only, **12 TEXT nodes modified**, no frames created. WordPress edited nodes: `49:99`, `49:101`, `49:102`, `49:104`, `49:105`, `49:96`; YouTube: `49:127`, `49:129`, `49:130`, `49:132`, `49:133`, `49:124`.

Both now visibly specify account and target asset selection pending, restricted fields, single-operation authorization and fail-closed expired/unselected state. WordPress only title/SEO summary; YouTube only description. Wording explicitly identifies examples and forbids remote writes before valid consent.

Readback confirmed relevant field text. All non-instance text bounding boxes remain within their respective 390×844 frame boundary (zero out-of-frame nodes). This is **not** actual account selection UI, permission grant, pixel screenshot review, or end-to-end acceptance. Existing demo-only navigation remains separate.

## Remaining
Selectable account/asset, expiry selection and positive consent confirmation; denied/revoked/expired path and remote readback; true interactive three-way diff/restore; visual screenshots, accessibility and T01–T12. PR #35 still Draft docs-only. No production code, deploy, merge or credentials.
