function annotateTerms(text){
  const tokens=text.split(/(\s+)/).filter(t=>t.length);const words=[];
  for(let i=0;i<tokens.length;i++){if(/^\s+$/.test(tokens[i]))continue;const tk=tokens[i];
    const lead=(tk.match(/^[^A-Za-z0-9]*/)||[""])[0];let trail=(tk.match(/[^A-Za-z0-9]*$/)||[""])[0];
    let core=tk.slice(lead.length,tk.length-trail.length);
    const dashIdx=core.search(/[—–]/);let internalDash=false;if(dashIdx>0){core=core.slice(0,dashIdx);internalDash=true;}
    const space=(tokens[i+1]&&/^\s+$/.test(tokens[i+1]))?tokens[i+1]:"";
    words.push({raw:tk,lead,core,trail,space,internalDash,cap:isCapCore(core),init:isInitial(core),allcaps:isAllCaps(core),
      connector:CONNECTORS.test(core),common:COMMON_CAP.test(core.replace(/\./,"")),attachNoun:ATTACH_NOUN.test(core),
      breaksAfter:/[,;:)]/.test(trail)||/[—–]$/.test(trail)||internalDash,breaksBefore:/[(]/.test(lead),endsSentence:/[.!?]$/.test(trail)});}
  let prevEnded=true;for(const w of words){w.sentStart=prevEnded;prevEnded=w.endsSentence&&!w.init&&!w.common;}
  const shortClip=words.length<=3;
  const isArticleCore=c=>/^(the|a|an)$/i.test(c);
  // proper-noun evidence: cores that appear capitalised away from a sentence start
  const midCap=new Set();
  for(const w of words){if((w.cap||w.allcaps)&&!w.sentStart&&!w.common&&!w.connector)midCap.add(w.core.replace(/['’]s$/,"").toLowerCase());}
  let out="",i=0;
  while(i<words.length){const w=words[i];
    const startArticle=w.cap&&isArticleCore(w.core)&&!w.endsSentence;
    const eligible=((w.cap||w.init)&&!w.common)||startArticle;
    if(!eligible){out+=w.raw+w.space;i++;continue;}
    let j=i,run=[];
    while(j<words.length){const x=words[j];
      if(x.breaksBefore&&run.length)break;
      if(((x.cap||x.init)&&!x.common)||(j===i&&startArticle)){run.push(x);if(x.breaksAfter){j++;break;}j++;continue;}
      // bridge over one or more consecutive connectors ("in the") to the next capitalised name
      if(x.connector&&!x.breaksAfter&&run.length){
        let k=j;while(k<words.length&&words[k].connector&&!words[k].breaksAfter&&!(k>j&&words[k].breaksBefore))k++;
        const nx=words[k];
        if(nx&&(nx.cap||nx.init)&&!nx.common&&!nx.breaksBefore){for(let m=j;m<k;m++)run.push(words[m]);j=k;continue;}
        break;}
      if(shortClip&&x.attachNoun&&run.length){run.push(x);j++;break;}
      break;}
    while(run.length&&run[run.length-1].connector){run.pop();}
    // a leading article ("The"/"A") only stays for a multi-word Title ("The Human Factor"); else emit it plainly
    if(run.length&&isArticleCore(run[0].core)){
      const realCaps=run.filter(r=>(r.cap||r.allcaps)&&!r.connector&&!r.init&&!isArticleCore(r.core)).length;
      if(realCaps<2){out+=run[0].raw+run[0].space;i++;continue;}
    }
    if(!run.length){out+=w.raw+w.space;i++;continue;}
    const realJ=i+run.length;
    const hasRealName=run.some(r=>(r.cap||r.allcaps)&&!r.connector&&!r.init&&!isArticleCore(r.core));
    const w0=run.find(r=>!isArticleCore(r.core))||run[0];
    const nameWords=run.filter(r=>!r.connector&&!isArticleCore(r.core));
    const single=nameWords.length===1;
    const possessive=/['’]s$/.test(w0.core);
    const recurs=midCap.has(w0.core.replace(/['’]s$/,"").toLowerCase());
    // a lone capitalised word is ambiguous if it merely opens a sentence: skip known lead-words always,
    // and skip any non-recurring single in a longer passage (real proper nouns usually recur or sit mid-sentence)
    const ambiguous=single&&w0.sentStart&&!w0.allcaps&&!w0.init&&!possessive&&
      ((SENTENCE_LEAD_STOP.test(w0.core)||w0.connector)||(!recurs&&words.length>1));
    if(hasRealName&&!ambiguous){const lead=run[0].lead,trail=run[run.length-1].trail;
      let display=run.map((r,k)=>{let s=r.raw;if(k===0)s=s.slice(lead.length);if(k===run.length-1)s=s.slice(0,s.length-trail.length);return s;}).join(" ");
      const term=lookupForm(display);const spaceAfter=run[run.length-1].space;
      if(term&&term.replace(/[^A-Za-z]/g,"").length>=3)out+=escHtml(lead)+`<span class="term" data-term="${escAttr(term)}">${escHtml(display)}</span>`+escHtml(trail)+spaceAfter;
      else out+=run.map(r=>r.raw+r.space).join("");}
    else out+=run.map(r=>r.raw+r.space).join("");
    i=Math.max(realJ,i+1);}
  return out.replace(/\s+$/,"");}

/* ---------- Wikipedia + Wiktionary ---------- */
const wikiCache={};
async function fetchWikiOne(title){
  try{const url="https://en.wikipedia.org/api/rest_v1/page/summary/"+encodeURIComponent(title);
    const r=await fetch(url);if(!r.ok)return null;const j=await r.json();
    return (j.type==="disambiguation"||!j.extract)?null:{title:j.title,extract:j.extract,link:j.content_urls?.desktop?.page,thumb:j.thumbnail?.source};}catch(e){return null;}}
async function fetchWiki(term){if(term in wikiCache)return wikiCache[term];
  const cands=[term];
  // "Rimbaud's Voyelles" / "Dürer's Melancholia" — try the full phrase first, then the work itself
  const pm=(term||"").match(/^(.+?)['’]s\s+(.+)$/);
  if(pm&&pm[2]&&pm[2].trim().length>=3)cands.push(pm[2].trim());
  let res=null;for(const t of cands){res=await fetchWikiOne(t);if(res)break;}
  wikiCache[term]=res;return res;}
const wiktCache={};
function stripTags(html){const d=document.createElement("div");d.innerHTML=html||"";return (d.textContent||"").trim();}
function compactText(s){return (s||"").replace(/\s+/g," ").replace(/\s+([,.;:!?])/g,"$1").trim();}
function cleanWiktionaryText(s){
  s=(s||"").replace(/<!--([\s\S]*?)-->/g," ").replace(/<ref[\s\S]*?<\/ref>/gi," ").replace(/<ref[^>]*\/>/gi," ");
  s=s.replace(/^\s*\|.*$/gm," ").replace(/^\s*\{\|[\s\S]*?\|\}\s*$/gm," ");
  let prev="";
  while(prev!==s&&/\{\{[^{}]*\}\}/.test(s)){
    prev=s;
    s=s.replace(/\{\{([^{}]*)\}\}/g,(m,inner)=>{
      const p=inner.split("|").map(x=>x.trim()).filter(Boolean);
      if(!p.length)return" ";
      const name=p[0].toLowerCase();
      if(/^(m|l|mention|term|bor|borrowed|der|derived|inh|inherited|cog|cognate|calque|back-form|compound|prefix|suffix|confix|af|blend|clipping)$/.test(name)){
        return p.slice(1).filter(x=>!/^(en|la|grc|gmw|gem-pro|ine-pro|enm|ang|fro|fr|it|es|de|nl|ar|he|ja|zh|ru|non|cel-pro)$/.test(x)&&!/^[a-z-]{2,8}$/.test(x)&&!/^(nocap|notext|sort=.*|tr=.*|t=.*|pos=.*)$/.test(x)).join(" ");
      }
      if(/^(lang|etyl|non-gloss definition|glossary)$/.test(name))return p.slice(2).join(" ");
      return " ";
    });
  }
  s=s.replace(/\[\[([^\]|#]*\|)?([^\]#|]*)\]\]/g,"$2").replace(/\[https?:\/\/[^\s\]]+\s*([^\]]*)\]/g,"$1");
  s=s.replace(/'''?/g,"").replace(/={2,}[^=]+={2,}/g," ").replace(/^[:*#;]+/gm," ");
  s=s.replace(/\([^)]*edit[^)]*\)/gi," ").replace(/\[[0-9]+\]/g," ");
  return compactText(s);
}
function extractEtymologyFromHtml(html){
  try{
    const doc=new DOMParser().parseFromString(html,"text/html");
    const heads=[...doc.querySelectorAll("h2,h3,h4,h5,h6")];
    const h=heads.find(x=>/^Etymology(?:\s+\d+)?$/i.test(compactText(x.textContent).replace(/\[edit\]/i,"")));
    if(!h)return"";
    const level=parseInt(h.tagName.slice(1),10);
    const bits=[];
    for(let n=h.nextElementSibling;n;n=n.nextElementSibling){
      if(/^H[2-6]$/.test(n.tagName)&&parseInt(n.tagName.slice(1),10)<=level)break;
      if(["P","UL","OL","DL"].includes(n.tagName)){
        const t=compactText(n.textContent);
        if(t&&!/^\[edit\]$/i.test(t))bits.push(t);
      }
      if(bits.join(" ").length>650)break;
    }
    return compactText(bits.join(" ")).slice(0,520);
  }catch(e){return"";}
}
function extractEtymologyFromWikitext(wt){
  try{
    let sec=wt||"";
    const en=sec.search(/^==\s*English\s*==\s*$/mi);
    if(en>=0){sec=sec.slice(en);const next=sec.slice(1).search(/^==[^=][\s\S]*?==\s*$/mi);if(next>=0)sec=sec.slice(0,next+1);}
    const re=/^(={3,5})\s*Etymology(?:\s+\d+)?\s*\1\s*$/gmi;
    const m=re.exec(sec);if(!m)return"";
    const level=m[1].length, rest=sec.slice(re.lastIndex);
    const next=new RegExp("^={2,"+level+"}\\s*[^=][\\s\\S]*?={2,"+level+"}\\s*$","mi");
    const cut=rest.search(next);
    const block=cut>=0?rest.slice(0,cut):rest;
    return cleanWiktionaryText(block).slice(0,520);
  }catch(e){return"";}
}
async function fetchWiktionary(word){const key=(word||"").toLowerCase();if(key in wiktCache)return wiktCache[key];
  const result={word,definition:"",example:"",etymology:"",pos:"",link:"https://en.wiktionary.org/wiki/"+encodeURIComponent(word)};
  // Primary: dictionaryapi.dev (CORS-enabled, reliable in the browser)
  try{const r=await fetch("https://api.dictionaryapi.dev/api/v2/entries/en/"+encodeURIComponent(word));
    if(r.ok){const j=await r.json();const entry=Array.isArray(j)?j[0]:null;
      if(entry){const mean=(entry.meanings||[])[0];
        if(mean){result.pos=mean.partOfSpeech||"";const d0=(mean.definitions||[])[0]||{};
          result.definition=stripTags(d0.definition||"");
          if(d0.example)result.example=stripTags(d0.example);}
        if(!result.etymology&&entry.origin)result.etymology=stripTags(entry.origin);}}
  }catch(e){}
  // Fallback definition: Wiktionary REST (may be CORS-limited in some browsers)
  if(!result.definition){try{const r=await fetch("https://en.wiktionary.org/api/rest_v1/page/definition/"+encodeURIComponent(word));
    if(r.ok){const j=await r.json();const en=j.en||[];
      if(en.length){const block=en[0];result.pos=result.pos||block.partOfSpeech||"";const d0=(block.definitions||[])[0]||{};
        result.definition=stripTags(d0.definition||"");
        if(!result.example&&d0.examples&&d0.examples.length)result.example=stripTags(d0.examples[0]);
        else if(!result.example&&d0.parsedExamples&&d0.parsedExamples.length)result.example=stripTags(d0.parsedExamples[0].example||"");}}
  }catch(e){}}
  // Etymology via Wiktionary action API (CORS-friendly with origin=*)
  if(!result.etymology){
    try{const u="https://en.wiktionary.org/w/api.php?action=query&prop=revisions&titles="+encodeURIComponent(word)+"&rvprop=content&rvslots=main&format=json&formatversion=2&origin=*";
      const r=await fetch(u);if(r.ok){const j=await r.json();const pg=j.query&&j.query.pages&&j.query.pages[0];const wt=pg&&pg.revisions&&pg.revisions[0]&&pg.revisions[0].slots&&pg.revisions[0].slots.main&&pg.revisions[0].slots.main.content||"";
        result.etymology=extractEtymologyFromWikitext(wt);}}
    catch(e){}
  }
  // Example sentence: Tatoeba first (real, in-context), else whatever definition source gave us
  const tat=await fetchTatoebaExample(word);
  if(tat){result.example=tat;result.exampleSource="Tatoeba";}
  else if(result.example){result.exampleSource="Dictionary";}
  wiktCache[key]=result;return result;}
const tatCache={};
async function fetchTatoebaExample(word){const key=(word||"").toLowerCase();if(key in tatCache)return tatCache[key];
  let out="";
  try{const u="https://tatoeba.org/en/api_v0/search?from=eng&trans_filter=limit&query="+encodeURIComponent(word)+"&sort=relevance&native=yes";
    const r=await fetch(u);
    if(r.ok){const j=await r.json();const rows=(j&&j.results)||[];
      // prefer a short, clean sentence that actually contains the word
      const re=new RegExp("\\b"+word.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\w*\\b","i");
      const cand=rows.map(x=>x&&x.text).filter(Boolean).filter(t=>re.test(t)&&t.length<=160);
      out=cand.sort((a,b)=>a.length-b.length)[0]||"";}
  }catch(e){}
  tatCache[key]=out;return out;}
async function populateTip(termEl,vocabEl){
  if(vocabEl){const word=vocabEl.dataset.vocab;
    tip.innerHTML=`<div class="t-title">${escHtml(word)}</div><div class="t-load">Looking up…</div>`+pinCloseHtml();
    const w=await fetchWiktionary(word);if(tip.style.display==="none")return;
    if(w.definition||w.example||w.etymology){
      tip.innerHTML=`<div class="t-title">${escHtml(word)}${w.pos?` · <span style="font-style:italic;font-size:13px;color:var(--ink-soft)">${escHtml(w.pos)}</span>`:""}</div>`
        +(w.definition?`<div class="t-field"><span class="fl">Definition</span>${escHtml(w.definition)}</div>`:"")
        +(w.example?`<div class="t-field"><span class="fl">Example${w.exampleSource?" · "+w.exampleSource:""}</span><i>${escHtml(w.example)}</i></div>`:"")
        +(w.etymology?`<div class="t-field"><span class="fl">Etymology</span>${escHtml(w.etymology)}</div>`:"")
        +(w.link?`<div style="margin-top:6px"><a href="${w.link}" target="_blank" rel="noopener">Wiktionary →</a></div>`:"")+pinCloseHtml();
    }else tip.innerHTML=`<div class="t-title">${escHtml(word)}</div><div class="t-load">No Wiktionary entry found.</div>`+pinCloseHtml();
    wirePinClose();return;}
  const term=termEl.dataset.term;
  tip.innerHTML=`<div class="t-title">${escHtml(term)}</div><div class="t-load">Looking up…</div>`+pinCloseHtml();
  const data=await fetchWiki(term);if(tip.style.display==="none")return;
  if(data)tip.innerHTML=(data.thumb?`<img class="t-thumb" src="${data.thumb}">`:"")+`<div class="t-title">${escHtml(data.title)}</div><div>${escHtml(data.extract)}</div>`+(data.link?`<div style="margin-top:6px"><a href="${data.link}" target="_blank" rel="noopener">Wikipedia →</a></div>`:"")+pinCloseHtml();
  else tip.innerHTML=`<div class="t-title">${escHtml(term)}</div><div class="t-load">No Wikipedia article found.</div>`+pinCloseHtml();
  wirePinClose();
}
