// Shared browser callback step. The caller supplies a session from its existing
// issuer (isolated fixture or real native Auth); this helper never creates one.
export async function enterWorkspaceSession(page,{origin,access_token,expires_in}){
 await page.goto('about:blank');
 await page.goto(origin+'/workspace.html#'+new URLSearchParams({access_token,token_type:'bearer',expires_in:String(expires_in)}));
 await page.locator('#workspace').waitFor({state:'visible'});
 if(await page.evaluate(()=>location.hash))throw Error('Callback fragment not cleared');
}
