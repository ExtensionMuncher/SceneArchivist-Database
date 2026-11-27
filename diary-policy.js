import { nameKey, matchingCharacter, usableName } from './diary-cast.js';
const names = values => [...new Set((Array.isArray(values)?values:[]).filter(v=>typeof v==='string').map(v=>v.trim()).filter(Boolean))];
// Exact reviewed aliases only; never merge people by a shared given name.
export function identityNames(roster, name) {
    const person=matchingCharacter(roster,name);
    return names([name,...(person?[person.name,...person.aliases.filter(a=>matchingCharacter(roster,a)===person)]:[])]);
}
export function sameIdentity(roster,a,b) {
    const aa=new Set(identityNames(roster,a).map(nameKey));
    return !!a&&!!b&&identityNames(roster,b).some(n=>aa.has(nameKey(n)));
}
export function policyFor(state,archive) {
    const stored=(Array.isArray(state?.diaryPolicies)?state.diaryPolicies:[]).find(p=>p?.archive===archive);
    return {archive,blocked:names(stored?.blocked),allowedPersona:names(stored?.allowedPersona)};
}
export function exclusion(policy,roster,persona,name) {
    if(policy.blocked.some(n=>sameIdentity(roster,n,name)))return 'Manually blacklisted';
    if(sameIdentity(roster,persona,name)&&!policy.allowedPersona.some(n=>sameIdentity(roster,n,name)))return 'Persona — excluded by default';
    return '';
}
export function setExcluded(policy,roster,persona,name,block) {
    const canonical=matchingCharacter(roster,name)?.name||name.trim();
    if(!usableName(canonical))throw new Error('Choose an individual character first.');
    const unrelated=n=>!sameIdentity(roster,n,canonical);
    const next={...policy,blocked:policy.blocked.filter(unrelated),allowedPersona:policy.allowedPersona.filter(unrelated)};
    if(block)next.blocked.push(canonical);
    else if(sameIdentity(roster,persona,canonical))next.allowedPersona.push(canonical);
    return next;
}
export function savePolicy(state,policy) {
    state.diaryPolicies=[...(Array.isArray(state.diaryPolicies)?state.diaryPolicies:[]).filter(p=>p?.archive!==policy.archive),policy];
}
