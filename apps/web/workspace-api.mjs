import {contentDigest} from './first-result-review.mjs';
import {validateReport,copyJSON,canonical,freeze} from './first-result-payload.mjs';
const versionMetadata = ['first_result_request_id', 'first_result_expected_version', 'first_result_request_digest'];
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
// Missing projection fields are unknown, never evidence that a row is legacy.
export function contentVersionKind(version) {
  if (!version || !versionMetadata.every(key => Object.hasOwn(version, key))) return 'invalid';
  if (versionMetadata.every(key => version[key] === null)) return version.first_result_payload == null ? 'legacy' : 'invalid';
  return uuid(version.id) && uuid(version.opportunity_id) && uuid(version.first_result_request_id) &&
    Number.isSafeInteger(version.first_result_expected_version) && version.first_result_expected_version >= 0 &&
    version.version_number === version.first_result_expected_version + 1 &&
    typeof version.first_result_request_digest === 'string' && /^pg-jsonb-sha256:[0-9a-f]{64}$/.test(version.first_result_request_digest)
    ? 'typed' : 'invalid';
}
const versionColumns = 'id,opportunity_id,version_number,title,draft_body,status,created_at,' + versionMetadata.join(',');

// Isolated Staging client. An access token exists only in this page's memory.
export function createWorkspaceApi({ origin, key, redirectOrigin, fetchImpl = fetch, urlSaveEnabled = false, urlResultSchemaEnabled = false, urlSaveTrial = null }) {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(origin) || !key.startsWith('sb_publishable_')) {
    throw new Error('Staging 設定不正確');
  }
  let token = null;
  let membership = null;
  let actorId = null;
  const bound = urlSaveTrial ? Object.freeze(copyJSON(urlSaveTrial)) : null;
  const boundAvailable = () => !bound || (bound.expected_version===0 && actorId===bound.actor_id && membership?.organization_id===bound.organization_id && membership?.role==='owner' && bound.workspace_url===redirectOrigin+'/workspace.html' && Date.now()<Date.parse(bound.expires_at));
  // Fixed, read-only M3 acceptance controls; independent of the expired Save lease.
  const tenantOwner='e85f1a90-3565-4fc1-a7e0-3b7d08830d0e';
  const tenantOrgA='93a88055-0a0b-40c0-b22f-a6d312320001',tenantOrgB='93a88055-0a0b-40c0-b22f-a6d312320002';
  const tenantParentA='9bafbb2f-eea7-48ea-bc23-3896897f19c3',tenantParentB='93a88055-0a0b-40c0-b22f-a6d3123c0002';
  const tenantAvailable=()=>origin==='https://vhzryhibmpvglzcmfnaa.supabase.co' && urlResultSchemaEnabled===true && urlSaveEnabled===false && actorId===tenantOwner && membership?.role==='owner' && membership?.organization_id===tenantOrgA;
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
      // Workspace members can see colleagues under RLS; authenticate using only the
      // current user's membership, not the number of rows visible in the org.
      const memberships = await select('organization_members', 'organization_id,role', {
        user_id: `eq.${user.id}`, limit: '2',
      });
      if (memberships.length !== 1 || !['owner', 'editor', 'viewer'].includes(memberships[0].role)) {
        throw new Error('需要恰好一個既有工作區；沒有成員資格或多工作區時不能保存。不會自動建立帳號或工作區。');
      }
      membership = Object.freeze(memberships[0]);
      actorId = user.id;
      return { ...membership };
    } catch (error) {
      token = null;
      membership = null;
      actorId = null;
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
      actorId = null;
      linkedSite = null;
      linkedSiteVerified = false;
    },
    listGoals() {
      return select('growth_goals','id,created_at',{
        organization_id:`eq.${activeOrg()}`,order:'created_at.desc,id.desc',limit:'20',
      });
    },
    async readGoal(id) {
      const rows=await select('growth_goal_turns','version_number,question_key,question_text,answer_text,created_at',{
        organization_id:`eq.${activeOrg()}`,goal_id:`eq.${id}`,order:'version_number.asc',limit:'201',
      });
      if(!rows.length || rows.length>200) throw new Error('找不到完整可讀取的目標紀錄');
      return rows;
    },
    saveGoalTurn({goalId,requestId,expectedVersion,questionKey,answer}) {
      return request('/rest/v1/rpc/save_goal_turn',{
        method:'POST',body:{p_organization_id:ownerOnly(),p_goal_id:goalId,p_request_id:requestId,
          p_expected_version:expectedVersion,p_question_key:questionKey,p_answer:answer},
      });
    },
    listObservations() {
      return select('search_observation_versions','id,created_at',{
        organization_id:`eq.${activeOrg()}`,order:'created_at.desc,id.desc',limit:'20',
      });
    },
    async readObservation(id) {
      const rows=await select('search_observation_versions','id,payload,created_at',{
        organization_id:`eq.${activeOrg()}`,id:`eq.${id}`,limit:'1',
      });
      if(rows.length!==1) throw new Error('找不到可讀取的觀測版本');
      return rows[0];
    },
    saveObservation(requestId,payload) {
      return request('/rest/v1/rpc/save_search_observation',{
        method:'POST',body:{p_organization_id:ownerOnly(),p_request_id:requestId,p_payload:payload},
      });
    },
    context() { return membership; },
    boundSaveAvailable() { return boundAvailable(); },
    tenantDiagnosticAvailable() { return tenantAvailable(); },
    async verifyOwnerTenantRead() {
      if(!tenantAvailable())throw new Error('固定唯讀驗收身份或設定不符');
      const session=membership;
      const current=()=>{if(membership!==session || !tenantAvailable())throw new Error('工作區已變更；驗收結果失效');};
      const positive=await select('growth_opportunities','id,organization_id',{organization_id:`eq.${tenantOrgA}`,id:`eq.${tenantParentA}`,limit:'2'});
      current();
      if(positive.length!==1 || positive[0]?.id!==tenantParentA || positive[0]?.organization_id!==tenantOrgA)throw new Error('正向控制未取得精確一筆；驗收未通過');
      const negative=await select('growth_opportunities','id,organization_id',{organization_id:`eq.${tenantOrgB}`,id:`eq.${tenantParentB}`,limit:'2'});
      current();
      if(negative.length!==0)throw new Error('跨工作區控制回傳資料；驗收未通過');
      return {positiveId:tenantParentA,negativeId:tenantParentB,positiveCount:1,negativeCount:0,checkedAt:new Date().toISOString()};
    },
    async readBoundUrlResult(knownId=null) {
      const org=activeOrg(),session=membership;
      if(!bound || bound.organization_id!==org) throw new Error('固定驗收工作區不符');
      const rows=await select('content_versions',`organization_id,created_by,${versionColumns},first_result_payload`,{organization_id:`eq.${org}`,first_result_request_id:`eq.${bound.request_id}`,limit:'2'});
      if(membership!==session)throw new Error('工作區已變更');
      if(!rows.length)return null;
      const row=rows[0];
      if(rows.length!==1||row.version_number!==1||row.status!=='draft'||contentVersionKind(row)!=='typed'||(knownId&&row.id!==knownId)||row.organization_id!==org||row.created_by!==bound.actor_id||row.opportunity_id!==bound.opportunity_id||row.first_result_request_id!==bound.request_id||row.first_result_expected_version!==0||row.first_result_request_digest!==bound.request_digest)throw new Error('固定版本讀回不一致');
      await validateReport(row.first_result_payload);
      if(await contentDigest(canonical(row.first_result_payload))!=='sha256:'+bound.payload_canonical_sha256||row.title!==row.first_result_payload.preview.fields.title.suggested||row.draft_body!==row.first_result_payload.preview.fields.description.suggested)throw new Error('固定成果讀回不一致');
      if(membership!==session)throw new Error('工作區已變更');return row;
    },
    async saveUrlResult(intent, {isCurrent, onDispatch=()=>{}}={}) {
      if (!urlSaveEnabled || !urlResultSchemaEnabled) throw new Error('URL 保存尚未開放');
      const org=ownerOnly(), session=membership, frozen=copyJSON(intent);
      if(typeof isCurrent!=='function' || typeof onDispatch!=='function') throw new Error('缺少有效的保存意圖檢查');
      if (frozen.organization_id!==org || !uuid(frozen.opportunity_id) || !uuid(frozen.request_id) ||
          !Number.isSafeInteger(frozen.expected_version) || frozen.expected_version<0 || frozen.expected_version>2147483646) throw new Error('保存識別不完整');
      await validateReport(frozen.payload);
      if(bound && (!boundAvailable() || frozen.organization_id!==bound.organization_id || frozen.opportunity_id!==bound.opportunity_id || frozen.request_id!==bound.request_id || frozen.expected_version!==0 || await contentDigest(canonical(frozen.payload))!=='sha256:'+bound.payload_canonical_sha256)) throw new Error('固定驗收範圍不符或已到期');
      // No async gap between live intent/session validation and dispatch.
      if (membership!==session || !boundAvailable() || isCurrent()!==true) throw new Error('保存意圖或工作區已失效；未送出保存');
      onDispatch();
      const id=await request('/rest/v1/rpc/save_url_result_draft',{method:'POST',body:{p_organization_id:org,p_opportunity_id:frozen.opportunity_id,p_request_id:frozen.request_id,p_expected_version:frozen.expected_version,p_payload:frozen.payload}});
      if (membership!==session || !uuid(id)) throw new Error('保存結果未知；只可查詢核對');
      return id;
    },
    async reconcileUrlResult(input, versionId=null, expectedActor=null) {
      const intent=copyJSON(input);
      const org=activeOrg(),session=membership;
      if (intent.organization_id!==org || !uuid(intent.request_id) || (expectedActor!==null && actorId!==expectedActor)) throw new Error('工作區已變更');
      const rows=await select('content_versions',`organization_id,${expectedActor!==null?'created_by,':''}${versionColumns},first_result_payload`,{organization_id:`eq.${org}`,first_result_request_id:`eq.${intent.request_id}`,limit:'2'});
      if(membership!==session) throw new Error('工作區已變更');
      if(rows.length===0)return null;
      const row=rows[0];
      if(rows.length!==1 || row.organization_id!==org || (expectedActor!==null && (row.created_by!==expectedActor || row.status!=='draft')) || (versionId && row.id!==versionId) || contentVersionKind(row)!=='typed' ||
       row.opportunity_id!==intent.opportunity_id || row.first_result_request_id!==intent.request_id || row.first_result_expected_version!==intent.expected_version ||
       canonical(row.first_result_payload)!==canonical(intent.payload) || row.title!==intent.payload.preview.fields.title.suggested || row.draft_body!==intent.payload.preview.fields.description.suggested) throw new Error('保存讀回不一致');
      return row;
    },
    async readContentVersion(version) {
      const org = activeOrg(), sessionMembership = membership, sessionToken = token;
      const expected = { ...version };
      if (contentVersionKind(expected) !== 'typed') throw new Error('版本識別資料不完整，請重新整理列表');
      const rows = await select('content_versions', `organization_id,${versionColumns},first_result_payload`, {
        organization_id: `eq.${org}`, id: `eq.${expected.id}`, limit: '1',
      });
      if (membership !== sessionMembership || token !== sessionToken) throw new Error('工作區已變更，請重新讀取');
      const row = rows[0];
      if (rows.length !== 1 || !row) throw new Error('找不到可讀取的完整版本，請重新整理或重試');
      if (row.organization_id !== org || contentVersionKind(row) !== 'typed' ||
          versionColumns.split(',').some(key => !Object.hasOwn(row, key) || row[key] !== expected[key])) {
        throw new Error('版本資料與列表不一致，請重新整理列表');
      }
      if (!row.first_result_payload || typeof row.first_result_payload !== 'object' || Array.isArray(row.first_result_payload)) {
        throw new Error('完整版本資料缺漏，請重新整理或重試');
      }
      return row;
    },
    async readReviewBase(version) {
      const org=ownerOnly(),session=membership,expected=copyJSON(version);
      if(!urlResultSchemaEnabled || expected.status!=='draft' || contentVersionKind(expected)!=='typed')throw new Error('此版本不可續編');
      const current=()=>{if(membership!==session)throw new Error('工作區已變更，請重新讀取');};
      const parents=await select('growth_opportunities','id,entry_kind',{organization_id:`eq.${org}`,id:`eq.${expected.opportunity_id}`,limit:'1'});
      current();
      if(parents.length!==1 || parents[0]?.id!==expected.opportunity_id || parents[0]?.entry_kind!=='url_result')throw new Error('成果來源項目已變更');
      const latest=await select('content_versions',versionColumns,{organization_id:`eq.${org}`,opportunity_id:`eq.${expected.opportunity_id}`,order:'version_number.desc',limit:'1'});
      current();
      if(latest.length!==1 || versionColumns.split(',').some(key=>latest[0]?.[key]!==expected[key]))throw new Error('已有不同版本，請重新整理後續編');
      const row=await this.readContentVersion(expected);
      await validateReport(row.first_result_payload);
      current();
      if(row.title!==row.first_result_payload.preview.fields.title.suggested || row.draft_body!==row.first_result_payload.preview.fields.description.suggested)throw new Error('成果內容與版本不一致');
      return row;
    },
    async prepareUrlRevisionIntent(baseVersion,exported,{isCurrent,requestId=crypto.randomUUID()}={}) {
      const org=ownerOnly(),session=membership,actor=actorId,base=copyJSON(baseVersion),payload=copyJSON(exported);
      const current=()=>{if(membership!==session || actorId!==actor || typeof isCurrent!=='function' || isCurrent()!==true)throw new Error('續編意圖或工作階段已失效');};
      current();
      if(!uuid(requestId) || !uuid(actor) || base.organization_id!==org || !uuid(base.id) || !Number.isSafeInteger(base.version_number) || base.version_number<1 || base.version_number>2147483646)throw new Error('續編基準識別不符');
      // Recheck the same signed identity/membership, without replacing the session.
      const user=await request('/auth/v1/user');current();
      if(user?.id!==actor)throw new Error('登入身份已變更');
      const memberships=await select('organization_members','organization_id,role',{user_id:`eq.${actor}`,limit:'2'});current();
      if(memberships.length!==1 || memberships[0]?.organization_id!==org || memberships[0]?.role!=='owner')throw new Error('擁有者工作區資格已變更');
      const fresh=await this.readReviewBase(base);current();
      if(canonical(fresh)!==canonical(base))throw new Error('已保存基準已變更');
      await validateReport(payload);current();
      if(!payload.review.confirmation || payload.review.revision<=base.first_result_payload.review.revision)throw new Error('請重新確認續編版本');
      const immutable=report=>{
        const value=copyJSON(report);
        for(const key of ['title','meta_description','description'])for(const field of ['suggested','user_edited','citation_role'])delete value.preview.fields[key][field];
        delete value.preview.status;
        for(const key of ['revision','content_digest','edited','fact_checks','confirmation'])delete value.review[key];
        return canonical(value);
      };
      if(immutable(payload)!==immutable(base.first_result_payload))throw new Error('續編不能改變已保存來源或原建議');
      if(['title','meta_description','description'].every(key=>payload.preview.fields[key].suggested===base.first_result_payload.preview.fields[key].suggested))throw new Error('續編內容未變更');
      const requestBody={organization_id:org,opportunity_id:base.opportunity_id,request_id:requestId,expected_version:base.version_number,payload};
      const binding={actor_id:actor,base_version_id:base.id,base_request_digest:base.first_result_request_digest};
      // Local intent digest is NOT PostgreSQL's authoritative pg-jsonb request digest.
      const intentDigest=await contentDigest(canonical({binding,request:requestBody}));current();
      return freeze({status:'prepared',binding,request:requestBody,intent_digest:intentDigest,source_digest:payload.snapshot.content_fingerprint,content_digest:payload.review.content_digest,authority:{persisted:false,published:false,owner_approved:false,server_authorized:false}});
    },
    async saveUrlRevision(candidate,{isCurrent,onDispatch}={}) {
      if(!urlSaveEnabled || !urlResultSchemaEnabled)throw new Error('URL 保存尚未開放');
      const intent=copyJSON(candidate),session=membership;
      const live=()=>membership===session && typeof isCurrent==='function' && isCurrent()===true;
      if(!live() || intent.binding?.actor_id!==actorId || !uuid(intent.binding?.base_version_id))throw new Error('續編基準或身份不符');
      const rows=await select('content_versions',`organization_id,${versionColumns},first_result_payload`,{organization_id:`eq.${ownerOnly()}`,id:`eq.${intent.binding.base_version_id}`,limit:'1'});
      if(!live() || rows.length!==1)throw new Error('續編基準已失效');
      const checked=await this.prepareUrlRevisionIntent(rows[0],intent.request?.payload,{isCurrent:live,requestId:intent.request?.request_id});
      if(canonical(checked)!==canonical(intent))throw new Error('保存意圖與目前基準不一致');
      return this.saveUrlResult(intent.request,{isCurrent:live,onDispatch});
    },
    async dashboard() {
      const org = activeOrg();
      const scope = { organization_id: `eq.${org}` };
      const [organizations, profiles, opportunities, sites, sources, decisions, versions, reviews, actionPlans] = await Promise.all([
        select('organizations', 'id,name,business_model', { id: `eq.${org}`, limit: '1' }),
        select('business_profiles', 'id,site_id,display_name,audience_summary,offering_summary,primary_outcome,target_market,review_status', { ...scope, limit: '1' }),
        select('growth_opportunities', (urlResultSchemaEnabled ? 'id,entry_kind,source_identity,' : 'id,')+'channel,audience_need,proposed_action,rationale,status,evidence_confidence,created_at', { ...scope, order: 'created_at.desc', limit: '30' }),
        select('sites', 'id,origin,verified_at', { ...scope, limit: '30' }),
        select('opportunity_sources', 'opportunity_id,source_kind,source_url,evidence_note,observed_at', { ...scope, order: 'observed_at.desc', limit: '500' }),
        select('opportunity_decisions', 'opportunity_id,decision,reason,decided_at', { ...scope, order: 'decided_at.desc', limit: '500' }),
        select('content_versions', versionColumns, { ...scope, order: 'created_at.desc', limit: '500' }),
        select('content_reviews', 'version_id,decision,reason,reviewed_at', { ...scope, order: 'reviewed_at.desc', limit: '500' }),
        select('content_action_plans', 'version_id,proposed_path,success_signal,rollback_plan,created_at', { ...scope, order: 'created_at.desc', limit: '500' }),
      ]);
      if (urlResultSchemaEnabled && opportunities.some(item=>!['legacy_opportunity','url_result'].includes(item.entry_kind))) throw new Error('項目類型缺漏，請重新整理');
      if (organizations.length !== 1) throw new Error('找不到測試工作區');
      if ([sources, decisions, versions, reviews, actionPlans].some(rows => rows.length === 500)) throw new Error('證據、版本或執行方案筆數超過此測試版可完整顯示的上限');
      linkedSite = profiles[0]?.site_id || null;
      linkedSiteVerified = !!sites.find(site => site.id === linkedSite)?.verified_at;
      return { organization: organizations[0], profile: profiles[0] || null, opportunities, sites, sources, decisions, versions, reviews, actionPlans, role: membership.role };
    },
    async verifyViewerIsolation() {
      // Fixture B has no access to Fixture A. This is a real JWT Data API
      // check, not a UI-only role check. Never return the token or error body.
      const fixtureA = '93a88055-0a0b-40c0-b22f-a6d312320001';
      const fixtureB = '93a88055-0a0b-40c0-b22f-a6d312320002';
      if (!token || membership?.role !== 'viewer' || membership.organization_id !== fixtureB) {
        throw new Error('此診斷僅供 Fixture B 檢視者使用');
      }
      const foreign = await select('organizations', 'id', { id: `eq.${fixtureA}`, limit: '1' });
      const scopeDenied = foreign.length === 0;
      // The deliberately invalid decision guarantees no write even if an
      // authorization regression reaches validation in this RPC.
      let response;
      try {
        response = await fetchImpl(`${origin}/rest/v1/rpc/review_growth_opportunity`, {
          method: 'POST',
          headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            p_organization_id: fixtureB,
            p_opportunity_id: '00000000-0000-0000-0000-000000000000',
            p_decision: 'invalid_probe_never_write',
            p_reason: 'viewer authorization check',
          }),
        });
      } catch {
        throw new Error('無法連線到 Staging，請稍後再試');
      }
      return { scopeDenied, ownerActionDenied: response.status === 403, ownerActionStatus: response.status };
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
    createContentDraft(id, title, draftBody) {
      return request('/rest/v1/rpc/create_content_draft', {
        method: 'POST', body: { p_organization_id: ownerOnly(), p_opportunity_id: id,
          p_title: title, p_draft_body: draftBody },
      });
    },
    reviewContentDraft(versionId, decision, reason) {
      return request('/rest/v1/rpc/review_content_draft', {
        method: 'POST', body: { p_organization_id: ownerOnly(), p_version_id: versionId,
          p_decision: decision, p_reason: reason },
      });
    },
    planContentAction(versionId, proposedPath, successSignal, rollbackPlan) {
      return request('/rest/v1/rpc/plan_content_action', {
        method: 'POST', body: { p_organization_id: ownerOnly(), p_version_id: versionId,
          p_proposed_path: proposedPath, p_success_signal: successSignal, p_rollback_plan: rollbackPlan },
      });
    },
  };
}
