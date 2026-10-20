// Adapter: REVIEWED AI SEO result -> Publish Preview fields.
//
// Only a fact-verified, human-reviewed AI result may feed the
// existing publisher's preview. The adapter carries the final
// fields (with their provenance) into the publisher field shape;
// anything not REVIEWED is refused, so unreviewed AI suggestions
// can never reach a publish surface.

const FIELDS = ['title', 'meta_description', 'description'];

export function publishFieldsFromReviewed(reviewed) {
  if (!reviewed || reviewed.status !== 'REVIEWED' || !reviewed.fields) {
    throw Error('REVIEWED AI result required');
  }
  const fields = {};
  for (const field of FIELDS) {
    const entry = reviewed.fields[field];
    if (!entry?.final || !entry.final_source) {
      throw Error('Reviewed field incomplete: ' + field);
    }
    fields[field] = {
      after: entry.final,
      source: entry.final_source, // 'ai_suggestion' | 'user_edit'
      citations: entry.citations ?? [],
    };
  }
  return {
    fields,
    unknown_fields: reviewed.unknown_fields ?? [],
    total_cost: reviewed.total_cost ?? null,
  };
}
