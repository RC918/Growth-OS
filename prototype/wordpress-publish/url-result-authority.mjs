// Adapter: Staging Save/Review readback -> publisher authority.
//
// The WordPress publisher only trusts an authority object. This
// adapter derives it from the actual persisted shapes produced by
// the Save/Review chain (content_versions + content_reviews rows),
// so the publish gate is bound to the same version the reviewer
// approved - not to a hand-assembled object. Offline and pure.

const FIELDS = ['title', 'meta_description', 'description'];

export function authorityFromSavedVersion({versionRow, reviewRow, targetUrl}) {
  if (!versionRow || !reviewRow) {
    throw Error('Saved version and review readback required');
  }
  if (reviewRow.version_id !== versionRow.id) {
    throw Error('Review does not belong to this version');
  }
  if (reviewRow.decision !== 'approved') {
    throw Error('Exact reviewed version required');
  }
  const payload = versionRow.first_result_payload;
  const fields = payload?.preview?.fields;
  if (!fields || !FIELDS.every(k => typeof fields[k]?.suggested === 'string')) {
    throw Error('Saved version lacks publishable fields');
  }
  if (!versionRow.organization_id || !versionRow.id || !reviewRow.id) {
    throw Error('Saved version binding incomplete');
  }
  if (typeof payload.snapshot?.content_fingerprint !== 'string'
      || !payload.snapshot.content_fingerprint.startsWith('sha256:')) {
    throw Error('Saved version source digest missing');
  }
  return {
    review_status: 'exact_version_confirmed',
    binding: {
      organization_id: versionRow.organization_id,
      version_id: versionRow.id,
      review_id: reviewRow.id,
    },
    target_url: targetUrl,
    fields: Object.fromEntries(FIELDS.map(k => [k, {after: fields[k].suggested}])),
  };
}
