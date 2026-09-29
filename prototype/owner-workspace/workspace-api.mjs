// Isolated Staging client. An access token exists only in this page's memory.
export function createWorkspaceApi({ origin, key, redirectOrigin, fetchImpl = fetch }) {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(origin) || !key.startsWith('sb_publishable_')) {
    throw new Error('Staging 設定不正確');
  }
  let token = null;
  let membership = null;
  let linkedSite = null;
  let linkedSiteVerified = false;

  async function request(path, { method = 'GET', body, authenticated = true } = {}) {
    if (authenticated && !token) throw new Error('請先登入');
    const headers = { apikey: key };
    if (authenticated) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetchImpl(`${origin}${path}`, {
        method, headers, cache: 'no-store',
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new Error('無法連線到 Staging，請稍後再試');
    }
    if (!response.ok) {
      // Auth and database error bodies can contain private data.
      throw new Error(`${path.startsWith('/auth/') ? '登入' : '資料操作'}失敗（HTTP ${response.status}）`);
    }
    return response.json();
  }

  async function select(table, columns, options = {}) {
    const params = new URLSearchParams({ select: columns, ...options });
    const data = await request(`/rest/v1/${table}?${params}`);
    if (!Array.isArray(data)) throw new Error('資料格式不正確');
    return data;
  }

  function activeOrg() {
    if (!membership) throw new Error('請先選擇工作區');
    return membership.organization_id;
  }

  function ownerOnly() {
    if (membership?.role !== 'owner') throw new Error('只有企業擁有者可以執行此操作');
    return activeOrg();
  }

  async function loadMembership(accessToken) {
    token = accessToken;
    try {
      // Ask Auth for the current user; an unverified fragment is not a session.
      const user = await request('/auth/v1/user');
      if (!user?.id) throw new Error('登入未取得有效使用者');
      const memberships = await select('organization_members', 'organization_id,role', { limit: '2' });
      if (memberships.length !== 1 || !['owner', 'viewer'].includes(memberships[0].role)) {
        throw new Error('此測試版需要恰好一個 owner 或 viewer 工作區');
      }
      membership = memberships[0];
      return { ...membership };
    } catch (error) {
      token = null;
      membership = null;
      linkedSite = null;
      linkedSiteVerified = false;
      throw error;
    }
  }

  return {
    async requestMagicLink(email, redirectTo) {
      const redirect = new URL(redirectTo);
      if (redirect.protocol !== 'https:' || redirect.origin !== redirectOrigin ||
          !redirect.pathname.endsWith('/workspace.html') || redirect.search || redirect.hash) {
        throw new Error('登入返回網址不正確');
      }
      await request(`/auth/v1/otp?redirect_to=${encodeURIComponent(redirect.href)}`, {
        method: 'POST', body: { email, create_user: false }, authenticated: false,
      });
    },
    async completeMagicLink(fragment) {
      const params = new URLSearchParams(fragment.replace(/^#/, ''));
      if (params.get('error') || params.get('error_code')) throw new Error('登入連結無效或已逾期，請重新取得');
      const accessToken = params.get('access_token');
      const expiresIn = Number(params.get('expires_in'));
      if (!accessToken || params.get('token_type')?.toLowerCase() !== 'bearer' ||
          !Number.isFinite(expiresIn) || expiresIn <= 0) {
        throw new Error('登入連結缺少有效工作階段');
      }
      return loadMembership(accessToken);
    },
    signOut() {
      token = null;
      membership = null;
      linkedSite = null;
      linkedSiteVerified = false;
    },
    async dashboard() {
      const org = activeOrg();
      const scope = { organization_id: `eq.${org}` };
      const [organizations, profiles, opportunities, sites] = await Promise.all([
        select('organizations', 'id,name,business_model', { id: `eq.${org}`, limit: '1' }),
        select('business_profiles', 'id,site_id,display_name,audience_summary,offering_summary,primary_outcome,target_market,review_status', { ...scope, limit: '1' }),
        select('growth_opportunities', 'id,channel,audience_need,proposed_action,rationale,status,evidence_confidence,created_at', { ...scope, order: 'created_at.desc', limit: '30' }),
        select('sites', 'id,origin,verified_at', { ...scope, limit: '30' }),
      ]);
      if (organizations.length !== 1) throw new Error('找不到測試工作區');
      linkedSite = profiles[0]?.site_id || null;
      linkedSiteVerified = !!sites.find(site => site.id === linkedSite)?.verified_at;
      return { organization: organizations[0], profile: profiles[0] || null, opportunities, sites, role: membership.role };
    },
    saveProfile(values) {
      const organization = ownerOnly();
      const detachSite = values.detach_site === true || values.detach_site === 'on';
      if (linkedSite && !linkedSiteVerified && !detachSite) {
        throw new Error('網站尚未驗證；請先驗證，或明確選擇解除網站關聯');
      }
      return request('/rest/v1/rpc/save_business_profile', {
        method: 'POST', body: { p_organization_id: organization, p_site_id: detachSite ? null : linkedSite,
          p_display_name: values.display_name, p_audience_summary: values.audience_summary,
          p_offering_summary: values.offering_summary, p_primary_outcome: values.primary_outcome,
          p_target_market: values.target_market },
      });
    },
    approveProfile() {
      return request('/rest/v1/rpc/approve_business_profile', {
        method: 'POST', body: { p_organization_id: ownerOnly() },
      });
    },
    createOpportunity(values) {
      return request('/rest/v1/rpc/create_growth_opportunity', {
        method: 'POST', body: { p_organization_id: ownerOnly(), p_site_id: null,
          p_channel: values.channel, p_audience_need: values.audience_need,
          p_proposed_action: values.proposed_action, p_rationale: values.rationale,
          p_source_kind: values.source_kind, p_evidence_note: values.evidence_note },
      });
    },
    reviewOpportunity(id, decision, reason) {
      return request('/rest/v1/rpc/review_growth_opportunity', {
        method: 'POST', body: { p_organization_id: ownerOnly(), p_opportunity_id: id,
          p_decision: decision, p_reason: reason },
      });
    },
  };
}
