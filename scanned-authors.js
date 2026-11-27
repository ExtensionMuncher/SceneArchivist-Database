// Optional diary metadata collected by the existing structured extraction request.
// No new requests, no change to event evidence, no automatic diary creation.
import * as M from './memory-engine.js';
import { nameKey, usableName, matchingCharacter } from './diary-cast.js';
const list=v=>Array.isArray(v)?v:[];
const clean=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
const individual=n=>usableName(n)&&! /^(?:a|an|the)\s|\b(?:students|classmates|staff|researchers|bystanders|family|teacher|cashier|librarian|hollow|people|members|guards|agents|spectators|pedestrians|children|friends)\b/i.test(n);
const same=(roster,a,b)=>nameKey(a)===nameKey(b)||!!(matchingCharacter(roster,a)&&matchingCharacter(roster,a)===matchingCharacter(roster,b));
const seen=(authors,roster,n)=>authors.some(a=>same(roster,a.name,n));
const current=e=>!!e&&M.active(e)&&!e.disable&&M.record(e)?.status==='current';
const ambiguous=(roster,name)=>roster.filter(c=>[c.name,...(c.aliases||[])].some(n=>nameKey(n)===nameKey(name))).length>1;
const contains=(text,name)=>{
    const escaped=nameKey(name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`,'u').test(nameKey(text));
};
export function authorExtractionInstructions(context,fragments=[]){
    // Only relevant, bounded names; don't grow the prompt with the whole cast.
    const known=context.authors.map(a=>a.name).filter(n=>fragments.some(e=>contains(e.content,n))).slice(0,12);
    return '\nOptional top-level "diaryAuthors":[{"name":"exact individual name in source","identity":"established role, pronouns (unknown if uncertain), characterization","voice":"first-person diary diction and emotional register","sourceIds":["supplied source id"]}]. At most 6 profiles, 60 words per profile. Named individuals only; omit generic roles, groups, invented facts, private thoughts and future knowledge. Use observed behavior/dialogue, provisional voice for sparse evidence. Never guess gender from names. Prioritize records; omit profiles if short of output space. No diaries. Already profiled: '+JSON.stringify(known)+'.';
}
export function attachScannedAuthors(records,raw,fragments,roster,context,fullInputs=fragments){
    // Optional metadata must never invalidate an otherwise valid extraction.
    const parsed=typeof raw==='string'?M.parseJSON(raw):raw;
    const byId=new Map(fragments.map(e=>[M.record(e).id,e]));
    const full=new Map(fullInputs.map(e=>[M.record(e).id,e]));
    const accepted=[];
    for(const p of list(parsed?.diaryAuthors).slice(0,6)){
        const name=clean(p?.name,120),identity=clean(p?.identity,700),voice=clean(p?.voice,650);
        if(!individual(name)||ambiguous(roster,name)||!identity||!voice||seen([...context.authors,...accepted],roster,name))continue;
        const ids=list(p.sourceIds);
        if(!ids.length||ids.length>6||ids.some(id=>typeof id!=='string'||!byId.has(id)||!full.has(id)))continue;
        const uniqueIds=[...new Set(ids)];
        if(!uniqueIds.some(id=>contains(byId.get(id).content,name)))continue;
        // Only a record actually citing the profile's evidence can carry it into the approved database.
        // Prefer a record about the author, then another record from the same source(s).
        const candidates=records.filter(r=>r.status==='current'&&uniqueIds.every(id=>r.derivedFrom.includes(id)));
        const target=candidates.find(r=>[r.subject,...list(r.people)].some(n=>same(roster,n,name)))||candidates[0];
        if(!target)continue;
        const canonical=matchingCharacter(roster,name)?.name||name;
        if(!individual(canonical)||seen([...context.authors,...accepted],roster,canonical))continue;
        const profile={name:canonical,text:identity+'\n\nVoice / style direction: '+voice,sourceIds:uniqueIds,sourceHashes:Object.fromEntries(uniqueIds.map(id=>[id,M.hash(full.get(id).content)]))};
        (target.scannedDiaryAuthors??=[]).push(profile);accepted.push(profile);
    }
    return records;
}
// A profile keeps its own immutable receipts, rather than inheriting later
// rebuild hashes from the carrier record. Older db.36 profiles are accepted
// only on unrevised, current carriers with matching original source hashes.
export function validProfile(p,e,byId){
    const r=M.record(e),ids=list(p?.sourceIds);
    if(!current(e)||!ids.length||ids.length>6||ids.some(id=>typeof id!=='string'))return false;
    if(p.carrierHash ? p.carrierHash!==M.hash(e.content) : list(r.revisions).length>0)return false;
    return ids.every(id=>list(r.derivedFrom).includes(id)&&current(byId.get(id))&&r.derivedHashes?.[id]===M.hash(byId.get(id).content)&&
        (!p.sourceHashes || (Object.hasOwn(p.sourceHashes,id)&&p.sourceHashes[id]===r.derivedHashes[id])));
}
export function storeProfiles(entry,profiles,entries,roster){
    const r=M.record(entry),byId=new Map(entries.filter(M.record).map(e=>[M.record(e).id,e]));
    if(!current(entry)||r.protection?.locked||r.protection?.exact||r.protection?.detailed)return false;
    const existing=list(r.scannedDiaryAuthors),next=[...existing];
    for(const p of list(profiles)){
        if(!individual(p?.name)||ambiguous(roster,p.name)||!clean(p.text,1500)||!p.sourceHashes)continue;
        const candidate={...p,carrierHash:M.hash(entry.content)};
        if(!validProfile(candidate,entry,byId))continue;
        if(next.some(a=>same(roster,a?.name,p.name)&&validProfile(a,entry,byId)))continue;
        // Replace stale same-author metadata; do not append duplicates on resume.
        for(let i=next.length-1;i>=0;i--)if(same(roster,next[i]?.name,p.name))next.splice(i,1);
        next.push(candidate);
    }
    if(M.hash(next)===M.hash(existing))return false;
    r.scannedDiaryAuthors=next;
    return true;
}
export function withScannedAuthors(context,entries,roster){
    const authors=context.authors.map(a=>({...a}));
    const active=entries.filter(current),byId=new Map(active.map(e=>[M.record(e).id,e]));
    for(const e of active){
        const r=M.record(e);
        if(!['knowledge','fact','thread'].includes(r.type))continue;
        for(const p of list(r.scannedDiaryAuthors)){
            const name=clean(p?.name,120),text=clean(p?.text,1500);
            if(!individual(name)||!text||ambiguous(roster,name)||seen(authors,roster,name)||!validProfile(p,e,byId))continue;
            const person=matchingCharacter(roster,name);
            if(!person)continue;
            authors.push({name:person.name,text,generated:true});
        }
    }
    return {...context,authors};
}
