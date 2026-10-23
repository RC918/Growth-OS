// Shared by the deployed Preview and the isolated acceptance candidate.
import assert from 'node:assert/strict';
export function deriveClaim(name,text){
 const replace=(from,to)=>{assert.equal(text.split(from).length,2,'Missing or ambiguous claim integration anchor: '+name);text=text.replace(from,to);};
 if(name==='workspace.mjs')replace("import { createWorkspaceApi, contentVersionKind } from './workspace-api.mjs';","import { createWorkspaceApi, contentVersionKind } from './claim-guarded-workspace-api.mjs';");
 if(name==='url-result-save.mjs'){
  replace("import {createTrialMarker}","import {assertSavedClaims} from './saved-claim-context.mjs';\nimport {createTrialMarker}");
  replace('const frozen=copyJSON(value);await validateReport(frozen);','const frozen=copyJSON(value);await validateReport(frozen);await assertSavedClaims(frozen);');
 }
 return text;
}
