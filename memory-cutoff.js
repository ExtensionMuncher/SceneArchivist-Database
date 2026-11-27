// Read-only temporal views. Never modify a stored memory list or its receipts.
import * as M from './memory-engine.js';
import * as Core from './core.js';
import {memoryBlocks} from './memory-retrieval.js';
import {memoryEvidenceIndex} from './memory-provenance.js';

// A range is eligible only when its END has passed. Reject incomplete or
// qualified dates rather than interpreting a scene number as a calendar date.
export function explicitDays(value) {
    let s=String(value||'').trim();
    if(!s||/\b(?:unknown|circa|before|after|about)\b|\?/i.test(s))return [];
    // Parenthesized clock times, dayparts and scene references are annotations,
    // not calendar endpoints. Keep any annotation that could name another day.
    const calendarWord=/\b(?:January|February|March|April|May|June|July|August|September|October|November|December|day|days|week|weeks|month|months|year|years|tomorrow|yesterday|midnight)\b|\d{4}-\d{2}-\d{2}/i;
    s=s.replace(/\s*\(([^()]*)\)\s*$/, (all,detail)=>calendarWord.test(detail)?all:'');
    const iso=s.match(/\b\d{4}-\d{2}-\d{2}(?!\d)/g)||[];
    const named=s.match(/\b(?:(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December),?\s+\d{4})\b/gi)||[];
    const full=[...iso,...named];
    if(full.length){
        if(full.length===1&&/(?:\b(?:to|through|until)\b|[–—]|\s-\s)/i.test(s))return [];
        const dates=full.map(M.calendarDay);return dates.every(Boolean)?M.unique(dates):[];
    }
    return [];
}

export function memoryParts(parent) {
    const r=M.record(parent);if(r?.type!=='memory'||r.covers?.length)return [];
    const blocks=memoryBlocks(parent.content,true);if(!blocks.length)return [];
    const lines=String(parent.content).split('\n'), support=memoryEvidenceIndex(parent);
    const parts=[];
    for(const block of blocks){
        const content=[...block.context.map(i=>lines[i]),lines.slice(block.start,block.end+1).join('\n')].join('\n\n');
        const items=Core.parseMemoryDoc(content);if(items.length!==1)return [];
        const bullet=items[0],provenance=support(content), dates=explicitDays(bullet.date);
        const learned=provenance.flatMap(x=>explicitDays(x.learnedAt));
        const citedDates=provenance.flatMap(x=>explicitDays(x.date));
        // An explicit but unknown date must not become known by inheriting a parent date.
        const uncertain=!!bullet.date&&!dates.length||provenance.some(x=>x.learnedAt&&!explicitDays(x.learnedAt).length);
        const available=uncertain?[]:M.unique([...dates,...learned,...citedDates]).sort();
        parts.push({block,bullet,content,provenance,dates:available});
    }
    return parts;
}

// Minimal, safe derived metadata: no parent-wide dates, places, source ranges,
// revision history, or keywords from subsequently acquired memories.
function view(parent,content,parts,id=M.record(parent).id){
    const r=M.record(parent), evidence=parts.flatMap(p=>p.provenance);
    const dates=M.unique(parts.flatMap(p=>p.dates)).sort();
    const meta={schema:r.schema,id,storyId:r.storyId,type:'memory',status:r.status,subject:r.subject,subjectAvatar:r.subjectAvatar,
        aliases:r.aliases||[],knowledge:r.knowledge,identityReviewed:r.identityReviewed,identityKind:r.identityKind,
        dates,people:M.unique([r.subject,...evidence.flatMap(x=>x.people||[])]),locations:M.unique(evidence.flatMap(x=>x.locations||[])),
        times:[],scenes:[],cast:[],covers:[],derivedFrom:[],revisions:[],memoryEvidence:evidence,
        contentHash:M.hash(content),lastContent:content,source:null,temporalView:true};
    if(Object.hasOwn(r,'branchDisabledFrom'))meta.branchDisabledFrom=r.branchDisabledFrom;
    return {...parent,content,key:[],keysecondary:[],comment:'Memories — '+(r.subject||''),sceneArchivist:meta};
}

export function memoryPartEntry(parent,part){
    const r=M.record(parent),parentHash=M.hash(parent.content),b=part.block;
    return {entry:view(parent,part.content,[part],`${r.id}~${parentHash.replace(':','-')}:${b.start+1}`),parent,
        provenance:part.provenance,excerpt:{fromLine:b.start+1,toLine:b.end+1,contextLines:b.context.map(i=>i+1),parentHash}};
}

export function projectMemory(parent,cutoff){
    if(!cutoff||M.record(parent)?.type!=='memory')return parent;
    if(!M.active(parent)||parent.disable)return null;
    const all=memoryParts(parent),parts=all.filter(p=>p.dates.length&&p.dates.every(d=>d<=cutoff));
    if(!parts.length)return null; // Unknown, complex, and mixed future ranges fail closed.
    const lines=String(parent.content).split('\n'),out=[],seen=new Set();
    for(const p of parts){for(const i of p.block.context){if(!seen.has(i)){out.push(lines[i],'');seen.add(i);}}
        out.push(lines.slice(p.block.start,p.block.end+1).join('\n'),'');}
    return view(parent,out.join('\n').trim()+'\n',parts);
}
export const projectMemories=(entries,cutoff)=>cutoff?entries.map(e=>projectMemory(e,cutoff)).filter(Boolean):entries;
export function resolveMemoryPart(parent,id){const p=memoryParts(parent).find(p=>memoryPartEntry(parent,p).entry.sceneArchivist.id===id);return p?memoryPartEntry(parent,p).entry:null;}
