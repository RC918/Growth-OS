import {urlPublishPreview} from '../../delivery/w1-private/dist/url-publish-preview.mjs';
import {createFixture} from './fixture.mjs';
let fixture,panel,ticket=0;
async function render(){const own=++ticket;fixture?.api.clear();panel?.root.remove();fixture=await createFixture(document.getElementById('scenario').value).open();if(own!==ticket)return;panel=urlPublishPreview({api:fixture.api,version:structuredClone(fixture.data.row),latest:true,isCurrent:()=>own===ticket});document.getElementById('preview').replaceChildren(panel.root);}
document.getElementById('scenario').addEventListener('change',render);
render();
