// Workflow readiness only. No traffic, revenue or predicted impact is inferred.
export function orderOpportunities(opportunities, sources, decisions) {
  const ranked = opportunities.map(item => {
    const sourceCount = sources.filter(row => row.opportunity_id === item.id).length;
    const itemDecisions = decisions.filter(row => row.opportunity_id === item.id);
    const matchingDecision = itemDecisions.some(row => row.decision === item.status);
    let tier;
    let reason;
    if (!sourceCount || (['approved', 'rejected'].includes(item.status) && !matchingDecision) ||
        (['candidate', 'in_review'].includes(item.status) && itemDecisions.length) ||
        !['candidate', 'in_review', 'approved', 'rejected'].includes(item.status)) {
      tier = 0; reason = '需查核來源或審核紀錄';
    } else if (item.status === 'approved') {
      tier = 1; reason = '已核准，可準備內容草稿';
    } else if (['candidate', 'in_review'].includes(item.status)) {
      tier = 2; reason = '有來源，等待企業主審核';
    } else {
      tier = 3; reason = '已不採納，保留紀錄';
    }
    return { item, tier, reason };
  });
  return ranked.sort((a, b) => a.tier - b.tier ||
    Date.parse(b.item.created_at) - Date.parse(a.item.created_at) || a.item.id.localeCompare(b.item.id));
}
