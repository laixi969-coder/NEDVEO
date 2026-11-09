import{jsx as rawJsx,jsxs as rawJsxs,Fragment as RawFragment}from'react/jsx-runtime';import{useSyncExternalStore,createContext,useContext}from'react';import dictionary from'./en.json';
export type{JSX}from'react/jsx-runtime';
let locale=localStorage.getItem('nedveo.locale')==='en'?'en':'zh';const listeners=new Set<()=>void>();
export const getLocale=()=>locale;
export function setLocale(value:string){locale=value==='en'?'en':'zh';localStorage.setItem('nedveo.locale',locale);for(const fn of listeners)fn()}
export function translate(text:string){if(locale!=='en')return text;const normalized=text.replace(/\s+/g,' ').trim(),translated=(dictionary as Record<string,string>)[normalized];return translated?text.match(/^\s*/)?.[0]+translated+(text.match(/\s*$/)?.[0]||''):text}
function subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}}
const Preserve=createContext(false);
export function Native({tag,raw}:any){const preserve=useContext(Preserve)||raw?.['data-no-translate']===true||['blockquote','pre','code'].includes(tag)||/(?:evidence-item|task-evidence|claim-audit)/.test(raw?.className||'');useSyncExternalStore(subscribe,getLocale,getLocale);const props={...raw},original=props.children;if(tag==='option'&&props.value===undefined&&typeof original==='string')props.value=original;if(!preserve){for(const key of ['placeholder','title','aria-label','alt'])if(typeof props[key]==='string')props[key]=translate(props[key]);props.children=Array.isArray(original)?original.map((v:any)=>typeof v==='string'?translate(v):v):typeof original==='string'?translate(original):original;}return rawJsx(Preserve.Provider,{value:preserve,children:rawJsx(tag,props)})}
export function jsx(type:any,props:any,key?:any){return typeof type==='string'?rawJsx(Native,{tag:type,raw:props},key):rawJsx(type,props,key)}
export const jsxs=jsx;export const Fragment=RawFragment;
