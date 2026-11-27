// Server-persisted standalone data. No World Info writes, attachment or injection.
// The legacy entries envelope is retained for source receipts, journals and portable backups.
const copy = x => JSON.parse(JSON.stringify(x));
const canonical = x => Array.isArray(x) ? `[${x.map(canonical).join(',')}]` : x && typeof x === 'object' ? `{${Object.keys(x).sort().map(k=>`${JSON.stringify(k)}:${canonical(x[k])}`).join(',')}}` : JSON.stringify(x);
const valid = x => x && typeof x === 'object' && x.entries && typeof x.entries === 'object' && !Array.isArray(x.entries);
const CATALOG='scene-archivist-db-catalog-v1.json';
const filePattern=/^scene-archivist-db-[a-zA-Z0-9-]+\.json$/;
function base64(text) { const bytes=new TextEncoder().encode(text); let binary=''; for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(binary); }
export function makeDatabaseEntry(_name,data) {
    data.entries ||= {}; let uid=0; while(Object.hasOwn(data.entries,uid))uid++;
    const e={uid,key:[],keysecondary:[],comment:'',content:'',constant:false,vectorized:false,selective:true,selectiveLogic:0,order:100,position:0,disable:false,ignoreBudget:false,depth:4,role:0,outletName:'',displayIndex:uid};
    data.entries[uid]=e;return e;
}
export function createDatabaseIO({fetch:request=(...a)=>globalThis.fetch(...a),requestHeaders=()=>({}),assert=()=>{},catalogName=CATALOG,onCatalog=()=>{}}={}) {
    let catalog={schema:1,files:[]},loaded=false;
    const find=name=>catalog.files.find(e=>e.name===name);
    const names=()=>catalog.files.map(e=>e.name);
    async function readFile(name,missing=false) {
        assert();const res=await request('/user/files/'+encodeURIComponent(name),{cache:'no-store'});assert();
        if(res.status===404&&missing)return null;
        if(!res.ok)throw new Error(`Archive file read failed: ${name} (HTTP ${res.status}). Restore a database backup; do not rescan.`);
        return res.json();
    }
    async function writeFile(name,data) {
        assert();const expected=copy(data);
        const res=await request('/api/files/upload',{method:'POST',headers:requestHeaders(),body:JSON.stringify({name,data:base64(JSON.stringify(expected))})});
        assert();if(!res.ok)throw new Error(`Archive file save failed (HTTP ${res.status}): ${name}`);
        const actual=await readFile(name);if(canonical(actual)!==canonical(expected))throw new Error('Archive save could not be verified; review before retrying.');return actual;
    }
    async function refresh() {
        const next=await readFile(catalogName,true);
        if(!next&&loaded&&catalog.files.length)throw new Error('Archive catalog disappeared. Restore a backup; no writes attempted.');
        if(next&&(!Array.isArray(next.files)||next.schema!==1||next.files.some(e=>typeof e.name!=='string'||!filePattern.test(e.file))||new Set(next.files.map(e=>e.name)).size!==next.files.length||new Set(next.files.map(e=>e.file)).size!==next.files.length))throw new Error('Archive catalog is invalid. No writes attempted.');
        catalog=next||{schema:1,files:[]};loaded=true;onCatalog(names());return names();
    }
    async function readFresh(name) {
        const item=find(name); if(!item)return null;
        const data=await readFile(item.file);if(!valid(data))throw new Error(`Invalid archive data: ${name}`);return data;
    }
    async function saveConfirmed(name,data) {
        if(!valid(data))throw new Error('Invalid archive data.');
        const item=find(name);if(!item)throw new Error(`Archive "${name}" is not in standalone storage. Migrate it first.`);
        return writeFile(item.file,data);
    }
    // Copy all data and verify each file BEFORE publishing a catalog pointer.
    // A failed copy never replaces or edits the native lorebook source.
    async function createMany(books) {
        await refresh();const before=copy(catalog),pending=[];
        for(const [name,data] of Object.entries(books)) {
            if(!name.trim()||!valid(data))throw new Error('Invalid database name or data.');
            if(find(name))throw new Error(`Database "${name}" already exists.`);
            const id=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const file=`scene-archivist-db-${id}.json`;
            await writeFile(file,data);pending.push({name,file});
        }
        // Refuse a known concurrent catalog edit rather than overwrite it.
        await refresh();if(canonical(before)!==canonical(catalog))throw new Error('Archive catalog changed during copy. Refresh and retry.');
        const next={schema:1,files:[...catalog.files,...pending]};
        await writeFile(catalogName,next);catalog=next;onCatalog(names());return names();
    }
    return {refresh,names,has:name=>!!find(name),readFresh,saveConfirmed,createMany};
}
