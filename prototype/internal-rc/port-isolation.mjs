// Pure, fail-closed interpretation of the fixed native fixture's port metadata.
// This does not create containers or change port publication/network settings.
import assert from 'node:assert/strict';
const fields=['exposedPorts','port','portBindings','ports','publishAllPorts','service'];
const record=v=>v!==null&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype;
const empty=v=>record(v)&&Reflect.ownKeys(v).length===0;
export function assertPortIsolation(observed){
 assert.ok(record(observed),'Port isolation metadata must be a record');
 assert.deepEqual(Reflect.ownKeys(observed).sort(),fields,'Exact isolation fields required');
 const {service,port,exposedPorts,portBindings,publishAllPorts,ports}=observed;
 assert.ok(service==='auth'||service==='rest','Only fixed native services allowed');
 assert.equal(port,service==='auth'?9999:3000,'Unexpected service port');
 assert.equal(publishAllPorts,false,'Publishing all ports is forbidden');
 // A nil map or empty map configures no bindings. Any map entry is rejected,
 // even a null/empty binding or an empty HostPort (dynamic publication).
 assert.ok(portBindings===null||empty(portBindings),'Host port bindings are forbidden');
 assert.ok(record(ports),'Runtime ports must be an explicit map');
 if(service==='auth'){
  // The pinned GoTrue fixture declares no EXPOSE metadata.
  assert.ok(exposedPorts===null||empty(exposedPorts),'Unexpected Auth EXPOSE metadata');
  assert.ok(empty(ports),'Auth runtime port metadata must be empty');
 }else{
  assert.ok(record(exposedPorts),'PostgREST EXPOSE metadata required');
  assert.deepEqual(Reflect.ownKeys(exposedPorts),['3000/tcp'],'Only PostgREST port 3000/tcp allowed');
  assert.ok(empty(exposedPorts['3000/tcp']),'EXPOSE declaration must be empty metadata');
  assert.deepEqual(Reflect.ownKeys(ports),['3000/tcp'],'Runtime ports must match EXPOSE');
  assert.equal(ports['3000/tcp'],null,'PostgREST port must have no runtime bindings');
 }
 return true;
}
