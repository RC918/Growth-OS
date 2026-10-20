// Phase 2A Measure minimal loop (offline-testable).
//
// Records, for one published version, the correspondence between the
// version and its public URL plus a timestamped HTTP availability and
// content readback observation. This measures ONLY that the published
// page is reachable and carries the published title. It never invents
// search impressions or clicks: traffic states stay UNKNOWN until a
// real data source (e.g. Search Console) is connected.
//
// States:
//   MEASURED        HTTP 200 and published title present in the page.
//   NO_DATA         Connected, but no usable page data (e.g. 404/empty).
//   NOT_CONNECTED   The fetch could not be performed at all.
//   UNKNOWN         Anything else (unexpected status or mismatch) -
//                   reported honestly instead of guessed.

export function createObservation({version_id, public_url}, result, observed_at) {
  const base = {version_id, public_url, observed_at, source: 'http_readback'};
  if (result?.error) {
    return {...base, state: 'NOT_CONNECTED', http_status: null,
      title_match: null, detail: String(result.error).slice(0, 120)};
  }
  const status = result?.status ?? null;
  const title = typeof result?.title === 'string' ? result.title : '';
  if (status === 200 && title) {
    return {...base, state: 'MEASURED', http_status: status,
      title_match: result.expected_title ? title === result.expected_title : null,
      detail: 'page reachable; published title read back'};
  }
  if (status === 404 || status === 410 || (status === 200 && !title)) {
    return {...base, state: 'NO_DATA', http_status: status,
      title_match: null, detail: 'no usable page data at public URL'};
  }
  return {...base, state: 'UNKNOWN', http_status: status,
    title_match: null, detail: 'unexpected readback; not interpreted'};
}

export async function observePublication(publication, {fetchPage, clock}) {
  const observed_at = new Date(clock()).toISOString();
  let result;
  try {
    const page = await fetchPage(publication.public_url);
    result = {status: page.status, title: page.title,
      expected_title: publication.expected_title};
  } catch (error) {
    result = {error: error?.message || 'fetch failed'};
  }
  return createObservation(publication, result, observed_at);
}

export function summarizeObservations(observations) {
  // Re-runnable measurement view: latest observation per version wins,
  // and the traffic verdict is always UNKNOWN without a real source.
  const latest = new Map();
  for (const o of observations) latest.set(o.version_id, o);
  return {
    publications: [...latest.values()],
    traffic: 'UNKNOWN',
    note: 'HTTP availability only; no search impressions or clicks are claimed.',
  };
}
