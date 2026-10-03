import { createWorkspaceApi } from './workspace-api.mjs';
import { orderOpportunities } from './opportunity-order.mjs';
import { createObservationPanel } from './workspace-observations.mjs';
import { createGoalPanel } from './workspace-goals.mjs';

const api = createWorkspaceApi({
  origin: 'https://vhzryhibmpvglzcmfnaa.supabase.co',
  key: 'sb_publishable_B9pMiED8jrCoxuy2kC0HoA_LmzKex9r',
  redirectOrigin: location.origin,
});
const $ = id => document.getElementById(id);
let state = null;
let epoch = 0;
let renderGeneration = 0;
const observations=createObservationPanel(api);
const goals=createGoalPanel(api);

function message(text, failure = false) {
  const target = $('notice');
  target.textContent = text;
  target.classList.toggle('error', failure);
  target.hidden = !text;
}

async function busy(form, operation, localNotice = null) {
  const buttons = [...form.querySelectorAll('button')];
  buttons.forEach(button => { button.disabled = true; });
  const report = (text, failure = false) => {
    if (!localNotice) return message(text, failure);
    localNotice.textContent = text;
    localNotice.classList.toggle('error', failure);
    localNotice.setAttribute('role', failure ? 'alert' : 'status');
    localNotice.hidden = !text;
  };
  report('處理中…');
  try {
    await operation();
    report('已完成，資料已更新。');
  } catch (error) {
    report(error.message, true);
  } finally {
    if (form.id === 'profile-form' && state) {
      showProfile(state.profile, state.sites, state.role === 'owner');
    } else {
      buttons.forEach(button => { button.disabled = false; });
    }
  }
}

function showProfile(profile, sites, owner) {
  const form = $('profile-form');
  for (const name of ['display_name', 'target_market', 'primary_outcome', 'audience_summary', 'offering_summary']) {
    form.elements.namedItem(name).value = profile?.[name] || (name === 'primary_outcome' ? 'order' : '');
  }
  for (const field of form.querySelectorAll('input,textarea,select')) field.disabled = !owner;
  const site = sites.find(item => item.id === profile?.site_id);
  const unverified = !!site && !site.verified_at;
  $('linked-site-status').textContent = site
    ? `關聯網站：${site.origin}（${site.verified_at ? '已驗證' : '尚未驗證'}）`
    : '尚未關聯網站。';
  $('detach-site-label').hidden = !owner || !unverified;
  $('detach-site').checked = false;
  $('save-profile').disabled = !owner || unverified;
  $('profile-status').textContent = profile?.review_status === 'owner_approved' ? '企業主已核准' : '尚待核准';
  $('approve-profile').disabled = !owner || !profile || profile.review_status !== 'draft';
  $('approval-note').hidden = !owner || profile?.review_status === 'owner_approved';
  $('opportunity-form').hidden = !owner || profile?.review_status !== 'owner_approved';
}

const sourceLabels = { owner_question: '企業主觀察', product_catalog: '商品資料', public_page: '公開頁面', gsc_query: 'GSC 查詢', research_note: '研究筆記' };
const decisionLabels = { approved: '核准', rejected: '不採納' };
const draftDecisionLabels = { approved: '核准', rejected: '退回' };
const formatTime = value => new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

function revealVersion(opportunityId, text) {
  const updated = [...$('opportunities').querySelectorAll('.opportunity-card')]
    .find(candidate => candidate.dataset.opportunityId === opportunityId);
  const panel = updated?.querySelector('.draft-focus');
  if (!panel) return;
  const result = document.createElement('p');
  result.className = 'draft-result';
  result.setAttribute('role', 'status');
  result.textContent = text;
  panel.insertBefore(result, panel.firstChild);
  panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Old-schema responses omit all four fields. Any non-null typed marker fails
// closed, including partial rows. This is presentation, not payload authorization.
const typedColumns = ['first_result_payload', 'first_result_request_id', 'first_result_expected_version', 'first_result_request_digest'];
const isTyped = version => !!version && typedColumns.some(key => version[key] != null);
const typedNotice = '待專用審核 · 未發布 · 僅供唯讀；不能使用一般草稿審核、兩欄修訂或執行方案。';
const resultFields = {title: '標題', meta_description: 'Meta description', description: '產品描述'};
function typedDraft(version) {
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
  add(panel, 'p', typedNotice, 'draft-state');
  add(panel, 'p', `內容版本：${version.id} · 第 ${version.version_number} 版`);
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

function opportunityCard(item, owner, sources, decisions, versions, reviews, actionPlans, orderReason) {
  const card = document.createElement('article');
  card.className = 'opportunity-card';
  card.dataset.opportunityId = item.id;
  const latestVersion = versions.reduce((latest, version) => !latest || version.version_number > latest.version_number ? version : latest, null);
  const typed = isTyped(latestVersion);
  const cardState = state, cardEpoch = epoch, generation = renderGeneration;
  let pending = false;
  const current = () => card.isConnected && state === cardState && epoch === cardEpoch && renderGeneration === generation;
  async function mutateLegacy(operation, success, createsVersion = false) {
    if (typed || !owner || pending || !current()) return;
    pending = true;
    const buttons = [...card.querySelectorAll('button')];
    buttons.forEach(button => { button.disabled = true; });
    message('處理中…');
    let refreshing = false;
    try {
      await operation();
      if (!current()) return;
      refreshing = true;
      const updated = await refresh();
      if (!updated || epoch !== cardEpoch) return;
      const newest = state.versions.filter(row => row.opportunity_id === item.id)
        .reduce((a, b) => !a || b.version_number > a.version_number ? b : a, null);
      if (!isTyped(newest) && (createsVersion || newest?.id === latestVersion?.id)) revealVersion(item.id, success);
      message('');
    } catch (error) {
      if (current()) message(error.message, true);
      else if (refreshing && state === cardState && epoch === cardEpoch && card.isConnected)
        message('資料更新未完成，請重新整理後再操作。', true);
    }
    finally { pending = false; if (current()) buttons.forEach(button => { button.disabled = false; }); }
  }
  const latestReview = latestVersion && reviews.find(row => row.version_id === latestVersion.id);
  const latestPlan = latestVersion && actionPlans.find(row => row.version_id === latestVersion.id);
  const top = document.createElement('div');
  top.className = 'opportunity-top';
  const channel = document.createElement('span');
  channel.textContent = ({organic_search:'自然搜尋',ai_discovery:'AI 探索',owned_content:'自有內容',distribution:'內容分發'})[item.channel] || item.channel;
  const status = document.createElement('span');
  status.textContent = ({candidate:'機會待審核',in_review:'機會審核中',approved:'機會已核准',rejected:'機會未採納',published:'已發布',measured:'已量測'})[item.status] || item.status;
  top.append(channel, status);
  const heading = document.createElement('h3');
  heading.textContent = item.audience_need;
  const action = document.createElement('p');
  action.textContent = item.proposed_action;
  const rationale = document.createElement('small');
  rationale.textContent = `判斷依據：${item.rationale} · 證據信心：${({low:'低',medium:'中',high:'高'})[item.evidence_confidence] || item.evidence_confidence}`;
  card.append(top, heading, action, rationale);
  const progress = document.createElement('p');
  progress.className = 'opportunity-progress';
  progress.textContent = typed ? `目前進度：第 ${latestVersion.version_number} 版 · 待專用審核 · 未發布` : latestVersion
    ? `目前進度：第 ${latestVersion.version_number} 版${latestReview ? `已${draftDecisionLabels[latestReview.decision] || latestReview.decision}` : '待審核'}${latestPlan ? '，執行方案已記錄' : latestReview?.decision === 'approved' ? '，可規劃執行' : latestReview?.decision === 'rejected' ? '，可新增修訂版' : ''}`
    : item.status === 'approved' ? '目前進度：機會已核准，可建立第一版草稿' : `目前進度：${status.textContent}`;
  card.append(progress);
  const evidence = document.createElement('details');
  evidence.className = 'evidence';
  const summary = document.createElement('summary');
  summary.textContent = `查看判斷依據與機會審核（來源 ${sources.length} 筆）`;
  evidence.append(summary);
  if (!sources.length) {
    const missing = document.createElement('p');
    missing.textContent = '尚無可追溯來源；不得以此作為已驗證需求。';
    evidence.append(missing);
  }
  for (const source of sources) {
    const row = document.createElement('p');
    row.textContent = `來源：${sourceLabels[source.source_kind] || source.source_kind} · ${formatTime(source.observed_at)}｜${source.evidence_note}${source.source_url ? `｜${source.source_url}` : ''}`;
    evidence.append(row);
  }
  if (!decisions.length && ['approved', 'rejected'].includes(item.status)) {
    const missing = document.createElement('p');
    missing.textContent = '審核狀態與決策紀錄不一致，請查核。';
    evidence.append(missing);
  }
  for (const decision of decisions) {
    const row = document.createElement('p');
    row.textContent = `審核：${decisionLabels[decision.decision] || decision.decision} · ${formatTime(decision.decided_at)}｜理由：${decision.reason}`;
    evidence.append(row);
  }
  const history = document.createElement('details');
  history.className = 'evidence version-history';
  const historySummary = document.createElement('summary');
  historySummary.textContent = `查看過去版本（${Math.max(0, versions.length - 1)} 筆）`;
  history.append(historySummary);
  for (const version of versions.filter(row => row.id !== latestVersion?.id).sort((a, b) => b.version_number - a.version_number)) {
    if (isTyped(version)) {
      const heading = document.createElement('p');
      heading.textContent = `第 ${version.version_number} 版 · ${formatTime(version.created_at)}`;
      history.append(heading, typedDraft(version));
      continue;
    }
    const review = reviews.find(row => row.version_id === version.id);
    const plan = actionPlans.find(row => row.version_id === version.id);
    const heading = document.createElement('p');
    heading.textContent = `第 ${version.version_number} 版 · ${formatTime(version.created_at)} · ${version.title} · ${review ? `內部${draftDecisionLabels[review.decision] || review.decision}` : '未審核'}`;
    const body = document.createElement('p');
    body.className = 'draft-body'; body.textContent = version.draft_body;
    history.append(heading, body);
    if (review) {
      const reviewNote = document.createElement('p');
      reviewNote.textContent = `版本審核：${formatTime(review.reviewed_at)}｜理由：${review.reason}。此核准不會公開發布。`;
      history.append(reviewNote);
    }
    if (plan) {
      const planNote = document.createElement('p');
      planNote.textContent = `歷史執行方案：${plan.proposed_path} · ${formatTime(plan.created_at)}。僅為內部規劃，未發布。`;
      history.append(planNote);
    }
  }
  const focus = document.createElement('section');
  focus.className = 'draft-focus';
  const focusHeading = document.createElement('h4');
  focusHeading.textContent = latestVersion ? `目前草稿 · 第 ${latestVersion.version_number} 版 · ${formatTime(latestVersion.created_at)}` : '目前草稿';
  focus.append(focusHeading);
  if (typed) {
    focus.append(typedDraft(latestVersion));
  } else if (latestVersion) {
    const title = document.createElement('strong'); title.textContent = latestVersion.title;
    const body = document.createElement('p'); body.className = 'draft-body'; body.textContent = latestVersion.draft_body;
    const state = document.createElement('p'); state.className = 'draft-state';
    state.textContent = latestReview
      ? `內部${draftDecisionLabels[latestReview.decision] || latestReview.decision} · ${formatTime(latestReview.reviewed_at)} · 理由：${latestReview.reason}。尚未公開發布。`
      : '待審核 · 這是已儲存的內容，尚未公開發布。';
    focus.append(title, body, state);
    if (latestPlan) {
      const plan = document.createElement('div'); plan.className = 'action-plan-summary';
      const planHeading = document.createElement('h5'); planHeading.textContent = '內部執行方案 · 尚未發布';
      const path = document.createElement('p'); path.textContent = `建議路徑：${latestPlan.proposed_path}（目前沒有公開網址）`;
      const signal = document.createElement('p'); signal.textContent = `發布後觀察：${latestPlan.success_signal}`;
      const rollback = document.createElement('p'); rollback.textContent = `撤回方式：${latestPlan.rollback_plan}`;
      plan.append(planHeading, path, signal, rollback);
      focus.append(plan);
    }
  } else {
    const empty = document.createElement('p'); empty.textContent = '尚無草稿。請先記錄第一版。'; focus.append(empty);
  }
  if (item.status === 'approved' || latestVersion) card.append(focus);
  let unsavedDraft = null;
  let compose = null;
  if (!typed && owner && item.status === 'approved' && sources.length && decisions.some(row => row.decision === 'approved')) {
    compose = document.createElement('details');
    compose.className = 'compose-draft';
    compose.open = !latestVersion;
    const composeSummary = document.createElement('summary');
    composeSummary.textContent = latestVersion ? '修訂內容並建立新版' : '建立第 1 版草稿';
    compose.append(composeSummary);
    const form = document.createElement('form');
    form.className = 'review-form draft-form';
    const title = document.createElement('label');
    title.textContent = '草稿標題';
    const titleInput = document.createElement('input');
    titleInput.name = 'title'; titleInput.required = true; titleInput.maxLength = 160;
    title.append(titleInput);
    const body = document.createElement('label');
    body.textContent = '草稿內容';
    const bodyInput = document.createElement('textarea');
    bodyInput.name = 'draft_body'; bodyInput.required = true; bodyInput.maxLength = 10000;
    body.append(bodyInput);
    unsavedDraft = { panel: compose, form, titleInput, bodyInput };
    const save = document.createElement('button');
    save.type = 'submit'; save.className = 'secondary'; save.textContent = '記錄新草稿版本';
    form.append(title, body, save);
    form.addEventListener('submit', event => {
      event.preventDefault();
      void mutateLegacy(() => api.createContentDraft(item.id, titleInput.value, bodyInput.value),
        '新草稿版本已記錄，請確認內容後再審核。', true);
    });
    compose.append(form);
  }
  if (!typed && owner && item.status === 'approved' && latestVersion && !latestReview) {
    const form = document.createElement('form');
    form.className = 'review-form';
    const versionNote = document.createElement('p');
    versionNote.textContent = `審核上方第 ${latestVersion.version_number} 版。每版只能審核一次。`;
    const label = document.createElement('label');
    label.textContent = '版本審核理由';
    const input = document.createElement('input');
    input.name = 'review_reason'; input.required = true; input.maxLength = 1000;
    label.append(input);
    const approve = document.createElement('button');
    approve.type = 'button'; approve.className = 'secondary'; approve.textContent = '核准此版本';
    const reject = document.createElement('button');
    reject.type = 'button'; reject.className = 'quiet'; reject.textContent = '退回此版本';
    for (const [button, decision] of [[approve, 'approved'], [reject, 'rejected']]) {
      button.addEventListener('click', () => {
        if (unsavedDraft && (unsavedDraft.titleInput.value.trim() || unsavedDraft.bodyInput.value.trim())) {
          message('草稿欄位有未儲存內容。請先記錄新草稿版本，或清空欄位後再審核目前版本。', true);
          unsavedDraft.panel.open = true;
          unsavedDraft.form.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        if (!form.reportValidity()) return;
        void mutateLegacy(() => api.reviewContentDraft(latestVersion.id, decision, input.value),
          `第 ${latestVersion.version_number} 版已${decision === 'approved' ? '核准' : '退回'}，尚未公開發布。`);
      });
    }
    form.append(versionNote, label, approve, reject);
    focus.append(form);
  }
  if (!typed && owner && item.status === 'approved' && latestVersion && latestReview?.decision === 'approved' && !latestPlan) {
    const form = document.createElement('form');
    form.className = 'review-form action-plan-form';
    const formNotice = document.createElement('p');
    formNotice.className = 'form-notice';
    formNotice.hidden = true;
    const formMessage = text => {
      formNotice.textContent = text;
      formNotice.setAttribute('role', 'alert');
      formNotice.classList.add('error');
      formNotice.hidden = false;
    };
    const note = document.createElement('p');
    note.textContent = '下一步：先記錄執行方案。這不會建立頁面，也不會對外發布。';
    const pathLabel = document.createElement('label');
    pathLabel.textContent = '建議頁面路徑（非公開網址）';
    const path = document.createElement('input');
    path.name = 'proposed_path'; path.required = true; path.maxLength = 201; path.placeholder = '/product-comparison';
    pathLabel.append(path);
    const signalLabel = document.createElement('label');
    signalLabel.textContent = '發布後要觀察的指標';
    const signal = document.createElement('input');
    signal.name = 'success_signal'; signal.required = true; signal.maxLength = 1000;
    signalLabel.append(signal);
    const rollbackLabel = document.createElement('label');
    rollbackLabel.textContent = '若內容需撤回，預計如何處理';
    const rollback = document.createElement('input');
    rollback.name = 'rollback_plan'; rollback.required = true; rollback.maxLength = 1000;
    rollbackLabel.append(rollback);
    const save = document.createElement('button');
    save.type = 'submit'; save.className = 'secondary'; save.textContent = '記錄內部執行方案';
    form.append(note, pathLabel, signalLabel, rollbackLabel, formNotice, save);
    path.addEventListener('input', () => { formNotice.hidden = true; });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const proposedPath = path.value.trim();
      if (!/^\/[a-z0-9][a-z0-9/_-]{0,199}$/.test(proposedPath)) {
        formMessage('請只輸入路徑，例如 /product-comparison；不要貼入括號說明文字。路徑僅可使用小寫英文字母、數字、-、_ 和 /。');
        path.focus();
        return;
      }
      if (unsavedDraft && (unsavedDraft.titleInput.value.trim() || unsavedDraft.bodyInput.value.trim())) {
        formMessage('有未儲存的新草稿。請先記錄新版本，或清空欄位後再規劃目前版本。');
        unsavedDraft.panel.open = true;
        unsavedDraft.form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      void mutateLegacy(() => api.planContentAction(latestVersion.id, proposedPath, signal.value.trim(), rollback.value.trim()),
        `第 ${latestVersion.version_number} 版的內部執行方案已記錄，尚未公開發布。`);
    });
    focus.append(form);
  }
  if (owner && ['candidate', 'in_review'].includes(item.status)) {
    const form = document.createElement('form');
    form.className = 'review-form';
    const label = document.createElement('label');
    label.textContent = '決策理由';
    const input = document.createElement('input');
    input.name = 'reason'; input.required = true; input.maxLength = 1000;
    label.append(input);
    const approve = document.createElement('button');
    approve.type = 'button'; approve.textContent = '核准'; approve.className = 'secondary';
    const reject = document.createElement('button');
    reject.type = 'button'; reject.textContent = '不採納'; reject.className = 'quiet';
    for (const [button, decision] of [[approve, 'approved'], [reject, 'rejected']]) {
      button.addEventListener('click', () => {
        if (!form.reportValidity()) return;
        busy(form, async () => { await api.reviewOpportunity(item.id, decision, input.value); await refresh(); });
      });
    }
    form.append(label, approve, reject);
    card.append(form);
  }
  if (compose) card.append(compose);
  card.append(evidence);
  if (versions.length > 1) card.append(history);
  return card;
}

async function refresh() {
  const current = epoch, generation = ++renderGeneration;
  const next = await api.dashboard();
  if (current !== epoch || generation !== renderGeneration) return false;
  state = next;
  const owner = next.role === 'owner';
  $('organization-name').textContent = next.organization.name;
  $('role-text').textContent = owner ? '企業擁有者 · 可管理資料與審核機會' : '檢視者 · 僅可閱讀';
  $('viewer-diagnostics').hidden = owner || next.organization.id !== '93a88055-0a0b-40c0-b22f-a6d312320002';
  for (const element of document.querySelectorAll('.owner-control')) element.hidden = !owner;
  $('viewer-note').hidden = owner;
  showProfile(next.profile, next.sites, owner);
  $('queue-count').textContent = `${next.opportunities.length} 筆`;
  const list = $('opportunities');
  list.replaceChildren(...orderOpportunities(next.opportunities, next.sources, next.decisions).map(({ item, reason }) => opportunityCard(item, owner,
    next.sources.filter(source => source.opportunity_id === item.id),
    next.decisions.filter(decision => decision.opportunity_id === item.id),
    next.versions.filter(version => version.opportunity_id === item.id),
    next.reviews, next.actionPlans, reason)));
  if (!next.opportunities.length) list.textContent = '尚無候選機會。先整理一個值得回答的客戶問題。';
  return true;
}

$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const email = form.elements.namedItem('email').value.trim();
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    await api.requestMagicLink(email, `${location.origin}${location.pathname}`);
    form.querySelector('.hint').textContent = '若此帳號已建立且可收信，請在同一瀏覽器開啟 Supabase 寄來的一次性登入連結。';
  } catch (error) {
    form.querySelector('.hint').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

async function acceptRedirect() {
  const fragment = location.hash;
  if (!fragment) return;
  // Remove credentials from history before any network call or UI rendering.
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  try {
    await api.completeMagicLink(fragment);
    if (!await refresh()) return;
    $('login-form').reset();
    $('sign-in').hidden = true;
    $('workspace').hidden = false;
    void observations.open(state.role);
    void goals.open(state.role);
    message('');
  } catch (error) {
    api.signOut();
    $('login-form').querySelector('.hint').textContent = error.message;
  }
}

void acceptRedirect();

// A restored page must refresh before any retained card can mutate.
window.addEventListener('pagehide', () => { epoch++; });
window.addEventListener('pageshow', event => {
  if (event.persisted && state) void refresh().catch(error => message(error.message, true));
});

$('sign-out').addEventListener('click', () => {
  epoch++;
  api.signOut();
  state = null;
  observations.close();
  goals.close();
  $('workspace').hidden = true;
  $('sign-in').hidden = false;
  $('opportunities').replaceChildren();
  message('');
  $('verification-result').textContent = '';
});

$('verify-viewer').addEventListener('click', async event => {
  const button = event.currentTarget;
  const result = $('verification-result');
  button.disabled = true;
  result.textContent = '驗證中…';
  try {
    const check = await api.verifyViewerIsolation();
    result.textContent = `跨工作區讀取：${check.scopeDenied ? '通過（無資料）' : '失敗（可見資料）'}；擁有者操作：${check.ownerActionDenied ? '通過（HTTP 403）' : `失敗或無法確認（HTTP ${check.ownerActionStatus}）`}。${check.scopeDenied && check.ownerActionDenied ? '兩項均通過。' : '請停止使用此測試工作區並回報。'}`;
  } catch (error) {
    result.textContent = `驗證未完成：${error.message}`;
  } finally {
    button.disabled = false;
  }
});

$('detach-site').addEventListener('change', event => {
  $('save-profile').disabled = !event.currentTarget.checked;
});

$('profile-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  busy(form, async () => {
    await api.saveProfile(Object.fromEntries(new FormData(form)));
    await refresh();
  });
});

$('approve-profile').addEventListener('click', () => {
  busy($('profile-form'), async () => { await api.approveProfile(); await refresh(); });
});

$('opportunity-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  busy(form, async () => {
    await api.createOpportunity(Object.fromEntries(new FormData(form)));
    form.reset();
    await refresh();
  });
});
