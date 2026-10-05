// Reuse the product's actual Auth/member/version/Review contract; never decode a JWT
// as authorization and never use an administrator key for publication decisions.
import {createWorkspaceApi} from '../../apps/web/workspace-api.mjs';
export function publicationAuthority({origin,key,redirectOrigin,fetchImpl,includeVersionCutoff=false}){
 return async(token,id,readonly=false)=>{
  const api=createWorkspaceApi({origin,key,redirectOrigin,fetchImpl,urlResultSchemaEnabled:true,urlReviewSchemaEnabled:true,reviewMarker:{read:()=>null}});
  await api.completeMagicLink('#access_token='+encodeURIComponent(token)+'&token_type=bearer&expires_in=60');
  const dashboard=await api.dashboard(),metadata=dashboard.versions.find(v=>v.id===id);if(!metadata)throw Error('Version not visible');
  const row=await api.readContentVersion(metadata);
  if(!readonly)return api.previewUrlPublication(row,{isCurrent:()=>true});
  if(api.context()?.role!=='owner')throw Error('Publication record requires Owner');
  const latest=!dashboard.versions.some(v=>v.opportunity_id===row.opportunity_id&&v.version_number>row.version_number);
  const d=await api.readSavedUrlDelivery(row,{latest,isCurrent:()=>true}),review=await api.readUrlReview(row);
  const version_superseded_at=includeVersionCutoff?await api.readSuccessorCreatedAt(row):null;
  return {...(includeVersionCutoff?{version_superseded_at,version_cutoff_unknown:(!latest||review?.is_latest_version===false)&&!version_superseded_at}:{}),binding:{organization_id:d.version.organization_id,version_id:d.version.id,version_number:d.version.number,review_id:review?.id??null,source_digest:d.source.source_digest,content_digest:d.content_digest,version_digest:d.version.version_digest},target_url:d.source.candidate_url,position:d.version.position};
 };
}
