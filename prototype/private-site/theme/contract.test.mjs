import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {content} from './content.mjs';
test('three-page content remains unpublished and derives exact approved drafts without invented operational facts',async()=>{
 const c=await content();assert.deepEqual(c,JSON.parse(await readFile(new URL('./content.json',import.meta.url))));
 assert.equal(c.public_ready,false);assert.equal(c.pages.length,3);assert.deepEqual(c.pages.map(p=>p.kind),['product','control','control']);assert.ok(c.blockers.includes('retention_and_deletion'));assert.ok(c.blockers.includes('actual_smtp_analytics_third_parties'));
 const privacy=JSON.stringify(c.pages[2]);for(const fact of ['古德茉莉科技股份有限公司','Good Morning Digital Co., Ltd.','hello@gmdgrowth.com','AWS','Supabase','新加坡','Zoho','美國','Brevo Free','待核'])assert.ok(privacy.includes(fact));assert.doesNotMatch(privacy,/保存[0-9]+日|已啟用SMTP|已符合GDPR/);
 const template=await readFile(new URL('./growth-private/index.php',import.meta.url),'utf8');assert.equal((template.match(/itemprop="description"/g)||[]).length,1);assert.equal((template.match(/itemprop="name"/g)||[]).length,1);assert.doesNotMatch(template,/str_replace.*<p>|<form|analytics|aggregateRating|offers/);assert.match(template,/growth_product_page_id/);assert.match(template,/growth_page_kind/);
});
