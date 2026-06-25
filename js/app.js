const STATE={clips:[],decks:[]};
const CAT_RULES=new Map(); // learned: normalized text/term -> category (persisted)
let REVIEW_LOG=[]; // past review sessions {date,total,acc,grades}
let IMPORT_LOG=[]; // past imports {date,name,added,updated,total}
let IS_SAMPLE=false; // true while the built-in sample is loaded
let CAT_FILTER={vocab:1,quotes:1,topic:1,none:1};
let SORT="page",QUERY="",PAGE="library",ACTIVE_DECK=null,LAMP_ON=true;
const CAT_LABELS={vocab:"vocabulary",quotes:"quote",topic:"topic of interest"};
const CAT_ORDER={vocab:0,quotes:1,topic:2,none:3};
const CAT_COLORVAR={vocab:"--cat-vocab",quotes:"--cat-quotes",topic:"--cat-topic"};
let DENSITY="comfortable"; // library row spacing: comfortable | compact | condensed
function applyDensity(d){DENSITY=d||DENSITY;try{localStorage.setItem("marginalia.density",DENSITY);}catch(e){}const l=document.getElementById("list");if(l){l.classList.remove("dens-comfortable","dens-compact","dens-condensed");l.classList.add("dens-"+DENSITY);}}
const SPINE_COLORS=["#7a1f2b","#2f4a3a","#3a3560","#6b4a1f","#5c2438","#264a52","#39402a","#5a2f28","#3f3a60","#6b3a2a"];
const root=document.documentElement;

/* ---------- Opening library doors ---------- */
const GATE_SEEN_KEY="marginalia.gateSeen";
const libraryGate=document.getElementById("libraryGate");
function openLibraryGate(){
  if(!libraryGate||libraryGate.classList.contains("opening"))return;
  libraryGate.classList.add("opening");
  try{localStorage.setItem(GATE_SEEN_KEY,"1");}catch(e){}
  setTimeout(()=>libraryGate.classList.add("hidden"),1500);
}


/* ---------- Mille-fleur corner vignette (Scriptorium pigments) ---------- */
function buildFleur(){/* flowers removed per request */}

/* ---------- Oil lamp accompanies the real cursor (offset, no lag) ---------- */
const lampC=document.getElementById("lampCursor"),lampH=document.getElementById("lampHalo");
const LAMP_DX=20,LAMP_DY=22; // sits just below-right of the pointer tip

/* ---------- Jump to top ---------- */
const jumpTop=document.getElementById("jumpTop");
function toggleJumpTop(){jumpTop.classList.toggle("show",window.scrollY>420);}
/* ---------- Parsing ---------- */
function parseClippings(text){const recs=text.split(/==========/).map(r=>r.trim()).filter(Boolean);const clips=[];
  for(const r of recs){const lines=r.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);if(lines.length<2)continue;
    const titleLine=lines[0],metaLine=lines[1];const content=lines.slice(2).join(" ").trim();
    let title=titleLine,author="";const m=titleLine.match(/^(.*)\(([^)]*)\)\s*$/);if(m){title=m[1].trim();author=cleanAuthor(m[2].trim());}
    if(/your bookmark/i.test(metaLine))continue;const isNote=/your note/i.test(metaLine);
    const pageM=metaLine.match(/page\s+([0-9ivxlcdm\-]+)/i),locM=metaLine.match(/location\s+([0-9\-]+)/i);
    const addM=metaLine.match(/Added on\s+(.+)$/i);const added=addM?addM[1].replace(/^[A-Za-z]+,\s*/,"").trim():null;
    if(!content)continue;clips.push({title,author,type:isNote?"note":"highlight",page:pageM?pageM[1]:null,loc:locM?locM[1]:null,text:content,added});}
  return clips;}
function parseHtml(html){const doc=new DOMParser().parseFromString(html,"text/html");const clips=[];
  const title=(doc.querySelector(".bookTitle")?.textContent||"").trim()||"Untitled";const author=(doc.querySelector(".authors")?.textContent||"").trim();
  const nodes=[...doc.querySelectorAll(".noteHeading,.noteText")];let pending=null;
  for(const n of nodes){if(n.classList.contains("noteHeading")){const h=n.textContent.trim();
    const pageM=h.match(/page\s+([0-9ivxlcdm\-]+)/i),locM=h.match(/location\s+([0-9\-]+)/i);
    pending={title,author,type:/note/i.test(h)?"note":"highlight",page:pageM?pageM[1]:null,loc:locM?locM[1]:null};}
    else if(pending){pending.text=n.textContent.trim();if(pending.text)clips.push(pending);pending=null;}}
  return clips;}
function parseCsv(text){const rows=csvRows(text);if(!rows.length)return[];const head=rows[0].map(h=>h.toLowerCase());
  const ci=n=>head.findIndex(h=>h.includes(n));const ti=ci("title"),ai=ci("author"),hi=ci("highlight"),ni=ci("note"),pi=ci("page"),li=ci("location"),di=ci("date");const clips=[];
  for(let i=1;i<rows.length;i++){const row=rows[i];if(!row.length)continue;
    const t=ti>=0?row[ti]:"Untitled",a=ai>=0?row[ai]:"",hx=hi>=0?row[hi]:"",nx=ni>=0?row[ni]:"",pg=pi>=0?row[pi]:null,lo=li>=0?row[li]:null;
    const dt=di>=0?row[di]:null;
    if(hx)clips.push({title:t,author:a,type:"highlight",page:pg,loc:lo,text:hx,added:dt});
    if(nx)clips.push({title:t,author:a,type:"note",page:pg,loc:lo,text:nx,added:dt});}return clips;}
function csvRows(str){const rows=[];let row=[],cur="",q=false;
  for(let i=0;i<str.length;i++){const c=str[i];
    if(q){if(c==='"'){if(str[i+1]==='"'){cur+='"';i++}else q=false}else cur+=c}
    else{if(c==='"')q=true;else if(c===',') {row.push(cur);cur=""}
      else if(c==='\n'){row.push(cur);rows.push(row);row=[];cur=""}else if(c==='\r'){}else cur+=c}}
  if(cur||row.length){row.push(cur);rows.push(row)}return rows.filter(r=>r.some(x=>x.trim()));}

/* ---------- Auto-categorize (improved vocab vs topic) ---------- */
/*
  Rule of thumb:
   - lowercase single word (or hyphenated like "self-same") -> VOCAB (a word you looked up)
   - a capitalized single word or a multi-word proper name -> TOPIC of interest (an entity)
   - figurative / long passages, notes -> QUOTES
   This fixes "Basho"/"Manichaean" landing in vocab when they're really topics,
   while keeping "termagant", "coelacanth", "onanism" as vocab.
*/
function strip(t){return t.replace(/[(),.;:—–'"“”‘’!?]/g,"").trim();}
function ruleKey(c){return strip((c.text||"")).toLowerCase().replace(/\s+/g," ").slice(0,80);}
function autoCategorize(c){
  if(c.type==="note")return"quotes";
  const rk=ruleKey(c);if(CAT_RULES.has(rk))return CAT_RULES.get(rk);
  const t=c.text.trim(), words=t.split(/\s+/), s=strip(t), sWords=s.split(/\s+/).filter(Boolean);
  const lowerSingle = sWords.length===1 && /^[a-z][a-z\-']*$/.test(s) && s.length<=24;
  if(lowerSingle) return "vocab";
  // a single Capitalized token, or ALLCAPS, or a short multi-word run that's mostly capitalized -> topic
  const capCount = words.filter(w=>/^[A-Z]/.test(strip(w))).length;
  const isProperish = (sWords.length===1 && /^[A-Z]/.test(s))
                   || (words.length<=8 && capCount/words.length>=0.5);
  // a short phrase carrying proper nouns (a list/group of names) is a topic of interest, not a quote
  const nonFirstCap = words.slice(1).some(w=>/^[A-Z]/.test(strip(w)));
  const namey = words.length<=6 && !/[.!?]$/.test(t) && (capCount>=2 || nonFirstCap);
  if((isProperish||namey) && words.length<=8) return "topic";
  if(/[;:—]|\blike a\b|as if|as though/i.test(t) && words.length<=45) return "quotes";
  if(words.length>=10) return "quotes";
  // short leftover lowercase-ish phrase: treat as vocab only if 1 word, else none
  if(sWords.length===1 && /^[A-Za-z][A-Za-z\-']*$/.test(s) && s.length<=24) return "vocab";
  return "none";
}
// vocab hover applies to a single word (lowercase OR capitalized, but single-token)
function isVocabWord(c){const s=strip(c.text);return /^[A-Za-z][A-Za-z\-']*$/.test(s)&&s.split(/\s+/).length===1;}
function vocabTermOf(c){return strip(c.text).split(/\s+/)[0];}

/* ---------- Term detection (validated vs all screenshots) ---------- */
const CONNECTORS=/^(of|de|von|van|der|den|the|and|al|el|la|le|du|da|di|della|delle|ibn|bin|ben|y|in|out|on|at|to|et)$/i;
const COMMON_CAP=/^(January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|God|Mr|Mrs|Ms|Dr|St|I|A|An|The)$/i;
const SENTENCE_LEAD_STOP=/^(the|a|an|but|and|or|if|when|while|this|that|these|those|he|she|it|they|we|in|on|at|for|to|of|as|my|his|her|their|its|our|your|with|from|by|was|were|is|are|be|been|being|not|no|so|then|than|because|which|who|whom|whose|what|how|why|where)$/i;
const ATTACH_NOUN=/^(shrine|war|temple|revolution|dynasty|empire|school|movement|period|era|society|order|rebellion|uprising|sutra|prize|river|mountain|sea|castle|palace|cathedral|abbey)$/i;
function titleCase(s){return s.replace(/\w\S*/g,w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase());}
function isAllCaps(w){return /^[A-ZÀ-Þ][A-ZÀ-Þ'’.\-]*$/.test(w)&&/[A-ZÀ-Þ]{2,}/.test(w);}
function isCapCore(w){if(!w)return false;return (/^[A-ZÀ-Þ][a-zà-ÿ'’\-]+$/.test(w))||/^[A-Z][a-zà-ÿ'’]+(-[A-ZÀ-Þ][a-zà-ÿ'’]+)+$/.test(w)||/^[A-Z]'[A-Z]/.test(w)||/^[A-Z][a-z]+[A-Z]/.test(w)||/^[A-Z]\.?$/.test(w)||isAllCaps(w);}
function isInitial(w){return /^[A-Z]\.?$/.test(w)&&w.replace(".","").length===1;}
function lookupForm(p){p=p.trim();p=p.replace(/-([a-z][a-z]+)$/,"");p=p.split(/[—–]/)[0];
  p=p.replace(/^[("'“‘\s]+|[)"'”’\s]+$/g,"").replace(/[,.;:!?]+$/,"").replace(/['’]s\b/g,"");
  p=p.replace(/\s+/g," ").trim();
  if(/^[^a-z]+$/.test(p)&&/[A-Z]/.test(p))p=titleCase(p);
  p=p.replace(/\s(Of|The|And|De|Von|Van|Der|Den|Du|Da|Di|La|Le|El|In|On|At|To)\s/g,(m,w)=>" "+w.toLowerCase()+" ");
  return p;}
function escHtml(s){return (s+"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}
function escAttr(s){return escHtml(s).replace(/"/g,"&quot;")}
/* ---------- Library render ---------- */
function groupByBook(){const map=new Map();STATE.clips.forEach(c=>{const ct=cleanTitle(c.title);const k=ct+"|"+c.author;
  if(!map.has(k))map.set(k,{title:ct,author:c.author,clips:[],key:slug(ct)});map.get(k).clips.push(c);});
  const books=[...map.values()];
  books.forEach(b=>{const ds=b.clips.map(parseDate).filter(Boolean).map(d=>+d);
    b.firstDate=ds.length?Math.min(...ds):null;b.lastDate=ds.length?Math.max(...ds):null;});
  // default shelf/library order: most recently read first; undated books fall to the end
  books.sort((a,b)=>(b.lastDate||-Infinity)-(a.lastDate||-Infinity)||a.title.localeCompare(b.title));
  return books;}
function pageNum(c){const v=c.page||c.loc||"0";const n=parseInt((""+v).split(/[-–]/)[0],10);return isNaN(n)?1e9:n;}
function shade(hex,p){const n=parseInt(hex.slice(1),16);let r=(n>>16)+p,g=((n>>8)&255)+p,b=(n&255)+p;
  r=Math.max(0,Math.min(255,r));g=Math.max(0,Math.min(255,g));b=Math.max(0,Math.min(255,b));return "#"+(r<<16|g<<8|b).toString(16).padStart(6,"0");}
function bookColor(i){return SPINE_COLORS[i%SPINE_COLORS.length];}
let BOOK_SIZE="m"; // s | m | l
function renderShelf(books){const shelf=document.getElementById("shelf");shelf.innerHTML="";
  const size=(BOOK_SIZE==="s"||BOOK_SIZE==="m"||BOOK_SIZE==="l")?BOOK_SIZE:"m";
  shelf.className="shelf size-"+size;
  books.forEach((b,i)=>{const color=bookColor(i);
    const sp=document.createElement("div");
    const sv=["v-b","v-c","v-d","v-e"][Math.abs([...(b.title||"")].reduce((h,ch)=>((h<<5)-h+ch.charCodeAt(0))|0,0))%4]; // stable per-title random mix
    sp.className="book-spine "+sv;
    sp.innerHTML=`<div class="cloth" style="background:${color}"></div><div class="spframe"></div><div class="band t"></div><div class="band b"></div><div class="cover-orn"></div><div class="vtitle">${escHtml(truncTitle(b.title,16))}</div><div class="htitle">${escHtml(b.title)}</div><div class="cauthor">${escHtml(b.author||"")}</div><div class="scount">${b.clips.length}</div>`;
    sp.title=b.title+(b.author?" — "+b.author:"");
    sp.onclick=()=>{const el=document.getElementById("book-"+b.key);if(el){el.classList.remove("collapsed");el.scrollIntoView({behavior:"smooth"});}};
    shelf.appendChild(sp);});
  const tog=document.getElementById("bookSizeToggle");if(tog)tog.querySelectorAll("button").forEach(btn=>btn.dataset.on=btn.dataset.sz===BOOK_SIZE?1:0);}
function render(){const list=document.getElementById("list");list.innerHTML="";const q=QUERY.toLowerCase();
  const books=groupByBook();renderShelf(books);let shown=0;
  books.forEach((book,bi)=>{const color=bookColor(bi);
    // pair Kindle notes to the highlight they annotate (same book + base location); attached notes render inline, not as their own card
    const locKey=c=>((c.loc||c.page||"")+"").split(/[-–]/)[0].trim();
    const noteMap=new Map();book.clips.forEach(c=>{if(c.type==="note"){const k=locKey(c);if(k)(noteMap.get(k)||noteMap.set(k,[]).get(k)).push(c);}});
    const notesFor=new Map(),attached=new Set();
    book.clips.forEach(c=>{if(c.type!=="note"){const ns=noteMap.get(locKey(c));if(ns&&ns.length){notesFor.set(c,ns);ns.forEach(n=>attached.add(n));}}});
    let clips=book.clips.filter(c=>{if(c.type==="note"&&attached.has(c))return false;
      if(!CAT_FILTER[c.cat])return false;
      if(q){const ns=notesFor.get(c),noteHit=ns&&ns.some(n=>n.text.toLowerCase().includes(q));
        if(!(c.text.toLowerCase().includes(q)||book.title.toLowerCase().includes(q)||(book.author||"").toLowerCase().includes(q)||noteHit))return false;}return true;});
    if(SORT==="page")clips.sort((a,b)=>pageNum(a)-pageNum(b));
    else if(SORT==="date")clips.sort((a,b)=>{const da=parseDate(a),db=parseDate(b);return (da?+da:Infinity)-(db?+db:Infinity)||pageNum(a)-pageNum(b);});
    else if(SORT==="len")clips.sort((a,b)=>b.text.length-a.text.length);
    else if(SORT==="tag")clips.sort((a,b)=>(CAT_ORDER[a.cat]-CAT_ORDER[b.cat])||(pageNum(a)-pageNum(b)));
    if(!clips.length)return;shown+=clips.length;
    const sec=document.createElement("section");sec.className="book";sec.id="book-"+book.key;
    sec.innerHTML=`<div class="book-head"><span class="ribbon" style="background:linear-gradient(180deg,${shade(color,18)},${color});--rcol:${color}"></span><span class="title">${escHtml(book.title)}</span>${book.author?`<span class="author">${escHtml(book.author)}</span>`:""}<span class="tally">${clips.length} ✦</span><span class="caret">▾</span></div><div class="clips"></div>`;
    const wrap=sec.querySelector(".clips");sec.querySelector(".book-head").onclick=()=>sec.classList.toggle("collapsed");
    clips.forEach(c=>{const div=document.createElement("div");div.className="clip"+(c.type==="note"?" is-note":"");div.dataset.fp=c.fp||clipFp(c);
      const locTxt=c.page?`<span class="pg">${escHtml(c.page)}</span>`:c.loc?`<span class="pg">${escHtml(c.loc)}</span>`:"—";
      let bodyHtml;
      if(c.type==="note")bodyHtml=escHtml(c.text);
      else if(c.cat==="vocab"&&isVocabWord(c)){const wd=vocabTermOf(c);bodyHtml=escHtml(c.text).replace(escHtml(wd),`<span class="vocabword" data-vocab="${escAttr(wd)}">${escHtml(wd)}</span>`);}
      else bodyHtml=annotateTerms(c.text);
      const editedTag=c.edited?'<span class="pill edited-pill" title="You edited this highlight">edited</span>':"";
      const updateTag=c.incoming?`<button class="upd-pill" title="A re-import has different text — click to review">update available</button>`:"";
      div.dataset.cat=c.cat||"none";
      const attNotes=notesFor.get(c),notesHtml=attNotes?attNotes.map(n=>`<div class="clip-note"><span class="cn-lab">note</span>${escHtml(n.text)}</div>`).join(""):"";
      div.innerHTML=`<div class="loc">${locTxt}${c.type==="note"?'<br><span class="pill">note</span>':""}<button class="edit-btn" title="Edit this highlight" aria-label="Edit">✎</button></div>
        <div class="body"><span class="cat-line" title="${CAT_LABELS[c.cat]||"untagged"}"></span><p class="text">${bodyHtml}</p>${notesHtml}
          <div class="meta"><div class="catpick" role="group" aria-label="Set tag">
            ${["vocab","quotes","topic"].map(k=>`<button data-k="${k}" data-sel="${c.cat===k?1:0}" title="${CAT_LABELS[k]}">${CAT_LABELS[k]}</button>`).join("")}
          </div>${editedTag}${updateTag}</div></div>`;
      div.querySelectorAll(".catpick button").forEach(b=>{b.onclick=()=>{
        const newCat=(c.cat===b.dataset.k)?"none":b.dataset.k;c.cat=newCat;c.catLocked=true;
        const rk=ruleKey(c);if(newCat==="none")CAT_RULES.delete(rk);else CAT_RULES.set(rk,newCat);
        saveState();render();};});
      const textEl=div.querySelector(".text"),editBtn=div.querySelector(".edit-btn");
      editBtn.onclick=()=>beginEdit(c,textEl,editBtn,div);
      const updBtn=div.querySelector(".upd-pill");if(updBtn)updBtn.onclick=()=>reviewUpdate(c);
      wrap.appendChild(div);});
    list.appendChild(sec);});
  if(!shown){const e=document.createElement("div");e.className="empty";
    e.textContent="No highlights match these filters.";
    list.appendChild(e);}
  document.getElementById("statClips").textContent=STATE.clips.length;document.getElementById("statBooks").textContent=books.length;}

/* ---------- Inline editing ---------- */
function beginEdit(c,textEl,editBtn,div){
  if(div.classList.contains("editing"))return;
  div.classList.add("editing");
  const original=c.text;
  textEl.textContent=c.text;             // strip term spans while editing
  textEl.setAttribute("contenteditable","true");
  textEl.classList.add("editing-text");
  textEl.focus();
  // place caret at end
  const r=document.createRange();r.selectNodeContents(textEl);r.collapse(false);
  const sel=getSelection();sel.removeAllRanges();sel.addRange(r);
  editBtn.textContent="✓";editBtn.title="Save edit (Enter)";
  const finish=(commit)=>{
    textEl.removeAttribute("contenteditable");textEl.classList.remove("editing-text");
    div.classList.remove("editing");textEl.removeEventListener("keydown",onKey);
    if(commit){const nt=textEl.textContent.replace(/\s+/g," ").trim();
      if(nt&&nt!==original){c.text=nt;c.edited=true;c.fp=clipFp(c);if(!c.catLocked)c.cat=autoCategorize(c);saveState();}
    }
    render();
  };
  const onKey=e=>{
    if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();finish(true);}
    else if(e.key==="Escape"){e.preventDefault();finish(false);}
  };
  textEl.addEventListener("keydown",onKey);
  textEl.addEventListener("blur",()=>finish(true),{once:true});
  editBtn.onclick=()=>finish(true);
}
/* ---------- Review an incoming re-import that differs from your edit ---------- */
function reviewUpdate(c){
  const keep=confirm(`A re-import has different text for this highlight.\n\nYOURS:\n"${c.text}"\n\nINCOMING:\n"${c.incoming}"\n\nOK = replace with incoming · Cancel = keep yours`);
  if(keep){c.text=c.incoming;c.edited=false;c.fp=clipFp(c);if(!c.catLocked)c.cat=autoCategorize(c);}
  delete c.incoming;saveState();render();
}

/* ---------- Tooltip ---------- */
const tip=document.getElementById("tip");let tipTimer=null,tipPinned=false;
function tipPosXY(cx,cy){const pad=20,w=360,h=220;let x=cx+pad,y=cy+pad;
  if(x+w>innerWidth)x=cx-w-pad;if(y+h>innerHeight)y=cy-h-pad;
  tip.style.left=Math.max(8,x)+"px";tip.style.top=Math.max(8,y)+"px";}
function tipPos(e){tipPosXY(e.clientX,e.clientY);}
function pinCloseHtml(){return tipPinned?'<button class="t-close" aria-label="Close">✕</button>':"";}
function wirePinClose(){const x=tip.querySelector(".t-close");if(x)x.onclick=()=>hideTip(true);}
function hideTip(force){tipPinned=false;tip.style.display="none";}
/* ---------- Surprise me ---------- */
function showSurprise(){const hl=STATE.clips.filter(c=>c.type!=="note");if(!hl.length)return;
  const c=hl[Math.floor(Math.random()*hl.length)];
  const txtEl=document.getElementById("spText");
  if(c.cat==="vocab"&&isVocabWord(c)){
    // a vocabulary word — present it as a hoverable term, not a quotation
    const wd=vocabTermOf(c)||c.text;
    txtEl.innerHTML=`<span class="vocabword" data-vocab="${escAttr(wd)}">${escHtml(wd)}</span>`;
    txtEl.classList.add("is-vocab");
    document.getElementById("spSrc").textContent="vocabulary · "+cleanTitle(c.title);
  }else{
    const isQuote=c.text.split(/\s+/).length>=3;
    const inner=annotateTerms(c.text);
    txtEl.innerHTML=isQuote?("“"+inner+"”"):inner;
    txtEl.classList.remove("is-vocab");
    document.getElementById("spSrc").textContent="— "+cleanTitle(c.title)+(c.author?", "+c.author:"")+(c.page?", p."+c.page:"");
  }
  document.getElementById("surprise").classList.remove("hidden");}

/* ---------- Decks ---------- */
function uid(){return "d"+Math.random().toString(36).slice(2,8);}
function clipKeyTerm(c){const html=annotateTerms(c.text);const m=html.match(/data-term="([^"]*)"/);
  if(m)return m[1].replace(/&quot;/g,'"').replace(/&amp;/g,"&");return lookupForm(c.text);}
function clipsForDeck(deck){const inc=new Set(deck.include||[]);
  return STATE.clips.filter(c=>c.type!=="note"&&c.cat!=="quotes"&&(deck.tags[c.cat]||inc.has(cardId(c))));}
function addClipToDeck(c,deckId){const d=STATE.decks.find(x=>x.id===deckId);if(!d)return false;
  d.include=d.include||[];const id=cardId(c);if(!d.include.includes(id))d.include.push(id);saveState();return true;}
function chooseDeckFor(c){
  if(!c){return;}
  const mk=()=>{const nm=prompt("New deck name:","Review picks");if(!nm)return;const d={id:uid(),name:nm.trim()||"Review picks",tags:{vocab:false,topic:false},include:[]};STATE.decks.push(d);ACTIVE_DECK=d.id;addClipToDeck(c,d.id);toast("Added to “"+d.name+"”.");};
  if(!STATE.decks.length){mk();return;}
  const ov=document.createElement("div");ov.className="deck-choose-ov";
  ov.innerHTML=`<div class="deck-choose"><div class="dc-h">Add to deck</div>${STATE.decks.map(d=>`<button class="dc-opt" data-id="${d.id}">${escHtml(d.name)}</button>`).join("")}<button class="dc-opt dc-new">＋ New deck…</button><button class="dc-cancel">Cancel</button></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();
  ov.addEventListener("click",e=>{if(e.target===ov)close();});
  ov.querySelector(".dc-cancel").onclick=close;
  ov.querySelector(".dc-new").onclick=()=>{close();mk();};
  ov.querySelectorAll(".dc-opt:not(.dc-new)").forEach(b=>b.onclick=()=>{addClipToDeck(c,b.dataset.id);const d=STATE.decks.find(x=>x.id===b.dataset.id);toast("Added to “"+(d?d.name:"deck")+"”.");close();});
}
function renderAnki(){const dl=document.getElementById("deckList");dl.innerHTML="";
  if(!STATE.clips.length){document.getElementById("deckDetail").innerHTML='<div class="empty">Import highlights first, on the Library tab.</div>';return;}
  STATE.decks.forEach(deck=>{const n=clipsForDeck(deck).length;
    const card=document.createElement("div");card.className="deck-card";card.dataset.on=ACTIVE_DECK===deck.id?1:0;
    const badges=Object.keys(deck.tags).filter(k=>deck.tags[k]).map(k=>`<span class="dtag" style="background:var(${CAT_COLORVAR[k]})">${CAT_LABELS[k]}</span>`).join("");
    card.innerHTML=`<div class="dname">${escHtml(deck.name)}<span class="pill">${n} cards</span></div><div class="dtags">${badges||'<span class="dcount">no tags selected</span>'}</div>`;
    card.onclick=()=>{ACTIVE_DECK=deck.id;renderAnki();};dl.appendChild(card);});
  renderDeckDetail();}
function renderDeckDetail(){const dd=document.getElementById("deckDetail");const deck=STATE.decks.find(d=>d.id===ACTIVE_DECK);
  if(!deck){dd.innerHTML='<div class="empty">Select or create a deck to begin.</div>';return;}
  const cards=clipsForDeck(deck);
  dd.innerHTML=`<h2 contenteditable="true" id="deckTitle" spellcheck="false">${escHtml(deck.name)}</h2>
    <div class="dd-sub">${cards.length} cards · backs auto-written on export</div>
    <div class="tag-toggles" id="tagToggles">${["vocab","topic"].map(k=>`<button class="tag-toggle c-${k}" data-k="${k}" data-on="${deck.tags[k]?1:0}"><span class="dot" style="background:var(${CAT_COLORVAR[k]})"></span>${CAT_LABELS[k]}</button>`).join("")}</div>
    <div class="card-preview"><div class="cp-lab">Sample card preview</div><div id="cardPreview"></div></div>
    <div class="deck-actions"><button class="btn" id="exportDeck">Export this deck (.txt)</button><button class="btn ghost" id="exportAll">Export all decks</button><button class="btn ghost" id="exportJson">Export JSON backup</button><button class="btn ghost" id="deleteDeck">Delete deck</button></div>`;
  document.getElementById("deckTitle").onblur=e=>{deck.name=e.target.textContent.trim()||"Untitled deck";saveState();renderAnki();};
  document.getElementById("tagToggles").addEventListener("click",e=>{const b=e.target.closest(".tag-toggle");if(!b)return;deck.tags[b.dataset.k]=!deck.tags[b.dataset.k];saveState();renderAnki();});
  document.getElementById("exportDeck").onclick=()=>exportDeck(deck);
  document.getElementById("exportAll").onclick=exportAllDecks;
  document.getElementById("exportJson").onclick=exportJson;
  document.getElementById("deleteDeck").onclick=()=>{STATE.decks=STATE.decks.filter(d=>d.id!==deck.id);ACTIVE_DECK=STATE.decks[0]?.id||null;saveState();renderAnki();};
  renderCardPreview(cards[0]);}
async function renderCardPreview(c){const box=document.getElementById("cardPreview");if(!box)return;
  if(!c){box.innerHTML='<div class="empty" style="padding:24px">No cards yet — toggle a tag above.</div>';return;}
  box.innerHTML=`<div class="mini-card"><div class="mc-front">${escHtml(c.text)}</div><div class="mc-back"><span class="mc-loading">Writing back from ${c.cat==="vocab"?"Wiktionary":"Wikipedia"}…</span></div></div>`;
  const back=await buildBack(c);const backEl=box.querySelector(".mc-back");if(!backEl)return;backEl.innerHTML=renderBackFields(back);}
function renderBackFields(back){if(back.kind==="vocab"){return [["Definition",back.definition],["Example",back.example],["Etymology",back.etymology]].map(([l,v])=>`<div class="mc-field"><span class="fl">${l}</span>${v?escHtml(v):'<span class="mc-loading">—</span>'}</div>`).join("");}
  return `<div class="mc-field"><span class="fl">Summary</span>${back.summary?escHtml(back.summary):'<span class="mc-loading">—</span>'}</div>`+(back.source?`<div class="mc-field"><span class="fl">Source</span>${escHtml(back.source)}</div>`:"");}
async function buildBack(c){if(c.cat==="vocab"){const word=vocabTermOf(c)||lookupForm(c.text).split(/\s+/)[0];const w=await fetchWiktionary(word);return {kind:"vocab",word,definition:w.definition,example:w.example,etymology:w.etymology};}
  const term=clipKeyTerm(c);const wk=await fetchWiki(term);return {kind:"wiki",summary:wk?wk.extract:"",source:wk?wk.title:term};}

/* ---------- Export ---------- */
function themeColorsForAnki(){const cs=getComputedStyle(root);const g=v=>cs.getPropertyValue(v).trim();
  return {paper:g("--card")||"#2f2417",ink:g("--ink")||"#f1e6d2",accent:g("--accent")||"#c9a84a",inkSoft:g("--ink-soft")||"#bda988",rule:g("--rule")||"#54422c"};}
function styleBlock(){const t=themeColorsForAnki();return `<style>
.marg-card{background:${t.paper};color:${t.ink};font-family:'Fraunces',Georgia,serif;padding:18px;border-radius:8px;line-height:1.5}
.marg-front{font-size:22px;text-align:center}
.marg-field{margin:8px 0}.marg-label{font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:${t.accent};display:block;margin-bottom:2px}
.marg-src{color:${t.inkSoft};font-style:italic;font-size:13px}
</style>`;}
function wrapFront(text){return `${styleBlock()}<div class="marg-card"><div class="marg-front">${escHtml(text)}</div></div>`;}
function wrapBackVocab(def,ex,et){return `${styleBlock()}<div class="marg-card">`+(def?`<div class="marg-field"><span class="marg-label">Definition</span>${escHtml(def)}</div>`:"")+(ex?`<div class="marg-field"><span class="marg-label">Example</span>${escHtml(ex)}</div>`:"")+(et?`<div class="marg-field"><span class="marg-label">Etymology</span>${escHtml(et)}</div>`:"")+(!def&&!ex&&!et?'<div class="marg-src">No Wiktionary entry found.</div>':"")+`</div>`;}
function wrapBackWiki(sum,src){return `${styleBlock()}<div class="marg-card">`+(sum?`<div class="marg-field"><span class="marg-label">Summary</span>${escHtml(sum)}</div>`:"")+(src?`<div class="marg-src">— ${escHtml(src)} (Wikipedia)</div>`:'<div class="marg-src">No Wikipedia summary found.</div>')+`</div>`;}
async function buildDeckRows(deck){const cards=clipsForDeck(deck);const rows=[];
  for(const c of cards){const back=await buildBack(c);
    if(back.kind==="vocab")rows.push({front:c.text,f1:back.definition||"",f2:back.example||"",f3:back.etymology||"",tags:["vocab",slug(c.title),slug(deck.name)].filter(Boolean).join(" ")});
    else rows.push({front:c.text,f1:back.summary||"",f2:back.source||"",f3:"",tags:[c.cat,slug(c.title),slug(deck.name)].filter(Boolean).join(" ")});}return rows;}
function rowsToTsv(deck,rows){const lines=["#separator:tab","#html:true","#deck:"+deck.name.replace(/\t/g," "),"#columns:Front\tBack\tTags","#tags column:3"];
  for(const r of rows){const isVocab=/(^| )vocab( |$)/.test(r.tags);const front=wrapFront(r.front);const back=isVocab?wrapBackVocab(r.f1,r.f2,r.f3):wrapBackWiki(r.f1,r.f2);
    lines.push([front,back,r.tags].map(x=>(x+"").replace(/\t/g," ").replace(/\r?\n/g," ")).join("\t"));}return lines.join("\n");}
async function exportDeck(deck){const cards=clipsForDeck(deck);if(!cards.length){toast("This deck has no cards — toggle a tag.");return;}
  toast("Writing "+cards.length+" card backs…");const rows=await buildDeckRows(deck);download("anki-"+slug(deck.name)+".txt",rowsToTsv(deck,rows),"text/plain");toast(`Exported "${deck.name}" — ${rows.length} cards. In Anki: File → Import.`);}
async function exportAllDecks(){const wc=STATE.decks.filter(d=>clipsForDeck(d).length);if(!wc.length){toast("No decks have cards yet.");return;}
  toast("Writing card backs for all decks…");for(const deck of wc){const rows=await buildDeckRows(deck);download("anki-"+slug(deck.name)+".txt",rowsToTsv(deck,rows),"text/plain");}toast(`Exported ${wc.length} decks.`);}
function exportJson(){exportLibraryJson();}
const PUB_KEYWORDS=/(edition|classics?|contemporaries|international|library|series|annotated|illustrated|unabridged|abridged|reprint|paperb(ack|ook)|hardcover|vol\.?\s*\w+|book\s*\d+|new directions|penguin|vintage|modern library|everyman|norton|oxford|bantam|anchor|knopf|picador|faber|harper|press|deluxe|centennial|anniversary|kindle|publishing|publisher|corporation|company|inc\b|ltd\b|llc\b)/i;
function cleanTitle(raw){let t=(raw||"").trim();
  t=t.replace(/[\(\[\{]?\s*ocean\s*of\s*pdf(\s*\.\s*com)?\s*[\)\]\}]?/ig,"").trim();
  if(/\s--\s/.test(t))t=t.split(/\s--\s/)[0].trim();
  t=t.replace(/\s*\d{9,13}[\dxX]?\s*$/,"").trim();
  t=t.replace(/\s*[\(\[]?(19|20)\d{2}[\)\]]?\s*$/,"").trim();
  let prev;do{prev=t;t=t.replace(/\s*[\(\[]([^\)\]]*)[\)\]]\s*$/,(m,inner)=>PUB_KEYWORDS.test(inner)?"":m).trim();}while(t!==prev);
  t=t.replace(/:\s*(a\s+novel|a\s+memoir|stories|poems|a\s+true\s+story)\s*$/i,"");
  t=t.replace(/\s+by\s+[A-Z][a-zA-Z.\-]+(\s+[A-Z][a-zA-Z.\-]+){0,3}\s*$/,"").trim();
  t=t.replace(/\s{2,}/g," ").replace(/[\s,;:.\-\u2013\u2014]+$/,"").trim();
  return t||raw;}
function truncTitle(t,max){t=t||"";return t.length>max?t.slice(0,max-1).replace(/[\s,;:\u2013-]+$/,"")+"\u2026":t;}
function cleanAuthor(raw){let a=(raw||"").trim();if(!a)return "";
  a=a.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*$/,"").trim(); // drop trailing (...) notes
  // "Last, First" -> "First Last" (only when a single comma and no 'and'/'&')
  if(/^[^,]+,\s*[^,]+$/.test(a)&&!/\band\b|&/i.test(a)){const [last,first]=a.split(",");a=(first.trim()+" "+last.trim()).trim();}
  a=a.replace(/\s{2,}/g," ").replace(/[;:,.\-\u2013\u2014\s]+$/,"").trim();
  return a;}
function slug(s){return (s+"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40);}
function download(name,content,type){const b=new Blob([content],{type}),u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function toast(m){const t=document.createElement("div");t.className="toast";t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),3200);}

/* ---------- Timeline ---------- */
function parseDate(c){if(!c.added)return null;const d=new Date(c.added);return isNaN(d)?null:d;}
let TL_BRUSH=null; // {start:Date,end:Date} — the timeline's focused date range (drives the recap; does NOT filter the Library)
function renderTimeline(){
  const dated=STATE.clips.filter(c=>c.type!=="note"&&parseDate(c));
  const head=document.getElementById("tlHead"),chart=document.getElementById("tlChart"),axis=document.getElementById("tlAxis"),stats=document.getElementById("tlStats");
  const readout=document.getElementById("tlReadout"),brushBar=document.getElementById("tlBrushBar");
  if(!dated.length){chart.innerHTML='<div class="empty">No timestamps found in this export.</div>';head.textContent="Reading timeline";axis.innerHTML="";stats.innerHTML="";if(brushBar)brushBar.innerHTML="";return;}
  const dates=dated.map(parseDate).sort((a,b)=>a-b);
  const min=dates[0],max=dates[dates.length-1];
  const span=Math.max(1,(max-min)/86400000);
  const buckets=Math.min(40,Math.max(8,Math.ceil(span/ (span>180?14:span>60?7:3))));
  const bw=(max-min)/buckets||1;
  const counts=new Array(buckets).fill(0).map(()=>({vocab:0,quotes:0,topic:0,none:0,total:0}));
  dated.forEach(c=>{const d=parseDate(c);let bi=Math.min(buckets-1,Math.floor((d-min)/bw));counts[bi][c.cat]=(counts[bi][c.cat]||0)+1;counts[bi].total++;});
  const maxC=Math.max(1,...counts.map(b=>b.total));
  const W=900,H=170,pad=4,bwid=(W-pad*2)/buckets;
  const col={vocab:"var(--cat-vocab)",quotes:"var(--cat-quotes)",topic:"var(--cat-topic)",none:"var(--cat-none)"};
  let bars="";
  counts.forEach((b,i)=>{const x=pad+i*bwid;let y=H;["topic","quotes","vocab","none"].forEach(k=>{const h=(b[k]/maxC)*(H-10);if(h>0){y-=h;bars+=`<rect x="${(x+1).toFixed(1)}" y="${y.toFixed(1)}" width="${(bwid-2).toFixed(1)}" height="${h.toFixed(1)}" fill="${col[k]}" rx="1"/>`;}});});
  chart.innerHTML=`<svg width="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="display:block">${bars}</svg>`;
  const fmt=d=>d.toLocaleDateString(undefined,{month:"short",year:"2-digit"});
  const fmtD=d=>d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"2-digit"});
  axis.innerHTML=`<span>${fmt(min)}</span><span>${fmt(new Date((+min+ +max)/2))}</span><span>${fmt(max)}</span>`;
  const books=new Set(dated.map(c=>cleanTitle(c.title))).size;
  head.textContent=`Reading timeline — ${dated.length} highlights, ${books} books, ${fmt(min)}–${fmt(max)}`;
  const byCat=k=>dated.filter(c=>c.cat===k).length;
  const streak=longestStreakWeeks(dates);
  stats.innerHTML=[["Highlights",dated.length],["Books",books],["Vocabulary",byCat("vocab")],["Quotes",byCat("quotes")],["Topics",byCat("topic")],["Longest streak",streak+(streak===1?" wk":" wks")]]
    .map(([l,v])=>`<div class="tl-stat"><b>${v}</b><span>${l}</span></div>`).join("");

  // ---- dual-handle date range slider (month ticks, ≥ 1-year span) ----
  const monthStart=d=>new Date(d.getFullYear(),d.getMonth(),1);
  const addMonths=(d,n)=>new Date(d.getFullYear(),d.getMonth()+n,1);
  const domMin=monthStart(min);
  let domMax=addMonths(monthStart(max),1);                 // first of the month after the last highlight
  if((+domMax- +domMin)<366*86400000)domMax=addMonths(domMin,12); // always show at least a full year
  const span2=(+domMax- +domMin)||1;
  // initialize fractions from existing brush, else full range
  let f0=TL_BRUSH?Math.max(0,Math.min(1,(+TL_BRUSH.start- +domMin)/span2)):0;
  let f1=TL_BRUSH?Math.max(0,Math.min(1,(+TL_BRUSH.end- +domMin)/span2)):1;
  const slider=document.getElementById("tlSlider"),range=document.getElementById("tlRange"),
        h0=document.getElementById("tlH0"),h1=document.getElementById("tlH1"),
        labL=document.getElementById("tlLabL"),labR=document.getElementById("tlLabR"),
        stateLab=document.getElementById("tlSliderState");
  labL.textContent=fmtD(domMin);labR.textContent=fmtD(new Date(+domMax-86400000));
  const dateAt=f=>new Date(+domMin+span2*f);
  (function monthTicks(){
    let layer=slider.querySelector(".tl-ticks");
    if(!layer){layer=document.createElement("div");layer.className="tl-ticks";slider.appendChild(layer);}
    let html="";
    for(let d=new Date(domMin);d<domMax;d=addMonths(d,1)){
      const f=(+d- +domMin)/span2,mo=d.getMonth(),isQ=mo%3===0,isYear=mo===0;
      if(!isQ)continue; // labeled (quarter) ticks only — no minor month ticks
      html+=`<div class="tk q" style="left:${(f*100).toFixed(2)}%"></div>`;
      html+=`<div class="tkl" style="left:${(f*100).toFixed(2)}%">${isYear?d.getFullYear():d.toLocaleDateString(undefined,{month:"short"})}</div>`;
    }
    layer.innerHTML=html;
  })();
  function paint(){
    const lo=Math.min(f0,f1),hi=Math.max(f0,f1);
    h0.style.left=(f0*100)+"%";h1.style.left=(f1*100)+"%";
    range.style.left=(lo*100)+"%";range.style.width=((hi-lo)*100)+"%";
    const full=lo<=0.0001&&hi>=0.9999;
    stateLab.textContent=full?"Drag to adjust range":`${fmtD(dateAt(lo))} – ${fmtD(dateAt(hi))}`;
    readout.style.display="none";
    const s=dateAt(lo),e=new Date(+dateAt(hi)+1);
    const inRange=dated.filter(c=>{const d=parseDate(c);return d&&d>=s&&d<e;});
    renderTimelineInsights(inRange,s,dateAt(hi));
  }
  function commit(){
    const lo=Math.min(f0,f1),hi=Math.max(f0,f1);
    if(lo<=0.0001&&hi>=0.9999)TL_BRUSH=null;
    else TL_BRUSH={start:dateAt(lo),end:new Date(+dateAt(hi)+1)}; // inclusive end
    renderBrushBar();
  }
  paint();
  function dragHandle(which,clientX){const r=slider.getBoundingClientRect();
    let f=Math.max(0,Math.min(1,(clientX-r.left)/r.width));
    if(which===0)f0=f;else f1=f;paint();}
  function attachDrag(handle,which){
    const down=e=>{e.preventDefault();const move=ev=>dragHandle(which,(ev.touches?ev.touches[0].clientX:ev.clientX));
      const up=()=>{commit();window.removeEventListener("mousemove",move);window.removeEventListener("mouseup",up);
        window.removeEventListener("touchmove",move);window.removeEventListener("touchend",up);};
      window.addEventListener("mousemove",move);window.addEventListener("mouseup",up);
      window.addEventListener("touchmove",move,{passive:false});window.addEventListener("touchend",up);};
    handle.addEventListener("mousedown",down);handle.addEventListener("touchstart",down,{passive:false});
    handle.addEventListener("keydown",e=>{const step=1/Math.max(20,buckets);
      if(e.key==="ArrowLeft"){if(which===0)f0=Math.max(0,f0-step);else f1=Math.max(0,f1-step);paint();commit();e.preventDefault();}
      else if(e.key==="ArrowRight"){if(which===0)f0=Math.min(1,f0+step);else f1=Math.min(1,f1+step);paint();commit();e.preventDefault();}});
  }
  attachDrag(h0,0);attachDrag(h1,1);

  renderBrushBar();
  function renderBrushBar(){if(!brushBar)return;
    if(TL_BRUSH){brushBar.innerHTML=`<button class="btn ghost sm" id="tlClearBrush">Reset range</button>`;
      document.getElementById("tlClearBrush").onclick=()=>{TL_BRUSH=null;f0=0;f1=1;paint();renderBrushBar();};
    }else brushBar.innerHTML="";}
}
function longestStreakWeeks(sortedDates){if(!sortedDates.length)return 0;
  const wk=d=>Math.floor((+d)/ (7*86400000));const weeks=[...new Set(sortedDates.map(wk))].sort((a,b)=>a-b);
  let best=1,run=1;for(let i=1;i<weeks.length;i++){if(weeks[i]===weeks[i-1]+1){run++;best=Math.max(best,run);}else run=1;}return best;}

/* ---------- Connections: ideas marked across books (fuzzy, not exact) ---------- */
const CONN_STOP=new Set("the a an and or but if then than that this these those there here when while with within without of to in on at by for from as is are was were be been being it its it's their them they we you your our his her my me i he she who whom which what whose into over under above below about against between through during before after each any all some most more much many few own same so such no not nor only just very can will would should could may might must shall do does did done has have had how why where whatever whoever however thus hence upon among toward towards because though although yet still ever never always often sometimes one two three first new old good great long little".split(/\s+/));
function stem(w){w=w.toLowerCase();
  w=w.replace(/(ical|ically|ation|ations|ousness|ising|izing|isation|ization)$/,"");
  w=w.replace(/(ing|edly|edness|ness|ments|ment|ions|ion|ities|ity|ously|ous|fully|ful|ently|ent|ance|ence|ies|ism|ist|ize|ise)$/,"");
  w=w.replace(/(ed|es|s)$/,"");
  return w.length>=4?w:w;}
const THEME_DEMOTE=new Set((
  // common verbs
  "make makes made making take takes took get gets got give gives gave go goes went come comes came see sees saw know knows knew think thinks thought say says said tell tells told find finds found want wants wanted use uses used work works worked call called feel felt seem seems become becomes look looks looking keep kept put puts let lets need needs try tries turn turned ask asked show shown move moved live lives lived believe believes "+
  // time words
  "time times day days year years moment moments today tomorrow yesterday now then soon later week month hour minute morning night age ago while during "+
  // vague nouns
  "thing things way ways part parts kind sort lot lots people person man men woman women place places case cases point points fact facts side end side number set group "+
  // UI / export words
  "highlight highlights note notes page pages location loc kindle export import quote quotes vocab vocabulary topic library clipping clippings book books chapter "+
  // generic adjectives
  "good great little big small large high low long short same different other another certain real true false simple whole full main early late best better worse "+
  // auxiliary / adverbial filler — not themes on their own
  "even well every ever never always often also still yet just only quite rather really actually almost enough indeed perhaps maybe somewhat somehow anyway besides meanwhile otherwise however moreover therefore thus hence furthermore nonetheless nevertheless although though unless whereas wherever whenever everything everyone everybody anything anyone somebody something nothing nobody themselves himself herself itself myself yourself ourselves "
).split(/\s+/).filter(Boolean));
function isThemeWord(w){const lw=(w||"").toLowerCase();return lw.length>=4&&!CONN_STOP.has(lw)&&!THEME_DEMOTE.has(lw)&&!(typeof THEME_BAD_WORDS!=="undefined"&&THEME_BAD_WORDS.has(lw));}
function keywordsForClip(c){
  const out=new Map(); // stem -> {disp, weight, entity}
  const add=(s,disp,w,ent)=>{if(!s)return;const ex=out.get(s);if(!ex)out.set(s,{disp,weight:w,entity:!!ent});else{ex.weight=Math.max(ex.weight,w);ex.entity=ex.entity||!!ent;if(disp.length>ex.disp.length||(/[A-Z]/.test(disp)&&!/[A-Z]/.test(ex.disp)))ex.disp=disp;}};
  // detected proper-noun / multiword entities — strongest signal
  const html=annotateTerms(c.text||"");const re=/data-term="([^"]*)"/g;let m;
  while((m=re.exec(html))){const t=m[1].replace(/&quot;/g,'"').replace(/&amp;/g,"&").trim();
    const words=t.split(/\s+/);const cleanWords=words.map(w=>w.replace(/[^A-Za-z]/g,"")).filter(Boolean);
    if(!cleanWords.length)continue;
    const anchor=cleanWords[cleanWords.length-1];
    // multi-word entities are keyed by their whole phrase stem, so "Marco Pierre White"
    // stays distinct from the common word "white" and won't inflate its count
    const key=cleanWords.length>1?cleanWords.map(stem).join(" "):stem(anchor);
    if(anchor.length>=3&&!CONN_STOP.has(anchor.toLowerCase()))add(key,t,cleanWords.length>1?3:2.2,true);}
  // vocab word
  if(c.cat==="vocab"&&isVocabWord(c)){const v=vocabTermOf(c);if(v)add(stem(v),v,2);}
  // multi-word conceptual phrases (adjacent capitalized or content-word bigrams)
  const raw=(c.text||"").split(/\s+/);
  for(let i=0;i<raw.length-1;i++){const a=raw[i].replace(/[^A-Za-z']/g,""),b=raw[i+1].replace(/[^A-Za-z']/g,"");
    if(isThemeWord(a)&&isThemeWord(b)){const phrase=(a+" "+b).toLowerCase();add(stem(a)+" "+stem(b),phrase,2.6);}}
  // single significant content words
  (c.text||"").split(/[^A-Za-z']+/).forEach(w=>{if(!isThemeWord(w))return;const s=stem(w);if(s.length<3)return;add(s,/^[A-Z]/.test(w)?w:w.toLowerCase(),1);});
  return out; // Map stem -> {disp, weight}
}
function termsForClip(c){return [...keywordsForClip(c).values()].map(v=>v.disp);}
function buildConnections(includeSingle){
  const map=new Map(); // stem -> {term, clips:[], books:Set, variants:Set, score}
  STATE.clips.forEach(c=>{if(c.type==="note")return;const ct=cleanTitle(c.title);
    const kw=keywordsForClip(c);
    const boost=1+(c.cat==="topic"?0.6:0)+(c.edited?0.4:0)+(c.cat==="quotes"?0.15:0);
    kw.forEach((v,s)=>{const disp=v.disp;
      if(!map.has(s))map.set(s,{term:disp,clips:[],books:new Set(),variants:new Set(),score:0});
      const e=map.get(s);e.clips.push(c);e.books.add(ct);e.variants.add(disp);
      e.score+=v.weight*boost;
      // label choice: for multi-word stems keep the fullest phrase; for single words
      // prefer the plain lowercase form over a capitalized one (so "fear" not "Fear",
      // and proper nouns that are always capitalized stay capitalized)
      const cur=e.term,multi=/\s/.test(cur)||/\s/.test(disp);
      let take;
      if(multi)take=disp.length>cur.length;
      else{const dLow=disp.toLowerCase()===disp,cLow=cur.toLowerCase()===cur;
        take=(dLow&&!cLow)?true:(!dLow&&cLow)?false:disp.length>cur.length;}
      if(take)e.term=disp;});});
  let groups=[...map.values()];
  groups=groups.filter(g=>includeSingle?g.clips.length>=2:g.books.size>=2);
  groups=groups.filter(g=>{const words=(g.term||"").toLowerCase().split(/[^a-z]+/).filter(Boolean);if(g.term.replace(/[^A-Za-z]/g,"").length<4)return false;if(words.length>3&&words.filter(w=>THEME_BAD_WORDS.has(w)||CONN_STOP.has(w)).length>=2)return false;return !THEME_BAD_WORDS.has(words[0]||"");});
  // multi-word phrases get a presentation bonus when ranking
  groups.forEach(g=>{if(/\s/.test(g.term))g.score*=1.15;});
  groups.sort((a,b)=>b.books.size-a.books.size||b.score-a.score||b.clips.length-a.clips.length||a.term.localeCompare(b.term));
  return groups;
}
/* ---------- Explore data hub ---------- */
let XP_VIEW="words";
let SELECTED_THEME=null;
let CONNECTION_FOCUS=null;
const THEME_BAD_WORDS=new Set("there their them they when what whom whose this that these those would could should about into over under more most much many some such will shall does done have been being from with were your you our his her its".split(/\s+/));
function renderExplore(){
  document.querySelectorAll(".xp-tab").forEach(t=>t.dataset.on=t.dataset.xp===XP_VIEW?1:0);
  document.getElementById("xpConnections").style.display=XP_VIEW==="connections"?"block":"none";
  document.getElementById("xpWords").style.display=XP_VIEW==="words"?"block":"none";
  document.getElementById("xpBooks").style.display=XP_VIEW==="books"?"block":"none";
  if(XP_VIEW==="connections")renderConnections();
  else if(XP_VIEW==="words")renderThemeMap();
  else if(XP_VIEW==="books")renderBookStats();
}
function normThemeTerm(s){return (s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
function topThemesFromClips(clips,limit=5){const freq=new Map();clips.forEach(c=>{if(c.type==="note")return;
    const boost=1+(c.cat==="topic"?0.6:0)+(c.edited?0.4:0)+(c.cat==="quotes"?0.15:0);
    keywordsForClip(c).forEach((v,s)=>{const disp=v.disp;const clean=disp.toLowerCase().replace(/[^a-z]/g,"");
      if(clean.length<4||THEME_BAD_WORDS.has(clean)||THEME_DEMOTE.has(clean)||THEME_BAD_WORDS.has((s||"").toLowerCase()))return;
      if(!freq.has(s))freq.set(s,{term:disp,count:0,score:0,books:new Set(),entity:false});
      const e=freq.get(s);e.count++;e.score+=v.weight*boost;e.books.add(cleanTitle(c.title));e.entity=e.entity||v.entity;if(disp.length>e.term.length)e.term=disp;});});
  return [...freq.values()].map(x=>{
      if(/\s/.test(x.term))x.score*=1.15;
      // case shouldn't matter: general (non-entity) single-word themes display lowercase so "World"/"world" merge cleanly
      if(!x.entity&&!/\s/.test(x.term))x.term=x.term.toLowerCase();
      return x;})
    .filter(x=>{ if(x.entity&&x.count<2)return false; /* one-off proper noun: needs 2+ highlights to count as a theme */ return x.count>=1;})
    .sort((a,b)=>b.score-a.score||b.count-a.count||b.books.size-a.books.size).slice(0,limit);}
function buildThemeGraph(){const groups=buildConnections(true).slice(0,18);
  const nodes=groups.map((g,i)=>({id:"t"+i,term:g.term,count:g.clips.length,books:g.books.size,clips:g.clips}));
  const byClip=new Map();nodes.forEach(n=>n.clips.forEach(c=>{const k=c.fp||clipFp(c);if(!byClip.has(k))byClip.set(k,[]);byClip.get(k).push(n.id);}));
  const edgeMap=new Map();byClip.forEach(ids=>{ids=[...new Set(ids)];for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const k=[ids[i],ids[j]].sort().join("|");edgeMap.set(k,(edgeMap.get(k)||0)+1);}});
  const edges=[...edgeMap.entries()].map(([k,w])=>{const [a,b]=k.split("|");return {a,b,w};}).filter(e=>e.w>0).sort((a,b)=>b.w-a.w).slice(0,28);
  return {nodes,edges};}
// Wordless, data-driven theme-evolution flow: early themes (left) stream to later themes (right).
// Node size = weight, vertical position = rank, colour = category mix. No text.
function themeEvolutionFigure(firstData,secondData){
  const W=760,H=180,padX=70,midL=W*0.30,midR=W*0.70;
  const left=(firstData||[]).slice(0,4),right=(secondData||[]).slice(0,4);
  if(!left.length&&!right.length){
    return `<svg class="evo-figure" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path class="evo-thin" d="M70 90 C 250 60, 510 120, 690 90"/></svg>`;}
  const maxC=Math.max(1,...left.map(d=>d.count),...right.map(d=>d.count));
  const yFor=(i,n)=>30+ (n<=1?0.5:i/(n-1))*(H-60);
  const node=(d,x,i,n)=>{const y=yFor(i,n);const r=7+Math.pow(d.count/maxC,.7)*18;
    return {x,y,r,d};};
  const lnodes=left.map((d,i)=>node(d,midL,i,left.length));
  const rnodes=right.map((d,i)=>node(d,midR,i,right.length));
  // streams: connect each left node to the right node sharing the most books (else nearest rank)
  let streams="";
  lnodes.forEach((ln,i)=>{rnodes.forEach((rn,j)=>{
    const share=[...new Set([...(ln.d.term?[ln.d.term]:[])])];
    // simple affinity: same stem prefix or rank proximity
    const aff=(ln.d.term[0]===rn.d.term[0])?2:0;const close=1-Math.abs(i-j)/Math.max(1,Math.max(lnodes.length,rnodes.length));
    const wgt=aff+close;if(wgt<0.9)return;
    const c1x=ln.x+(rn.x-ln.x)*0.5;
    streams+=`<path class="evo-stream" d="M${ln.x} ${ln.y} C ${c1x} ${ln.y}, ${c1x} ${rn.y}, ${rn.x} ${rn.y}" stroke-width="${(0.8+close*3).toFixed(1)}"/>`;
  });});
  const incoming=`<path class="evo-thin" d="M${padX} ${H/2} C ${midL*0.6} ${H/2}, ${midL*0.7} ${lnodes[0]?lnodes[0].y:H/2}, ${midL} ${lnodes[0]?lnodes[0].y:H/2}"/>`;
  const outgoing=`<path class="evo-thin" d="M${midR} ${rnodes[0]?rnodes[0].y:H/2} C ${midR+40} ${rnodes[0]?rnodes[0].y:H/2}, ${W-padX-30} ${H/2}, ${W-padX} ${H/2}"/>`;
  const dot=nd=>`<circle class="evo-node" cx="${nd.x.toFixed(1)}" cy="${nd.y.toFixed(1)}" r="${nd.r.toFixed(1)}"><title>${escHtml(nd.d.term)} · ${nd.d.count}</title></circle>`;
  return `<svg class="evo-figure" viewBox="0 0 ${W} ${H}" role="img" aria-label="Abstract flow of themes over time">
    ${incoming}${streams}${outgoing}
    ${lnodes.map(dot).join("")}${rnodes.map(dot).join("")}
    <circle class="evo-cap" cx="${padX}" cy="${H/2}" r="4"/><circle class="evo-cap" cx="${W-padX}" cy="${H/2}" r="4"/>
  </svg>`;
}
function themeEvolutionHtml(clips,start,end){const dated=clips.filter(parseDate).sort((a,b)=>parseDate(a)-parseDate(b));
  if(dated.length<4){return `<h2>Theme evolution</h2><p class="evo-copy">Widen the slider to see how your highlighted ideas shift over time.</p>`;}
  const mid=Math.max(1,Math.floor(dated.length/2));const firstHalf=dated.slice(0,mid),secondHalf=dated.slice(mid);
  const first=topThemesFromClips(firstHalf,4),second=topThemesFromClips(secondHalf,4);
  const label=d=>d.toLocaleDateString(undefined,{month:"short",day:"numeric"});
  return `<h2>Theme evolution</h2><p class="evo-copy">From <mark>${label(start)}</mark>, your highlights center on ${first.length?first.slice(0,3).map(x=>`<mark>${escHtml(x.term)}</mark>`).join(", "):"a few scattered ideas"}; by <mark>${label(end)}</mark>, they shift toward ${second.length?second.slice(0,3).map(x=>`<mark>${escHtml(x.term)}</mark>`).join(", "):"newer themes"}.</p>`;}
function renderThemeMap(){const box=document.getElementById("wordCloud");if(!box)return;
  if(!STATE.clips.length){box.innerHTML='<div class="empty">Import highlights first.</div>';return;}
  const {nodes,edges}=buildThemeGraph();if(!nodes.length){box.innerHTML='<div class="empty">Not enough recurring themes yet. Try importing more books or enabling single-book themes in Connections.</div>';return;}
  const W=760,H=520,cx=W/2,cy=H/2;const maxCount=Math.max(...nodes.map(n=>n.count));
  nodes.forEach((n,i)=>{const angle=(Math.PI*2*i/nodes.length)-Math.PI/2;const ring=i<6?150:212;n.x=cx+Math.cos(angle)*ring;n.y=cy+Math.sin(angle)*ring;n.r=14+Math.round(Math.pow(n.count/maxCount,.72)*28);});
  const nodeById=Object.fromEntries(nodes.map(n=>[n.id,n]));const maxEdge=Math.max(1,...edges.map(e=>e.w));const selected=SELECTED_THEME&&nodes.find(n=>n.term===SELECTED_THEME)?SELECTED_THEME:nodes[0].term;SELECTED_THEME=selected;
  box.innerHTML=`<div class="theme-map-wrap"><div class="theme-map-canvas"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Theme map network graph">
    <defs><filter id="themeSoftGlow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="7" result="blur"/><feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.86  0 0 0 0 0.66  0 0 0 0 0.29  0 0 0 .85 0" result="glow"/><feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    ${edges.map(e=>{const a=nodeById[e.a],b=nodeById[e.b];return `<line class="theme-edge" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke-width="${1+(e.w/maxEdge)*5}"/>`;}).join("")}
    ${nodes.slice().sort((a,b)=>(a.term===selected?1:0)-(b.term===selected?1:0)).map(n=>`<g class="theme-node" data-term="${escAttr(n.term)}" data-sel="${n.term===selected?1:0}" tabindex="0" role="button" aria-label="Theme ${escAttr(n.term)}, ${n.count} highlights"><circle class="n-ring" cx="${n.x}" cy="${n.y}" r="${n.r}"${n.term===selected?' filter="url(#themeSoftGlow)"':""}/><text x="${n.x}" y="${n.y+4}" text-anchor="middle">${escHtml(truncTitle(n.term,18))}</text></g>`).join("")}
  </svg><div class="theme-legend"><span>nodes = themes</span><span>size = highlights</span><span>line = co-occurrence</span></div></div><aside class="theme-detail" id="themeDetail"></aside></div>`;
  box.querySelectorAll(".theme-node").forEach(n=>{const open=()=>{SELECTED_THEME=n.dataset.term;renderThemeMap();};n.onclick=open;n.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open();}};});
  renderThemeDetail(nodes.find(n=>n.term===selected)||nodes[0]);}
function renderThemeDetail(node){const pane=document.getElementById("themeDetail");if(!pane||!node)return;
  const books=[...new Set(node.clips.map(c=>cleanTitle(c.title)))];
  pane.innerHTML=`<h2>${escHtml(node.term)}</h2><div class="td-meta">${node.count} highlights · ${books.length} book${books.length===1?"":"s"}</div>
    <div class="td-actions"><button class="btn sm" id="themeOpenConn">Open in Connections</button></div>
    ${node.clips.slice(0,6).map(c=>`<div class="theme-hit"><span class="src">${escHtml(cleanTitle(c.title))}${c.page?" · p. "+escHtml(c.page):""}</span>${escHtml(c.text.length>190?c.text.slice(0,187)+"…":c.text)}</div>`).join("")}`;
  document.getElementById("themeOpenConn").onclick=()=>openConnectionsForTheme(node.term);}
function openConnectionsForTheme(term){
  CONNECTION_FOCUS=term;XP_VIEW="connections";
  const tab=document.querySelector('.tab[data-page="connections"]');if(tab)tab.click();else renderExplore();
  setTimeout(()=>{const el=document.querySelector('.conn-group.focus');if(el)el.scrollIntoView({behavior:"smooth",block:"start"});},60);
}
/* ---------- Memory (semantic) search — supplements inline filtering ---------- */
function tokenizeQuery(q){return (q||"").toLowerCase().split(/[^a-z0-9']+/).filter(w=>w.length>2&&!(typeof CONN_STOP!=="undefined"&&CONN_STOP.has(w)));}
function memoryScore(c,terms,q){const hay=[c.text,cleanTitle(c.title),c.author,...termsForClip(c)].join(" ").toLowerCase();
  let score=0,matched=0;for(const t of terms){let hit=false;if(hay.includes(t)){score+=3;hit=true;}const st=stem(t);if(st!==t&&hay.includes(st)){score+=2;hit=true;}if(hit)matched++;}
  if(terms.length>1){score+=matched*matched*0.8;if(q&&(c.text||"").toLowerCase().includes(q))score+=5;} // reward covering more query terms + exact phrase
  if(c.cat==="quotes")score+=0.3;if(c.cat==="topic")score+=0.2;return score;}
function renderMemoryResults(){const input=document.getElementById("q"),box=document.getElementById("memoryResults");if(!input||!box||PAGE!=="library")return;
  const q=input.value.trim();if(q.length<2||!STATE.clips.length){box.classList.remove("show");box.innerHTML="";return;}
  const terms=tokenizeQuery(q);if(!terms.length){box.classList.remove("show");box.innerHTML="";return;}
  const ql=q.toLowerCase();
  const scored=STATE.clips.filter(c=>c.type!=="note").map(c=>({c,score:memoryScore(c,terms,ql)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  const top=scored.length?scored[0].score:0,floor=Math.max(3,top*0.5); // drop weak matches once a strong one exists
  const hits=scored.filter(x=>x.score>=floor).slice(0,8);
  if(!hits.length){box.classList.remove("show");box.innerHTML="";return;}
  box.innerHTML=`<div class="memory-lead">Closest matches</div>`+hits.map(({c,score})=>`<button class="memory-hit" data-fp="${escAttr(c.fp)}" type="button"><b>${escHtml(c.text.length>150?c.text.slice(0,147)+"…":c.text)}</b><div class="src">${escHtml(cleanTitle(c.title))}${c.author?" · "+escHtml(c.author):""}${c.page?" · p. "+escHtml(c.page):""}</div><span class="score">${Math.round(score)}</span></button>`).join("");
  box.classList.add("show");box.querySelectorAll(".memory-hit[data-fp]").forEach(btn=>btn.onclick=()=>jumpToMemoryHit(btn.dataset.fp));}
function jumpToMemoryHit(fp){const c=STATE.clips.find(x=>x.fp===fp);if(!c)return;
  // the live text filter OR an off category chip may be hiding this clip — clear/enable both so it always renders
  QUERY="";const qel=document.getElementById("q");if(qel)qel.value="";
  const cb=document.getElementById("clearSearch");if(cb)cb.style.display="none";
  document.querySelectorAll('#catFilters .chip').forEach(ch=>ch.dataset.on="1");
  if(typeof CAT_FILTER!=="undefined"&&CAT_FILTER)Object.keys(CAT_FILTER).forEach(k=>CAT_FILTER[k]=true);
  render();
  const box=document.getElementById("memoryResults");if(box){box.classList.remove("show");box.innerHTML="";}
  const sec=document.getElementById("book-"+slug(cleanTitle(c.title)));if(sec)sec.classList.remove("collapsed");
  setTimeout(()=>{const t=document.querySelector(`.clip[data-fp="${CSS.escape(fp)}"]`);if(t){t.scrollIntoView({behavior:"smooth",block:"center"});t.classList.add("pulse");setTimeout(()=>t.classList.remove("pulse"),1800);}},40);}
/* ---------- Timeline insights (recap + theme evolution) ---------- */
function renderTimelineInsights(clips,start,end){const recap=document.getElementById("tlRecap"),evo=document.getElementById("tlEvolution");if(!recap||!evo)return;
  if(!clips.length){recap.innerHTML="";evo.innerHTML="";return;}
  const fmt=d=>d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
  const total=clips.length,books=[...new Set(clips.map(c=>cleanTitle(c.title)))];const by=k=>clips.filter(c=>c.cat===k).length;const pct=n=>total?Math.round(n/total*100):0;
  const themes=topThemesFromClips(clips,5);const titleCounts=new Map();clips.forEach(c=>titleCounts.set(cleanTitle(c.title),(titleCounts.get(cleanTitle(c.title))||0)+1));
  const topTitle=[...titleCounts.entries()].sort((a,b)=>b[1]-a[1])[0]||["—",0];
  recap.innerHTML=`<h2>Recap</h2><div class="tl-subtle">${fmt(start)} – ${fmt(end)}</div>
    <div class="recap-grid"><div class="recap-stat"><b>${total}</b><span>highlights</span></div><div class="recap-stat"><b>${books.length}</b><span>books</span></div><div class="recap-stat"><b>${pct(by("quotes"))}%</b><span>quotes</span></div><div class="recap-stat"><b>${pct(by("topic"))}%</b><span>topics</span></div></div>
    <div class="tl-subtle"><b style="color:var(--ink)">Most highlighted:</b> ${escHtml(topTitle[0])} · ${topTitle[1]} highlight${topTitle[1]===1?"":"s"}</div>
    <div class="recap-bars">${themes.length?themes.map(t=>`<div class="recap-bar"><span>${escHtml(t.term)}</span><i style="width:${Math.max(12,Math.round(t.count/(themes[0].count||1)*100))}%"></i><em>${t.count}</em></div>`).join(""):'<div class="tl-subtle">No recurring themes yet in this range.</div>'}</div>`;
  evo.innerHTML=themeEvolutionHtml(clips,start,end);
}
/* ---------- Visitor counter (real global count via free CountAPI) ---------- */
async function updateVisitorInfo(){const el=document.getElementById("visitorInfo");if(!el)return;
  let n=null;
  try{const seen=sessionStorage.getItem("marginalia.counted");
    const url=seen?"https://api.countapi.xyz/get/marginalia.app/visits"
                  :"https://api.countapi.xyz/hit/marginalia.app/visits";
    const r=await fetch(url);if(r.ok){const j=await r.json();if(typeof j.value==="number"){n=j.value;sessionStorage.setItem("marginalia.counted","1");}}
  }catch(e){}
  let code="";
  try{const r=await fetch("https://ipapi.co/json/");if(r.ok){const j=await r.json();code=(j.country_code||j.country||"").toUpperCase();}}catch(e){}
  if(n==null){el.textContent=code?`(${code})`:"";return;}
  el.textContent=`${n.toLocaleString()} visitor${n===1?"":"s"}${code?` (${code})`:""}`;
}
function vocabRarity(w){w=(w||"").toLowerCase();
  // offline rarity proxy: longer words and uncommon letter patterns rank higher;
  // very common words rank low. Not a corpus frequency, but a reasonable ordering.
  let score=w.length*1.0;
  if(/[qzjx]/.test(w))score+=3;if(/(ph|rh|ae|oe|eu|gn|mn)/.test(w))score+=2;
  if(/(tion|ity|ous|ism|esce|ulent|idian|ial)$/.test(w))score+=2;
  if(w.length<=5)score-=3;
  return score;}
function renderBookStats(){const box=document.getElementById("bookStats");if(!box)return;
  const books=groupByBook();
  if(!books.length){box.innerHTML='<div class="empty">Import highlights first.</div>';return;}
  const fmt=d=>d?d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}):"—";
  const rows=books.map(b=>{const by={vocab:0,quotes:0,topic:0,none:0};
    b.clips.forEach(c=>by[c.cat]=(by[c.cat]||0)+1);
    const dates=b.clips.map(parseDate).filter(Boolean).sort((a,b)=>a-b);
    const total=b.clips.length;const maxBar=total||1;
    const segLab={vocab:"vocabulary",quotes:"quote",topic:"topic of interest",none:"untagged"};
    const seg=(k,col)=>by[k]?`<span style="background:${col};width:${by[k]/maxBar*100}%"></span>`:"";
    const legend=`<div class="bs-legend">`+[["vocab","var(--cat-vocab)"],["quotes","var(--cat-quotes)"],["topic","var(--cat-topic)"],["none","var(--cat-none)"]].filter(([k])=>by[k]).map(([k,col])=>`<span class="bs-leg"><i style="background:${col}"></i>${by[k]} ${segLab[k]} · ${Math.round(by[k]/maxBar*100)}%</span>`).join("")+`</div>`;
    // per-book vocab ranked by rarity/difficulty
    const vocab=[...new Set(b.clips.filter(c=>c.cat==="vocab"&&isVocabWord(c)).map(c=>vocabTermOf(c)).filter(Boolean))]
      .sort((x,y)=>vocabRarity(y)-vocabRarity(x)).slice(0,8);
    return {b,by,total,first:dates[0],last:dates[dates.length-1],vocab,legend,
      bar:`<div class="bs-bar">${seg("vocab","var(--cat-vocab)")}${seg("quotes","var(--cat-quotes)")}${seg("topic","var(--cat-topic)")}${seg("none","var(--cat-none)")}</div>`};
  }).sort((a,b)=>b.total-a.total);
  box.innerHTML=rows.map(r=>{
    const rangeTxt=r.first?(r.last&&+r.last!==+r.first?fmt(r.first)+" – "+fmt(r.last):fmt(r.first)):"—";
    return `<div class="bs-row">
      <div class="bs-head"><span class="bs-title">${escHtml(r.b.title)}</span><span class="bs-author">${escHtml(r.b.author||"")}</span><span class="bs-headspacer"></span><span class="bs-range">${rangeTxt}</span><span class="bs-count">${r.total}</span></div>
      ${r.bar}${r.legend}
      ${r.vocab.length?`<div class="bs-vocab">${r.vocab.map(w=>`<button class="bs-vocab-word" data-q="${escAttr(w)}">${escHtml(w)}</button>`).join("")}</div>`:""}
    </div>`;}).join("");
  box.querySelectorAll(".bs-vocab-word").forEach(w=>w.onclick=()=>{QUERY=w.dataset.q;const qel=document.getElementById("q");if(qel)qel.value=QUERY;document.querySelector('.tab[data-page="library"]').click();render();document.getElementById("list").scrollIntoView({behavior:"smooth"});});
}
function renderImportHistory(){const box=document.getElementById("importHistory");if(!box)return;
  if(!IMPORT_LOG.length){box.innerHTML='<div class="empty">No imports yet. Your import history will appear here.</div>';return;}
  const fmt=t=>new Date(t).toLocaleString(undefined,{month:"short",day:"numeric",year:"2-digit",hour:"numeric",minute:"2-digit"});
  box.innerHTML=`<table class="rv-hist"><thead><tr><th>When</th><th>File</th><th>New</th><th>Updated</th><th>Library total</th></tr></thead><tbody>`+
    IMPORT_LOG.map(r=>`<tr><td>${fmt(r.date)}</td><td>${escHtml(r.name||"import")}</td><td>${r.added}</td><td>${r.updated}</td><td>${r.total}</td></tr>`).join("")+
    `</tbody></table>`;
}
function renderDropPanel(){const box=document.getElementById("dropPanel");if(typeof updateLibSwitch==="function")updateLibSwitch();if(!box)return;
  const libs=listLibraries();
  if(!libs.length){box.innerHTML="";return;}
  const fmt=t=>new Date(t).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
  const activeLib=LIBRARIES.find(l=>l.id===ACTIVE_LIB);
  const hasContent=LIBRARIES.some(l=>(l.clips||[]).length);
  const batches=activeLib?(activeLib.importLog||IMPORT_LOG):[];
  box.innerHTML=`
    <div class="dp-card">
      <div class="dp-head">Your libraries</div>
      <div class="dp-libs">
        ${libs.map(l=>`<div class="dp-lib${l.active?" on":""}" data-id="${l.id}">
          <button class="dp-libname" data-act="switch" data-id="${l.id}">${escHtml(l.name)}<span class="dp-count">${l.count}</span></button>
          <button class="dp-mini" data-act="rename" data-id="${l.id}" title="Rename">✎</button>
          <button class="dp-mini" data-act="delete" data-id="${l.id}" title="Delete">✕</button>
        </div>`).join("")}
      </div>
      <div class="dp-actions">
        ${hasContent?`<button class="btn sm" data-act="done">← Back to library</button>`:""}
        <button class="btn sm" data-act="new">＋ New library</button>
        ${activeLib&&activeLib.clips&&activeLib.clips.length?`<button class="btn ghost sm" data-act="export">Export JSON backup</button><button class="btn ghost sm" data-act="dedup">Remove duplicates</button>`:""}
      </div>
      ${batches&&batches.length?`
        <div class="dp-head" style="margin-top:18px">Imports in “${escHtml(activeLib.name)}”</div>
        <table class="rv-hist"><thead><tr><th>When</th><th>File</th><th>New</th><th>Updated</th><th></th></tr></thead><tbody>
        ${batches.map(r=>`<tr><td>${fmt(r.date)}</td><td>${escHtml(r.name||"import")}</td><td>${r.added}</td><td>${r.updated||0}</td><td>${r.batch?`<button class="dp-mini" data-act="rmbatch" data-batch="${r.batch}" title="Undo this import">undo</button>`:""}</td></tr>`).join("")}
        </tbody></table>`:""}
    </div>`;
  box.querySelectorAll("[data-act]").forEach(el=>{el.onclick=()=>{
    const act=el.dataset.act,id=el.dataset.id;
    if(act==="switch")switchLibrary(id);
    else if(act==="new"){const n=prompt("Name the new library:","My Library");if(n!==null)createLibrary(n.trim()||"My Library");}
    else if(act==="rename"){const lib=LIBRARIES.find(l=>l.id===id);const n=prompt("Rename library:",lib?lib.name:"");if(n!==null&&n.trim())renameLibrary(id,n.trim());}
    else if(act==="delete"){const lib=LIBRARIES.find(l=>l.id===id);if(confirm(`Delete library “${lib?lib.name:""}” and all its highlights? This can't be undone.`))deleteLibrary(id);}
    else if(act==="export")exportLibraryJson();
    else if(act==="dedup")dedupActiveLibrary();
    else if(act==="rmbatch"){if(confirm("Undo this import — remove the highlights it added?"))removeImportBatch(el.dataset.batch);}
    else if(act==="done")closeImport();
  };});
}
// Leave the import / restore / history view without taking any action (only if there's a library to return to)
function closeImport(){if(!LIBRARIES.some(l=>(l.clips||[]).length))return;
  document.getElementById("drop").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  render();if(typeof showSurprise==="function")showSurprise();}
function renderConnections(){const box=document.getElementById("connList");if(!box)return;
  if(!STATE.clips.length){box.innerHTML='<div class="empty">Import highlights first, on the Library tab.</div>';return;}
  const includeSingle=document.getElementById("connAll").checked;
  let groups=buildConnections(includeSingle);
  // when opened from a theme, keep the natural ranked order and just reveal/scroll to the theme in its place
  if(!groups.length){box.innerHTML=`<div class="empty">No recurring terms found${includeSingle?"":" across multiple books — try the toggle above"}.</div>`;return;}
  box.innerHTML=groups.map((g,i)=>{
    const focused=CONNECTION_FOCUS&&(normThemeTerm(g.term)===normThemeTerm(CONNECTION_FOCUS)||normThemeTerm(g.term).includes(normThemeTerm(CONNECTION_FOCUS))||normThemeTerm(CONNECTION_FOCUS).includes(normThemeTerm(g.term)));
    const chips=[...g.books].map(b=>`<span class="conn-book">${escHtml(b)}</span>`).join("");
    const items=g.clips.map(c=>`<div class="conn-clip"><span class="conn-src"><b>${escHtml(cleanTitle(c.title))}</b>${c.author?` · ${escHtml(c.author)}`:""}${c.page?" · p."+escHtml(c.page):""}</span>${escHtml(c.text)}</div>`).join("");
    return `<div class="conn-group${focused?" focus":""}"><div class="conn-head" data-i="${i}">
        <span class="conn-term">${escHtml(g.term)}</span>
        <span class="conn-meta">${g.books.size} books · ${g.clips.length} highlights</span>
        <span class="caret">▾</span></div>
      <div class="conn-clips">${items}</div></div>`;
  }).join("");
  box.querySelectorAll(".conn-head").forEach(h=>h.onclick=()=>h.parentElement.classList.toggle("collapsed"));
}

/* ---------- In-app spaced-repetition review ---------- */
let RV={active:false,cards:[],i:0,flipped:false,again:[],session:null};
const GRADES=[{k:1,label:"Again",cls:"g-again"},{k:2,label:"Hard",cls:"g-hard"},{k:3,label:"Good",cls:"g-good"},{k:4,label:"Easy",cls:"g-easy"}];
let REVIEW_SUB="flash"; // flash | anki
function showReviewSub(which){
  REVIEW_SUB=which;
  document.querySelectorAll(".rv-subtab").forEach(t=>t.dataset.on=t.dataset.rv===which?1:0);
  const f=document.getElementById("rvFlash"),a=document.getElementById("rvAnki");
  if(f)f.style.display=which==="flash"?"block":"none";
  if(a)a.style.display=which==="anki"?"block":"none";
  if(which==="anki"){endReview();renderAnki();}
}
function resetReviewSetup(){
  document.getElementById("reviewSetup").classList.remove("hidden");
  document.getElementById("reviewStage").classList.add("hidden");
  document.getElementById("reviewStage").innerHTML="";RV.active=false;
  renderResumeBar();
  renderDeckContents();
  renderReviewHistory();
  showReviewSub(REVIEW_SUB);
}
let DECK_GROUP="tag"; // tag | book
let DECK_SORT="rare"; // rare | reviewed | hard
function stripTrailingPunct(s){return (s||"").replace(/[\s.,;:!?]+$/,"").trim();}
function reviewOf(c){const r=c&&c.review;return {count:r?r.count:0,grades:r?(r.grades||[]):[]};}
function avgGrade(g){return g.length?g.reduce((a,b)=>a+b,0)/g.length:null;}
function renderDeckContents(){const box=document.getElementById("deckContents");if(!box)return;
  const lib=LIBRARIES.find(l=>l.id===ACTIVE_LIB);const flagged=(lib&&lib.flagged)||[];
  const flaggedSet=new Set(flagged);
  const byId=new Map(STATE.clips.filter(c=>c.type!=="note").map(c=>[cardId(c),c]));
  const isFlagged=c=>flaggedSet.has(cardId(c));
  // vocab terms (deduped), flagged cards excluded from the main lists
  const vocabClips=STATE.clips.filter(c=>c.cat==="vocab"&&isVocabWord(c)&&!isFlagged(c));
  const vocabMap=new Map();
  vocabClips.forEach(c=>{const t=vocabTermOf(c);if(!t)return;if(!vocabMap.has(t))vocabMap.set(t,{term:t,clip:c,count:0,grades:[]});const e=vocabMap.get(t);const r=reviewOf(c);e.count+=r.count;e.grades=e.grades.concat(r.grades);});
  let vocab=[...vocabMap.values()];
  const topics=STATE.clips.filter(c=>c.cat==="topic"&&!isFlagged(c));
  if(!vocab.length&&!topics.length&&!flagged.length){box.innerHTML="";return;}
  const sortVocab=arr=>{
    if(DECK_SORT==="reviewed")return arr.sort((a,b)=>b.count-a.count||vocabRarity(b.term)-vocabRarity(a.term));
    if(DECK_SORT==="hard")return arr.sort((a,b)=>{const ga=avgGrade(a.grades),gb=avgGrade(b.grades);return (ga==null?99:ga)-(gb==null?99:gb)||b.count-a.count;});
    return arr.sort((a,b)=>vocabRarity(b.term)-vocabRarity(a.term));};
  const sortTopics=arr=>{
    if(DECK_SORT==="reviewed")return arr.sort((a,b)=>reviewOf(b).count-reviewOf(a).count);
    if(DECK_SORT==="hard")return arr.sort((a,b)=>{const ga=avgGrade(reviewOf(a).grades),gb=avgGrade(reviewOf(b).grades);return (ga==null?99:ga)-(gb==null?99:gb);});
    return arr;};
  const rvn=n=>n?`<span class="rvn" title="${n} review${n===1?"":"s"}">×${n}</span>`:"";
  const vBtn=o=>`<button class="deck-word" data-q="${escAttr(o.term)}" data-cid="${escAttr(cardId(o.clip))}">${escHtml(o.term)}${rvn(o.count)}<span class="add-deck" data-add="${escAttr(cardId(o.clip))}" title="Add to a deck">＋</span></button>`;
  const tBtn=c=>{const full=stripTrailingPunct(c.text);const t=full.length>54?full.slice(0,52)+"…":full;
    return `<button class="deck-word topicw" data-q="${escAttr(c.text.slice(0,40))}" data-cid="${escAttr(cardId(c))}" title="${escAttr(cleanTitle(c.title))}">${escHtml(t)}${rvn(reviewOf(c).count)}<span class="add-deck" data-add="${escAttr(cardId(c))}" title="Add to a deck">＋</span></button>`;};
  const section=(head,sub,inner)=>`<div class="deck-section"><div class="deck-col-head">${escHtml(head)}${sub?`<span class="deck-sub">${escHtml(sub)}</span>`:""}</div><div class="deck-words">${inner||'<span class="deck-empty">none</span>'}</div></div>`;
  let sections="";
  if(DECK_GROUP==="book"){
    groupByBook().forEach(b=>{
      const vs=b.clips.filter(c=>c.cat==="vocab"&&isVocabWord(c)&&!isFlagged(c)).map(c=>{const r=reviewOf(c);return {term:vocabTermOf(c),clip:c,count:r.count,grades:r.grades};});
      const ts=b.clips.filter(c=>c.cat==="topic"&&!isFlagged(c));
      if(!vs.length&&!ts.length)return;
      sections+=section(b.title,b.author||"",sortVocab(vs).map(vBtn).join("")+sortTopics(ts).map(tBtn).join(""));
    });
  }else{
    const subLab=DECK_SORT==="reviewed"?"most reviewed":DECK_SORT==="hard"?"hardest first":"rare → common";
    sections+=section("vocabulary",subLab,vocab.length?sortVocab(vocab).map(vBtn).join(""):"");
    sections+=section("topic of interest",DECK_SORT==="rare"?"":subLab,topics.length?sortTopics(topics).map(tBtn).join(""):"");
  }
  const flaggedCards=flagged.map(id=>byId.get(id)).filter(Boolean);
  box.innerHTML=`
    <div class="deck-toolbar">
      <span class="deck-head-lab">Deck contents</span>
      <span class="deck-sub">${vocab.length} vocab · ${topics.length} topics</span>
      <span class="deck-group">
        <button data-grp="tag" data-on="${DECK_GROUP==="tag"?1:0}">by tag</button>
        <button data-grp="book" data-on="${DECK_GROUP==="book"?1:0}">by book</button>
      </span>
      <select class="filter deck-sortsel" id="deckSortSel" title="Sort terms">
        <option value="rare"${DECK_SORT==="rare"?" selected":""}>rarest first</option>
        <option value="reviewed"${DECK_SORT==="reviewed"?" selected":""}>most reviewed</option>
        <option value="hard"${DECK_SORT==="hard"?" selected":""}>hardest first</option>
      </select>
    </div>
    <div class="deck-sections">${sections}</div>
    ${flaggedCards.length?`<div class="deck-flagged-sec"><div class="dfh">⚑ Flagged (${flaggedCards.length}) <button class="btn ghost sm" id="reviewFlagged">Review flagged</button> <button class="btn ghost sm" id="clearFlagged">Clear all</button></div><div>${flaggedCards.map(c=>`<span class="flag-card" title="${escAttr(cleanTitle(c.title))}">${escHtml(c.cat==="vocab"&&isVocabWord(c)?vocabTermOf(c):(c.text.length>40?c.text.slice(0,38)+"…":c.text))}<button data-unflag="${escAttr(cardId(c))}" title="Remove flag" aria-label="Remove flag">✕</button></span>`).join("")}</div></div>`:""}
  `;
  box.querySelectorAll(".deck-group button[data-grp]").forEach(b=>b.onclick=()=>{DECK_GROUP=b.dataset.grp;renderDeckContents();});
  const dss=document.getElementById("deckSortSel");if(dss)dss.onchange=()=>{DECK_SORT=dss.value;renderDeckContents();};
  box.querySelectorAll(".add-deck").forEach(b=>b.onclick=ev=>{ev.stopPropagation();const c=byId.get(b.dataset.add);if(c)chooseDeckFor(c);});
  box.querySelectorAll(".deck-word").forEach(w=>w.onclick=()=>{QUERY=w.dataset.q;const qel=document.getElementById("q");if(qel)qel.value=QUERY;document.querySelector('.tab[data-page="library"]').click();render();document.getElementById("list").scrollIntoView({behavior:"smooth"});});
  const rf=document.getElementById("reviewFlagged");if(rf)rf.onclick=()=>startFlaggedReview();
  const cf=document.getElementById("clearFlagged");if(cf)cf.onclick=()=>{if(lib){lib.flagged=[];}STATE.clips.forEach(c=>c.flagged=false);saveState();renderDeckContents();};
  box.querySelectorAll("[data-unflag]").forEach(b=>b.onclick=()=>{const id=b.dataset.unflag;if(lib&&lib.flagged)lib.flagged=lib.flagged.filter(x=>x!==id);const c=byId.get(id);if(c)c.flagged=false;saveState();renderDeckContents();});
}
function startFlaggedReview(){const lib=LIBRARIES.find(l=>l.id===ACTIVE_LIB);const flagged=(lib&&lib.flagged)||[];
  const byFp=new Map(STATE.clips.filter(c=>c.type!=="note").map(c=>[cardId(c),c]));
  const cards=flagged.map(fp=>byFp.get(fp)).filter(Boolean);
  if(!cards.length){toast("No flagged cards.");return;}
  RV={active:true,cards,i:0,flipped:false,again:[],session:{started:Date.now(),total:cards.length,grades:{1:0,2:0,3:0,4:0},seen:0}};
  setSavedSession(null);document.getElementById("reviewSetup").classList.add("hidden");document.getElementById("reviewStage").classList.remove("hidden");drawReviewCard();}
function renderResumeBar(){const bar=document.getElementById("reviewResume");if(!bar)return;
  const s=getSavedSession();
  if(s&&s.remaining&&s.remaining.length){
    bar.style.display="";
    bar.innerHTML=`<span>You have a paused session — <b>${s.remaining.length}</b> card${s.remaining.length===1?"":"s"} left (${s.seen||0} done).</span>
      <span class="rr-btns"><button class="btn sm" id="rrResume">Resume</button><button class="btn ghost sm" id="rrDiscard">Discard</button></span>`;
    document.getElementById("rrResume").onclick=resumeReview;
    document.getElementById("rrDiscard").onclick=()=>{setSavedSession(null);renderResumeBar();};
  }else bar.style.display="none";
}
function getSavedSession(){const lib=LIBRARIES.find(l=>l.id===ACTIVE_LIB);return lib?lib.reviewSession:null;}
function setSavedSession(s){const lib=LIBRARIES.find(l=>l.id===ACTIVE_LIB);if(lib){lib.reviewSession=s;}saveState();}
function reviewCats(){const cats={};document.querySelectorAll("#reviewCats .chip").forEach(ch=>cats[ch.dataset.cat]=ch.dataset.on==="1");return cats;}
function cardId(c){return c.fp||clipFp(c);}
function saveReviewSession(){
  if(!RV.active||!RV.session)return;
  // remaining = cards not yet graded this pass (from current index onward) + the again queue
  const remaining=RV.cards.slice(RV.i).map(cardId).concat(RV.again.map(cardId));
  setSavedSession({remaining,grades:RV.session.grades,seen:RV.session.seen,started:RV.session.started,total:RV.session.total});
}
function resumeReview(){
  const s=getSavedSession();if(!s||!s.remaining||!s.remaining.length){renderResumeBar();return;}
  const byFp=new Map(STATE.clips.filter(c=>c.type!=="note").map(c=>[cardId(c),c]));
  const cards=s.remaining.map(fp=>byFp.get(fp)).filter(Boolean);
  if(!cards.length){toast("Those cards are no longer in this library.");setSavedSession(null);renderResumeBar();return;}
  RV={active:true,cards,i:0,flipped:false,again:[],
    session:{started:s.started||Date.now(),total:s.total||cards.length,grades:s.grades||{1:0,2:0,3:0,4:0},seen:s.seen||0}};
  setSavedSession(null);
  document.getElementById("reviewSetup").classList.add("hidden");
  document.getElementById("reviewStage").classList.remove("hidden");
  drawReviewCard();
}
function startReview(){
  const cats=reviewCats();
  let pool=STATE.clips.filter(c=>c.type!=="note"&&c.cat!=="quotes"&&cats[c.cat]);
  if(!pool.length){toast("No cards match — pick at least one category with highlights.");return;}
  // Build a fresh batch each time: a mix of less-reviewed and previously-reviewed cards,
  // so you don't have to grind the whole library in one sitting.
  const shuffle=a=>a.map(x=>[Math.random(),x]).sort((p,q)=>p[0]-q[0]).map(p=>p[1]);
  const seen=shuffle(pool.filter(c=>reviewOf(c).count>0));
  const fresh=shuffle(pool.filter(c=>reviewOf(c).count===0));
  const BATCH=Math.min(20,pool.length);
  // favor under-reviewed cards but always fold in some previously-seen ones for spacing
  const seenTake=Math.min(seen.length,Math.round(BATCH*0.35));
  let cards=fresh.slice(0,BATCH-seenTake).concat(seen.slice(0,seenTake));
  if(cards.length<BATCH){const extra=fresh.slice(BATCH-seenTake).concat(seen.slice(seenTake));cards=cards.concat(extra.slice(0,BATCH-cards.length));}
  cards=shuffle(cards);
  RV={active:true,cards,i:0,flipped:false,again:[],
    session:{started:Date.now(),total:cards.length,grades:{1:0,2:0,3:0,4:0},seen:0}};
  setSavedSession(null);
  document.getElementById("reviewSetup").classList.add("hidden");
  document.getElementById("reviewStage").classList.remove("hidden");
  drawReviewCard();
}
function clozeFront(c){
  // Vocab: show the word, define on the back. Topics: show the full text, reveal source context on the back.
  if(c.cat==="vocab"&&isVocabWord(c))return {front:vocabTermOf(c)||c.text,hint:"",answer:c.text,kind:"vocab"};
  const terms=termsForClip(c);
  return {front:stripTrailingPunct(c.text),hint:"",answer:stripTrailingPunct(terms[0]||""),kind:"quote"};
}
async function drawReviewCard(){
  const stage=document.getElementById("reviewStage");
  if(RV.i>=RV.cards.length){
    if(RV.again.length){RV.cards=RV.again;RV.again=[];RV.i=0;RV.flipped=false;
      stage.innerHTML=`<div class="rv-card"><div class="rv-done">Round complete — ${RV.cards.length} to see again.</div><div class="rv-controls"><button class="btn" id="rvContinue">Continue (${RV.cards.length})</button><button class="btn ghost" id="rvEnd">Finish</button></div></div>`;
      document.getElementById("rvContinue").onclick=drawReviewCard;document.getElementById("rvEnd").onclick=finishReview;return;}
    finishReview();return;
  }
  const c=RV.cards[RV.i];const cz=clozeFront(c);const n=RV.cards.length;
  const progress=`${RV.i+1} / ${n}`;
  const catCls=c.cat==="vocab"?"c-vocab":"c-topic";const frontCls=c.cat==="vocab"?"is-vocab":"is-topicc";
  stage.innerHTML=`<div class="rv-topbar"><span class="rv-progress">${progress}</span><div class="rv-topbtns"><button class="btn ghost sm" id="rvPrev" title="Previous card"${RV.i===0?" disabled":""}>← Back</button><button class="btn ghost sm" id="rvSkip" title="Skip — move on without recording">Skip</button><button class="btn ghost sm" id="rvFlag" title="Flag a problem with this card">⚑ Flag</button><button class="btn ghost sm" id="rvSaveExit">Save &amp; exit</button></div></div>
    <div class="rv-card">
      <div class="rv-cat lab ${catCls}">${CAT_LABELS[c.cat]||"untagged"}</div>
      <div class="rv-front ${frontCls}${cz.kind==="quote"?" is-quote":""}">${escHtml(cz.front)} ${cz.hint?`<span class="rv-hintlabel">${cz.hint}</span>`:""}</div>
      <div class="rv-back" id="rvBack" style="display:none"><div class="rv-loading">Looking up…</div></div>
      <div class="rv-src">${escHtml(cleanTitle(c.title))}${c.author?" · "+escHtml(c.author):""}${c.page?" · p."+escHtml(c.page):""}</div>
      <div class="rv-controls" id="rvControls">
        <button class="btn ghost" id="rvFlip">Flip (Space)</button>
      </div>
      <div class="rv-cardbtns"><button class="rv-minilink" id="rvFind">Find in library</button><button class="rv-minilink" id="rvAddDeck">Add to deck</button></div>
    </div>`;
  RV.flipped=false;
  document.getElementById("rvFlip").onclick=flipReviewCard;
  document.getElementById("rvSkip").onclick=skipReview;
  document.getElementById("rvPrev").onclick=goBackReview;
  document.getElementById("rvFind").onclick=()=>jumpToClipInLibrary(c);
  document.getElementById("rvAddDeck").onclick=()=>chooseDeckFor(c);
  document.getElementById("rvFlag").onclick=()=>flagReview(c);
  document.getElementById("rvSaveExit").onclick=()=>{saveReviewSession();resetReviewSetup();toast("Session saved — resume any time.");};
}
function goBackReview(){if(!RV.active||RV.i<=0)return;RV.i--;RV.flipped=false;drawReviewCard();}
function jumpToClipInLibrary(c){
  endReview();
  QUERY="";const qel=document.getElementById("q");if(qel)qel.value="";
  // make sure every category is visible so the target clip actually renders
  document.querySelectorAll('#catFilters .chip').forEach(ch=>ch.dataset.on="1");
  if(typeof CAT_FILTER!=="undefined"&&CAT_FILTER)Object.keys(CAT_FILTER).forEach(k=>CAT_FILTER[k]=true);
  const tab=document.querySelector('.tab[data-page="library"]');if(tab)tab.click();
  render();
  const fp=cardId(c);
  setTimeout(()=>{const t=document.querySelector(`.clip[data-fp="${CSS.escape(fp)}"]`);if(t){const bk=t.closest(".book");if(bk)bk.classList.remove("collapsed");t.scrollIntoView({behavior:"smooth",block:"center"});t.classList.add("pulse");setTimeout(()=>t.classList.remove("pulse"),1800);}else toast("Highlight is in your library.");},80);
}
function skipReview(){if(!RV.active)return;RV.i++;RV.flipped=false;drawReviewCard();}
function flagReview(c){if(!c)return;c.flagged=true;const rk=c.fp||clipFp(c);
  const lib=LIBRARIES.find(l=>l.id===ACTIVE_LIB);if(lib){lib.flagged=lib.flagged||[];if(!lib.flagged.includes(rk))lib.flagged.push(rk);}
  saveState();toast("Card flagged — find flagged cards on the review screen.");RV.i++;RV.flipped=false;drawReviewCard();}
async function flipReviewCard(){
  if(RV.flipped)return;RV.flipped=true;
  const c=RV.cards[RV.i];const back=document.getElementById("rvBack");back.style.display="block";
  const cz=clozeFront(c);
  let html="";
  if(c.cat==="vocab"){const w=await fetchWiktionary(vocabTermOf(c));
    html=(w.definition?`<div class="t-field"><span class="fl">Definition</span>${escHtml(w.definition)}</div>`:"")+
      (w.example?`<div class="t-field"><span class="fl">Example${w.exampleSource?" · "+w.exampleSource:""}</span><i>${escHtml(w.example)}</i></div>`:"")+
      (w.etymology?`<div class="t-field"><span class="fl">Etymology</span>${escHtml(w.etymology)}</div>`:"");
    if(!w.definition&&!w.etymology&&!w.example)html=`<div class="t-load">No dictionary entry found for this word.</div>`;
  }else{const term=cz.answer||clipKeyTerm(c);const wk=await fetchWiki(term);
    html=(cz.answer?`<div class="rv-answer is-topicc">${escHtml(cz.answer)}</div>`:"")+
      (wk?`<div class="t-field"><span class="fl">${escHtml(wk.title)}</span>${escHtml(wk.extract)}</div>`:`<div class="t-load">No Wikipedia summary.</div>`);
  }
  if(back)back.innerHTML=html;
  const ctr=document.getElementById("rvControls");
  if(ctr)ctr.innerHTML=`<div class="rv-grades">`+GRADES.map(g=>`<button class="btn rv-grade ${g.cls}" data-g="${g.k}"><b>${g.k}</b> ${g.label}</button>`).join("")+`</div>`;
  ctr.querySelectorAll(".rv-grade").forEach(btn=>btn.onclick=()=>gradeReview(+btn.dataset.g));
}
function gradeReview(grade){if(!RV.active||!RV.flipped)return;const c=RV.cards[RV.i];
  // per-card history
  c.review=c.review||{count:0,grades:[],last:null};
  c.review.count++;c.review.grades.push(grade);c.review.last=grade;c.review.lastAt=Date.now();
  // session tally
  RV.session.grades[grade]++;RV.session.seen++;
  if(grade===1)RV.again.push(c); // "Again" re-queues this round
  RV.i++;RV.flipped=false;saveState();drawReviewCard();
}
function finishReview(){
  const s=RV.session;
  if(s&&s.seen>0){const correct=s.grades[3]+s.grades[4];const acc=Math.round(correct/s.seen*100);
    REVIEW_LOG.unshift({date:s.started,total:s.seen,acc,grades:{...s.grades}});
    REVIEW_LOG=REVIEW_LOG.slice(0,50);saveState();}
  RV.active=false;
  const stage=document.getElementById("reviewStage");
  const s2=s||{seen:0,grades:{1:0,2:0,3:0,4:0}};const correct=s2.grades[3]+s2.grades[4];
  const acc=s2.seen?Math.round(correct/s2.seen*100):0;
  stage.innerHTML=`<div class="rv-card"><div class="rv-done">✦ Session complete</div>
    <div class="rv-summary">${s2.seen} cards · ${acc}% good or easy</div>
    <div class="rv-gradebreak">${GRADES.map(g=>`<span class="${g.cls}">${g.label}: ${s2.grades[g.k]}</span>`).join("")}</div>
    <div class="rv-controls"><button class="btn" id="rvRestart">Review again</button><button class="btn ghost" id="rvEnd">Back to start</button></div></div>`;
  document.getElementById("rvRestart").onclick=startReview;
  document.getElementById("rvEnd").onclick=resetReviewSetup;
  renderReviewHistory();
}
function endReview(){if(RV.active){saveReviewSession();}RV.active=false;}
function renderReviewHistory(){const statBox=document.getElementById("reviewStats"),box=document.getElementById("reviewHistory");
  if(!box)return;
  if(!REVIEW_LOG.length){if(statBox)statBox.innerHTML="";box.innerHTML="";return;}
  const sessions=REVIEW_LOG.slice().reverse(); // oldest -> newest for the chart
  const totalSeen=REVIEW_LOG.reduce((s,r)=>s+r.total,0);
  const totalGood=REVIEW_LOG.reduce((s,r)=>s+(r.grades[3]+r.grades[4]),0);
  const overallAcc=totalSeen?Math.round(totalGood/totalSeen*100):0;
  // study streak in days (consecutive calendar days with a session, ending today/most recent)
  const days=[...new Set(REVIEW_LOG.map(r=>new Date(r.date).toDateString()))].map(d=>new Date(d)).sort((a,b)=>b-a);
  let streak=0;{let cur=new Date();cur.setHours(0,0,0,0);
    const set=new Set(days.map(d=>{const x=new Date(d);x.setHours(0,0,0,0);return +x;}));
    if(!set.has(+cur))cur.setDate(cur.getDate()-1); // allow streak ending yesterday
    while(set.has(+cur)){streak++;cur.setDate(cur.getDate()-1);}}
  const tiles=[["Sessions",REVIEW_LOG.length],["Cards reviewed",totalSeen],["Overall accuracy",overallAcc+"%"],["Study streak",streak+(streak===1?" day":" days")]];
  // chart geometry
  const n=sessions.length,W=Math.max(320,Math.min(720,n*46+40)),H=170,padB=24,padT=8,padL=8,padR=8;
  const maxTotal=Math.max(1,...sessions.map(s=>s.total));
  const bw=Math.min(34,(W-padL-padR)/n-8),gap=((W-padL-padR)-bw*n)/(n+1);
  const gcol={1:"#b0485a",2:"#c08a3a",3:"var(--verd)",4:"var(--lapis)"};
  let bars="",pts=[];
  sessions.forEach((s,i)=>{const x=padL+gap+i*(bw+gap);let y=H-padB;
    [1,2,3,4].forEach(g=>{const v=s.grades[g]||0;if(!v)return;const h=v/maxTotal*(H-padB-padT);y-=h;
      bars+=`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${gcol[g]}" rx="1"><title>${["","again","hard","good","easy"][g]}: ${v}</title></rect>`;});
    const acc=s.total?(s.grades[3]+s.grades[4])/s.total:0;
    pts.push([x+bw/2,padT+(1-acc)*(H-padB-padT)]);});
  const line=pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
  const dots=pts.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="var(--gold)" stroke="var(--paper)" stroke-width="1"/>`).join("");
  const fmt=t=>new Date(t).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"2-digit"});
  if(statBox)statBox.innerHTML=`
    <div class="rv-hist-head">Your review stats</div>
    <div class="rv-stat-tiles">${tiles.map(([l,v])=>`<div class="rv-tile"><b>${v}</b><span>${l}</span></div>`).join("")}</div>
    <div class="rv-chart-wrap">
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="rv-chart">
        ${bars}
        <path d="${line}" fill="none" stroke="var(--gold)" stroke-width="1.5" opacity="0.9"/>
        ${dots}
      </svg>
      <div class="rv-chart-legend"><span><i style="background:#b0485a"></i>again</span><span><i style="background:#c08a3a"></i>hard</span><span><i style="background:var(--verd)"></i>good</span><span><i style="background:var(--lapis)"></i>easy</span><span><i style="background:var(--gold)"></i>accuracy</span></div>
    </div>`;
  box.innerHTML=`
    <details class="rv-sessions">
    <summary>Past sessions (${REVIEW_LOG.length})</summary>
    <table class="rv-hist"><thead><tr><th>Date</th><th>Cards</th><th>Accuracy</th><th>A/H/G/E</th><th></th></tr></thead><tbody>`+
    REVIEW_LOG.map((r,i)=>`<tr><td>${fmt(r.date)}</td><td>${r.total}</td><td>${r.acc}%</td><td>${r.grades[1]}/${r.grades[2]}/${r.grades[3]}/${r.grades[4]}</td><td><button class="rv-del" data-i="${i}" title="Delete this session" aria-label="Delete this session">✕</button></td></tr>`).join("")+
    `</tbody></table></details>`;
  box.querySelectorAll(".rv-del").forEach(b=>b.onclick=()=>{
    const i=+b.dataset.i;if(i<0||i>=REVIEW_LOG.length)return;
    if(!confirm("Delete this review session from your history?"))return;
    REVIEW_LOG.splice(i,1);saveState();renderReviewHistory();
  });
}
/* ---------- Ingest ---------- */
function ingest(text,filename,fromSample){let clips=[];
  // If the currently loaded library is the built-in sample and the user now imports
  // their own data, clear the sample first so it doesn't merge in.
  // If the active library is the built-in sample and the user imports their own data,
  // start a fresh "My Library" instead of merging into the sample.
  if(IS_SAMPLE&&!fromSample){createLibraryQuiet("My Library");}
  if(/\.html?$/i.test(filename)||/<html|class="?bookTitle/i.test(text))clips=parseHtml(text);
  else if(/\.csv$/i.test(filename))clips=parseCsv(text);else clips=parseClippings(text);
  if(!clips.length){toast("Couldn't find any highlights in that file.");return;}
  clips.forEach(c=>{c.fp=clipFp(c);if(!c.cat)c.cat=autoCategorize(c);});
  clips=dedupClips(clips);
  ensureActiveLib(fromSample?"Sample":"My Library",fromSample);
  const batch=newLibId();const when=Date.now();

  const hadData=STATE.clips.length>0;
  if(!hadData){
    clips.forEach((c,i)=>{c.id=i;c.batch=batch;});STATE.clips=clips;
    STATE.decks=[{id:uid(),name:"Vocabulary",tags:{vocab:true,quotes:false,topic:false}},{id:uid(),name:"Topics of interest",tags:{vocab:false,quotes:false,topic:true}}];
    ACTIVE_DECK=STATE.decks[0].id;
    toast(`Imported ${clips.length} highlight${clips.length===1?"":"s"}.`);
    IMPORT_LOG.unshift({batch,date:when,name:filename||"import",added:clips.length,updated:0,total:STATE.clips.length});
  }else{
    const byFp=new Map(STATE.clips.map(c=>[c.fp,c]));
    let added=0,changed=0,maxId=STATE.clips.reduce((m,c)=>Math.max(m,c.id||0),0);
    clips.forEach(c=>{const ex=byFp.get(c.fp);
      if(!ex){c.id=++maxId;c.batch=batch;STATE.clips.push(c);byFp.set(c.fp,c);added++;}
      else if(ex.text!==c.text){
        if(ex.edited){ex.incoming=c.text;changed++;}
        else{ex.text=c.text;ex.cat=ex.catLocked?ex.cat:autoCategorize(ex);changed++;}
      }});
    toast(added||changed?`Merged: ${added} new, ${changed} updated.`:"No new highlights — library already up to date.");
    if(added||changed)IMPORT_LOG.unshift({batch,date:when,name:filename||"import",added,updated:changed,total:STATE.clips.length});
  }
  IMPORT_LOG=IMPORT_LOG.slice(0,100);
  IS_SAMPLE=!!fromSample;
  saveState();
  document.getElementById("drop").classList.add("hidden");document.getElementById("app").classList.remove("hidden");
  showSurprise();render();renderDropPanel();}

/* ---------- Fingerprint + dedup ---------- */
function clipFp(c){const t=cleanTitle(c.title||"").toLowerCase();const a=(c.author||"").toLowerCase();
  const loc=(c.loc||c.page||"").toString().split(/[-–]/)[0].trim();
  // Identity is stable across text edits: book + author + type + location.
  // Only when there's no location do we fall back to a text head to disambiguate.
  if(loc)return [c.type||"highlight",t,a,loc].join("|");
  const head=(c.text||"").toLowerCase().replace(/\s+/g," ").trim().slice(0,60);
  return [c.type||"highlight",t,a,"noloc",head].join("|");}
function dedupClips(clips){const seen=new Map();const out=[];
  const norm=s=>(s||"").toLowerCase().replace(/\s+/g," ").trim();
  const bare=s=>norm(s).replace(/[^\p{L}\p{N}\s]/gu," ").replace(/\s+/g," ").trim(); // ignore punctuation/case
  for(const c of clips){const arr=seen.get(c.fp);
    if(arr){
      // same identity (page/loc). Treat as duplicate if texts overlap or match ignoring punctuation.
      const ct=norm(c.text),cb=bare(c.text);let merged=false;
      for(const prev of arr){const pt=norm(prev.text),pb=bare(prev.text);
        if(pt===ct||(cb&&pb===cb)||pt.includes(ct)||ct.includes(pt)){if(ct.length>pt.length)prev.text=c.text;merged=true;break;}}
      if(merged)continue;
      // genuinely different highlight on the same page → keep it, disambiguate its fp
      c.fp=c.fp+"#"+(arr.length);arr.push(c);out.push(c);continue;
    }
    seen.set(c.fp,[c]);out.push(c);}
  // second pass: collapse same-book clips that differ only by punctuation/case ("word." vs "word")
  const byBare=new Map();const final=[];
  for(const c of out){const cb=bare(c.text);
    if(!cb){final.push(c);continue;}
    const key=[c.type||"highlight",cleanTitle(c.title||"").toLowerCase(),(c.author||"").toLowerCase(),cb].join("|");
    const prev=byBare.get(key);
    if(prev){if((c.text||"").length>(prev.text||"").length)prev.text=c.text;continue;}
    byBare.set(key,c);final.push(c);}
  return final;}

/* ---------- Persistence (multi-library) ---------- */
const LS_KEY="marginalia.v2";
const LS_KEY_OLD="marginalia.v1";
let saveTimer=null;
let LIBRARIES=[];   // [{id,name,clips,decks,activeDeck,catRules,reviewLog,importLog,isSample}]
let ACTIVE_LIB=null;
function newLibId(){return "lib"+Math.random().toString(36).slice(2,8);}
// Snapshot the live working globals back into the active library object
function syncActiveLib(){const lib=LIBRARIES.find(l=>l.id===ACTIVE_LIB);if(!lib)return;
  lib.clips=STATE.clips;lib.decks=STATE.decks;lib.activeDeck=ACTIVE_DECK;
  lib.catRules=Array.from(CAT_RULES.entries());lib.reviewLog=REVIEW_LOG;lib.importLog=IMPORT_LOG;lib.isSample=IS_SAMPLE;}
// Load a library object's data into the live working globals
function loadLibIntoState(lib){
  STATE.clips=lib.clips||[];STATE.decks=lib.decks||[];ACTIVE_DECK=lib.activeDeck||(STATE.decks[0]&&STATE.decks[0].id)||null;
  CAT_RULES.clear();(lib.catRules||[]).forEach(([k,v])=>CAT_RULES.set(k,v));
  REVIEW_LOG=lib.reviewLog||[];IMPORT_LOG=lib.importLog||[];IS_SAMPLE=!!lib.isSample;}
function saveState(){try{clearTimeout(saveTimer);saveTimer=setTimeout(()=>{
    syncActiveLib();
    localStorage.setItem(LS_KEY,JSON.stringify({v:2,libraries:LIBRARIES,activeLib:ACTIVE_LIB,savedAt:Date.now()}));
  },250);}catch(e){/* storage full or blocked */}}
function loadState(){try{
    const raw=localStorage.getItem(LS_KEY);
    if(raw){const d=JSON.parse(raw);
      if(d&&Array.isArray(d.libraries)&&d.libraries.length){
        LIBRARIES=d.libraries;ACTIVE_LIB=d.activeLib&&LIBRARIES.find(l=>l.id===d.activeLib)?d.activeLib:LIBRARIES[0].id;
        const lib=LIBRARIES.find(l=>l.id===ACTIVE_LIB);if(lib&&(lib.clips||[]).length){loadLibIntoState(lib);return true;}
        return false;}}
    // migrate a v1 single-library save if present
    const old=localStorage.getItem(LS_KEY_OLD);
    if(old){const d=JSON.parse(old);if(d&&Array.isArray(d.clips)&&d.clips.length){
      const lib={id:newLibId(),name:d.isSample?"Sample":"My Library",clips:d.clips,decks:d.decks||[],
        activeDeck:d.activeDeck||null,catRules:d.catRules||[],reviewLog:d.reviewLog||[],importLog:d.importLog||[],isSample:!!d.isSample};
      LIBRARIES=[lib];ACTIVE_LIB=lib.id;loadLibIntoState(lib);saveState();return true;}}
    return false;
  }catch(e){return false;}}
function clearStored(){try{localStorage.removeItem(LS_KEY);}catch(e){}}
// Ensure there is an active library object backing the working state (create on first import)
function ensureActiveLib(name,isSample){
  let lib=LIBRARIES.find(l=>l.id===ACTIVE_LIB);
  if(!lib){lib={id:newLibId(),name:name||(isSample?"Sample":"My Library"),clips:[],decks:[],activeDeck:null,catRules:[],reviewLog:[],importLog:[],isSample:!!isSample};
    LIBRARIES.push(lib);ACTIVE_LIB=lib.id;}
  return lib;}
/* ----- Library management API ----- */
function listLibraries(){return LIBRARIES.map(l=>({id:l.id,name:l.name,count:(l.clips||[]).length,isSample:!!l.isSample,active:l.id===ACTIVE_LIB}));}
function switchLibrary(id){if(id===ACTIVE_LIB)return;const lib=LIBRARIES.find(l=>l.id===id);if(!lib)return;
  syncActiveLib();ACTIVE_LIB=id;loadLibIntoState(lib);saveState();
  if(STATE.clips.length){document.getElementById("drop").classList.add("hidden");document.getElementById("app").classList.remove("hidden");showSurprise();render();}
  else{document.getElementById("app").classList.add("hidden");document.getElementById("drop").classList.remove("hidden");}
  if(typeof updateSampleBtn==="function")updateSampleBtn();
  renderDropPanel();}
function createLibraryQuiet(name){syncActiveLib();
  const lib={id:newLibId(),name:name||"New library",clips:[],decks:[],activeDeck:null,catRules:[],reviewLog:[],importLog:[],isSample:false};
  LIBRARIES.push(lib);ACTIVE_LIB=lib.id;loadLibIntoState(lib);return lib;}
function createLibrary(name){createLibraryQuiet(name);saveState();
  document.getElementById("app").classList.add("hidden");document.getElementById("drop").classList.remove("hidden");
  renderDropPanel();}
function renameLibrary(id,name){const lib=LIBRARIES.find(l=>l.id===id);if(lib){lib.name=name||lib.name;saveState();renderDropPanel();}}
function deleteLibrary(id){const i=LIBRARIES.findIndex(l=>l.id===id);if(i<0)return;
  LIBRARIES.splice(i,1);
  if(ACTIVE_LIB===id){if(LIBRARIES.length){ACTIVE_LIB=LIBRARIES[0].id;loadLibIntoState(LIBRARIES[0]);}
    else{ACTIVE_LIB=null;STATE.clips=[];STATE.decks=[];ACTIVE_DECK=null;CAT_RULES.clear();REVIEW_LOG=[];IMPORT_LOG=[];IS_SAMPLE=false;}}
  saveState();
  if(STATE.clips.length){document.getElementById("drop").classList.add("hidden");document.getElementById("app").classList.remove("hidden");render();}
  else{document.getElementById("app").classList.add("hidden");document.getElementById("drop").classList.remove("hidden");}
  renderDropPanel();}
function removeImportBatch(batchId){
  const before=STATE.clips.length;
  STATE.clips=STATE.clips.filter(c=>c.batch!==batchId);
  IMPORT_LOG=IMPORT_LOG.filter(r=>r.batch!==batchId);
  const removed=before-STATE.clips.length;
  saveState();renderDropPanel();
  if(!STATE.clips.length){document.getElementById("app").classList.add("hidden");document.getElementById("drop").classList.remove("hidden");}
  else render();
  toast(`Removed ${removed} highlight${removed===1?"":"s"} from that import.`);}
function dedupActiveLibrary(){
  const before=STATE.clips.length;
  STATE.clips=dedupClips(STATE.clips);
  const removed=before-STATE.clips.length;
  saveState();render();renderDropPanel();
  toast(removed?`Removed ${removed} duplicate${removed===1?"":"s"}.`:"No duplicates found.");}
function exportLibraryJson(){syncActiveLib();const lib=LIBRARIES.find(l=>l.id===ACTIVE_LIB);if(!lib)return;
  const payload={marginalia:true,v:2,exported:Date.now(),library:{name:lib.name,clips:lib.clips,decks:lib.decks,importLog:lib.importLog,reviewLog:lib.reviewLog}};
  download(`${slug(lib.name)||"library"}-backup.json`,JSON.stringify(payload,null,2),"application/json");}
function importLibraryJson(text){try{const d=JSON.parse(text);
    const libsrc=d.library||d;const clips=libsrc.clips;if(!Array.isArray(clips)||!clips.length){toast("That JSON has no highlights.");return;}
    syncActiveLib();
    const lib={id:newLibId(),name:(libsrc.name||"Imported library")+"",clips,decks:libsrc.decks||[],activeDeck:(libsrc.decks&&libsrc.decks[0]&&libsrc.decks[0].id)||null,
      catRules:[],reviewLog:libsrc.reviewLog||[],importLog:libsrc.importLog||[],isSample:false};
    LIBRARIES.push(lib);ACTIVE_LIB=lib.id;loadLibIntoState(lib);saveState();
    document.getElementById("drop").classList.add("hidden");document.getElementById("app").classList.remove("hidden");
    showSurprise();render();toast(`Restored "${lib.name}" — ${clips.length} highlights.`);
  }catch(e){toast("Couldn't read that backup file.");}}

/* ---------- Wiring ---------- */
const fileInput=document.getElementById("file");
const fileJson=document.getElementById("fileJson");
const drop=document.getElementById("drop");
const _startOver=document.getElementById("startOver");
/* ---------- Illuminated repeating vine divider (full width) ---------- */
function renderMastDivider(){const el=document.getElementById("mastDivider");if(!el)return;
  // One tile = a full period of two interwoven strands (gold over lapis), tiled horizontally.
  const W=104,H=26,c=13,a=7;
  const gold=`M0 ${c} C ${W*0.125} ${c-a}, ${W*0.375} ${c-a}, ${W/2} ${c} C ${W*0.625} ${c+a}, ${W*0.875} ${c+a}, ${W} ${c}`;
  const lapis=`M0 ${c} C ${W*0.125} ${c+a}, ${W*0.375} ${c+a}, ${W/2} ${c} C ${W*0.625} ${c-a}, ${W*0.875} ${c-a}, ${W} ${c}`;
  // a spine-style glyph at the crossing point, instead of a plain dot
  const SYMS=["❧","✦","❦","✥","❀"],sym=SYMS[Math.floor(Math.random()*SYMS.length)];
  const tile=`
    <path d="${lapis}" fill="none" stroke="var(--lapis)" stroke-width="1.5" stroke-linecap="round" opacity="0.82"/>
    <path d="${gold}" fill="none" stroke="var(--gold)" stroke-width="1.7" stroke-linecap="round"/>
    <text x="${W/2}" y="${c}" text-anchor="middle" dominant-baseline="central" font-size="10" fill="var(--gold)">${sym}</text>`;
  el.innerHTML=`<svg width="100%" height="${H}" preserveAspectRatio="xMinYMid meet" aria-hidden="true">
    <defs><pattern id="plaitTile" width="${W}" height="${H}" patternUnits="userSpaceOnUse">${tile}</pattern></defs>
    <rect x="0" y="0" width="100%" height="${H}" fill="url(#plaitTile)"/>
  </svg>`;}
/* ---------- Library switcher (masthead dropdown overlay) ---------- */
function updateLibSwitch(){const name=document.getElementById("libSwitchName");const lib=LIBRARIES.find(l=>l.id===ACTIVE_LIB);
  if(name)name.textContent=lib?lib.name:"Library";}
function renderLibMenu(){const menu=document.getElementById("libMenu");if(!menu)return;
  const libs=listLibraries();
  menu.innerHTML=`<div class="lib-menu-head">Libraries</div>`+
    (libs.length?libs.map(l=>`<div class="lib-menu-row${l.active?" on":""}">
        <button class="lib-menu-name" data-act="switch" data-id="${l.id}">${escHtml(l.name)}<span class="dp-count">${l.count}</span></button>
        <button class="lib-mini" data-act="rename" data-id="${l.id}" title="Rename">✎</button>
        <button class="lib-mini" data-act="delete" data-id="${l.id}" title="Delete">✕</button>
      </div>`).join(""):`<div class="lib-menu-empty">No libraries yet.</div>`)+
    `<div class="lib-menu-actions">
       <button class="btn sm" data-act="new">＋ New library</button>
       <button class="btn ghost sm" data-act="import">Import, restore &amp; history…</button>
     </div>`;
  menu.querySelectorAll("[data-act]").forEach(el=>el.onclick=()=>{const act=el.dataset.act,id=el.dataset.id;
    if(act==="switch"){switchLibrary(id);closeLibMenu();updateLibSwitch();}
    else if(act==="new"){const n=prompt("Name the new library:","My Library");if(n!==null){createLibrary(n.trim()||"My Library");closeLibMenu();updateLibSwitch();}}
    else if(act==="rename"){const lib=LIBRARIES.find(l=>l.id===id);const n=prompt("Rename library:",lib?lib.name:"");if(n!==null&&n.trim()){renameLibrary(id,n.trim());renderLibMenu();updateLibSwitch();}}
    else if(act==="delete"){const lib=LIBRARIES.find(l=>l.id===id);if(confirm(`Delete library “${lib?lib.name:""}” and all its highlights?`)){deleteLibrary(id);renderLibMenu();updateLibSwitch();}}
    else if(act==="import"){closeLibMenu();document.getElementById("app").classList.add("hidden");document.getElementById("drop").classList.remove("hidden");document.getElementById("surprise").classList.add("hidden");renderDropPanel();}
  });}
function openLibMenu(){renderLibMenu();document.getElementById("libMenu").classList.add("show");}
function closeLibMenu(){const m=document.getElementById("libMenu");if(m)m.classList.remove("show");}
function backToMyLibrary(){const mine=LIBRARIES.filter(l=>!l.isSample);if(!mine.length){toast("No personal library yet — import your highlights to begin.");return;}
  switchLibrary(mine[mine.length-1].id);updateSampleBtn();}
function updateSampleBtn(){const b=document.getElementById("sampleBtn");if(b)b.textContent=IS_SAMPLE?"← Back to my library":"Load a sample";}
