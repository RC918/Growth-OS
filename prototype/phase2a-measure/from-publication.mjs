// Adapter: publisher evidence -> Measure observation input.
//
// The WordPress publisher's confirmed_applied evidence already binds
// version, target_url and the applied fields. This adapter turns that
// evidence into the publication record observePublication expects, so
// Publish and Measure share one identity chain instead of re-typing
// URLs or titles.

export function publicationFromEvidence(intent) {
  if (!intent || intent.state !== 'confirmed_applied' || !intent.evidence) {
    throw Error('Verified publication evidence required');
  }
  const evidence = intent.evidence;
  if (evidence.binding?.version_id !== intent.version) {
    throw Error('Publication evidence binding mismatch');
  }
  return {
    version_id: intent.version,
    public_url: evidence.target_url,
    expected_title: evidence.html_fields?.title ?? evidence.api_fields?.title,
    publication_id: intent.id,
    published_modified_at: evidence.modified_at,
    observed_at: evidence.observed_at,
  };
}
