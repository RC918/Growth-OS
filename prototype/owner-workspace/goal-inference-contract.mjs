// Synchronous Node adapter; the shared validation authority has no runtime imports.
import {createHash} from 'node:crypto';
import {validatedInferenceData,materializeInferenceProposal,prepareConfirmedIntakeTurnWith} from './goal-inference-core.mjs';
export function validateInferenceProposal(output,snapshot) {
 const data=validatedInferenceData(output,snapshot);
 return materializeInferenceProposal(data,createHash('sha256').update(data.fingerprintText).digest('hex'));
}
export function prepareConfirmedIntakeTurn(output,snapshot,confirmation,fieldKey,requestId) {
 return prepareConfirmedIntakeTurnWith(output,snapshot,confirmation,fieldKey,requestId,validateInferenceProposal);
}
