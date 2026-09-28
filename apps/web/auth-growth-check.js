// Temporary read-only acceptance page. No environment IDs or keys in source.
const tables = ['organizations','organization_members','sites','scans','findings',
  'import_batches','funnel_daily','recommendations','actions','audit_events',
  'business_profiles','growth_opportunities','opportunity_sources','opportunity_decisions'];
const sessions = {a:null,b:null};

function configuration() {
  const base = document.getElementById('project-url').value.trim().replace(/\/$/, '');
  const key = document.getElementById('publishable-key').value.trim();
  let url;
  try { url = new URL(base); } catch { throw new Error('Supabase 專案網址無效'); }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') ||
      url.pathname !== '/' || url.search || url.hash || !key.startsWith('sb_publishable_'))
    throw new Error('請填入 Supabase HTTPS 專案網址與 publishable key');
  return {base,key};
}

async function signIn(config,email,password) {
  const response = await fetch(`${config.base}/auth/v1/token?grant_type=password`, {
    method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},
    body:JSON.stringify({email,password}),cache:'no-store',
  });
  if (!response.ok) throw new Error(`Auth HTTP ${response.status}`);
  const token = (await response.json()).access_token;
  if (!token) throw new Error('Auth 未回傳權杖');
  return token;
}

async function rows(config,token,path) {
  const response = await fetch(`${config.base}/rest/v1/${path}`, {
    headers:{apikey:config.key,Authorization:`Bearer ${token}`},cache:'no-store',
  });
  if (!response.ok) throw new Error(`Data API HTTP ${response.status}`);
  const value = await response.json();
  if (!Array.isArray(value)) throw new Error('Data API 回應格式錯誤');
  return value;
}

async function ownOrg(config,token,expectedRole) {
  const memberships = await rows(config,token,'organization_members?select=organization_id,role&limit=2');
  if (memberships.length !== 1 || memberships[0].role !== expectedRole)
    throw new Error('測試帳號的組織角色不符合預期');
  return memberships[0].organization_id;
}

async function checkIsolation(config) {
  const a = await ownOrg(config,sessions.a,'owner');
  const b = await ownOrg(config,sessions.b,'viewer');
  if (a === b) throw new Error('兩帳號不應屬於同一組織');
  for (const [actor,own,other] of [['a',a,b],['b',b,a]]) {
    for (const table of tables) {
      const column = table === 'organizations' ? 'id' : 'organization_id';
      const counts = [];
      for (const org of [own,other]) {
        const params = new URLSearchParams({select:column,[column]:`eq.${org}`,limit:'2'});
        counts.push((await rows(config,sessions[actor],`${table}?${params}`)).length);
      }
      const expected = actor === 'b' && ['audit_events','opportunity_decisions'].includes(table) ? 0 : 1;
      if (counts[0] !== expected || counts[1] !== 0)
        throw new Error(`${actor.toUpperCase()} ${table}：本組織 ${counts[0]}、跨組織 ${counts[1]}，預期 ${expected}/0`);
    }
  }
}

for (const actor of ['a','b']) {
  const form = document.getElementById(`account-${actor}`);
  form.addEventListener('submit',async event => {
    event.preventDefault();
    const emailInput = form.elements.namedItem('email');
    const passwordInput = form.elements.namedItem('password');
    const email = emailInput.value;
    const password = passwordInput.value;
    passwordInput.value = '';
    const output = form.querySelector('output');
    const button = form.querySelector('button');
    button.disabled = true;
    output.textContent = '驗證中…';
    try {
      const config = configuration();
      sessions[actor] = await signIn(config,email,password);
      output.textContent = `PASS：帳號 ${actor.toUpperCase()} 已登入。`;
      if (sessions.a && sessions.b) {
        document.getElementById('overall').textContent = '正在驗證 14 張表的隔離…';
        await checkIsolation(config);
        document.getElementById('overall').textContent = 'PASS：兩個真實 Auth session 的 14 張表跨組織隔離通過。';
        sessions.a = null;
        sessions.b = null;
      }
    } catch (error) {
      sessions[actor] = null;
      output.textContent = `FAIL：${error.message}`;
      document.getElementById('overall').textContent = '驗收未通過。';
    } finally { button.disabled = false; }
  });
}
