// Only synthetic HTML, injected fetch, and ephemeral page Review. No network.
import {execFileSync} from 'node:child_process';
import {createResultReview, reviewFields} from '../../../apps/web/first-result-review.mjs';
export const ids={org:'10000000-0000-4000-8000-000000000001',other:'10000000-0000-4000-8000-000000000002',owner:'10000000-0000-4000-8000-000000000003',owner2:'10000000-0000-4000-8000-000000000004',viewer:'10000000-0000-4000-8000-000000000005',editor:'10000000-0000-4000-8000-000000000006',foreign:'10000000-0000-4000-8000-000000000007',goal:'10000000-0000-4000-8000-000000000008'};
export const parent=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const request=n=>`30000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export async function fixtures(){
 const raw=JSON.parse(execFileSync('python3',['-B','-c',`
import json,socket
from unittest.mock import patch
from product_source import build_snapshot
from test_product_source import PRODUCT,WOO_PRODUCT,fixture
bodies=[PRODUCT,WOO_PRODUCT,PRODUCT.replace(b'Public steel bolt for workshop assembly.',('🧪'*1000).encode()),PRODUCT.replace(b'Public steel bolt',b'Public \\xef\\xbb\\xbf\\xf0\\x9f\\xff\\xed\\xa0\\x80 steel bolt')]
with patch.object(socket,'getaddrinfo',side_effect=AssertionError('DNS forbidden')),patch.object(socket,'create_connection',side_effect=AssertionError('connection forbidden')):
 print(json.dumps([build_snapshot('https://example.com/products/bolt',lambda u:fixture(u) if u.endswith('/robots.txt') else (200,{'content-type':'text/html'},b),lambda:'2026-10-03T00:00:00Z') for b in bodies]))
`],{cwd:new URL('../../../prototype/public-audit/',import.meta.url),encoding:'utf8'}));
 const reports=[];
 for(let i=0;i<raw.length;i++){
  const review=createResultReview(raw[i]);
  if(i===2){review.edit('description','縮短的描述');review.edit('title','🔩'.repeat(1000));}
  else review.edit('title',' 保留 "引號" \\ slash\n e\u0301 é 🧪 \u2028\u2029 ');
  for(const k of reviewFields)review.check(k,true);await review.confirm();reports.push(await review.export());
 }
 return reports;
}
export const seedSQL=`
insert into auth.users(id) values ${[ids.owner,ids.owner2,ids.viewer,ids.editor,ids.foreign].map(id=>`('${id}')`).join(',')};
insert into public.organizations(id,name,business_model) values('${ids.org}','Synthetic A','trade'),('${ids.other}','Synthetic B','trade');
insert into public.organization_members(organization_id,user_id,role) values('${ids.org}','${ids.owner}','owner'),('${ids.org}','${ids.owner2}','owner'),('${ids.org}','${ids.viewer}','viewer'),('${ids.org}','${ids.editor}','editor'),('${ids.other}','${ids.foreign}','owner');
insert into public.growth_opportunities(id,organization_id,channel,audience_need,proposed_action,rationale,status,evidence_confidence)
values ${[1,2,3,4,5,6].map(n=>`('${parent(n)}','${n===6?ids.other:ids.org}','organic_search','Synthetic need','Synthetic action','Synthetic rationale','${n===3?'candidate':'approved'}','low')`).join(',')};
insert into public.opportunity_sources(organization_id,opportunity_id,source_kind,evidence_note,observed_at)
values ${[1,2,3,5,6].map(n=>`('${n===6?ids.other:ids.org}','${parent(n)}','research_note','Synthetic evidence',now())`).join(',')};
insert into public.opportunity_decisions(organization_id,opportunity_id,actor_user_id,decision,reason)
values ${[1,2,3,4,6].map(n=>`('${n===6?ids.other:ids.org}','${parent(n)}','${n===6?ids.foreign:ids.owner}','approved','Synthetic decision')`).join(',')};
insert into public.growth_goals(id,organization_id,actor_user_id) values('${ids.goal}','${ids.org}','${ids.owner}');
insert into public.growth_goal_turns(organization_id,goal_id,actor_user_id,request_id,version_number,question_key,question_text,answer_text)
select '${ids.org}','${ids.goal}','${ids.owner}',gen_random_uuid(),n,'goal','Synthetic question','Synthetic answer '||n from generate_series(1,13)n;
`;
export const bootstrapSQL=`
create role anon nologin;create role authenticated nologin;create role service_role nologin;
create schema auth;create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
alter default privileges in schema public grant all on tables to anon,authenticated;
`;
