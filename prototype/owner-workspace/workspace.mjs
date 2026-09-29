import { createWorkspaceApi } from './workspace-api.mjs';

const api = createWorkspaceApi({
  origin: 'https://vhzryhibmpvglzcmfnaa.supabase.co',
  key: 'sb_publishable_B9pMiED8jrCoxuy2kC0HoA_LmzKex9r',
});
const $ = id => document.getElementById(id);
let state = null;
let epoch = 0;

function message(text, failure = false) {
  const target = $('notice');
  target.textContent = text;
  target.classList.toggle('error', failure);
  target.hidden = !text;
}

async function busy(form, operation) {
  const buttons = [...form.querySelectorAll('button')];
  buttons.forEach(button => { button.disabled = true; });
  message('處理中…');
  try {
    await operation();
    message('已完成，資料已更新。');
  } catch (error) {
    message(error.message, true);
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

function showProfile(profile, owner) {
  const form = $('profile-form');
  for (const name of ['display_name', 'target_market', 'primary_outcome', 'audience_summary', 'offering_summary']) {
    form.elements.namedItem(name).value = profile?.[name] || (name === 'primary_outcome' ? 'order' : '');
  }
  for (const field of form.querySelectorAll('input,textarea,select')) field.disabled = !owner;
  $('profile-status').textContent = profile?.review_status === 'owner_approved' ? '企業主已核准' : '尚待核准';
  $('approve-profile').disabled = !owner || !profile || profile.review_status !== 'draft';
  $('approval-note').hidden = !owner || profile?.review_status === 'owner_approved';
  $('opportunity-form').hidden = !owner || profile?.review_status !== 'owner_approved';
}

function opportunityCard(item, owner) {
  const card = document.createElement('article');
  card.className = 'opportunity-card';
  const top = document.createElement('div');
  top.className = 'opportunity-top';
  const channel = document.createElement('span');
  channel.textContent = ({organic_search:'自然搜尋',ai_discovery:'AI 探索',owned_content:'自有內容',distribution:'內容分發'})[item.channel] || item.channel;
  const status = document.createElement('span');
  status.textContent = ({candidate:'待審核',in_review:'審核中',approved:'已核准',rejected:'未採納',published:'已發布',measured:'已量測'})[item.status] || item.status;
  top.append(channel, status);
  const heading = document.createElement('h3');
  heading.textContent = item.audience_need;
  const action = document.createElement('p');
  action.textContent = item.proposed_action;
  const rationale = document.createElement('small');
  rationale.textContent = `判斷依據：${item.rationale} · 信心程度：${item.evidence_confidence}`;
  card.append(top, heading, action, rationale);
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
  return card;
}

async function refresh() {
  const current = epoch;
  const next = await api.dashboard();
  if (current !== epoch) return;
  state = next;
  const owner = next.role === 'owner';
  $('organization-name').textContent = next.organization.name;
  $('role-text').textContent = owner ? '企業擁有者 · 可管理資料與審核機會' : '檢視者 · 僅可閱讀';
  for (const element of document.querySelectorAll('.owner-control')) element.hidden = !owner;
  $('viewer-note').hidden = owner;
  showProfile(next.profile, owner);
  $('queue-count').textContent = `${next.opportunities.length} 筆`;
  const list = $('opportunities');
  list.replaceChildren(...next.opportunities.map(item => opportunityCard(item, owner)));
  if (!next.opportunities.length) list.textContent = '尚無候選機會。先整理一個值得回答的客戶問題。';
}

$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const email = form.elements.namedItem('email').value.trim();
  const passwordInput = form.elements.namedItem('password');
  const password = passwordInput.value;
  passwordInput.value = '';
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    await api.signIn(email, password);
    await refresh();
    form.reset();
    $('sign-in').hidden = true;
    $('workspace').hidden = false;
    message('');
  } catch (error) {
    api.signOut();
    // Login errors must be shown on the login form, never reveal the submitted password.
    form.querySelector('.hint').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$('sign-out').addEventListener('click', () => {
  epoch++;
  api.signOut();
  state = null;
  $('workspace').hidden = true;
  $('sign-in').hidden = false;
  $('opportunities').replaceChildren();
  message('');
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
