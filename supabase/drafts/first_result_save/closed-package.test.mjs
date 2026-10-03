import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {checkClosedPackage} from './closed-package-checks.mjs';
test('single-DO closed deployment candidate (isolated PGlite, no hosted-history claim)',async()=>{
 const db=await PGlite.create();
 try{await checkClosedPackage({exec:q=>db.exec(q),scalar:async q=>Object.values((await db.query(q)).rows[0])[0]},'PGlite',{pglite:true});}
 finally{await db.close();}
});
