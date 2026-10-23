// Validation sidecar only: persisted payload/digests and frozen validators stay unchanged.
import {validateReport,copyJSON,freeze} from './first-result-payload.mjs';
import {reviewFields} from './first-result-review.mjs';
import {evaluateConsoleClaims} from './console-claim-review.mjs';

export async function assertSavedClaims(value) {
 const payload=copyJSON(value);
 await validateReport(payload);
 if(!payload.review.confirmation)throw Error('請先核對並確認目前內容，再交接保存');
 // The frozen export replaces suggested with edits. Restore producer text only
 // in a disposable validation copy, and evaluate the actual saved edits against it.
 const producer=copyJSON(payload),fields={};
 for(const key of reviewFields){
  fields[key]=payload.preview.fields[key].suggested;
  producer.preview.fields[key].suggested=payload.review.original_suggestions[key];
 }
 const result=evaluateConsoleClaims({report:producer,fields});
 if(result.mapping_status!=='PROVEN_EXTRACTIVE_CONTEXT'||!['PASS','PASS_WITH_REVIEW'].includes(result.decision))
  throw Error('宣稱檢查未通過或來源 UNKNOWN；請返回成果核對完整來源與目前版本');
 return freeze(result);
}
