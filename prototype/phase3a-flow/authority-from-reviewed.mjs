// Adapter: REVIEWED AI result + saved version binding -> the
// authority the existing publisher trusts for preview.
//
// The binding (organization, version, review) always comes from
// the persisted Save/Review readback, never from the AI. Only the
// field texts come from the fact-verified, human-reviewed AI
// result. Anything not REVIEWED is refused.

import {publishFieldsFromReviewed} from './to-publish-preview.mjs';

export function authorityFromReviewedAi({reviewed, binding, targetUrl}) {
  const {fields} = publishFieldsFromReviewed(reviewed); // throws unless REVIEWED
  if (!binding?.organization_id || !binding?.version_id || !binding?.review_id) {
    throw Error('Saved version binding incomplete');
  }
  if (!targetUrl || typeof targetUrl !== 'string') {
    throw Error('Target URL required');
  }
  return {
    review_status: 'exact_version_confirmed',
    binding: {
      organization_id: binding.organization_id,
      version_id: binding.version_id,
      review_id: binding.review_id,
    },
    target_url: targetUrl,
    fields: Object.fromEntries(
      Object.entries(fields).map(([k, f]) => [k, {after: f.after}])),
    field_sources: Object.fromEntries(
      Object.entries(fields).map(([k, f]) => [k, f.source])),
  };
}
