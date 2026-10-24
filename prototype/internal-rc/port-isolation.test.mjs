import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPortIsolation} from './port-isolation.mjs';
const fixture=service=>({service,port:service==='auth'?9999:3000,exposedPorts:service==='auth'?null:{'3000/tcp':{}},portBindings:null,publishAllPorts:false,ports:service==='auth'?{}:{'3000/tcp':null}});
for(const service of ['auth','rest'])for(const bindings of [null,{}])test(`${service}: fixed metadata with empty bindings ${JSON.stringify(bindings)}`,()=>{
 const row=fixture(service);row.portBindings=bindings;const before=structuredClone(row);assert.equal(assertPortIsolation(row),true);assert.deepEqual(row,before);
});
test('Auth accepts an explicit empty EXPOSE map',()=>{const row=fixture('auth');row.exposedPorts={};assert.equal(assertPortIsolation(row),true);});
const rejected=[];
const reject=(label,change,service='rest')=>{const row=fixture(service);change(row);rejected.push([label,row]);};
for(const field of ['service','port','exposedPorts','portBindings','publishAllPorts','ports'])reject('missing '+field,r=>delete r[field]);
for(const service of ['db','wordpress','constructor','',null,3000])reject('unknown service '+String(service),r=>r.service=service);
for(const port of [9999,3001,'3000',null,0])reject('unexpected port '+String(port),r=>r.port=port);
for(const value of [true,'false',0,null])reject('PublishAllPorts '+String(value),r=>r.publishAllPorts=value);
for(const host of ['0.0.0.0','127.0.0.1','::1','::','']){
 for(const port of ['3000','']){
  reject(`configured binding ${host}:${port}`,r=>r.portBindings={'3000/tcp':[{HostIp:host,HostPort:port}]});
  reject(`runtime binding ${host}:${port}`,r=>r.ports={'3000/tcp':[{HostIp:host,HostPort:port}]});
 }
}
for(const value of [{'3000/tcp':null},{'3000/tcp':[]},[],false,'{}'])reject('invalid/nonempty configured bindings '+JSON.stringify(value),r=>r.portBindings=value);
for(const value of [null,[],{},'{}',{'9999/tcp':null},{'3000/udp':null},{'3000/tcp':null,'4000/tcp':null},{'3000/tcp':[]},{'3000/tcp':{}},{'3000/tcp':false}])reject('invalid/mismatched runtime ports '+JSON.stringify(value),r=>r.ports=value);
for(const value of [null,[],{},'{}',{'3000/udp':{}},{'9999/tcp':{}},{'3000/tcp':{},'4000/tcp':{}},{'3000/tcp':null},{'3000/tcp':[]},{'3000/tcp':{HostPort:'3000'}}])reject('invalid/mismatched EXPOSE '+JSON.stringify(value),r=>r.exposedPorts=value);
reject('Auth wrong port',r=>r.port=3000,'auth');
reject('Auth declared port',r=>r.exposedPorts={'9999/tcp':{}},'auth');
reject('Auth runtime port',r=>r.ports={'9999/tcp':null},'auth');
reject('Auth inconsistent rest metadata',r=>{r.exposedPorts={'3000/tcp':{}};r.ports={'3000/tcp':null};},'auth');
reject('extra metadata field',r=>r.unexpected=true);
for(const [index,value]of [null,[],false,'metadata',{},Object.create(null)].entries())rejected.push(['invalid top-level '+index,value]);
for(const [label,row]of rejected)test('rejects '+label,()=>assert.throws(()=>assertPortIsolation(row)));
