// Per-request override, never mutate a selected preset or active RP settings.
export function isGLMDiaryProfile(route,request){return !!request?.diaryRequest&&route.api==='openai'&&route.provider==='custom'&&/(?:^|\/)glm-5\.3(?:-flash)?$/i.test(route.model);}
export function diaryProfileOverride(route,request,preset,parseYaml,stringifyYaml){
    if(!isGLMDiaryProfile(route,request))return {};
    const raw=preset?.custom_include_body||'';
    const parsed=raw?parseYaml(raw):{};
    const body=Array.isArray(parsed)?Object.assign({},...parsed.filter(x=>x&&typeof x==='object'&&!Array.isArray(x))):parsed&&typeof parsed==='object'?{...parsed}:{};
    body.reasoning_effort='low';
    if(body.thinking?.type==='disabled')body.thinking={...body.thinking,type:'enabled'};
    const rawExclude=preset?.custom_exclude_body||'';
    const exclude=rawExclude?parseYaml(rawExclude):[];
    return {reasoning_effort:'low',custom_include_body:stringifyYaml(body),...(Array.isArray(exclude)&&exclude.includes('reasoning_effort')?{custom_exclude_body:stringifyYaml(exclude.filter(x=>x!=='reasoning_effort'))}:{})};
}
