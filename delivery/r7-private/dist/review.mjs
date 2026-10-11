import {mountR7Review} from './intro-r7-review.mjs';
// Detached empty input preserves the reviewed lifecycle invalidation contract.
// No URL entry, form, backend, workspace, or model is exposed in this copy.
void mountR7Review(document.getElementById('r7-review'),document.createElement('input'));
