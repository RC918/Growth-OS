import test from 'node:test';
import assert from 'node:assert/strict';
import {createRevisionMarker,revisionMarkerKey} from './url-result-trial-marker.mjs';
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash='sha256:'+'1'.repeat(64);
const operation={actor_id:id(1),organization_id:id(2),opportunity_id:id(3),base_version_id:id(4),base_request_digest:'pg-jsonb-sha256:'+'2'.repeat(64),base_payload_digest:hash,request_id:id(5),expected_version:1,source_digest:hash,content_digest:hash,payload_digest:hash,intent_digest:hash};
const storage=()=>{const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
test('single revision marker survives new reader, keeps known UUID monotonic and only stores metadata',()=>{
 const store=storage();let marker=createRevisionMarker(()=>store);assert.equal(marker.read(),null);marker.attempt(operation);
 marker=createRevisionMarker(()=>store);assert.deepEqual(marker.read(),{...operation,known_id:null,resolved:false});marker.remember(operation.request_id,id(6));
 marker=createRevisionMarker(()=>store);assert.equal(marker.read().known_id,id(6));marker.remember(operation.request_id,id(6),true);marker.remember(operation.request_id,id(6));assert.equal(marker.read().resolved,true);
 marker.attempt({...operation,base_version_id:id(6),request_id:id(7),expected_version:2});assert.equal(marker.read().request_id,id(7));
 const serialized=store.getItem(revisionMarkerKey);assert.ok(serialized.length<2048);assert.equal(/token|Bearer|first_result_payload/.test(serialized),false);
});
test('storage denied/no-op/corrupt/disappeared/changed and duplicate pending fail closed',()=>{
 for(const method of ['getItem','setItem']){const store=storage();store[method]=()=>{throw Error('denied');};const marker=createRevisionMarker(()=>store);assert.throws(()=>marker.read());assert.throws(()=>marker.attempt(operation));}
 const noop=storage();noop.setItem=()=>{};assert.throws(()=>createRevisionMarker(()=>noop).read());
 for(const mutate of [s=>s.setItem(revisionMarkerKey,'broken'),s=>s.values.delete(revisionMarkerKey),s=>s.setItem(revisionMarkerKey,JSON.stringify({schema_version:1,operation:{...operation,known_id:null,resolved:false,payload:{}}}))]){const store=storage(),marker=createRevisionMarker(()=>store);marker.read();mutate(store);assert.throws(()=>marker.read());assert.throws(()=>marker.attempt(operation));}
 const store=storage(),marker=createRevisionMarker(()=>store);marker.attempt(operation);assert.throws(()=>marker.attempt({...operation,request_id:id(8)}));
 const other=storage(),known=createRevisionMarker(()=>other);known.attempt(operation);known.remember(operation.request_id,id(6));assert.throws(()=>known.remember(operation.request_id,id(7)));
});
