import * as M from './memory-engine.js';
import * as Core from './core.js';
import {matchingCharacter, nameKey, usableName} from './diary-cast.js';
import {verifiedNoteSource} from './little-things.js';
export function characterSources(entries, roster, name) {
    const person=matchingCharacter(roster,name); const names=new Set([name,...(person?[person.name,...person.aliases.filter(a=>matchingCharacter(roster,a)===person)]:[])].map(nameKey));
    const byId=new Map(entries.map(e=>[M.record(e)?.id,e]));
    return entries.filter(e=>{const r=M.record(e);return r?.type==='knowledge'&&r.status==='current'&&!e.disable&&M.active(e)&&usableName(r.subject)&&names.has(nameKey(r.subject))&&r.body?.trim()&&Object.entries(r.derivedHashes||{}).every(([id,hash])=>byId.has(id)&&M.hash(byId.get(id).content)===hash);});
}
export function sourceMoment(e,entries) {
    const r=M.record(e), linked=(r.derivedFrom||[]).map(id=>entries.find(x=>M.record(x)?.id===id)).filter(Boolean);
    const units=linked.filter(x=>M.record(x).type==='unit').sort((a,b)=>(M.record(a).unit?.number||0)-(M.record(b).unit?.number||0));
    const unit=M.record(units.at(-1))?.unit?.number??null;
    // The source scene's date is the scene of discovery, not necessarily the event date.
    const dates=M.unique(units.flatMap(x=>(M.record(x).dates||[]).map(M.calendarDay).filter(Boolean)));
    const date=M.calendarDay(r.learnedAt)||(dates.length===1?dates[0]:'');
    return {unit,date};
}
export function memoryProjection(entries,roster,unit='Scene'){
    const seen=new Set(), plans=[];
    for(const person of roster){
        const sources=characterSources(entries,roster,person.name).filter(e=>!seen.has(M.record(e).id));if(!sources.length)continue;
        const bullets=[],links=[];
        for(const e of sources){const r=M.record(e),{date,unit:n}=sourceMoment(e,entries);seen.add(r.id);
            const text=`${r.knowledge==='unaware'?'Knowledge boundary (not known): ':r.knowledge==='suspects'?'Suspicion: ':r.knowledge==='false-belief'?'Belief (may be false): ':r.knowledge==='hiding'?'Concealed knowledge: ':''}${r.body.trim().replace(/\s+/g,' ')}${r.howLearned?' (How learned: '+r.howLearned+')':''}`;
            const tag=n!=null?`[${unit} ${n}${date?', '+date:''}] `:date?`[Date: ${date}] `:'';
            const bullet=Core.parseMemoryDoc('- '+tag+text)[0];if(!bullet)continue;
            bullets.push(bullet); links.push({character:person.name,text:bullet.text,textHash:M.hash(bullet.text.replace(/\s+/g,' ').trim()),a:bullet.a,b:bullet.b,date:bullet.date||'',sourceIds:[r.id],learnedAt:r.learnedAt||'',howLearned:r.howLearned||'',citation:'existing structured knowledge; not new inference'});
        }
        if(bullets.length)plans.push({person,sources,content:Core.memoryDocText(person.name,M.tidyMemory(bullets,{removeExact:true}),{},unit),links});
    }
    return plans;
}
export function diaryNotes(entries,roster,name,notes,chat,sourceId){
    const person=matchingCharacter(roster,name),names=new Set([name,...(person?[person.name,...person.aliases.filter(a=>matchingCharacter(roster,a)===person)]:[])].map(nameKey));
    return (notes||[]).filter(n=>n.knows?.some(k=>names.has(nameKey(k)))&&verifiedNoteSource(n.source,sourceId,chat)&&(!n.quote||n.source.ranges.some(r=>r.messages.some(m=>String(chat[m.index]?.mes||'').includes(n.quote))))).map(n=>{
        const indices=new Set(n.source.ranges.flatMap(r=>r.messages.map(m=>m.index))),units=entries.filter(e=>M.record(e)?.type==='unit'&&M.active(e)&&M.record(e).source?.chatId===sourceId&&M.record(e).source.ranges?.some(r=>r.messages?.some(m=>indices.has(m.index))));
        const dates=M.unique(units.flatMap(e=>(M.record(e).dates||[]).map(M.calendarDay).filter(Boolean))),unit=units.length===1?M.record(units[0]).unit?.number:null;
        const date=M.calendarDay(n.date)||(dates.length===1?dates[0]:'');
        const content=`Known detail: ${n.text}${n.quote?'\nExact source excerpt (not necessarily the author’s own dialogue): '+n.quote:''}`;
        return {e:{content,sceneArchivist:{id:n.id,type:'knowledge',status:'current',subject:name,knowledge:'knows',source:n.source}},date,unit,note:n,receipt:M.hash(n)};
    });
}
export function diarySelection(entries,roster,name,{date='',from='',to='',used=[],notes=[],chat=[],sourceId=''}={}){
    const known=characterSources(entries,roster,name).filter(e=>M.record(e).knowledge!=='unaware'&&!used.includes(M.record(e).id));
    const rows=[...known.map(e=>({e,...sourceMoment(e,entries)})),...diaryNotes(entries,roster,name,notes,chat,sourceId).filter(x=>!used.includes(x.note.id))].sort((a,b)=>String(a.date).localeCompare(String(b.date))||(a.unit??-1)-(b.unit??-1)||(M.record(a.e).source?.ranges?.[0]?.from??0)-(M.record(b.e).source?.ranges?.[0]?.from??0));
    if(from!==''||to!==''){
        const min=from===''?0:Number(from),max=to===''?Infinity:Number(to);if(!Number.isInteger(min)||min<0||max<min||(max!==Infinity&&!Number.isInteger(max)))throw new Error('Enter a valid inclusive message range.');
        return rows.filter(({e})=>M.record(e).source?.ranges?.some(r=>r.from<=max&&r.to>=min)).filter(x=>!date||x.date===date);
    }
    if(date)return rows.filter(x=>x.date===date);
    const lastDate=rows.map(x=>x.date).filter(Boolean).sort().at(-1);if(lastDate)return rows.filter(x=>x.date===lastDate);
    const lastUnit=Math.max(-1,...rows.map(x=>x.unit??-1));return rows.filter(x=>(x.unit??-1)===lastUnit);
}
export function diaryRequest(name, rows, style='', date='', voice=''){
    return {system:`Write a short private fictional diary in ${name}'s own first-person voice. Use the named author identity and story setting to resolve pronouns; third-person references in evidence may describe someone else. Do not change the author's identity or import canon from another setting. Write directly, without analysis, headings, recap, or source IDs. Use only the personal evidence for events and knowledge; keep uncertainty and private perspective. Do not invent events or force emotional development. Match the length to the amount of evidence; one detail may need only a few sentences. ${style?'Style: '+style:''}`,prompt:`DIARY AUTHOR: ${name}\nSTORY DATE: ${date||'Unknown'}\nAUTHOR IDENTITY / VOICE (background only):\n${voice||'Use the named author and evidence. Do not guess pronouns or canon.'}\n\nPERSONAL EVIDENCE:\n${rows.map(({e,date,unit})=>`SOURCE ${M.record(e).id} | ${date||'unknown date'} | unit ${unit??'unknown'}\n${e.content}`).join('\n\n')}\n\nWrite the diary now.`,maxTokens:3500};
}

/** Reuse exactly the source identities of the saved diary, never its generated prose. */
export function regenerationRows(entries,roster,name,target,{notes=[],chat=[],sourceId=''}={}) {
    const r=M.record(target);
    const known=new Map(characterSources(entries,roster,name).filter(e=>M.record(e).knowledge!=='unaware').map(e=>[M.record(e).id,e]));
    const noteMap=new Map(diaryNotes(entries,roster,name,notes,chat,sourceId).map(x=>[x.note.id,x]));
    const ids=M.unique(r.derivedFrom||[]), refs=r.diaryNoteRefs||[];
    if(!ids.length&&!refs.length)throw new Error('This older diary has no personal-evidence receipts. Use Replace with selected period to rebuild it safely.');
    const rows=[];
    for(const id of ids){const e=known.get(id);if(!e)throw new Error('A saved diary source is missing or no longer belongs to this character. Use Replace with selected period to choose current evidence.');rows.push({e,...sourceMoment(e,entries)});}
    for(const id of M.unique(refs.map(n=>n.id))){const row=noteMap.get(id);if(!row)throw new Error('A saved diary detail is missing or no longer verified. Use Replace with selected period to choose current evidence.');rows.push(row);}
    return rows.sort((a,b)=>String(a.date).localeCompare(String(b.date))||(a.unit??-1)-(b.unit??-1)||(M.record(a.e).source?.ranges?.[0]?.from??0)-(M.record(b.e).source?.ranges?.[0]?.from??0));
}
