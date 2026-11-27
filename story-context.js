import { matchingCharacter, nameKey } from './diary-cast.js';
const clean=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
export function storyContext(state,archive){
    const found=(Array.isArray(state?.storyContexts)?state.storyContexts:[]).find(x=>x?.archive===archive);
    return {archive,setting:clean(found?.setting,4000),authors:(Array.isArray(found?.authors)?found.authors:[]).filter(x=>x&&typeof x.name==='string').map(x=>({name:clean(x.name,120),text:clean(x.text,1500)})).filter(x=>x.name&&x.text)};
}
export function saveStoryContext(state,context){state.storyContexts=[...(Array.isArray(state.storyContexts)?state.storyContexts:[]).filter(x=>x?.archive!==context.archive),storyContext({storyContexts:[context]},context.archive)];}
export function authorName(roster,name){return matchingCharacter(roster,name)?.name||name;}
export function authorEntry(context,roster,name){const canonical=nameKey(authorName(roster,name));return context.authors.find(x=>!x.generated&&nameKey(x.name)===nameKey(name))||context.authors.find(x=>!x.generated&&nameKey(authorName(roster,x.name))===canonical)||context.authors.find(x=>nameKey(x.name)===nameKey(name))||context.authors.find(x=>nameKey(authorName(roster,x.name))===canonical);}
export function authorNote(context,roster,name){return authorEntry(context,roster,name)?.text||'';}
export function authorBackground(ctx,roster,name,context){
    const canonical=authorName(roster,name), person=matchingCharacter(roster,canonical);
    const names=new Set([canonical,...(person?.aliases||[]).filter(a=>matchingCharacter(roster,a)===person)].map(nameKey));
    const cards=ctx.characters||[],group=ctx.groupId!=null?ctx.groups?.find(g=>String(g.id)===String(ctx.groupId)):null;
    const relevant=group?cards.filter(c=>group.members?.includes(c.avatar)):[cards[ctx.characterId]].filter(Boolean);
    const matched=relevant.filter(c=>names.has(nameKey(c.name||c.data?.name)));
    const data=matched.length===1?(matched[0].data||matched[0]):{};
    const entry=authorEntry(context,roster,name),manual=entry?.text;
    return [manual&&(entry.generated?'Author identity (scan-generated, interpretive background only): ':'Author identity (user supplied; takes priority): ')+manual, 'Diary author: '+canonical, person?.aliases?.length?'Known aliases: '+person.aliases.join(', '):'', clean(data.description,1800)&&'Matching card description (background only): '+clean(data.description,1800), clean(data.personality,1000)&&'Matching card personality: '+clean(data.personality,1000)].filter(Boolean).join('\n');
}
export function settingBlock(context){return context.setting?'\n\nSTORY SETTING (interpretive background only, not new event evidence or character knowledge):\n'+context.setting:'';}
