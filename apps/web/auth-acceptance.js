// Temporary synthetic Staging acceptance page. No credential or token persistence.
const base = 'https://vhzryhibmpvglzcmfnaa.supabase.co';
const key = 'sb_publishable_B9pMiED8jrCoxuy2kC0HoA_LmzKex9r';
const orgs = {
  a: '93a88055-0a0b-40c0-b22f-a6d312320001',
  b: '93a88055-0a0b-40c0-b22f-a6d312320002',
};
const tables = ['organizations','organization_members','sites','scans','findings','import_batches','funnel_daily','recommendations','actions','audit_events'];
const passed = {a:false,b:false};

async function countVisible(token, table, orgId) {
  const column = table === 'organizations' ? 'id' : 'organization_id';
  const query = new URLSearchParams({select:column,[column]:`eq.${orgId}`,limit:'2'});
  const response = await fetch(`${base}/rest/v1/${table}?${query}`, {
    headers:{apikey:key,Authorization:`Bearer ${token}`},cache:'no-store',
  });
  if (!response.ok) throw new Error(`Data API ${table}: HTTP ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error(`Data API ${table}: invalid response`);
  return rows.length;
}

async function check(actor, email, password) {
  const response = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method:'POST',headers:{apikey:key,'Content-Type':'application/json'},
    body:JSON.stringify({email,password}),cache:'no-store',
  });
  if (!response.ok) throw new Error(`Auth: HTTP ${response.status}`);
  const token = (await response.json()).access_token;
  if (!token) throw new Error('Auth: no access token');
  const own = orgs[actor], other = orgs[actor === 'a' ? 'b' : 'a'];
  for (const table of tables) {
    const ownCount = await countVisible(token,table,own);
    const otherCount = await countVisible(token,table,other);
    const expected = actor === 'b' && table === 'audit_events' ? 0 : 1;
    if (ownCount !== expected || otherCount !== 0)
      throw new Error(`${table}: own=${ownCount}, cross=${otherCount}; expected ${expected},0`);
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
    emailInput.value = '';
    const output = form.querySelector('output');
    const button = form.querySelector('button');
    button.disabled = true;
    output.textContent = '驗證中…';
    try {
      await check(actor,email,password);
      passed[actor] = true;
      output.textContent = `PASS：帳號 ${actor.toUpperCase()} 的 10 張表與跨租戶讀取符合預期。`;
    } catch (error) {
      passed[actor] = false;
      output.textContent = `FAIL：${error.message}`;
    } finally {
      button.disabled = false;
      document.getElementById('overall').textContent = passed.a && passed.b
        ? 'PASS：兩個真實 Auth session 的 Data API 隔離均通過。'
        : '等待兩個帳號分別通過驗證。';
    }
  });
}
