// Inline script source that rewrites every root-absolute /api/* and /uploads/*
// URL the app emits at runtime so the app works behind the music-apps reverse
// proxy at /<slug>. Next.js auto-prefixes <Link>, next/image, and route
// handlers via basePath, but NOT plain fetch / XHR / HTMLMediaElement.src /
// HTMLImageElement.src / setAttribute / new Audio(). This shim covers those.
//
// Usage in a Next.js root layout:
//
//     import { basepathShimSource } from "@music-apps/shared";
//
//     <script dangerouslySetInnerHTML={{ __html: basepathShimSource("/shreddy") }} />
//
// The script is intentionally a single dense IIFE so it stays small in the
// SSR-rendered HTML head.

export function basepathShimSource(basePath: string): string {
  // The slug ends with no trailing slash so concatenation stays predictable.
  const bp = basePath.replace(/\/+$/, "");
  // JSON.stringify keeps escaping safe even if a future basePath has odd chars.
  const BP = JSON.stringify(bp);
  return `(function(){
var BP=${BP};
function fix(u){
  if(typeof u!=='string')return u;
  if(u.indexOf('/api/')===0||u.indexOf('/uploads/')===0)return BP+u;
  return u;
}
function fixAbs(u){
  // Handles full URLs like https://host/api/x — rewrites pathname only.
  try{
    var url=new URL(u,location.href);
    if(url.origin===location.origin&&(url.pathname.indexOf('/api/')===0||url.pathname.indexOf('/uploads/')===0)){
      url.pathname=BP+url.pathname;
      return url.toString();
    }
  }catch(e){}
  return u;
}
// 1) fetch()
var of=window.fetch;
window.fetch=function(i,o){
  if(typeof i==='string')i=fix(i);
  else if(i&&typeof i==='object'&&i.url){
    var nu=fixAbs(i.url);
    if(nu!==i.url)i=new Request(nu,i);
  }
  return of.call(this,i,o);
};
// 2) XHR
var oo=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(m,u){
  arguments[1]=fix(u);
  return oo.apply(this,arguments);
};
// 3) HTMLMediaElement.src setter (audio / video tags + element.src=)
function patchSrc(proto){
  var d=Object.getOwnPropertyDescriptor(proto,'src');
  if(d&&d.set){
    Object.defineProperty(proto,'src',{
      configurable:true,enumerable:d.enumerable,
      get:d.get,
      set:function(v){d.set.call(this,fix(v));}
    });
  }
}
if(window.HTMLMediaElement)patchSrc(HTMLMediaElement.prototype);
if(window.HTMLImageElement)patchSrc(HTMLImageElement.prototype);
if(window.HTMLSourceElement)patchSrc(HTMLSourceElement.prototype);
// 4) new Audio(url) — Audio is a function alias for HTMLAudioElement that takes a src.
var OA=window.Audio;
if(OA){
  window.Audio=function(u){return new OA(u==null?u:fix(u));};
  window.Audio.prototype=OA.prototype;
}
// 5) setAttribute('src'|'href'|'srcset', ...) — for declarative or imperative cases
//    the property-setter patch above doesn't cover.
var osa=Element.prototype.setAttribute;
Element.prototype.setAttribute=function(name,value){
  if(name==='src'||name==='href'){
    value=fix(value);
  }
  return osa.call(this,name,value);
};
})();`;
}
