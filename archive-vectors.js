import * as M from './memory-engine.js';
import {treeText} from './information-tree.js';
import {memoryParts,memoryPartEntry} from './memory-cutoff.js';
import {matchingCharacter} from './diary-cast.js';
// Independent configuration, server-side embeddings via ST's existing vector API.
// Never turn on native World Info injection or mutate Vector Storage preferences.
const TYPES = new Set(['unit','recap','knowledge','fact','thread','clip','memory']);
export function vectorConfig(w) {
    const o = w.options(), source = o.archiveVectorSource || 'ollama';
    if (!['ollama','vllm','llamacpp','transformers','openai','openrouter'].includes(source)) throw new Error('Select a supported embedding provider.');
    const model = String(o.archiveVectorModel || '').trim(), apiUrl = String(o.archiveVectorUrl || '').trim();
    if (!['transformers','llamacpp'].includes(source) && !model) throw new Error('Enter the embedding model ID in Archive vector search.');
    if (['ollama','vllm','llamacpp'].includes(source)) {
        let u; try { u = new URL(apiUrl); } catch { throw new Error('Enter the embedding server URL.'); }
        if (!['http:','https:'].includes(u.protocol) || u.username || u.password) throw new Error('Use an HTTP(S) server URL without credentials.');
    }
    const collectionId = 'scene-archivist-db-v1-' + M.hash([w.state().storyId, w.h.settings().lorebook, source, model, apiUrl]).replace(':','-');
    return { source, model, apiUrl, collectionId, keep: false };
}
export function archiveNoteEntry(note,storyId) {
    const content=`## ► Little Thing\n\n- ${note.text}`;
    return {content,key:note.cues||[],sceneArchivist:{schema:1,id:note.id,storyId,type:'fact',status:'current',dates:note.date?[note.date]:[],people:note.participants||[],locations:[],aliases:[],covers:[],derivedFrom:[],protection:{exact:!!note.quote},source:note.source,contentHash:M.hash(content),lastContent:content}};
}
export function vectorItems(entries, hash, canonicalName) {
    const byHash = new Map();
    for (const e of entries) {
        const r=M.record(e); if (!r?.id || !TYPES.has(r.type) || !M.active(e) || e.disable) continue;
        const content=String(e.content || ''); if (!content.trim()) continue;
        // Bounded overlapping chunks; original records remain authoritative.
        const parts=memoryParts(e);
        if(parts.length){
            for(const part of parts){
                const row=memoryPartEntry(e,part);
                // A bullet hash is independent of which other bullets are visible.
                const text=[r.subject,...(r.aliases||[]),part.content].filter(Boolean).join('\n');
                const h=hash(JSON.stringify([r.id,'memory-bullet-v1',text]));
                const prior=byHash.get(h);if(prior){if(M.record(prior.parent||prior.entry).id===r.id&&prior.text===text)continue;throw new Error('Vector identifier collision; index not changed.');}
                byHash.set(h,{hash:h,text,index:0,...row});
            }
            continue;
        }
        const treeMetadata=treeText(e,canonicalName);
        for(let start=0,i=0;start<content.length;start+=2000,i++) {
            const text=[treeMetadata, r.subject, ...(r.aliases||[]), ...(e.key||[]), content.slice(start,start+2200)].filter(Boolean).join('\n');
            const h=hash(JSON.stringify([r.id,M.hash(content),i,text]));
            if(byHash.has(h)){const prior=byHash.get(h);if(M.record(prior.entry).id===r.id&&prior.text===text)continue;throw new Error('Vector identifier collision; index not changed.');}
            byHash.set(h,{hash:h,text,index:i,entry:e,rerankText:content.slice(start,start+2200)});
        }
    }
    return byHash;
}
const canonicalFor=w=>{const roster=w.diaryRoster?.();return roster?name=>matchingCharacter(roster,name)?.name||'':undefined;};
async function api(w, action, body) {
    const resp=await fetch('/api/vector/'+action,{method:'POST',headers:w.h.requestHeaders(),body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
    if(!resp.ok) throw new Error(`Embedding ${action} failed (HTTP ${resp.status}). Verify provider/model and server connection.`);
    return action==='list'||action==='query'?resp.json():null;
}
export async function syncArchiveVectors(w, transport=api) {
    const config=vectorConfig(w), identity=w.identity(), check=()=>{if(identity!==w.identity()||config.collectionId!==vectorConfig(w).collectionId)throw new Error('Story or embedding settings changed; sync stopped.');};
    const items=vectorItems([...w.entries,...(w.littleThings?.()||[]).map(n=>archiveNoteEntry(n,w.state().storyId))],w.h.vectorHash,canonicalFor(w)), saved=await readIndex(w,config,transport); check();
    const missing=[...items.values()].filter(x=>!saved.has(x.hash));
    for(let i=0;i<missing.length;i+=16){ check(); await transport(w,'insert',{...config,items:missing.slice(i,i+16).map(({hash,text,index})=>({hash,text,index}))}); check(); w.vectorProgress?.(`Indexing ${Math.min(i+16,missing.length)}/${missing.length} new chunks…`); }
    const stale=[...saved].filter(h=>!items.has(h));
    if(stale.length){check();await transport(w,'delete',{...config,hashes:stale});}
    check();
    const verified=await readIndex(w,config,transport);check();
    const absent=[...items.keys()].filter(h=>!verified.has(h)).length;
    if(absent)throw new Error(`Index synchronization incomplete: ${absent} of ${items.size} chunks missing from server. Retry synchronization; existing chunks will be reused.`);
    return {records:new Set([...items.values()].map(x=>M.record(x.parent||x.entry).id)).size,chunks:items.size,added:missing.length,removed:stale.length};
}
async function readIndex(w,config,transport) {
    const saved=await transport(w,'list',config);
    if(!Array.isArray(saved)||saved.some(h=>!Number.isSafeInteger(Number(h))))throw new Error('Invalid vector index listing from SillyTavern.');
    return new Set(saved.map(Number));
}

// A search preview is an author-only diagnostic, not evidence returned to the RP model.
// Never call the embedding provider merely to discover an empty or outdated collection.
export async function inspectArchiveSearch(w, entries, topic, transport=api, candidateLimit) {
    const config=vectorConfig(w), opts=w.options(), identity=w.identity?.();
    const check=()=>{if(identity!==w.identity?.()||config.collectionId!==vectorConfig(w).collectionId)throw new Error('Story or embedding settings changed during search.');};
    const items=vectorItems(entries,w.h.vectorHash,canonicalFor(w));
    const topK=Math.max(1,Math.min(candidateLimit?40:30,Math.floor(Number(candidateLimit||opts.archiveVectorK)||8)));
    const threshold=Math.max(0,Math.min(1,Number(opts.archiveVectorThreshold)||0));
    const saved=await readIndex(w,config,transport);check();
    const indexed=[...items.keys()].filter(h=>saved.has(h)).length;
    const stats={expected:items.size,stored:saved.size,indexed,missing:items.size-indexed,threshold,raw:0,above:0,eligibleAbove:0,unmatched:0,near:0,limited:false};
    const rows=[];
    if(!items.size||!String(topic||'').trim()||!indexed)return {rows,stats};
    // ST ranks the whole collection before our date/character/branch filter.
    // Overfetch once if scope is narrower so unrelated high scores cannot
    // crowd out every eligible result. Bound network traffic for huge archives.
    const scoped=indexed<saved.size;
    const wanted=scoped?Math.max(topK*4,Math.min(saved.size,2048)):topK*4;
    const queryK=Math.min(saved.size,wanted);
    stats.limited=scoped&&queryK<saved.size;
    const out=await transport(w,'query',{...config,searchText:String(topic).slice(0,200),topK:queryK,threshold});check();
    if(!out||!Array.isArray(out.metadata)||!Array.isArray(out.hashes))throw new Error('Invalid vector query response from SillyTavern.');
    const raw=new Set(out.hashes.map(Number));stats.raw=raw.size;stats.above=out.metadata.length;
    const above=new Set();const seen=new Set();
    for(const meta of out.metadata){
        const h=Number(meta.hash),hit=items.get(h);
        if(!hit||!saved.has(h)||meta.text!==hit.text){stats.unmatched++;continue;}
        above.add(h);
        const id=M.record(hit.entry).id;if(seen.has(id)||rows.length>=topK)continue;seen.add(id);
        rows.push({entry:hit.entry,parent:hit.parent||hit.entry,excerpt:hit.excerpt||null,provenance:hit.provenance,rerankText:hit.rerankText,score:1/(rows.length+1),matchedTerms:[],queries:[topic]});
    }
    stats.eligibleAbove=above.size;
    stats.near=[...raw].filter(h=>items.has(h)&&saved.has(h)&&!above.has(h)).length;
    return {rows,stats};
}
export async function searchArchiveVectors(w, entries, topic, transport=api, candidateLimit) {
    return (await inspectArchiveSearch(w,entries,topic,transport,candidateLimit)).rows;
}
export function vectorSearchStatus(stats) {
    const s=stats;
    if(!s.expected)return 'No eligible archive chunks to search.';
    if(!s.stored)return 'The selected story/model index is empty. Synchronize archive index first.';
    if(!s.indexed)return 'None of the current chunks match the stored index. Synchronize to refresh outdated vectors.';
    if(!s.raw)return 'The vector server returned no ranked candidates despite having indexed chunks. Check the embedding model/server.';
    if(!s.above)return `The vector server ranked ${s.raw} candidates, but none passed similarity ${s.threshold}. Lower the threshold and test again.`;
    if(!s.eligibleAbove)return 'Ranked vectors did not match current eligible evidence. Synchronize if chunks are missing; check the active search scope.';
    return `${s.eligibleAbove} matching chunks passed similarity ${s.threshold}.`;
}
