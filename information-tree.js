import * as M from './memory-engine.js';
import {castNames} from './diary-cast.js';
// Derived, read-only view. Build only from already audience/time-filtered records.
// Stable paths and evidence IDs are navigational metadata, never independent canon.
const labels={unit:'Chronology',recap:'Recaps',knowledge:'Characters',memory:'Characters',fact:'Facts and entities',thread:'Threads',clip:'Clips'};
const clean=x=>String(x||'').replace(/\s+/g,' ').trim().slice(0,160);
const key=x=>clean(x).normalize('NFKC').toLowerCase();
export const pathId=parts=>parts.map(p=>encodeURIComponent(key(p))).join('/');
export function describe(entry,canonicalName=x=>x) {
    const r=M.record(entry); if(!r||!labels[r.type]||!M.active(entry)||entry.disable)return null;
    const note=String(r.id).startsWith('little-'), type=note?'Little Things':labels[r.type];
    const resolved=clean(canonicalName(r.subject)), subject=resolved||clean(r.subject), n=r.unit?.number;
    const first=String(entry.content||'').split('\n').find(l=>/^\s*[-*]\s+\S/.test(l))?.replace(/^\s*[-*]\s+/,'')||M.title(entry);
    const summary=clean(r.type==='memory'?`${String(entry.content||'').split('\n').filter(l=>/^[-*]\s+\S/.test(l)).length} memory items; first: ${first}`:first), title=clean(M.title(entry));
    let paths;
    if(note)paths=[[type,clean(canonicalName((r.people||[])[0]))||'Other']];
    else if(r.type==='unit')paths=[[type,`${r.unit?.label||'Scene'} ${Number.isInteger(n)?Math.floor((n-1)/10)*10+1:'unknown'}${Number.isInteger(n)?'–'+(Math.floor((n-1)/10)*10+10):''}`]];
    else if(r.type==='knowledge'||r.type==='memory')paths=[[type,resolved||'Unresolved identities',r.type==='memory'?'Memories':'Knowledge']];
    else if(r.type==='thread')paths=[[type,subject||'Unassigned']];
    else paths=[[type,subject||'General']];
    // Secondary facets are nonexclusive cross-links. Entity subjects are not cast.
    for(const name of M.unique([r.subject,...(r.people||[]),...(r.cast||[]).flatMap(castNames)]).slice(0,24)){const p=clean(canonicalName(name));if(p)paths.push(['People referenced',p]);}
    for(const place of M.unique([...(r.locations||[]),...(r.scenes||[]).map(s=>String(s).includes('·')?String(s).split('·').slice(1).join('·').trim():'')]).slice(0,10)){if(clean(place))paths.push(['Locations',clean(place)]);}
    for(const date of new Set((r.dates||[]).map(M.fullDate).filter(d=>d!=null).map(d=>new Date(d).toISOString().slice(0,10))))paths.push(['Dates',date.slice(0,7),date]);
    const aliases=M.unique([r.subject,...(r.aliases||[]),...(entry.key||[]),...(r.people||[]),...(r.locations||[]),...(r.dates||[])]).map(clean).slice(0,30);
    return {id:r.id,title,summary,paths,aliases,entry};
}
export function buildTree(entries,canonicalName) {
    const root={id:'',label:'Archive',children:new Map(),leaves:new Map(),records:new Set()};const nodes=new Map([['',root]]),records=new Map();
    for(const entry of entries){const d=describe(entry,canonicalName);if(!d||records.has(d.id))continue;records.set(d.id,d);
        for(const path of d.paths){let node=root;node.records.add(d.id);for(let i=0;i<path.length;i++){const id=pathId(path.slice(0,i+1));if(!nodes.has(id)){const child={id,label:path[i],children:new Map(),leaves:new Map(),records:new Set()};nodes.set(id,child);node.children.set(id,child);}node=nodes.get(id);node.records.add(d.id);}node.leaves.set(d.id,d);}
    }
    return {root,nodes,records};
}
export function browseTree(tree,branch='',page=1,pageSize=18,query='') {
    const node=tree.nodes.get(String(branch||''));if(!node)return {error:'Branch unavailable in this scope.'};
    let rows=[...node.children.values()].sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true})).map(n=>({kind:'folder',id:n.id,label:n.label,count:n.records.size}));
    rows.push(...[...node.leaves.values()].map(x=>({kind:'entry',id:x.id,label:x.title,summary:x.summary})));
    const terms=M.queryTerms(String(query||'').slice(0,200));
    if(terms.length){
        const score=(s)=>{const words=new Set(M.queryTerms(s));return terms.reduce((n,t)=>n+(words.has(t)?1:0),0);};
        const folders=[...tree.nodes.values()].filter(n=>n.id&&n.id!==node.id&&(!node.id||n.id.startsWith(node.id+'/'))).map(n=>({kind:'folder',id:n.id,label:n.label,count:n.records.size,score:score(n.label)*3}));
        const leaves=[...node.records].map(id=>tree.records.get(id)).map(d=>({kind:'entry',id:d.id,label:d.title,summary:d.summary,score:score(d.title)*3+score(d.summary)*2+score(d.aliases.join(' '))}));
        rows=[...folders,...leaves].filter(r=>r.score>0).sort((a,b)=>b.score-a.score||a.label.localeCompare(b.label)).map(({score,...r})=>r);
    }
    const count=rows.length, pages=Math.max(1,Math.ceil(count/pageSize)),p=Math.max(1,Math.min(pages,Math.floor(Number(page)||1)));
    return {branch:node.id,label:node.label,totalRecords:node.records.size,matchedRows:count,page:p,pages,rows:rows.slice((p-1)*pageSize,p*pageSize)};
}
export function treeText(entry,canonicalName) {const d=describe(entry,canonicalName);return d?[...d.paths.map(p=>p.join(' / ')),d.title,d.summary,...d.aliases].join('\n'):'';}
// Exact read with explicit pagination. Never silently truncate a long record.
export function readTreeEntries(tree,ids,page=1,limit=7000) {
    const selected=M.unique(Array.isArray(ids)?ids:[]).slice(0,5);if(!selected.length)return 'Supply exact record IDs returned by the tree or search.';
    const out=[];let remaining=limit;
    for(const id of selected){const d=tree.records.get(id);if(!d){out.push(`${id}: unavailable in this scope.`);continue;}
        const size=1800,chunks=[],content=String(d.entry.content||'');
        for(let start=0;start<content.length;){let end=Math.min(content.length,start+size);if(end<content.length){const nl=content.lastIndexOf('\n',end-1);if(nl>=start+size/2)end=nl+1;if(/[\uD800-\uDBFF]/.test(content[end-1]))end--;}chunks.push(content.slice(start,end));start=end;}if(!chunks.length)chunks.push('');
        const p=Math.max(1,Math.floor(Number(page)||1));if(p>chunks.length){out.push(`${id}: part ${p} does not exist (${chunks.length} parts).`);continue;}
        const text=`SOURCE ${id} · ${d.title} · part ${p}/${chunks.length}\n${chunks[p-1]}`;
        if(text.length>remaining){out.push('Further requested records exceed the read allowance. Read separately.');break;}remaining-=text.length+2;out.push(text);
    }return out.join('\n\n');
}
