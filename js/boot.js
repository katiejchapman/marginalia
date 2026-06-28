// Returning visitors skip straight in (no animation)
(function maybeSkipGate(){
  let seen=false;try{seen=localStorage.getItem(GATE_SEEN_KEY)==="1";}catch(e){}
  if(seen&&libraryGate){libraryGate.classList.add("hidden");}
})();
window.addEventListener("resize",()=>{if(typeof syncBookHeadTop==="function")syncBookHeadTop();});
libraryGate?.addEventListener("click",openLibraryGate);
libraryGate?.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openLibraryGate();}});
document.getElementById("replayGate")?.addEventListener("click",()=>{
  if(!libraryGate)return;
  libraryGate.classList.remove("hidden","opening");
});

/* ---------- Mode / cursor toggles (one 4-cell grid) ---------- */
document.getElementById("ctrlGrid").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;
  if(b.dataset.mode){root.setAttribute("data-mode",b.dataset.mode);document.querySelectorAll("#ctrlGrid button[data-mode]").forEach(x=>x.dataset.on=x===b?1:0);}
  else if(b.dataset.cur){LAMP_ON=b.dataset.cur==="lamp";document.querySelectorAll("#ctrlGrid button[data-cur]").forEach(x=>x.dataset.on=x===b?1:0);
    document.body.classList.toggle("lampcursor",LAMP_ON);
    if(!LAMP_ON){document.getElementById("lampHalo").style.display="none";document.getElementById("lampCursor").style.display="none";}}});
root.setAttribute("data-mode","dark");
document.querySelector(".tabs").addEventListener("click",e=>{const b=e.target.closest(".tab");if(!b)return;
  PAGE=b.dataset.page;document.querySelectorAll(".tab").forEach(t=>t.dataset.on=t===b?1:0);
  // clicking Library while in the import/restore/history view returns to the library
  if(PAGE==="library"){const d=document.getElementById("drop");if(d&&!d.classList.contains("hidden")&&typeof closeImport==="function")closeImport();}
  document.getElementById("pageLibrary").style.display=PAGE==="library"?"":"none";
  document.getElementById("pageTimeline").style.display=PAGE==="timeline"?"block":"none";
  document.getElementById("pageConnections").style.display=PAGE==="connections"?"block":"none";
  document.getElementById("pageReview").style.display=PAGE==="review"?"block":"none";
  if(PAGE!=="review")endReview();
  if(PAGE==="timeline")renderTimeline();
  if(PAGE==="connections")renderExplore();
  if(PAGE==="review")resetReviewSetup();
  // the shelf can't measure its width while hidden — re-paginate now that the library is visible
  if(PAGE==="library"&&typeof renderShelf==="function")renderShelf(SHELF_BOOKS);});
// re-paginate the shelf when the viewport width changes (rows-per-width shifts)
let _shelfRz;addEventListener("resize",()=>{clearTimeout(_shelfRz);_shelfRz=setTimeout(()=>{if(PAGE==="library"&&typeof renderShelf==="function")renderShelf(SHELF_BOOKS);},160);});
document.querySelectorAll(".rv-subtab").forEach(t=>t.onclick=()=>showReviewSub(t.dataset.rv));
document.addEventListener("mousemove",e=>{if(!LAMP_ON)return;
  lampC.style.display="block";lampH.style.display="block";
  const x=e.clientX+LAMP_DX,y=e.clientY+LAMP_DY;
  lampC.style.left=x+"px";lampC.style.top=y+"px";
  lampH.style.left=x+"px";lampH.style.top=y+"px";},{passive:true});
document.addEventListener("mouseleave",()=>{lampC.style.display="none";lampH.style.display="none";});
window.addEventListener("scroll",toggleJumpTop,{passive:true});
jumpTop.addEventListener("click",()=>window.scrollTo({top:0,behavior:"smooth"}));
toggleJumpTop();


// Hover (mouse) behavior
document.addEventListener("mouseover",async e=>{
  if(tipPinned)return;
  const termEl=e.target.closest(".term"),vocabEl=e.target.closest(".vocabword");
  if(!termEl&&!vocabEl)return;clearTimeout(tipTimer);tipPos(e);tip.style.display="block";
  populateTip(termEl,vocabEl);});
document.addEventListener("mousemove",e=>{if(!tipPinned&&tip.style.display==="block"&&(e.target.closest(".term")||e.target.closest(".vocabword")))tipPos(e);});
document.addEventListener("mouseout",e=>{if(tipPinned)return;if(e.target.closest(".term")||e.target.closest(".vocabword"))tipTimer=setTimeout(()=>tip.style.display="none",140);});
tip.addEventListener("mouseenter",()=>{if(!tipPinned)clearTimeout(tipTimer);});
tip.addEventListener("mouseleave",()=>{if(!tipPinned)tip.style.display="none";});
// Tap-to-pin (touch / pen): pin the tooltip open near the tapped term
document.addEventListener("pointerdown",e=>{
  if(e.pointerType==="mouse")return;
  const termEl=e.target.closest(".term"),vocabEl=e.target.closest(".vocabword");
  if(termEl||vocabEl){
    e.preventDefault();
    const r=(termEl||vocabEl).getBoundingClientRect();
    tipPinned=true;tip.style.display="block";tipPosXY(r.left+r.width/2,r.bottom);
    populateTip(termEl,vocabEl);return;
  }
  if(tipPinned&&!e.target.closest("#tip"))hideTip(true);
},{passive:false});
window.addEventListener("scroll",()=>{if(tipPinned)hideTip(true);},{passive:true});

// keyboard shortcuts: 1/2/3/4 grade (auto-advance), Space flips then defaults to Good(3)
document.addEventListener("keydown",e=>{
  if(PAGE!=="review"||!RV.active)return;
  if(e.target.isContentEditable||/^(INPUT|TEXTAREA)$/.test(e.target.tagName))return;
  if(e.key===" "){e.preventDefault();if(!RV.flipped)flipReviewCard();else gradeReview(3);}
  else if(["1","2","3","4"].includes(e.key)){if(RV.flipped){e.preventDefault();gradeReview(+e.key);}}
  else if((e.metaKey||e.ctrlKey)&&(e.key==="z"||e.key==="Z")){e.preventDefault();goBackReview();}
  else if(e.key==="Escape"){finishReview();}
});
// Escape backs out of the import / restore / history view without doing anything
document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;
  const d=document.getElementById("drop");
  if(d&&!d.classList.contains("hidden")&&typeof closeImport==="function")closeImport();});

document.getElementById("pickBtn").onclick=()=>fileInput.click();
(function(){const nb=document.getElementById("newLibBtn");if(nb)nb.onclick=()=>{const n=prompt("Name the new library:","My Library");if(n!==null)createLibrary(n.trim()||"My Library");};})();
document.querySelectorAll(".js-scan").forEach(b=>b.onclick=()=>{if(typeof openAddHighlight==="function")openAddHighlight();else if(typeof startHandoff==="function")startHandoff();});
document.getElementById("manageBtn").onclick=e=>{e.stopPropagation();const m=document.getElementById("libMenu");if(m.classList.contains("show"))closeLibMenu();else openLibMenu();};
// import all chosen files in sequence, staying in the import panel so the user
// can keep adding files (and pick more in another dialog) before viewing.
fileInput.onchange=e=>{const files=[...e.target.files];if(!files.length)return;
  let i=0;const next=()=>{if(i>=files.length){fileInput.value="";return;}
    const f=files[i++];const r=new FileReader();
    r.onload=()=>{ingest(r.result,f.name,false,{navigate:false,modified:f.lastModified});next();};
    r.readAsText(f);};
  next();};
fileJson.onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{importLibraryJson(r.result);fileJson.value="";};r.readAsText(f);};
["dragover","dragenter"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("drag")}));
["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("drag")}));
drop.addEventListener("drop",e=>{const files=[...e.dataTransfer.files];if(!files.length)return;
  let i=0;const next=()=>{if(i>=files.length)return;const f=files[i++];const r=new FileReader();
    r.onload=()=>{if(/\.json$/i.test(f.name))importLibraryJson(r.result);
      else ingest(r.result,f.name,false,{navigate:false,modified:f.lastModified});next();};
    r.readAsText(f);};
  next();});
document.getElementById("q").oninput=e=>{QUERY=e.target.value;JUMP_FP=null;render();renderMemoryResults();const cb=document.getElementById("clearSearch");if(cb)cb.style.display=e.target.value?"block":"none";};
(function(){const cb=document.getElementById("clearSearch");if(cb)cb.onclick=()=>{const q=document.getElementById("q");if(q)q.value="";QUERY="";JUMP_FP=null;const box=document.getElementById("memoryResults");if(box){box.classList.remove("show");box.innerHTML="";}cb.style.display="none";render();if(q)q.focus();};})();
document.getElementById("sortSel").onchange=e=>{SORT=e.target.value;render();};
document.getElementById("libCollapse").onclick=()=>{
  const btn=document.getElementById("libCollapse");
  const books=[...document.querySelectorAll("#list .book")];
  const anyOpen=books.some(b=>!b.classList.contains("collapsed"));
  books.forEach(b=>b.classList.toggle("collapsed",anyOpen));
  btn.dataset.collapsed=anyOpen?"1":"0";
  btn.title=anyOpen?"Expand all books":"Collapse all books";
  btn.setAttribute("aria-label",btn.title);
};
if(_startOver)_startOver.onclick=()=>{
  syncActiveLib();saveState();
  document.getElementById("app").classList.add("hidden");
  document.getElementById("drop").classList.remove("hidden");
  document.getElementById("surprise").classList.add("hidden");
  renderDropPanel();
};
(function(){const ds=document.getElementById("densSel");const saved=(localStorage.getItem("marginalia.density")||"comfortable");DENSITY=saved;if(ds){ds.value=saved;ds.onchange=()=>applyDensity(ds.value);}applyDensity(saved);})();
document.querySelectorAll("#catFilters .chip").forEach(ch=>{ch.onclick=()=>{const k=ch.dataset.cat;CAT_FILTER[k]=CAT_FILTER[k]?0:1;ch.dataset.on=CAT_FILTER[k]?1:0;render();};});
document.getElementById("notesToggle").onclick=function(){NOTES_ONLY=!NOTES_ONLY;this.dataset.on=NOTES_ONLY?1:0;render();};
document.querySelectorAll("#reviewCats .chip").forEach(ch=>{ch.onclick=()=>{ch.dataset.on=ch.dataset.on==="1"?"0":"1";};});
document.getElementById("reviewStartBtn").onclick=startReview;
document.getElementById("connAll").onchange=renderConnections;
document.getElementById("connCollapse").onclick=()=>{
  const btn=document.getElementById("connCollapse");
  const groups=[...document.querySelectorAll("#connList .conn-group")];
  const anyOpen=groups.some(g=>!g.classList.contains("collapsed"));
  groups.forEach(g=>g.classList.toggle("collapsed",anyOpen));
  btn.dataset.collapsed=anyOpen?"1":"0";
  btn.title=anyOpen?"Expand all themes":"Collapse all themes";
  btn.setAttribute("aria-label",btn.title);
};
document.querySelectorAll(".xp-tab").forEach(t=>t.onclick=()=>{XP_VIEW=t.dataset.xp;renderExplore();});
document.querySelectorAll("#tlGrain button").forEach(b=>b.onclick=()=>{TL_GRAIN=b.dataset.grain;document.querySelectorAll("#tlGrain button").forEach(x=>x.dataset.on=x===b?1:0);renderTimeline();});
document.querySelectorAll("#bookSizeToggle button").forEach(btn=>btn.onclick=()=>{BOOK_SIZE=btn.dataset.sz;render();});
document.getElementById("spAgain").onclick=showSurprise;
document.getElementById("addDeck").onclick=()=>{const nm=document.getElementById("newDeckName").value.trim();if(!nm){toast("Name the deck first.");return;}
  const d={id:uid(),name:nm,tags:{vocab:false,quotes:false,topic:false},include:[]};STATE.decks.push(d);ACTIVE_DECK=d.id;document.getElementById("newDeckName").value="";saveState();renderAnki();};
document.getElementById("newDeckName").addEventListener("keydown",e=>{if(e.key==="Enter")document.getElementById("addDeck").click();});
buildFleur();
renderMastDivider();
updateVisitorInfo();
/* ---------- Restore previous session ---------- */
(function restoreSession(){
  if(loadState()){
    // the sample is always available as a selectable library — recreate it if missing OR rebuild it if the
    // built-in content changed (stale cached version), without leaving the user's own library
    const _smp=LIBRARIES.find(l=>l.isSample);
    if((!_smp||_smp.sampleVer!==SAMPLE_VERSION)&&typeof loadSample==="function"){const prev=ACTIVE_LIB;loadSample();if(prev&&LIBRARIES.some(l=>l.id===prev))switchLibrary(prev);}
    document.getElementById("drop").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    showSurprise();render();renderDropPanel();updateLibSwitch();
    const n=STATE.clips.length;
    setTimeout(()=>toast(`Welcome back — restored ${n} highlight${n===1?"":"s"}.`),400);
  }else{
    // first visit — preload the sample library so there's something to explore
    if(typeof loadSample==="function")loadSample();
    document.getElementById("drop").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    showSurprise();render();renderDropPanel();updateLibSwitch();
  }
})();
document.getElementById("libSwitchBtn")?.addEventListener("click",e=>{e.stopPropagation();});
document.addEventListener("click",e=>{if(!e.target.closest("#libSwitch"))closeLibMenu();});
function loadSample(){const sample=`Meditations (Marcus Aurelius)
- Your Highlight on page 17 | location 305 | Added on Tuesday, 27 August 2024 09:52:34

The happiness of your life depends upon the quality of your thoughts.
==========
Meditations (Marcus Aurelius)
- Your Highlight on page 23 | location 393 | Added on Saturday, 07 September 2024 23:13:02

Waste no more time arguing about what a good man should be. Be one.
==========
Meditations (Marcus Aurelius)
- Your Highlight on page 29 | location 477 | Added on Saturday, 31 August 2024 09:35:27

equanimity
==========
Meditations (Marcus Aurelius)
- Your Highlight on page 30 | location 547 | Added on Tuesday, 13 August 2024 08:36:37

The soul becomes dyed with the color of its thoughts.
==========
Meditations (Marcus Aurelius)
- Your Highlight on page 43 | location 790 | Added on Saturday, 17 August 2024 11:18:26

stoicism
==========
Meditations (Marcus Aurelius)
- Your Highlight on page 50 | location 903 | Added on Sunday, 08 September 2024 12:06:37

Confine yourself to the present.
==========
Meditations (Marcus Aurelius)
- Your Highlight on page 59 | location 1039 | Added on Monday, 05 August 2024 09:36:03

providence
==========
Meditations (Marcus Aurelius)
- Your Highlight on page 68 | location 1184 | Added on Monday, 09 September 2024 17:29:37

Nature and virtue point in the same direction.
==========
Meditations (Marcus Aurelius)
- Your Highlight on page 82 | location 1456 | Added on Saturday, 24 August 2024 12:44:49

When you arise in the morning, think of what a precious privilege it is to be alive.
==========
Meditations (Marcus Aurelius)
- Your Highlight on page 90 | location 1620 | Added on Sunday, 08 September 2024 22:56:21

ataraxia
==========
The Republic (Plato)
- Your Highlight on page 106 | location 1889 | Added on Friday, 20 September 2024 10:32:26

The heaviest penalty for declining to rule is to be ruled by someone inferior.
==========
The Republic (Plato)
- Your Highlight on page 113 | location 2013 | Added on Friday, 30 August 2024 20:02:42

Socrates argued that the just soul is ordered and harmonious.
==========
The Republic (Plato)
- Your Highlight on page 118 | location 2092 | Added on Tuesday, 03 September 2024 22:37:51

dialectic
==========
The Republic (Plato)
- Your Highlight on page 131 | location 2365 | Added on Saturday, 05 October 2024 15:30:44

Justice is the excellence of the soul.
==========
The Republic (Plato)
- Your Highlight on page 135 | location 2438 | Added on Wednesday, 25 September 2024 21:18:45

The object of education is to teach us to love what is beautiful.
==========
The Republic (Plato)
- Your Highlight on page 150 | location 2675 | Added on Friday, 23 August 2024 18:10:39

philosopher-king
==========
The Republic (Plato)
- Your Highlight on page 157 | location 2774 | Added on Saturday, 24 August 2024 16:08:47

Virtue is a kind of health and beauty and good habit of the soul.
==========
The Republic (Plato)
- Your Highlight on page 166 | location 2940 | Added on Friday, 13 September 2024 22:05:10

We are bound to our opinions as prisoners to the shadows on the wall.
==========
The Republic (Plato)
- Your Highlight on page 181 | location 3209 | Added on Sunday, 22 September 2024 11:52:27

temperance
==========
Moby-Dick (Herman Melville)
- Your Highlight on page 191 | location 3391 | Added on Tuesday, 08 October 2024 19:14:09

Call me Ishmael.
==========
Moby-Dick (Herman Melville)
- Your Highlight on page 193 | location 3473 | Added on Saturday, 21 September 2024 14:00:31

It is the easiest thing in the world for a man to look as if he had a great secret in him.
==========
Moby-Dick (Herman Melville)
- Your Highlight on page 202 | location 3606 | Added on Saturday, 05 October 2024 20:34:23

leviathan
==========
Moby-Dick (Herman Melville)
- Your Highlight on page 212 | location 3809 | Added on Friday, 01 November 2024 08:29:57

Whenever I find myself growing grim about the mouth, I account it high time to get to sea.
==========
Moby-Dick (Herman Melville)
- Your Highlight on page 227 | location 4049 | Added on Sunday, 20 October 2024 22:40:25

the sea draws men toward the infinite
==========
Moby-Dick (Herman Melville)
- Your Highlight on page 229 | location 4120 | Added on Friday, 13 September 2024 21:10:07

Ahab's monomania bends the whole crew to his fatal purpose.
==========
Moby-Dick (Herman Melville)
- Your Highlight on page 240 | location 4334 | Added on Saturday, 14 September 2024 11:34:06

monomania
==========
Moby-Dick (Herman Melville)
- Your Highlight on page 253 | location 4560 | Added on Thursday, 12 September 2024 19:09:40

There is no quality in this world that is not what it is merely by contrast.
==========
Moby-Dick (Herman Melville)
- Your Highlight on page 264 | location 4729 | Added on Sunday, 13 October 2024 10:54:31

doubloon
==========
Moby-Dick (Herman Melville)
- Your Highlight on page 281 | location 5007 | Added on Sunday, 27 October 2024 11:06:47

Towards thee I roll, thou all-destroying but unconquering whale.
==========
Crime and Punishment (Fyodor Dostoevsky)
- Your Highlight on page 292 | location 5222 | Added on Thursday, 21 November 2024 12:33:01

Pain and suffering are always inevitable for a large intelligence and a deep heart.
==========
Crime and Punishment (Fyodor Dostoevsky)
- Your Highlight on page 300 | location 5367 | Added on Tuesday, 15 October 2024 07:48:33

Raskolnikov wanders the heat of St. Petersburg consumed by his theory.
==========
Crime and Punishment (Fyodor Dostoevsky)
- Your Highlight on page 308 | location 5559 | Added on Monday, 28 October 2024 12:22:49

Taking a new step, uttering a new word, is what people fear most.
==========
Crime and Punishment (Fyodor Dostoevsky)
- Your Highlight on page 319 | location 5713 | Added on Tuesday, 22 October 2024 13:51:15

nihilism
==========
Crime and Punishment (Fyodor Dostoevsky)
- Your Highlight on page 332 | location 5958 | Added on Monday, 21 October 2024 18:46:01

To go wrong in one's own way is better than to go right in someone else's.
==========
Crime and Punishment (Fyodor Dostoevsky)
- Your Highlight on page 336 | location 6012 | Added on Sunday, 24 November 2024 18:28:51

The extraordinary man has the right to overstep certain obstacles.
==========
Crime and Punishment (Fyodor Dostoevsky)
- Your Highlight on page 348 | location 6230 | Added on Saturday, 12 October 2024 14:30:12

suffering can be the doorway to redemption
==========
Crime and Punishment (Fyodor Dostoevsky)
- Your Highlight on page 358 | location 6442 | Added on Tuesday, 19 November 2024 07:30:58

magnanimity
==========
The Brothers Karamazov (Fyodor Dostoevsky)
- Your Highlight on page 369 | location 6658 | Added on Friday, 25 October 2024 13:30:56

If God does not exist, everything is permitted.
==========
The Brothers Karamazov (Fyodor Dostoevsky)
- Your Highlight on page 380 | location 6789 | Added on Saturday, 23 November 2024 19:29:25

The mystery of human existence lies not in just staying alive, but in finding something to live for.
==========
The Brothers Karamazov (Fyodor Dostoevsky)
- Your Highlight on page 382 | location 6872 | Added on Friday, 01 November 2024 07:09:37

Above all, do not lie to yourself.
==========
The Brothers Karamazov (Fyodor Dostoevsky)
- Your Highlight on page 398 | location 7150 | Added on Tuesday, 03 December 2024 18:09:35

Father Zosima teaches that we are each responsible to all, for all.
==========
The Brothers Karamazov (Fyodor Dostoevsky)
- Your Highlight on page 416 | location 7470 | Added on Saturday, 19 October 2024 10:33:47

the soul is healed by being with children
==========
The Brothers Karamazov (Fyodor Dostoevsky)
- Your Highlight on page 424 | location 7581 | Added on Thursday, 07 November 2024 13:01:16

theodicy
==========
The Brothers Karamazov (Fyodor Dostoevsky)
- Your Highlight on page 431 | location 7729 | Added on Saturday, 14 December 2024 17:16:34

Much on earth is hidden from us, but to make up for that we have a secret sense.
==========
The Brothers Karamazov (Fyodor Dostoevsky)
- Your Highlight on page 444 | location 7983 | Added on Friday, 18 October 2024 18:57:29

What is hell? The suffering of being unable to love.
==========
The Brothers Karamazov (Fyodor Dostoevsky)
- Your Highlight on page 463 | location 8287 | Added on Saturday, 14 December 2024 11:33:32

St. Petersburg society masks its cruelty with manners.
==========
Pride and Prejudice (Jane Austen)
- Your Highlight on page 466 | location 8336 | Added on Tuesday, 20 August 2024 11:11:09

It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.
==========
Pride and Prejudice (Jane Austen)
- Your Highlight on page 478 | location 8618 | Added on Saturday, 14 September 2024 23:33:35

Vanity and pride are different things, though the words are often used synonymously.
==========
Pride and Prejudice (Jane Austen)
- Your Highlight on page 494 | location 8905 | Added on Saturday, 14 September 2024 13:17:02

supercilious
==========
Pride and Prejudice (Jane Austen)
- Your Highlight on page 502 | location 8995 | Added on Saturday, 14 September 2024 09:28:20

I could easily forgive his pride, if he had not mortified mine.
==========
Pride and Prejudice (Jane Austen)
- Your Highlight on page 517 | location 9293 | Added on Sunday, 01 September 2024 22:32:15

Elizabeth's wit is her armor against a society obsessed with rank.
==========
Pride and Prejudice (Jane Austen)
- Your Highlight on page 535 | location 9600 | Added on Thursday, 12 September 2024 13:53:28

There is no charm equal to tenderness of heart.
==========
Pride and Prejudice (Jane Austen)
- Your Highlight on page 542 | location 9710 | Added on Sunday, 18 August 2024 17:04:42

felicity
==========
Pride and Prejudice (Jane Austen)
- Your Highlight on page 551 | location 9873 | Added on Saturday, 17 August 2024 16:50:07

A lady's imagination is very rapid; it jumps from admiration to love in a moment.
==========
Walden (Henry David Thoreau)
- Your Highlight on page 557 | location 9992 | Added on Sunday, 01 December 2024 11:29:14

I went to the woods because I wished to live deliberately.
==========
Walden (Henry David Thoreau)
- Your Highlight on page 563 | location 10080 | Added on Saturday, 04 January 2025 14:10:45

The mass of men lead lives of quiet desperation.
==========
Walden (Henry David Thoreau)
- Your Highlight on page 577 | location 10340 | Added on Sunday, 22 December 2024 18:20:05

Our life is frittered away by detail. Simplify, simplify.
==========
Walden (Henry David Thoreau)
- Your Highlight on page 587 | location 10567 | Added on Monday, 16 December 2024 21:45:01

Thoreau finds in nature the same calm the Stoics sought in virtue.
==========
Walden (Henry David Thoreau)
- Your Highlight on page 602 | location 10803 | Added on Tuesday, 07 January 2025 23:04:07

verdure
==========
Walden (Henry David Thoreau)
- Your Highlight on page 608 | location 10960 | Added on Sunday, 24 November 2024 08:57:49

What you get by achieving your goals is not as important as what you become by achieving them.
==========
Walden (Henry David Thoreau)
- Your Highlight on page 618 | location 11092 | Added on Thursday, 28 November 2024 15:25:09

stoicism of the woods
==========
Walden (Henry David Thoreau)
- Your Highlight on page 636 | location 11406 | Added on Saturday, 21 December 2024 08:51:44

Rather than love, than money, than fame, give me truth.
==========
Walden (Henry David Thoreau)
- Your Highlight on page 644 | location 11539 | Added on Sunday, 24 November 2024 07:40:05

I had three chairs in my house; one for solitude, two for friendship, three for society.
==========
Frankenstein (Mary Shelley)
- Your Highlight on page 650 | location 11712 | Added on Saturday, 21 December 2024 10:29:00

Beware; for I am fearless, and therefore powerful.
==========
Frankenstein (Mary Shelley)
- Your Highlight on page 665 | location 11925 | Added on Tuesday, 24 December 2024 08:33:45

Nothing is so painful to the human mind as a great and sudden change.
==========
Frankenstein (Mary Shelley)
- Your Highlight on page 671 | location 12087 | Added on Sunday, 15 December 2024 12:12:59

The creature longs for sympathy and is met only with horror.
==========
Frankenstein (Mary Shelley)
- Your Highlight on page 684 | location 12286 | Added on Wednesday, 22 January 2025 16:28:32

Victor's ambition oversteps the bounds of nature.
==========
Frankenstein (Mary Shelley)
- Your Highlight on page 691 | location 12417 | Added on Thursday, 02 January 2025 15:02:00

ignominy
==========
Frankenstein (Mary Shelley)
- Your Highlight on page 693 | location 12466 | Added on Sunday, 26 January 2025 21:06:42

Learn from me, if not by my precepts, then by my example, how dangerous is the acquirement of knowledge.
==========
Frankenstein (Mary Shelley)
- Your Highlight on page 710 | location 12727 | Added on Thursday, 23 January 2025 19:32:19

Solitude curdles the soul into resentment.
==========
Frankenstein (Mary Shelley)
- Your Highlight on page 716 | location 12877 | Added on Saturday, 04 January 2025 11:25:22

wretchedness
==========
Middlemarch (George Eliot)
- Your Highlight on page 720 | location 12944 | Added on Saturday, 14 December 2024 15:27:10

It is a narrow mind which cannot look at a subject from various points of view.
==========
Middlemarch (George Eliot)
- Your Highlight on page 722 | location 13012 | Added on Thursday, 20 February 2025 23:42:18

Dorothea's idealism collides with the small economies of provincial life.
==========
Middlemarch (George Eliot)
- Your Highlight on page 734 | location 13176 | Added on Sunday, 15 December 2024 12:17:28

We are all of us born in moral stupidity, taking the world as an udder to feed our supreme selves.
==========
Middlemarch (George Eliot)
- Your Highlight on page 736 | location 13217 | Added on Friday, 17 January 2025 17:15:02

What do we live for, if it is not to make life less difficult for each other?
==========
Middlemarch (George Eliot)
- Your Highlight on page 746 | location 13415 | Added on Saturday, 18 January 2025 17:24:05

pier-glass
==========
Middlemarch (George Eliot)
- Your Highlight on page 763 | location 13698 | Added on Tuesday, 04 February 2025 14:32:49

The growing good of the world is partly dependent on unhistoric acts.
==========
Middlemarch (George Eliot)
- Your Highlight on page 763 | location 13740 | Added on Thursday, 09 January 2025 11:25:37

Character is not cut in marble; it is something living and changing.
==========
Middlemarch (George Eliot)
- Your Highlight on page 769 | location 13801 | Added on Sunday, 15 December 2024 14:05:37

magnanimity
==========
The Odyssey (Homer)
- Your Highlight on page 784 | location 14111 | Added on Thursday, 06 March 2025 19:48:20

Sing to me of the man, Muse, the man of twists and turns.
==========
The Odyssey (Homer)
- Your Highlight on page 801 | location 14404 | Added on Wednesday, 22 January 2025 11:02:52

Odysseus is driven across the wine-dark sea by the wrath of Poseidon.
==========
The Odyssey (Homer)
- Your Highlight on page 820 | location 14706 | Added on Saturday, 22 February 2025 23:48:32

Of all creatures that breathe and move, nothing is bred that is weaker than man.
==========
The Odyssey (Homer)
- Your Highlight on page 820 | location 14754 | Added on Saturday, 04 January 2025 11:40:23

guile
==========
The Odyssey (Homer)
- Your Highlight on page 827 | location 14847 | Added on Monday, 10 February 2025 07:40:34

Be strong, saith my heart; I am a soldier; I have seen worse sights than this.
==========
The Odyssey (Homer)
- Your Highlight on page 837 | location 15012 | Added on Saturday, 25 January 2025 09:47:59

the sea is both road and adversary
==========
The Odyssey (Homer)
- Your Highlight on page 850 | location 15309 | Added on Monday, 03 March 2025 22:16:51

There is a time for many words, and there is also a time for sleep.
==========
The Odyssey (Homer)
- Your Highlight on page 856 | location 15387 | Added on Wednesday, 15 January 2025 13:14:47

fate spun by the gods cannot be outrun
==========
The Odyssey (Homer)
- Your Highlight on page 873 | location 15662 | Added on Saturday, 08 February 2025 16:49:02

xenia
==========
Meditations (Marcus Aurelius)
- Your Note on page 17 | location 305 | Added on Tuesday, 27 August 2024 10:01:12

This reframed how I start my mornings — guard the quality of the first thought.
==========
Meditations (Marcus Aurelius)
- Your Note on page 30 | location 547 | Added on Tuesday, 13 August 2024 08:40:10

Cf. cognitive behavioral therapy: thoughts dye the mood.
==========
Meditations (Marcus Aurelius)
- Your Note on page 50 | location 903 | Added on Sunday, 08 September 2024 12:09:55

The whole book really comes down to this one line.
==========
The Great Gatsby (F. Scott Fitzgerald)
- Your Highlight on page 66 | location 1190 | Added on Monday, 04 January 2024 08:00:00

So we beat on, boats against the current, borne back ceaselessly into the past.
==========
The Great Gatsby (F. Scott Fitzgerald)
- Your Highlight on page 74 | location 1320 | Added on Tuesday, 06 January 2024 09:17:11

ineffable
==========
The Great Gatsby (F. Scott Fitzgerald)
- Your Highlight on page 84 | location 1490 | Added on Wednesday, 08 January 2024 10:34:22

West Egg
==========
War and Peace (Leo Tolstoy)
- Your Highlight on page 90 | location 1580 | Added on Thursday, 11 February 2024 09:13:07

We can know only that we know nothing. And that is the highest degree of human wisdom.
==========
War and Peace (Leo Tolstoy)
- Your Highlight on page 98 | location 1710 | Added on Friday, 13 February 2024 10:30:18

magnanimity
==========
War and Peace (Leo Tolstoy)
- Your Highlight on page 108 | location 1880 | Added on Saturday, 15 February 2024 11:47:29

Borodino
==========
Anna Karenina (Leo Tolstoy)
- Your Highlight on page 114 | location 1970 | Added on Sunday, 18 March 2024 10:26:14

All happy families are alike; each unhappy family is unhappy in its own way.
==========
Anna Karenina (Leo Tolstoy)
- Your Highlight on page 122 | location 2100 | Added on Monday, 20 March 2024 11:43:25

vexation
==========
Anna Karenina (Leo Tolstoy)
- Your Highlight on page 132 | location 2270 | Added on Tuesday, 22 March 2024 12:00:36

Moscow
==========
Jane Eyre (Charlotte Bronte)
- Your Highlight on page 138 | location 2360 | Added on Wednesday, 25 April 2024 11:39:21

I am no bird; and no net ensnares me: I am a free human being with an independent will.
==========
Jane Eyre (Charlotte Bronte)
- Your Highlight on page 146 | location 2490 | Added on Thursday, 27 April 2024 12:56:32

sojourn
==========
Jane Eyre (Charlotte Bronte)
- Your Highlight on page 156 | location 2660 | Added on Friday, 28 April 2024 13:13:43

Thornfield
==========
Wuthering Heights (Emily Bronte)
- Your Highlight on page 162 | location 2750 | Added on Saturday, 08 May 2024 12:52:28

Whatever our souls are made of, his and mine are the same.
==========
Wuthering Heights (Emily Bronte)
- Your Highlight on page 170 | location 2880 | Added on Sunday, 10 May 2024 13:09:39

wuthering
==========
Wuthering Heights (Emily Bronte)
- Your Highlight on page 180 | location 3050 | Added on Monday, 12 May 2024 14:26:50

Yorkshire
==========
Great Expectations (Charles Dickens)
- Your Highlight on page 186 | location 3140 | Added on Tuesday, 15 June 2024 13:05:35

Suffering has been stronger than all other teaching.
==========
Great Expectations (Charles Dickens)
- Your Highlight on page 194 | location 3270 | Added on Wednesday, 17 June 2024 14:22:46

remonstrance
==========
Great Expectations (Charles Dickens)
- Your Highlight on page 204 | location 3440 | Added on Thursday, 19 June 2024 15:39:57

Satis House
==========
A Tale of Two Cities (Charles Dickens)
- Your Highlight on page 210 | location 3530 | Added on Friday, 22 July 2024 14:18:42

It was the best of times, it was the worst of times.
==========
A Tale of Two Cities (Charles Dickens)
- Your Highlight on page 218 | location 3660 | Added on Saturday, 24 July 2024 15:35:53

expiation
==========
A Tale of Two Cities (Charles Dickens)
- Your Highlight on page 228 | location 3830 | Added on Sunday, 26 July 2024 16:52:04

Bastille
==========
The Picture of Dorian Gray (Oscar Wilde)
- Your Highlight on page 234 | location 3920 | Added on Monday, 05 August 2024 15:31:49

The only way to get rid of a temptation is to yield to it.
==========
The Picture of Dorian Gray (Oscar Wilde)
- Your Highlight on page 242 | location 4050 | Added on Tuesday, 07 August 2024 16:48:00

hedonism
==========
The Picture of Dorian Gray (Oscar Wilde)
- Your Highlight on page 252 | location 4220 | Added on Wednesday, 09 August 2024 17:05:11

London
==========
Don Quixote (Miguel de Cervantes)
- Your Highlight on page 258 | location 4310 | Added on Thursday, 12 September 2024 16:44:56

When life itself seems lunatic, who knows where madness lies?
==========
Don Quixote (Miguel de Cervantes)
- Your Highlight on page 266 | location 4440 | Added on Friday, 14 September 2024 17:01:07

quixotic
==========
Don Quixote (Miguel de Cervantes)
- Your Highlight on page 276 | location 4610 | Added on Saturday, 16 September 2024 18:18:18

La Mancha
==========
The Iliad (Homer)
- Your Highlight on page 282 | location 4700 | Added on Sunday, 19 October 2024 17:57:03

Any moment might be our last. Everything is more beautiful because we are doomed.
==========
The Iliad (Homer)
- Your Highlight on page 290 | location 4830 | Added on Monday, 21 October 2024 18:14:14

ineluctable
==========
The Iliad (Homer)
- Your Highlight on page 300 | location 5000 | Added on Tuesday, 23 October 2024 19:31:25

Troy
==========
Hamlet (William Shakespeare)
- Your Highlight on page 306 | location 5090 | Added on Wednesday, 26 November 2024 18:10:10

This above all: to thine own self be true.
==========
Hamlet (William Shakespeare)
- Your Highlight on page 314 | location 5220 | Added on Thursday, 28 November 2024 19:27:21

antic
==========
Hamlet (William Shakespeare)
- Your Highlight on page 324 | location 5390 | Added on Friday, 28 November 2024 08:44:32

Elsinore
==========
Paradise Lost (John Milton)
- Your Highlight on page 330 | location 5480 | Added on Saturday, 09 December 2024 19:23:17

The mind is its own place, and in itself can make a heaven of hell, a hell of heaven.
==========
Paradise Lost (John Milton)
- Your Highlight on page 338 | location 5610 | Added on Sunday, 11 December 2024 08:40:28

pandemonium
==========
Paradise Lost (John Milton)
- Your Highlight on page 348 | location 5780 | Added on Monday, 13 December 2024 09:57:39

Eden
==========
The Divine Comedy (Dante Alighieri)
- Your Highlight on page 354 | location 5870 | Added on Tuesday, 16 January 2024 08:36:24

Do not be afraid; our fate cannot be taken from us; it is a gift.
==========
The Divine Comedy (Dante Alighieri)
- Your Highlight on page 362 | location 6000 | Added on Wednesday, 18 January 2024 09:53:35

contrapasso
==========
The Divine Comedy (Dante Alighieri)
- Your Highlight on page 372 | location 6170 | Added on Thursday, 20 January 2024 10:10:46

Florence
==========
Faust (Johann Wolfgang von Goethe)
- Your Highlight on page 378 | location 6260 | Added on Friday, 23 February 2024 09:49:31

He alone deserves freedom and life who must conquer them each day.
==========
Faust (Johann Wolfgang von Goethe)
- Your Highlight on page 386 | location 6390 | Added on Saturday, 25 February 2024 10:06:42

ennui
==========
Faust (Johann Wolfgang von Goethe)
- Your Highlight on page 396 | location 6560 | Added on Sunday, 27 February 2024 11:23:53

Mephistopheles
==========
Leaves of Grass (Walt Whitman)
- Your Highlight on page 402 | location 6650 | Added on Monday, 06 March 2024 10:02:38

I am large, I contain multitudes.
==========
Leaves of Grass (Walt Whitman)
- Your Highlight on page 410 | location 6780 | Added on Tuesday, 08 March 2024 11:19:49

effuse
==========
Leaves of Grass (Walt Whitman)
- Your Highlight on page 420 | location 6950 | Added on Wednesday, 10 March 2024 12:36:00

Manhattan
==========
The Stranger (Albert Camus)
- Your Highlight on page 426 | location 7040 | Added on Thursday, 13 April 2024 11:15:45

I opened myself to the gentle indifference of the world.
==========
The Stranger (Albert Camus)
- Your Highlight on page 434 | location 7170 | Added on Friday, 15 April 2024 12:32:56

absurdity
==========
The Stranger (Albert Camus)
- Your Highlight on page 444 | location 7340 | Added on Saturday, 17 April 2024 13:49:07

Algiers
==========
Thus Spoke Zarathustra (Friedrich Nietzsche)
- Your Highlight on page 450 | location 7430 | Added on Sunday, 20 May 2024 12:28:52

You must have chaos within you to give birth to a dancing star.
==========
Thus Spoke Zarathustra (Friedrich Nietzsche)
- Your Highlight on page 458 | location 7560 | Added on Monday, 22 May 2024 13:45:03

transvaluation
==========
Thus Spoke Zarathustra (Friedrich Nietzsche)
- Your Highlight on page 468 | location 7730 | Added on Tuesday, 24 May 2024 14:02:14

Zarathustra
==========
Notes from Underground (Fyodor Dostoevsky)
- Your Highlight on page 474 | location 7820 | Added on Wednesday, 27 June 2024 13:41:59

I am a sick man. I am a spiteful man. I am an unattractive man.
==========
Notes from Underground (Fyodor Dostoevsky)
- Your Highlight on page 482 | location 7950 | Added on Thursday, 28 June 2024 14:58:10

inertia
==========
Notes from Underground (Fyodor Dostoevsky)
- Your Highlight on page 492 | location 8120 | Added on Friday, 28 June 2024 15:15:21

St. Petersburg
==========
The Trial (Franz Kafka)
- Your Highlight on page 498 | location 8210 | Added on Saturday, 10 July 2024 14:54:06

Someone must have slandered Josef K., for one morning he was arrested without having done anything truly wrong.
==========
The Trial (Franz Kafka)
- Your Highlight on page 506 | location 8340 | Added on Sunday, 12 July 2024 15:11:17

labyrinthine
==========
The Trial (Franz Kafka)
- Your Highlight on page 516 | location 8510 | Added on Monday, 14 July 2024 16:28:28

Prague
==========
Ulysses (James Joyce)
- Your Highlight on page 522 | location 8600 | Added on Tuesday, 17 August 2024 15:07:13

History is a nightmare from which I am trying to awake.
==========
Ulysses (James Joyce)
- Your Highlight on page 530 | location 8730 | Added on Wednesday, 19 August 2024 16:24:24

epiphany
==========
Ulysses (James Joyce)
- Your Highlight on page 540 | location 8900 | Added on Thursday, 21 August 2024 17:41:35

Dublin
==========`;
// Load the sample into its own dedicated "Sample" library (reuse if up to date, else rebuild)
syncActiveLib();
const existingSample=LIBRARIES.find(l=>l.isSample);
if(existingSample){
  if(existingSample.sampleVer===SAMPLE_VERSION){switchLibrary(existingSample.id);return;}
  deleteLibrary(existingSample.id); // stale built-in sample — drop it and rebuild with the current books
}
createLibraryQuiet("Sample");
ingest(sample,"Marginalia sample.txt",true);
const SAMPLE_CATS=["quotes", "quotes", "vocab", "quotes", "vocab", "quotes", "vocab", "quotes", "quotes", "vocab", "quotes", "topic", "vocab", "quotes", "quotes", "vocab", "quotes", "quotes", "vocab", "quotes", "quotes", "vocab", "quotes", "topic", "topic", "vocab", "quotes", "vocab", "quotes", "quotes", "topic", "quotes", "vocab", "quotes", "quotes", "topic", "vocab", "quotes", "quotes", "quotes", "topic", "topic", "vocab", "quotes", "quotes", "topic", "quotes", "quotes", "vocab", "quotes", "topic", "quotes", "vocab", "quotes", "quotes", "quotes", "quotes", "topic", "vocab", "quotes", "topic", "quotes", "quotes", "quotes", "quotes", "topic", "topic", "vocab", "quotes", "topic", "vocab", "quotes", "topic", "quotes", "quotes", "vocab", "quotes", "quotes", "vocab", "quotes", "topic", "quotes", "vocab", "quotes", "topic", "quotes", "topic", "vocab"];
STATE.clips.filter(c=>c.type!=="note").forEach((c,i)=>{if(SAMPLE_CATS[i]){c.cat=SAMPLE_CATS[i];c.catLocked=true;}});
const freshSample=LIBRARIES.find(l=>l.isSample);if(freshSample)freshSample.sampleVer=SAMPLE_VERSION;
saveState();render();renderDropPanel();}
