// Test-only synthetic HTML through the unchanged product source producer.
// All source reads are injected; Python audit forbids socket use.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=String.raw`
import html,json,sys
from urllib.parse import urlsplit
sys.path.insert(0,'prototype/public-audit')
from product_source import build_snapshot
name,url=sys.argv[1:]
description='Public steel product for workshop assembly.'
body=('<html><head><title>'+html.escape(name)+'</title><meta name="description" content="Old catalog"><script type="application/ld+json">'+json.dumps({'@type':'Product','name':name})+'</script></head><body>'
      '<main itemscope itemtype="https://schema.org/Product"><h1 itemprop="name">'+html.escape(name)+'</h1>'
      '<p itemprop="description">'+description+'</p><ul><li itemprop="additionalProperty">Reusable package</li></ul></main></body></html>').encode()
def deny_network(event,args):
    if event.startswith('socket.'): raise RuntimeError('Network forbidden in handoff fixture')
sys.addaudithook(deny_network)
def fetch(target):
    if target==url: return 200,{'content-type':'text/html'},body
    if target==urlsplit(url)._replace(path='/robots.txt',query='',fragment='').geturl():
        return 200,{'content-type':'text/plain'},b'User-agent: *\nAllow: /\n'
    raise RuntimeError('Unexpected synthetic source target')
print(json.dumps(build_snapshot(url,fetch)))
`;
export function handoffSourceFixture(title,sourceURL){
 return JSON.parse(execFileSync('python3',['-B','-c',script,title,sourceURL],{cwd:fileURLToPath(new URL('../../',import.meta.url)),encoding:'utf8'}));
}
