const typedColumns = ['first_result_payload', 'first_result_request_id', 'first_result_expected_version', 'first_result_request_digest'];
const typedNotice = '待專用審核 · 未發布 · 僅供唯讀；不能使用一般草稿審核、兩欄修訂或執行方案。';
const resultFields = {title: '標題', meta_description: 'Meta description', description: '產品描述'};
export function typedDraft(version,{reviewAvailable=false}={}) {
  const panel = document.createElement('section');
  panel.className = 'typed-draft';
  panel.dataset.versionId = version.id;
  const add = (parent, tag, text, className = '') => {
    const node = document.createElement(tag); node.textContent = text; node.className = className; parent.append(node); return node;
  };
  const detail = (label, value) => {
    const box = document.createElement('details');
    add(box, 'summary', label);
    add(box, 'pre', value === undefined ? '資料缺漏' : JSON.stringify(value, null, 2));
    panel.append(box);
  };
  add(panel, 'p', version.id==='尚未保存'?'未保存預覽 · 待確認保存 · 未發布':reviewAvailable?'已保存成果 · 確認狀態見下方 · 未發布':typedNotice, 'draft-state');
  add(panel, 'p', version.id==='尚未保存' ? '尚未保存的完整成果；請核對後確認保存。' : `內容版本：${version.id} · 第 ${version.version_number} 版`);
  const report = version.first_result_payload;
  const snapshot = report?.snapshot, preview = report?.preview, review = report?.review;
  const complete = typedColumns.every(key => version[key] != null) &&
    Object.keys(resultFields).every(key => typeof preview?.fields?.[key]?.suggested === 'string' &&
      typeof preview.fields[key].original === 'string' && typeof review?.original_suggestions?.[key] === 'string' &&
      typeof review?.edited?.[key] === 'boolean' && typeof review?.fact_checks?.[key] === 'boolean') &&
    typeof snapshot?.html === 'string' && typeof snapshot?.content_base64 === 'string' &&
    typeof snapshot?.content_fingerprint === 'string' && typeof snapshot?.version === 'string' &&
    snapshot?.id && snapshot?.original_url && snapshot?.final_url && snapshot?.fetched_at &&
    Array.isArray(snapshot?.citations) && snapshot.citations.length > 0 && report?.facts?.product_name &&
    report?.facts?.description && Array.isArray(report?.facts?.features) &&
    ['title','meta_description','use'].every(key => Object.hasOwn(report.facts, key)) &&
    Array.isArray(report?.inferences) && Array.isArray(report?.missing) &&
    review?.scope === 'page_only' && review?.persisted === false && typeof review?.content_digest === 'string' &&
    Object.hasOwn(review, 'confirmation') && preview?.published === false &&
    preview?.source_snapshot_id === snapshot?.id && preview?.source_version === snapshot?.version &&
    review?.snapshot_id === snapshot?.id && review?.source_version === snapshot?.version &&
    review?.original_url === snapshot?.original_url && review?.final_url === snapshot?.final_url &&
    Number.isSafeInteger(review?.revision) && review.revision >= 0 &&
    Number.isSafeInteger(version.first_result_expected_version) && version.first_result_expected_version + 1 === version.version_number &&
    version.title === preview?.fields?.title?.suggested && version.draft_body === preview?.fields?.description?.suggested;
  if (!complete) add(panel, 'p', 'Typed 資料不完整或版本對應不一致；僅顯示可讀資料，所有內容操作均已阻擋。', 'typed-incomplete');
  add(panel, 'p', '來源是提交者提供的資料，未獨立驗證；下列本頁核對與確認紀錄不是 owner approval，也不是發布授權。');
  for (const [key, label] of Object.entries(resultFields)) {
    const field = preview?.fields?.[key];
    add(panel, 'h5', label);
    const value = add(panel, 'p', typeof field?.suggested === 'string' ? field.suggested : '資料缺漏', 'draft-body typed-current');
    value.dataset.field = key;
    add(panel, 'p', `修改狀態：${typeof review?.edited?.[key] === 'boolean' ? review.edited[key] ? '使用者修改；引用僅供原建議對照' : '原建議' : '資料缺漏'}`);
    detail(`${label}：來源原文／原建議／引用與歷史核對`, {
      original: field?.original, original_suggestion: review?.original_suggestions?.[key],
      user_edited: field?.user_edited, edited: review?.edited?.[key],
      citations: field?.citations, citation_role: field?.citation_role, historical_fact_check: review?.fact_checks?.[key],
    });
  }
  detail('來源識別／來源 bytes 摘要（不同於內容摘要）', snapshot && {
    id: snapshot.id, original_url: snapshot.original_url, final_url: snapshot.final_url,
    fetched_at: snapshot.fetched_at, source_version: snapshot.version, source_digest: snapshot.content_fingerprint,
  });
  detail('內容修訂／內容摘要／歷史 page-only receipt（非 owner approval）', review);
  detail('事實 facts（來源宣稱，未獨立驗證）', report?.facts);
  detail('推論 inferences', report?.inferences);
  detail('未知與待確認', {missing: report?.missing, pending_confirmation: preview?.pending_confirmation});
  detail('來源引用 citations', snapshot?.citations);
  detail('完整來源快照／抽取限制', {snapshot, extraction: report?.extraction});
  detail('完整版本 payload 與請求識別（僅供查核，不代表驗證通過）', {
    payload: report, request_id: version.first_result_request_id,
    expected_version: version.first_result_expected_version, request_digest: version.first_result_request_digest,
  });
  return panel;
}
