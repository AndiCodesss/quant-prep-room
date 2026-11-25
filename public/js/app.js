/* ---------------- State ---------------- */
const today=()=>isoOf(new Date());
function isoOf(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function dateOf(s){const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)}
const RESET="2026-11-25"; // progress saved under an older stamp is discarded
let S={v:1,start:today(),done:{},can:{},rev:{},wu:"",r:RESET};
let DB=null, COL=null, SAMPLE=null, SYNC="device";
const LKEY="qpr-state-v1";
function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
(function(){const raw=lsGet(LKEY);if(raw){try{const o=JSON.parse(raw);if(o&&o.done&&o.r===RESET)S=Object.assign(S,o)}catch(e){}}})();
S.rev=S.rev||{};S.wu=S.wu||"";
function mergeState(a,b){
  const rev=Object.assign({},b.rev||{});
  for(const [k,v] of Object.entries(a.rev||{})){if(!rev[k]||(v.last||"")>=(rev[k].last||""))rev[k]=v}
  const can=Object.assign({},b.can||{});
  for(const [k,v] of Object.entries(a.can||{})){if(typeof can[k]!=="string"||(typeof v==="string"&&v>can[k]))can[k]=v}
  return{v:1,r:RESET,start:(a.start<b.start?a.start:b.start),done:Object.assign({},b.done||{},a.done||{}),known:Object.assign({},b.known||{},a.known||{}),can,rev,wu:((a.wu||"")>(b.wu||"")?a.wu:b.wu)||""};
}

/* ---------------- Saved answers: what you wrote or typed in a lesson stays there ---------------- */
const ANS={},ansT={};
async function loadAns(id){
  if(ANS[id])return ANS[id];
  let o=null;const raw=lsGet("qpr-ans-"+id);if(raw){try{o=JSON.parse(raw)}catch(e){}}
  if(!(o&&o.r===RESET&&o.b))o=null;
  if(COL){try{const sn=await Promise.race([COL.doc("ans-"+id).get(),new Promise((_,r)=>setTimeout(()=>r(0),6000))]);const d=sn.exists?sn.data():null;if(d&&d.r===RESET&&d.b&&(!o||(d.at||"")>(o.at||"")))o=d}catch(e){}}
  ANS[id]=o||{r:RESET,b:{},at:""};return ANS[id];
}
function saveAns(id){
  const o=ANS[id];if(!o)return;o.at=new Date().toISOString();lsSet("qpr-ans-"+id,JSON.stringify(o));
  clearTimeout(ansT[id]);ansT[id]=setTimeout(()=>{if(COL)COL.doc("ans-"+id).set(JSON.parse(JSON.stringify(o))).catch(()=>{})},2500);
}
const bind=(id,k)=>({saved:ANS[id]&&ANS[id].b[k],onChange:v=>{if(!ANS[id])return;ANS[id].b[k]=v;saveAns(id)}});

/* ---------------- Spaced review ---------------- */
// Card id "w3d2#1" = practice problem 1 of lesson w3d2. Expanding intervals in days.
const LADDER=[1,4,10,30,90,240];
function addDays(iso,n){const d=dateOf(iso);d.setDate(d.getDate()+n);return isoOf(d)}
function nextN(c,g){const n=c?c.n:-1;const r=g===0?0:g===1?Math.max(0,n):g===2?n+1:n+2;return Math.min(Math.max(r,0),LADDER.length-1)}
function rateCard(cid,g){const c=S.rev[cid];const n=nextN(c,g);S.rev[cid]={n,due:addDays(today(),LADDER[n]),last:today(),lapses:((c&&c.lapses)||0)+(g===0?1:0)};save();updateStats()}
const fmtIv=d=>d===1?"tomorrow":d<30?d+" days":d<365?Math.round(d/30)+" mo":"1 yr";
function dueCards(){const t=today();return Object.entries(S.rev).filter(([k,v])=>v.due<=t).sort((a,b)=>a[1].due<b[1].due?-1:a[1].due>b[1].due?1:0).map(([k])=>k)}
function pickWarmup(n){
  const due=dueCards(),pick=[],weeks=new Set();
  for(const c of due){if(pick.length>=n)break;const w=c.split("d")[0];if(!weeks.has(w)){pick.push(c);weeks.add(w)}}
  for(const c of due){if(pick.length>=n)break;if(!pick.includes(c))pick.push(c)}
  for(let i=pick.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pick[i],pick[j]]=[pick[j],pick[i]]}
  return pick;
}
// The rating row of a problem. A checked answer rates itself (auto: 0 Forgot, 1 Hard, 2 Good), so nothing has to be
// tapped for the problem to count; the row then shows what was saved and lets you overrule it. Without a check
// (answer revealed by hand) it asks.
function rateRow(cid,el,after,auto){
  const c0=S.rev[cid],names=["Forgot","Hard","Good","Easy"];let told=false;
  el.hidden=false;
  const paint=g=>{
    el.innerHTML=(g==null?'<span class="note">How did it go?</span>':`<span class="note">Saved as <b>${names[g]}</b>: back in your warm-up on ${fmtDate(dateOf(S.rev[cid].due))}. Change it:</span>`)
      +names.map((t,k)=>`<button class="btn sm${k===g?" on":""}" data-g="${k}">${t} <span class="iv">· ${fmtIv(LADDER[nextN(c0,k)])}</span></button>`).join("");
    el.querySelectorAll("[data-g]").forEach(b=>b.onclick=()=>set(+b.dataset.g));
  };
  // Every choice is counted from the card as it was before this visit, so changing your mind never rates it twice.
  const set=g=>{if(c0)S.rev[cid]=c0;else delete S.rev[cid];rateCard(cid,g);paint(g);if(after&&!told){told=true;after()}};
  if(auto!=null)set(auto);else paint(null);
}
const VERDICT_GRADE={wrong:0,partly:1,correct:2};
// Closed-book reveal: the first click on an empty attempt only nudges.
function revealAnswer(btn,ta,fb,ans,onFirst){
  if(ans.hidden&&!ta.has()&&!btn.dataset.nudged){btn.dataset.nudged="1";fb.hidden=false;fb.textContent="Have a go first, even a partial attempt on the pad or on paper. Retrieving it yourself is what makes it stick. Click again to reveal anyway.";return}
  fb.hidden=fb.textContent.startsWith("Have a go")?true:fb.hidden;
  ans.hidden=!ans.hidden;btn.textContent=ans.hidden?(SAMPLE?"Show the full written answer":"Show answer"):"Hide answer";
  if(!ans.hidden&&!btn.dataset.seen){btn.dataset.seen="1";if(onFirst)onFirst()}
}
// Missed training problems live in their own doc; their review cards are "x#<id>".
let BANK={items:{},r:RESET};const BKEY="qpr-bank-v1";let bankChain=Promise.resolve();
(function(){const r=lsGet(BKEY);if(r){try{const o=JSON.parse(r);if(o&&o.items&&o.r===RESET)BANK=o}catch(e){}}})();
function saveBank(){
  const ks=Object.keys(BANK.items);
  if(ks.length>200)ks.sort((a,b)=>BANK.items[a].at<BANK.items[b].at?-1:1).slice(0,ks.length-200).forEach(k=>{delete BANK.items[k];delete S.rev["x#"+k]});
  lsSet(BKEY,JSON.stringify(BANK));
  if(COL){const snap=JSON.parse(JSON.stringify(BANK));bankChain=bankChain.then(()=>COL.doc("drillbank").set(snap)).catch(()=>{})}
}
function bankAdd(it,due){
  const id=Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  BANK.items[id]={q:String(it.q),a:String(it.a),t:String(it.topic||"Training"),at:new Date().toISOString()};
  saveBank();
  if(due){S.rev["x#"+id]={n:0,due:addDays(today(),1),last:today(),lapses:0};save()}
  return "x#"+id;
}
let saving=false,again=false;
async function save(){
  lsSet(LKEY,JSON.stringify(S));
  if(!COL)return;
  if(saving){again=true;return}
  saving=true;
  try{await COL.doc("progress").set(JSON.parse(JSON.stringify(S)));SYNC="account"}catch(e){SYNC="device"}
  saving=false;
  if(again){again=false;save()}
}

/* ---------------- Helpers ---------------- */
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function renderMD(src,el,typeset=true){
  src=String(src||"").replace(/\\\[([\s\S]+?)\\\]/g,(m,x)=>"$$"+x+"$$").replace(/\\\(([\s\S]+?)\\\)/g,(m,x)=>"$"+x+"$");
  const math=[];
  src=src.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g,m=>{math.push(m);return "MJXPH"+(math.length-1)+"Q"});
  let html;
  if(window.marked&&window.DOMPurify){html=marked.parse(src);}
  else{html=src.split(/\n{2,}/).map(p=>"<p>"+esc(p)+"</p>").join("");}
  html=html.replace(/MJXPH(\d+)Q/g,(m,i)=>esc(math[+i]));
  el.innerHTML=window.DOMPurify?DOMPurify.sanitize(html):html;
  if(typeset)typesetNow(el);
}
/* ---------------- Lesson layout: numbered sections and coloured boxes ---------------- */
// A lesson is Markdown. A quote block that opens with a tag becomes a box:
//   > [!rule] Product rule          rule, definition, formula  (blue)
//   > [!example] Doubling time      example                    (green)
//   > [!warning]                    warning, mistake           (red)
//   > [!intuition]                  intuition, tip             (violet)
//   > [!why]                        why it matters             (teal)
//   > [!remember]                   remember                   (amber, framed)
//   > [!notation]                   a sign and how to read it  (grey)
// Lessons written before the tags existed are boxed by their headings ("Common mistakes", "Example", ...).
const BOXES={rule:["rule","Rule"],definition:["rule","Definition"],formula:["rule","Formula"],example:["example","Worked example"],warning:["warning","Watch out"],mistake:["warning","Watch out"],intuition:["intuition","The idea"],tip:["intuition","Tip"],why:["why","Why it matters"],remember:["remember","Remember"],notation:["notation","New notation"]};
function lessonBox(type,title){
  const d=document.createElement("div"),h=document.createElement("div"),b=document.createElement("b"),s=document.createElement("span");
  d.className="box box-"+BOXES[type][0];h.className="box-h";b.textContent=BOXES[type][1];s.textContent=title||"";h.append(b,s);d.append(h);return d;
}
const boxKind=t=>/mistake|trap|pitfall|watch out|careful/i.test(t)?"warning":/example/i.test(t)?"example":/why (this|it) matters|matters for|quantitative finance|quant finance/i.test(t)?"why":/remember|recap|summary|takeaway|key (facts|results|points)/i.test(t)?"remember":/intuition|the idea|big picture/i.test(t)?"intuition":/\b(definitions?|rules?|formulas?|theorem|identit\w+|laws?|notation)\b|sums to know/i.test(t)?"rule":"";
function renderLesson(src,el){
  renderMD(src,el,false);
  // 1) Tagged quote blocks.
  el.querySelectorAll("blockquote").forEach(bq=>{
    const tw=document.createTreeWalker(bq,NodeFilter.SHOW_TEXT);let tn=tw.nextNode();while(tn&&!tn.nodeValue.trim())tn=tw.nextNode();if(!tn)return;
    const m=/^\s*\[!(\w+)\][ \t]*([^\n]*)\n?/.exec(tn.nodeValue),type=m&&m[1].toLowerCase();if(!m||!BOXES[type])return;
    tn.nodeValue=tn.nodeValue.slice(m[0].length);
    const d=lessonBox(type,m[2].trim()),p=bq.firstElementChild;
    if(p&&!p.textContent.trim()&&!p.children.length)p.remove();
    while(bq.firstChild)d.append(bq.firstChild);bq.replaceWith(d);
  });
  // 2) Every "##" heading opens a numbered section; a heading that names a kind of box becomes that box.
  // What belongs to a heading: everything up to the next heading, but never the closing "Things to remember" box.
  const upTo=(h,stop)=>{const out=[];for(let n=h.nextSibling;n&&!(n.nodeType===1&&(stop.includes(n.tagName)||n.classList.contains("box-remember")));n=n.nextSibling)out.push(n);return out};
  [...el.children].filter(n=>n.tagName==="H2").forEach(h=>{
    const rest=upTo(h,["H2"]),k=boxKind(h.textContent);
    if(k){const d=lessonBox(k,h.textContent);h.replaceWith(d);d.append(...rest);return}
    // The page numbers the sections itself, so a number written into the heading would show twice.
    const tn=h.firstChild;if(tn&&tn.nodeType===3)tn.nodeValue=tn.nodeValue.replace(/^\s*\d+[.)]\s+/,"");
    const sec=document.createElement("section");sec.className="lsec";h.before(sec);sec.append(h,...rest);
  });
  el.querySelectorAll(".lsec > h3").forEach(h=>{const k=boxKind(h.textContent);if(!k)return;const rest=upTo(h,["H3","H2"]),d=lessonBox(k,h.textContent);h.replaceWith(d);d.append(...rest)});
  // 3) "**Example.** ..." paragraphs, with the list that follows them.
  el.querySelectorAll("p > strong:first-child").forEach(st=>{
    const p=st.parentNode;if(p.firstChild!==st||p.closest(".box"))return;
    const k=boxKind(st.textContent);if(!k)return;
    const d=lessonBox(k,""),nx=p.nextElementSibling;p.before(d);d.append(p);
    if(nx&&(nx.tagName==="OL"||nx.tagName==="UL"))d.append(nx);
  });
  // 4) The opening paragraph, and the plain-English reading under a formula.
  const first=el.firstElementChild;if(first&&first.tagName==="P")first.classList.add("lead");
  el.querySelectorAll("p").forEach(p=>{if(/^\s*In words:/i.test(p.textContent))p.classList.add("inwords-line")});
  notationBoxes(el);
  typesetNow(el);
}
// Notation is explained where it first turns up. Before the paragraph (or box) in which a sign from the Symbols
// table appears for the first time in a lesson, a grey "New notation" box says how to read it, what it means and
// shows one small example. It keeps appearing in later lessons until "Got it" is tapped for that sign.
function notationBoxes(el){
  const known=S.known||{},seen=new Set(),at=new Map();
  el.querySelectorAll("p,li,td,th").forEach(node=>{
    if(node.closest(".box-h,.box-notation"))return;
    const tex=(node.textContent.match(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g)||[]).join(" ");if(!tex)return;
    SYMS.forEach((s,i)=>{
      if(seen.has(i)||known[s[0]]||!s[3]||!s[3].test(tex))return;
      seen.add(i);
      const spot=node.closest(".box")||node.closest("ul,ol,table")||node;
      if(!at.has(spot))at.set(spot,[]);at.get(spot).push(i);
    });
  });
  at.forEach((ids,spot)=>{
    const d=lessonBox("notation",ids.length>1?"new signs in the next lines":"a new sign in the next lines");
    ids.forEach(i=>{
      const [tex,say,what,,ex]=SYMS[i],row=document.createElement("div");row.className="nt";
      row.innerHTML='<div class="nt-s"></div><div class="nt-b"><div class="nt-say"></div><div class="nt-what"></div><div class="nt-ex"></div></div><button type="button" class="btn sm">Got it</button>';
      row.querySelector(".nt-s").textContent="$"+tex+"$";
      row.querySelector(".nt-say").textContent="Say: “"+say+"”";
      const w=row.querySelector(".nt-what"),x=row.querySelector(".nt-ex");
      if(what)renderMD(what,w,false);else w.remove();
      if(ex)renderMD("**For example:** "+ex,x,false);else x.remove();
      row.querySelector("button").onclick=()=>{S.known=S.known||{};S.known[tex]=today();save();row.remove();if(!d.querySelector(".nt"))d.remove()};
      d.append(row);
    });
    spot.before(d);
  });
}
const doneCount=()=>LESSONS.filter(l=>S.done[l.id]).length;
const nextLesson=()=>LESSONS.find(l=>!S.done[l.id])||LESSONS[LESSONS.length-1];
function streak(){const days=new Set(Object.values(S.done));let d=new Date();if(!days.has(isoOf(d)))d.setDate(d.getDate()-1);let n=0;while(days.has(isoOf(d))){n++;d.setDate(d.getDate()-1)}return n}
function pace(){
  const days=Math.floor((dateOf(today())-dateOf(S.start))/864e5);
  const expected=Math.min(LESSONS.length,Math.floor(days*6/7)+1);
  const diff=doneCount()-expected;
  return {expected,diff};
}
function finishDate(){const left=LESSONS.length-doneCount();const d=new Date();d.setDate(d.getDate()+Math.ceil(left*7/6));return d}
const fmtDate=d=>d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
function weekDate(w){const d=dateOf(S.start);d.setDate(d.getDate()+(w-1)*7);return d.toLocaleDateString("en-GB",{day:"numeric",month:"short"})}
function updateStats(){
  document.getElementById("s-streak").textContent=streak()+(streak()===1?" day":" days");
  document.getElementById("s-done").textContent=Math.round(doneCount()/LESSONS.length*100)+"%";
  const n=dueCards().length,b=document.getElementById("s-due");b.hidden=!n;b.textContent=n;
}

/* ---------------- Lesson content (hand-written or generated) ---------------- */
const MEM={};
// A lesson is its own text and problems plus any extra problems asked for later ("more problems on this topic").
// The extras are kept apart from the lesson and added behind its own problems, so the earlier ones keep their numbers
// and with them their place in the review deck.
const MORE={};
async function loadMore(id){
  if(MORE[id])return MORE[id];
  let o=null;const raw=lsGet("qpr-more-"+id);if(raw){try{o=JSON.parse(raw)}catch(e){}}
  if(!(o&&o.r===RESET&&Array.isArray(o.items)))o=null;
  if(COL){try{const sn=await Promise.race([COL.doc("more-"+id).get(),new Promise((_,r)=>setTimeout(()=>r(0),6000))]);const d=sn.exists?sn.data():null;if(d&&d.r===RESET&&Array.isArray(d.items)&&(!o||d.items.length>o.items.length))o=d}catch(e){}}
  MORE[id]=o||{r:RESET,items:[]};return MORE[id];
}
async function addMore(id,items){
  const o=await loadMore(id);o.items.push(...items);lsSet("qpr-more-"+id,JSON.stringify(o));
  if(COL){try{await COL.doc("more-"+id).set(JSON.parse(JSON.stringify(o)))}catch(e){}}
}
async function loadLesson(id){
  const base=await loadBase(id);if(!base)return null;
  const more=(await loadMore(id)).items;
  return more.length?Object.assign({},base,{practice:(base.practice||[]).concat(more),own:(base.practice||[]).length}):base;
}
async function loadBase(id){
  if(HAND[id])return HAND[id];
  if(MEM[id])return MEM[id];
  if(COL){try{const s=await COL.doc("lesson-"+id).get();if(s.exists){MEM[id]=s.data();return MEM[id]}}catch(e){}}
  const raw=lsGet("qpr-lesson-"+id);if(raw){try{MEM[id]=JSON.parse(raw);return MEM[id]}catch(e){}}
  return null;
}
async function storeLesson(id,obj){
  MEM[id]=obj;lsSet("qpr-lesson-"+id,JSON.stringify(obj));
  if(COL){try{await COL.doc("lesson-"+id).set(obj)}catch(e){}}
}
function lessonPrompt(L){
  const wk=WEEKS[L.w-1];
  const ctx="The student is preparing for the admission interview of the MSc Quantitative Finance jointly offered by UZH and ETH Zurich. Background: one university business-math course at WU Vienna, otherwise a beginner. They study about 45–60 minutes a day.";
  const earlier=WEEKS.slice(Math.max(0,L.w-9),L.w-1).map(x=>x[0]);
  const mix=earlier.length?" Interleave: also include 2 problems on earlier weeks' themes ("+earlier.slice(-4).join("; ")+"), unlabeled and shuffled in with the rest, so the student has to recognise which method applies.":"";
  const topic=L.review
    ? "Today is a REVIEW day for week "+L.w+" ("+wk[0]+"). The week covered: "+wk[1].join("; ")+". Write a short recap of the key results (formulas, definitions, one-line intuition each), then 10 mixed practice problems across the week, at least one for every day's topic, in shuffled order, not grouped by topic."+mix
    : "Today's lesson: week "+L.w+" of 52 ("+L.phase+" phase, week theme: "+wk[0]+"). Topic: "+L.title+". Earlier this week: "+wk[1].slice(0,L.d-1).join("; ")+(L.d>1?".":"(this is the first day).")+" Write a self-contained lesson of about 45 minutes: start with intuition in plain language, then the precise definitions/statements (state the sets variables live in), then at least two fully worked examples step by step, a short 'common mistakes' list, and a closing paragraph on why it matters for quantitative finance or the interview. The student finds mathematical notation hard to read: directly below every displayed formula add a line in italics starting with 'In words:' that reads the formula aloud in plain English, and the first time any symbol appears (for example a capital sigma for sums, the element-of sign, the integral sign, a prime for derivatives) name the symbol and say how it is pronounced. Then 8 practice problems, ordered from easy to hard. Every rule or definition of the lesson is practised at least twice: once directly, and once in a harder or less obvious form, with different numbers and a different surface each time. The FIRST problem is shown before the lesson as a try-first question, so it must be approachable with intuition alone. Problem 6 combines today's topic with something from earlier in the course, problem 7 is a multi-step problem, and problem 8 is an interview-style 'explain why' question.";
  return ctx+"\n\n"+topic+"\n\nIf the topic is not mathematical (for example application documents or interview practice), give concrete practical guidance and exercises instead, using what is known about this program: application 15 Nov–15 Jan, CHF 200 fee, CV and course summary on the program's templates, 1-page motivation letter, two referees, a 20-minute Zoom interview in March with a math part (calculus, linear algebra, probability and statistics) and a finance/economics part.\n\nFORMAT, follow exactly:\n- Markdown only, no HTML. Use ## and ### headings.\n- Math in LaTeX: inline as $...$ and display as $$...$$ on its own lines. Never use \\( \\) or \\[ \\]. Never use the dollar sign for money; write CHF or USD.\n- LAYOUT of the lesson (not the practice part). The page shows it as numbered sections with coloured boxes, so write it to be scanned, never as one long block of text:\n  * Open with one short paragraph: what today is about and why, in plain words.\n  * Then 3 to 6 sections, each starting with a ## heading that names its idea. At most 3 short paragraphs of running text per section; everything else goes into boxes.\n  * A box is a quote block whose first line is a tag and a short title, followed by an empty quote line, then the content. EVERY line of a box starts with '> ', including empty lines, list items and formulas. Inside a box a display formula sits on ONE line: > $$...$$\n  * The tags: [!intuition] the idea in everyday words or a picture, before any formula. [!rule] every definition, theorem or formula worth knowing, stated precisely with the sets the variables live in, followed by its 'In words:' line. [!example] a worked example, as numbered steps with one move per step and the reason for it. [!warning] a common mistake, shown as the wrong step, why it is wrong, and the right step. [!why] what it is used for in quantitative finance or in the interview. [!remember] the things to remember. [!notation] a sign or way of writing that is new in this lesson and is NOT one of the standard signs (the page itself explains sums, products, factorials, set signs, quantifiers, arrows, limits, derivatives, integrals and the usual probability signs where they first appear): put the box directly before the first formula that uses it and give the sign, how to say it aloud, what it means, and one tiny example.\n  * Every lesson has at least: one [!intuition], two [!rule], two [!example], one [!warning] and one [!why]. It ENDS with one box '> [!remember] Things to remember' holding 3 to 5 bullet points, each one fact or formula the student should be able to write down from memory tomorrow.\n  * Example of a box:\n> [!rule] Product rule for powers\n>\n> For $a>0$ and real numbers $x, y$:\n>\n> $$a^x a^y=a^{x+y}$$\n>\n> *In words: to multiply two powers of the same base, add the exponents.*\n- After the lesson, a line containing only ===PRACTICE===\n- Then each problem as a block starting with a line 'Q:' followed by the question, then a line 'A:' followed by a complete worked answer. Separate blocks with a line containing only ---\n- Do not use --- anywhere else.";
}
function parseLesson(text){
  const parts=text.split(/^\s*===\s*PRACTICE\s*===\s*$/m);
  const md=(parts[0]||"").trim(), practice=[];
  if(parts[1]){parts[1].split(/^\s*---\s*$/m).forEach(b=>{const m=b.match(/Q:\s*([\s\S]*?)\n\s*A:\s*([\s\S]*)/);if(m)practice.push({q:m[1].trim(),a:m[2].trim()})})}
  return {md,practice,at:new Date().toISOString()};
}
const ERRCOPY={rate_limited:"Claude is busy, or the usage limit is reached. Wait a minute and try again.",session_expired:"Your sign-in has expired. Reload the page and sign in again.",refused:"Claude declined this request. Try again.",empty_completion:"No answer came back. Try again.",upstream:"Claude couldn't be reached from the server. Try again in a moment.",cancelled:""};
const errText=e=>(e&&e.code&&ERRCOPY[e.code]!==undefined)?ERRCOPY[e.code]:"Something went wrong while asking Claude. Try again.";
const hideFor=c=>c==="unavailable";

/* ---------------- Ink pad (Apple Pencil, finger or mouse) ---------------- */
let TTS=null, IMG=null, PLAYER=null;
let DICT=null, DICT_T=null; // dictation, and the answer box it is currently filling
const TOUCHY=(navigator.maxTouchPoints||0)>0||(window.matchMedia&&matchMedia("(pointer:coarse)").matches);
let PEN_SEEN=false; // once the Pencil has touched a pad, finger and palm touches on pads are ignored
const selOff=()=>{try{const s=window.getSelection&&window.getSelection();if(s&&s.rangeCount)s.removeAllRanges()}catch(_){}};
document.addEventListener("selectstart",e=>{if(document.documentElement.classList.contains("inking"))e.preventDefault()});
// One tool palette for every writing pad on the page. Calc, Undo, Redo, Clear, Home and Taller act on the pad you last wrote on.
// A stroke remembers its tool ("pen" | "hi"), its colour (a key into the --pen-* / --hi-* CSS variables) and its size (0, 1, 2).
const PENS=["ink","blue","red","green","orange","purple"],HIS=["yellow","green","pink","blue"];
const PEN_W=[.6,1,1.75],HI_W=[10,16,24],HI_A=.36; // pen: factor on the pressure width. Highlighter: width in px, and how see-through it is
// The PNG that goes to Claude is always a white page, whatever the theme: colours are exported dark and legible, highlighter faint.
const PEN_X={ink:"#111111",blue:"#1b3fae",red:"#b3261e",green:"#17703a",orange:"#a85400",purple:"#6a2fb0"},HI_X={yellow:"#ffd60a",green:"#5fd17a",pink:"#ff7eb6",blue:"#6fb7ff"},HI_XA=.3;
const TOOLS={pen:"Pen",hi:"Highlighter",erase:"Eraser",move:"Move the page"};
const INKPREF="qpr-ink";
const INK={tool:"pen",prev:"pen",pen:{c:"ink",w:1},hi:{c:"yellow",w:1},opts:true,active:null,hover:null,pads:new Set()};
// Zoom of a pad: 1 = 100%. The dock buttons and the keyboard walk through the steps; a pinch or Ctrl+wheel lands anywhere in between.
const ZOOM={min:.4,max:4,steps:[.4,.5,.67,.8,1,1.25,1.5,2,2.5,3,4]};
const clampZ=z=>Math.max(ZOOM.min,Math.min(ZOOM.max,z));
// The last tool, and each tool's colour and size, come back after a reload. The eraser does not: a page should never open ready to erase.
(function(){try{const o=JSON.parse(lsGet(INKPREF)||"null");if(!o)return;
  [["pen",PENS],["hi",HIS]].forEach(([t,set])=>{const q=o[t];if(q&&set.includes(q.c))INK[t].c=q.c;if(q&&[0,1,2].includes(q.w))INK[t].w=q.w});
  if(o.prev==="pen"||o.prev==="hi")INK.prev=o.prev;
  if(TOOLS[o.tool])INK.tool=o.tool==="erase"?INK.prev:o.tool;
  if(o.opts===false)INK.opts=false}catch(e){}})();
const saveInk=()=>lsSet(INKPREF,JSON.stringify({tool:INK.tool,prev:INK.prev,pen:INK.pen,hi:INK.hi,opts:INK.opts}));
// The colours as the page shows them right now (they differ between the light and the dark theme).
let PAL=null;
function pal(){
  const ink=getComputedStyle(document.body).color;if(PAL&&PAL.ink===ink)return PAL;
  const cs=getComputedStyle(document.documentElement),v=n=>cs.getPropertyValue(n).trim();
  PAL={ink,accent:v("--accent")||ink,pen:{ink},hi:{}};PENS.slice(1).forEach(c=>{PAL.pen[c]=v("--pen-"+c)||ink});HIS.forEach(c=>{PAL.hi[c]=v("--hi-"+c)||HI_X[c]});return PAL;
}
const DOCK=document.createElement("div");DOCK.className="inkdock";DOCK.hidden=true;DOCK.setAttribute("role","toolbar");DOCK.setAttribute("aria-label","Writing tools");
const ICO={pen:"M4 20l1.2-4.4L16.6 4.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.4 18.8 4 20zM14.6 6.2l3.2 3.2",
  hi:"M9.5 13.5l7.3-9.2a1.4 1.4 0 0 1 2-.2l2 1.7a1.4 1.4 0 0 1 .2 2l-7.5 9zM9.5 13.5l-1.7 3.7 2.6 2.2 3.1-2.6M7.8 17.2L4 20.6h4.6l1.8-1.2M3 21.5h18",
  erase:"M8.6 20h10.9M5.2 13.4l8.2-8.2a2 2 0 0 1 2.8 0l3.6 3.6a2 2 0 0 1 0 2.8L12.6 19H8l-2.8-2.8a2 2 0 0 1 0-2.8zM9.4 9.2l6 6",
  move:"M12 3v18M3 12h18M9.4 5.6L12 3l2.6 2.6M9.4 18.4L12 21l2.6-2.6M5.6 9.4L3 12l2.6 2.6M18.4 9.4L21 12l-2.6 2.6",
  undo:"M8.5 13.5L4 9l4.5-4.5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",redo:"M15.5 13.5L20 9l-4.5-4.5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  clear:"M4 7h16M9.5 7V4.5h5V7M6.2 7l.9 12a2 2 0 0 0 2 1.8h5.8a2 2 0 0 0 2-1.8l.9-12M10 11v6M14 11v6",
  zout:"M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 0 0 0-13zM15.3 15.3L20 20M8 10.5h5",zin:"M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 0 0 0-13zM15.3 15.3L20 20M8 10.5h5M10.5 8v5",
  home:"M3.5 11.5L12 4l8.5 7.5M6 9.8V20h12V9.8M10 20v-5.5h4V20",grow:"M12 3.5v17M8 7.5l4-4 4 4M8 16.5l4 4 4-4M5 12h3M16 12h3"};
const ico=n=>'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="'+ICO[n]+'"/></svg>';
const dbtn=(attr,n,label,title)=>'<button type="button" '+attr+' aria-label="'+label+'" title="'+(title||label)+'">'+ico(n)+'</button>';
DOCK.innerHTML='<button type="button" class="grip" data-grip aria-label="Move the tools" title="Drag to move">\u2807\u2807</button>'
  +dbtn('data-t="pen"',"pen","Pen","Pen (P). Tap again to show or hide its colours and sizes")+dbtn('data-t="hi"',"hi","Highlighter","Highlighter (H). Tap again to show or hide its colours and sizes")
  +dbtn('data-t="erase"',"erase","Eraser","Eraser (E). Rubs out whole strokes. Two quick taps of the Pencil tip on the page switch to it and back")+dbtn('data-t="move"',"move","Move the page","Move: drag the page (M)")
  +'<div class="opts"><div class="opts-in"></div></div><i></i>'
  +'<button type="button" class="calc" data-a="calc" aria-label="Calculate what I just wrote" title="Works out the calculation you just wrote and puts the answer after your equals sign">= Calc</button>'
  +dbtn('data-a="undo"',"undo","Undo","Undo (Ctrl+Z, or tap the page with two fingers)")+dbtn('data-a="redo"',"redo","Redo","Redo (Ctrl+Shift+Z, or tap the page with three fingers)")
  +dbtn('data-a="clear"',"clear","Clear the page","Clear everything you wrote on this page")+dbtn('data-a="home"',"home","Back to the task and my work","Back to the task and my work, at 100%")
  +dbtn('data-a="zout"',"zout","Zoom out","Zoom out (Ctrl and minus, or pinch two fingers together)")+dbtn('data-a="zin"',"zin","Zoom in","Zoom in (Ctrl and plus, or spread two fingers)")
  +'<button type="button" class="zpct" data-a="zreset" aria-label="Zoom 100%. Tap for 100%" title="Zoom. Tap to go back to 100% (Ctrl+0)">100%</button>'
  +dbtn('data-a="grow"',"grow","Make the pad taller")+'<button type="button" class="fold" data-fold aria-label="Fold the tools" title="Fold">\u2212</button>';
document.body.append(DOCK);
// A short line next to the palette: which tool a gesture switched to, what the calculator read, or why it could not.
const SAY=document.createElement("div");SAY.className="inksay";SAY.hidden=true;SAY.setAttribute("role","status");document.body.append(SAY);
let sayT=0;
function inkSay(text,ms){
  clearTimeout(sayT);if(!text){SAY.hidden=true;return}
  SAY.textContent=text;SAY.hidden=false;SAY.classList.remove("in");
  const r=DOCK.getBoundingClientRect(),w=SAY.offsetWidth,h=SAY.offsetHeight,W=window.innerWidth,H=window.innerHeight;let x,y;
  if(DOCK.hidden||!r.width){x=(W-w)/2;y=H-h-24}
  else if(r.width>r.height*1.4){x=r.left+r.width/2-w/2;y=r.top-h-8;if(y<8)y=r.bottom+8}
  else{x=r.left+r.width/2>W/2?r.left-w-8:r.right+8;y=r.top+Math.min(r.height/2,90)-h/2}
  SAY.style.left=Math.max(8,Math.min(W-w-8,x))+"px";SAY.style.top=Math.max(8,Math.min(H-h-8,y))+"px";
  void SAY.offsetWidth;SAY.classList.add("in");
  sayT=setTimeout(()=>{SAY.hidden=true},ms||Math.min(9000,2400+text.length*60));
}
// Colours and sizes of the active tool slide open under the tools; tapping the active tool again folds them away.
const SWNAME={ink:"Ink (dark on light pages, light on dark pages)",blue:"Blue",red:"Red",green:"Green",orange:"Orange",purple:"Purple",yellow:"Yellow",pink:"Pink"},SZNAME=["Fine","Medium","Thick"];
function drawOpts(){
  const t=INK.tool,q=INK[t],box=DOCK.querySelector(".opts");
  if(q){
    box.firstChild.innerHTML='<div class="sws" role="group" aria-label="Colour">'+(t==="pen"?PENS:HIS).map(c=>'<button type="button" class="sw'+(c===q.c?" on":"")+'" data-c="'+c+'" aria-label="'+SWNAME[c]+'" title="'+SWNAME[c]+'" aria-pressed="'+(c===q.c)+'"></button>').join("")
      +'</div><div class="szs" role="group" aria-label="Thickness">'+[0,1,2].map(w=>'<button type="button" class="sz'+(w===q.w?" on":"")+'" data-w="'+w+'" aria-label="'+SZNAME[w]+'" title="'+SZNAME[w]+'" aria-pressed="'+(w===q.w)+'"><b></b></button>').join("")+'</div>';
    box.querySelectorAll(".sw").forEach(b=>b.style.setProperty("--c","var(--"+t+"-"+b.dataset.c+")"));
  }
  box.classList.toggle("open",!!q&&INK.opts);box.inert=!(q&&INK.opts);
  DOCK.style.setProperty("--tc",q?"var(--"+t+"-"+q.c+")":"var(--ink)");
}
function syncTools(){DOCK.querySelectorAll("[data-t]").forEach(x=>{const on=x.dataset.t===INK.tool;x.classList.toggle("on",on);x.setAttribute("aria-pressed",on)});drawOpts()}
function setTool(t,say){
  if(!TOOLS[t])return;
  if(t!==INK.tool){if(INK[INK.tool])INK.prev=INK.tool;INK.tool=t;saveInk();syncTools()}
  if(say)inkSay(TOOLS[t],1200);
}
// What a double tap does: to the eraser, and back to the pen or highlighter you had.
const flipEraser=()=>setTool(INK.tool==="erase"?INK.prev:"erase",true);
// Grey out what cannot do anything right now, and show the calculator reading.
function syncDock(){
  const p=inkTarget(),set=(a,off,busy)=>{const b=DOCK.querySelector('[data-a="'+a+'"]');b.classList.toggle("off",!!off);b.setAttribute("aria-disabled",off?"true":"false");if(busy!==undefined){b.classList.toggle("busy",busy);b.setAttribute("aria-busy",busy?"true":"false")}};
  set("calc",!p||(p.blank&&!p.busy),!!(p&&p.busy));set("undo",!p||!p.undos);set("redo",!p||!p.redos);syncZoom(p);
}
// The zoom readout. Folded, it only shows while the pad is not at 100%, so there is always a way back.
function syncZoom(p){
  if(p===undefined)p=inkTarget();
  const z=p?p.zoom:1,t=Math.round(z*100)+"%",b=DOCK.querySelector(".zpct"),off=(a,v)=>{const x=DOCK.querySelector('[data-a="'+a+'"]');x.classList.toggle("off",v);x.setAttribute("aria-disabled",v?"true":"false")};
  if(b.textContent!==t){b.textContent=t;b.setAttribute("aria-label","Zoom "+t+". Tap for 100%")}
  b.classList.toggle("z",t!=="100%");off("zout",!p||z<=ZOOM.min*1.001);off("zin",!p||z>=ZOOM.max/1.001);
}
function inkTarget(){
  INK.pads.forEach(p=>{if(!p.pad.isConnected)INK.pads.delete(p)});
  const live=[...INK.pads].filter(p=>p.pad.offsetParent);
  if(INK.active&&live.includes(INK.active))return INK.active;
  const mid=window.innerHeight/2;let best=null,bd=1e9;
  live.forEach(p=>{const r=p.pad.getBoundingClientRect(),d=Math.abs((r.top+r.bottom)/2-mid);if(d<bd){bd=d;best=p}});
  return best;
}
DOCK.addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;
  if("grip" in b.dataset)return;
  if("fold" in b.dataset){setFold(!DOCK.classList.contains("min"));return}
  const t=b.dataset.t;
  if(t){if(t===INK.tool&&INK[t]&&!DOCK.classList.contains("min")){INK.opts=!INK.opts;saveInk();drawOpts()}else setTool(t);return}
  if(b.dataset.c||b.dataset.w){const q=INK[INK.tool];if(!q)return;if(b.dataset.c)q.c=b.dataset.c;else q.w=+b.dataset.w;saveInk();drawOpts();return}
  const p=inkTarget();if(p)p.act(b.dataset.a);
});
["selectstart","contextmenu","dblclick"].forEach(t=>DOCK.addEventListener(t,e=>e.preventDefault()));
syncTools();
// Desktop: P pen, H highlighter, E eraser, M move, Ctrl+Z undo, Ctrl+Shift+Z or Ctrl+Y redo. Never while typing.
document.addEventListener("keydown",e=>{
  if(DOCK.hidden||e.altKey||e.defaultPrevented||e.isComposing)return;
  const el=e.target;if(el&&el.nodeType===1&&(el.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)))return;
  const k=String(e.key||"").toLowerCase();
  if(e.ctrlKey||e.metaKey){
    // Ctrl/Cmd with + - 0 zooms the pad the mouse is over. Anywhere else the browser keeps its own zoom keys.
    const zk={"+":"zin","=":"zin","-":"zout","_":"zout","0":"zreset"}[k],h=INK.hover;
    if(zk){if(h&&h.pad.isConnected&&h.pad.offsetParent){e.preventDefault();h.act(zk)}return}
    if(k!=="z"&&k!=="y")return;const p=inkTarget();if(!p)return;e.preventDefault();p.act(k==="y"||e.shiftKey?"redo":"undo",true);return;
  }
  const t={p:"pen",h:"hi",e:"erase",m:"move"}[k];if(t&&!e.shiftKey)setTool(t,true);
});
let dockRaf=0;
function refreshDock(){cancelAnimationFrame(dockRaf);dockRaf=requestAnimationFrame(()=>{const on=[...document.querySelectorAll(".ink-pad")].some(p=>p.offsetParent);DOCK.hidden=!on;if(on){placeDock();syncDock()}else inkSay("")})}
// The dock is an overlay: it reserves no space, sits where you last dragged it, and can be folded away.
const DOCKPOS="qpr-dock";let dockAt=null;
(function(){try{const o=JSON.parse(lsGet(DOCKPOS)||"null");if(o&&isFinite(o.x)&&isFinite(o.y))dockAt={x:o.x,y:o.y};if(o&&o.min)DOCK.classList.add("min")}catch(e){}})();
function saveDock(){lsSet(DOCKPOS,JSON.stringify(Object.assign({},dockAt||{},{min:DOCK.classList.contains("min")})))}
function setFold(min){DOCK.classList.toggle("min",min);const f=DOCK.querySelector("[data-fold]");f.textContent=min?"+":"\u2212";f.title=min?"Show all tools":"Fold";saveDock();placeDock()}
// dockAt is the dock's centre as a fraction of the window, so it stays put when the iPad is turned.
function placeDock(){
  if(!dockAt||DOCK.hidden){if(!dockAt)DOCK.classList.remove("placed");return}
  DOCK.classList.add("placed");
  const w=DOCK.offsetWidth,h=DOCK.offsetHeight,W=window.innerWidth,H=window.innerHeight;
  DOCK.style.left=Math.max(6,Math.min(W-w-6,dockAt.x*W-w/2))+"px";DOCK.style.top=Math.max(6,Math.min(H-h-6,dockAt.y*H-h/2))+"px";
}
(function(){
  const grip=DOCK.querySelector("[data-grip]");let d=null;
  grip.addEventListener("pointerdown",e=>{const r=DOCK.getBoundingClientRect();d={id:e.pointerId,ox:e.clientX-r.left,oy:e.clientY-r.top};try{grip.setPointerCapture(e.pointerId)}catch(_){}DOCK.classList.add("dragging");e.preventDefault()});
  grip.addEventListener("pointermove",e=>{if(!d||e.pointerId!==d.id)return;const w=DOCK.offsetWidth,h=DOCK.offsetHeight;dockAt={x:(e.clientX-d.ox+w/2)/window.innerWidth,y:(e.clientY-d.oy+h/2)/window.innerHeight};placeDock()});
  const drop=e=>{if(!d||e.pointerId!==d.id)return;d=null;DOCK.classList.remove("dragging");saveDock()};
  ["pointerup","pointercancel"].forEach(t=>grip.addEventListener(t,drop));
  window.addEventListener("resize",placeDock);
  if(DOCK.classList.contains("min"))setFold(true);
  // The palette changes size when it folds or its colours slide open: keep its top-left corner (the grip) where it is, and inside the window.
  let sz=null;
  if(window.ResizeObserver)new ResizeObserver(()=>{
    const w=DOCK.offsetWidth,h=DOCK.offsetHeight;if(!w||!h)return;
    if(dockAt&&sz&&!d&&(w!==sz.w||h!==sz.h)){dockAt.x+=(w-sz.w)/2/window.innerWidth;dockAt.y+=(h-sz.h)/2/window.innerHeight;saveDock()}
    sz={w,h};placeDock();
  }).observe(DOCK);
})();
new MutationObserver(refreshDock).observe(document.getElementById("view"),{childList:true,subtree:true,attributes:true,attributeFilter:["hidden"]});
// What Claude is asked when Calc is tapped. It only reads; Calc.evaluate (calc.js) does the arithmetic.
// The small fast model reads a single written line as reliably as the large one, so the quick tier is used.
const CALC_TIER="check"; // the fast handwriting tier: a process is kept ready for it, so the reply comes in about two seconds
const CALC_PROMPT=`The image shows a student's handwritten math (dark ink on white). They tapped a calculator button: find the calculation they wrote last and transcribe it. Do not compute it and do not correct it.

Which one: the calculation that ends in an equals sign with nothing written after it, normally the bottom line. If nothing ends in an open equals sign, take the last written expression. Transcribe only what is to be computed: the part between the previous equals sign on that line (if there is one) and the open equals sign.

Write "expr" as plain text on one line: numbers with a decimal point (a handwritten decimal comma becomes a point: 1,04 is 1.04; leave out thousands separators), + - * /, ^ for powers, parentheses, a fraction as (top)/(bottom), sqrt(x), root(n,x), ln(x), log(x), log10(x) only when a base 10 is written, exp(x), sin(x) cos(x) tan(x), abs(x), n!, C(n,k) for a binomial coefficient, % as written, e, pi. Letters that stand for unknown values stay as letters.

Reply with only a JSON object:
{"expr": "...", "eq": [x0, y0, x1, y1] | null, "box": [x0, y0, x1, y1], "h": 0.1}
- eq: a tight box around that open equals sign, as fractions of the image width and height from the top-left corner (0 to 1). null when the expression has no equals sign after it.
- box: a tight box around the whole transcribed expression, same units.
- h: the height of one handwritten digit in that expression, as a fraction of the image height.
If there is no calculation, or you cannot read it with confidence: {"expr": ""}`;
function makeInk(host,opts={}){
  const wrap=document.createElement("div");wrap.className="ink";
  wrap.innerHTML=`<div class="ink-pad"><canvas aria-label="Writing pad. Write with the Apple Pencil, a finger or the mouse."></canvas><div class="ink-marks"></div></div>`;
  host.append(wrap);
  const pad=wrap.querySelector(".ink-pad"),cv=wrap.querySelector("canvas"),mk=wrap.querySelector(".ink-marks"),ctx=cv.getContext("2d");
  let H=opts.height||260,W=0,strokes=[],hist=[],redo=[],cur=null,box=null,lastSize=null,marks=[],pan=null,lastPen=0,panRaf=0,drawRaf=0,busy=false,late=null,tap=null,multi=null;
  const fingers=new Map();
  // Endless page: strokes live in page coordinates, cam is the top-left corner of what the pad shows.
  // cam.z is the zoom (1 = 100%): a page point q is shown at (q - cam) * cam.z pad pixels. Zoom belongs to the pad and is never saved.
  const cam={x:0,y:0,z:1};
  let camRaf=0,zGoal=0,zShown=1,solAt={x:0,y:0},taskAt={x:16,y:12};
  function applyCam(){
    // The overlays keep their page position (left/top) and are scaled from their own corner, so the shift has to allow for that corner.
    const z=cam.z,tf=o=>"translate("+((o.x-cam.x)*z-o.x)+"px,"+((o.y-cam.y)*z-o.y)+"px) scale("+z+")";
    mk.style.transform=tf({x:0,y:0});sol.style.transform=tf(solAt);task.style.transform=tf(taskAt);
    pad.style.backgroundSize=(28*z)+"px "+(28*z)+"px";pad.style.backgroundPosition=(-cam.x*z)+"px "+(-cam.y*z)+"px";draw();
    if(z!==zShown){zShown=z;syncZoom()}
  }
  // Pinch, wheel and drag only move the camera; the pad is repainted once in the next frame.
  const camLater=()=>{if(!camRaf)camRaf=requestAnimationFrame(()=>{camRaf=0;applyCam()})};
  const stopGlide=()=>{cancelAnimationFrame(panRaf);zGoal=0};
  // Glide to a camera position, and to zoom nz if given. With ax, ay (pad pixels) the page point under that spot stays under it instead.
  function panTo(nx,ny,nz,ax,ay){
    stopGlide();const sx=cam.x,sy=cam.y,sz=cam.z,ez=clampZ(nz||sz),fix=ax!=null,px=sx+ax/sz,py=sy+ay/sz,t0=performance.now(),still=!!(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches);
    zGoal=ez;
    const step=t=>{
      const k=still?1:Math.min(1,Math.max(0,(t-t0)/350)),e=1-Math.pow(1-k,3);cam.z=k<1?sz*Math.pow(ez/sz,e):ez;
      if(fix){cam.x=px-ax/cam.z;cam.y=py-ay/cam.z}else{cam.x=sx+(nx-sx)*e;cam.y=sy+(ny-sy)*e}
      if(k<1)panRaf=requestAnimationFrame(step);else zGoal=0;applyCam();
    };
    panRaf=requestAnimationFrame(step);
  }
  // Zoom at once (pinch, wheel), keeping the page point under the pad pixel (ax, ay) where it is.
  function zoomAt(nz,ax,ay){const px=cam.x+ax/cam.z,py=cam.y+ay/cam.z;cam.z=clampZ(nz);cam.x=px-ax/cam.z;cam.y=py-ay/cam.z;camLater()}
  // The middle of the part of the pad that is on screen: what the zoom buttons zoom around.
  function mid(){const r=cv.getBoundingClientRect(),t=Math.max(r.top,0),b=Math.min(r.bottom,window.innerHeight);return{x:W/2,y:b>t?(t+b)/2-r.top:H/2}}
  // Bring a page rectangle into view, moving as little as possible. Margins are screen pixels, so they look the same at every zoom.
  // Zoomed in and the rectangle does not fit: zoom out just far enough, at most back to 100%. It never zooms in.
  function ensure(x0,y0,x1,y1){
    let z=cam.z;if(z>1)z=Math.max(1,Math.min(z,(W-24)/Math.max(1,x1-x0),(H-24)/Math.max(1,y1-y0)));
    const vw=W/z,vh=H/z,m=8/z,g=12/z;let nx=cam.x,ny=cam.y;
    if(x1>cam.x+vw-m||x0<cam.x+m)nx=(x1-x0<=vw-2*g)?(x0<cam.x+m?x0-g:x1-vw+g):x0-g;
    if(y1>cam.y+vh-m||y0<cam.y+m)ny=(y1-y0<=vh-2*g)?(y0<cam.y+m?y0-g:y1-vh+g):y0-g;
    if(nx!==cam.x||ny!==cam.y||z!==cam.z)panTo(nx,ny,z);
  }
  const changed=()=>{if(opts.onChange)opts.onChange();syncDock()};
  function line(c,s,k,ox,oy,from){
    // Curves through the midpoints of the samples, so fast Pencil strokes stay round. from: draw only the newest piece.
    // Pencil pressure still shapes the width; the chosen size scales it.
    const P=s.pts,X=q=>(q.x-ox)*k,Y=q=>(q.y-oy)*k,f=k*(PEN_W[s.w]||1);c.lineCap="round";c.lineJoin="round";
    if(P.length===1){c.beginPath();c.arc(X(P[0]),Y(P[0]),1.4*f,0,7);c.fill();return}
    for(let i=Math.max(1,from||1);i<P.length;i++){
      const a=P[i-1],b=P[i],z=P[i-2];c.lineWidth=(1.1+1.9*((a.p+b.p)/2))*f;c.beginPath();
      if(z){c.moveTo((X(z)+X(a))/2,(Y(z)+Y(a))/2);c.quadraticCurveTo(X(a),Y(a),(X(a)+X(b))/2,(Y(a)+Y(b))/2)}
      else{c.moveTo(X(a),Y(a));c.lineTo((X(a)+X(b))/2,(Y(a)+Y(b))/2)}
      c.stroke();
    }
    if(!from){const a=P[P.length-2],b=P[P.length-1];c.lineWidth=(1.1+1.9*b.p)*f;c.beginPath();c.moveTo((X(a)+X(b))/2,(Y(a)+Y(b))/2);c.lineTo(X(b),Y(b));c.stroke()}
  }
  // A highlighter stroke is one path, drawn in one go: where it crosses itself it does not get darker.
  function hiLine(c,s,k,ox,oy){
    const P=s.pts,X=q=>(q.x-ox)*k,Y=q=>(q.y-oy)*k,n=P.length;c.lineCap="round";c.lineJoin="round";c.lineWidth=(HI_W[s.w]||HI_W[1])*k;
    c.beginPath();c.moveTo(X(P[0]),Y(P[0]));
    for(let i=1;i<n-1;i++)c.quadraticCurveTo(X(P[i]),Y(P[i]),(X(P[i])+X(P[i+1]))/2,(Y(P[i])+Y(P[i+1]))/2);
    c.lineTo(X(P[n-1])+(n===1?.01:0),Y(P[n-1]));c.stroke();
  }
  // A calculator result: {calc, txt, x, y, h} is text starting at x, centred on y, h px high; its pts only tell the eraser and the page bounds where it is.
  const CALC_FONT='"Noteworthy","Chalkboard SE","Segoe Print","Comic Sans MS",sans-serif';
  function calcText(c,s,k,ox,oy){c.font=(s.h*k)+"px "+CALC_FONT;c.textBaseline="middle";c.textAlign="left";c.fillText(s.txt,(s.x-ox)*k,(s.y-oy)*k)}
  function calcPts(s){
    ctx.save();ctx.font=s.h+"px "+CALC_FONT;const w=Math.max(s.h*.5,ctx.measureText(s.txt).width);ctx.restore();
    const pts=[];for(let x=0;x<=w+3;x+=6)[-.32,0,.32].forEach(r=>pts.push({x:s.x+Math.min(x,w),y:s.y+r*s.h,p:.5}));return pts;
  }
  const penCol=s=>{const p=pal();return p.pen[s.c]||p.ink};
  // Highlighter first, so it lies under the writing; then pen ink and calculator results. x: the dark-on-white version for Claude.
  function paint(c,list,k,ox,oy,x){
    const p=pal();
    c.save();c.globalAlpha=x?HI_XA:HI_A;list.forEach(s=>{if(s.t==="hi"){c.strokeStyle=x?HI_X[s.c]||HI_X.yellow:p.hi[s.c]||p.hi.yellow;hiLine(c,s,k,ox,oy)}});c.restore();
    list.forEach(s=>{if(s.t==="hi")return;const col=s.calc?(x?PEN_X.ink:p.accent):x?PEN_X[s.c]||PEN_X.ink:penCol(s);c.strokeStyle=col;c.fillStyle=col;if(s.calc)calcText(c,s,k,ox,oy);else line(c,s,k,ox,oy)});
  }
  // Strokes are painted again at the zoom, so they stay sharp at any size.
  function draw(){ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,cv.width,cv.height);ctx.restore();paint(ctx,strokes,cam.z,cam.x,cam.y)}
  const redraw=()=>{if(!drawRaf)drawRaf=requestAnimationFrame(()=>{drawRaf=0;draw()})};
  function size(){const w=pad.clientWidth;if(!w)return;W=w;task.style.maxWidth=Math.max(200,Math.min(560,W-32))+"px";if(!task.hidden)taskAt={x:task.offsetLeft,y:task.offsetTop};const dpr=window.devicePixelRatio||1;pad.style.height=H+"px";cv.style.height=H+"px";cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);applyCam()}
  const pt=e=>{const r=cv.getBoundingClientRect();return{x:(e.clientX-r.left)/cam.z+cam.x,y:(e.clientY-r.top)/cam.z+cam.y,p:e.pointerType==="pen"?Math.max(.1,e.pressure||.5):.5}};
  // Undo steps are earlier versions of the page; a new step empties Redo.
  const keep=a=>{hist.push(a);if(hist.length>80)hist.shift();redo.length=0};
  const snap=()=>keep(strokes.slice());
  // The eraser takes whole strokes (and calculator results). Its undo step is only made once it really removes something.
  // Its reach is in screen pixels (14 around the tip), so it is as precise zoomed in as it is forgiving zoomed out.
  function eraseAt(p){
    const left=strokes.filter(s=>{const r=s.t==="hi"?8/cam.z+(HI_W[s.w]||HI_W[1])/2:14/cam.z;return !s.pts.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<r)});
    if(left.length!==strokes.length){if(cur&&cur.erase&&!cur.hit){cur.hit=true;keep(strokes)}strokes=left;draw()}
  }
  function clearMarks(){marks=[];mk.innerHTML=""}
  // The tutor's model answer, written in blue to the right of the student's work; the page slides over to show it.
  const sol=document.createElement("div");sol.className="ink-sol";sol.hidden=true;pad.append(sol);
  // The task itself is printed on the page, so the answer can carry straight on from it. It is not ink: Eraser, Undo and Clear leave it alone.
  const task=document.createElement("div");task.className="ink-task";task.hidden=!opts.task;pad.append(task);
  const H0=H;
  function fitTask(){if(task.hidden)return;const need=task.offsetTop+task.offsetHeight+Math.max(150,H0-50);if(need>H){H=need;size()}}
  if(opts.task){renderMD(String(opts.task).replace(/\$\s*\.\s*$/,()=>"$"),task,false);typesetNow(task);if(window.ResizeObserver)new ResizeObserver(fitTask).observe(task)}
  function clearSol(){sol.hidden=true;sol.className="ink-sol";sol.innerHTML=""}
  function setSolution(list){
    clearSol();if(!box||!list.length)return;
    const x=box.x+box.w+48,y=box.y+4;
    sol.style.left=x+"px";sol.style.top=y+"px";solAt={x,y};applyCam();sol.style.maxWidth=Math.max(220,Math.min(480,W-24))+"px";
    // First one numbered note per red circle (what it should be), then the book answer line by line.
    let headed=false;
    list.forEach(it=>{
      const d=document.createElement("div");d.className="sl";
      if(it.n){d.classList.add("sn");d.innerHTML='<span class="n"></span><div class="prose"></div>';d.querySelector(".n").textContent=it.n;renderMD(it.md,d.querySelector(".prose"),false)}
      else{
        if(!headed){headed=true;const h=document.createElement("div");h.className="sl-h";h.textContent="Book answer";sol.append(h)}
        if(it.md!=null){d.classList.add("sn");d.innerHTML='<div class="prose"></div>';renderMD(it.md,d.firstChild,false)}else d.textContent="$$"+it.tex+"$$";
      }
      sol.append(d);
    });
    sol.hidden=false;
    const fit=()=>{if(!sol.hidden)ensure(x,y,x+sol.offsetWidth,y+sol.offsetHeight)};
    fit();try{if(window.MathJax&&MathJax.typesetPromise)MathJax.typesetPromise([sol]).then(fit).catch(()=>{})}catch(e){}
  }
  // Everything is on the page at once; the line the voice is explaining is lit up.
  // k: the line being read. j: the piece of that line the sentence is about (see markParts), or none.
  function reveal(k,j){[...sol.querySelectorAll(".sl")].forEach((d,i)=>{d.classList.toggle("cur",i===k);d.classList.toggle("whole",i===k&&!(j>=0));d.querySelectorAll(".hp").forEach(h=>h.classList.toggle("now",i===k&&j!=null&&j>=0&&h.classList.contains("hp-"+j)))})}
  function revealAll(){reveal(-1)}
  // Gestures. Safari gives a web page no event for the Pencil's own double tap or squeeze, so the nearest thing is done on the glass:
  // two quick taps of the Pencil tip in one spot switch to the eraser and back, and the two dots they left are taken away again.
  // A tap is a Pencil contact of at most TAP.dur ms that moves at most TAP.move px. The second tap must start within TAP.gap ms of the
  // first one lifting, and within TAP.near px of it. The dots of a colon, a division sign or "..." sit 8 px or more apart even in small
  // writing, and a decimal point or the dot of an i is a single tap, so writing does not set it off: only dotting the very same spot twice does.
  const TAP={dur:170,move:4,gap:300,near:6};
  // Two fingers tapped together = Undo, three = Redo. Every finger must land within MT.join ms of the first and stay within MT.move px,
  // and all must lift within MT.dur ms. Nothing happens while the Pencil is down or was down in the last MT.palm ms: that is the hand resting on the glass.
  // Two fingers that move are a pinch: once either finger has travelled more than MT.move px, or the gap between them has changed by more
  // than that, the contact can no longer be a tap (so it never fires Undo) and it zooms and drags the page instead. A second finger that
  // joins a finger already dragging the page, or one that has been resting still, starts a pinch straight away. All of these are screen pixels.
  const MT={join:150,move:12,dur:350,palm:700};
  const spread=s=>{const f=[...fingers.values()];return f.length===2?Math.hypot(f[0][s+"x"]-f[1][s+"x"],f[0][s+"y"]-f[1][s+"y"]):0};
  // multi.g: the page point under the fingers' midpoint, their gap and the zoom when the pinch (re)started. Taken again whenever a finger lands or lifts,
  // so the page never jumps; with one finger left it simply keeps dragging.
  function grab(){
    const f=[...fingers.values()],n=f.length;multi.g=null;if(multi.dead||n<1||n>2)return;
    const r=cv.getBoundingClientRect(),mx=f.reduce((a,q)=>a+q.cx,0)/n-r.left,my=f.reduce((a,q)=>a+q.cy,0)/n-r.top;
    stopGlide();multi.g={n,px:cam.x+mx/cam.z,py:cam.y+my/cam.z,d:spread("c"),z:cam.z};
  }
  function pinch(){
    const g=multi.g,f=[...fingers.values()],n=f.length;if(!g||n!==g.n)return;
    const r=cv.getBoundingClientRect(),mx=f.reduce((a,q)=>a+q.cx,0)/n-r.left,my=f.reduce((a,q)=>a+q.cy,0)/n-r.top;
    if(n===2&&g.d>8)cam.z=clampZ(g.z*spread("c")/g.d);
    cam.x=g.px-mx/cam.z;cam.y=g.py-my/cam.z;camLater();
  }
  function activate(){if(INK.active!==api){INK.active=api;document.querySelectorAll(".ink-pad.act").forEach(x=>x.classList.remove("act"));pad.classList.add("act");syncDock()}}
  // Take back whatever the contact in progress did (a palm, or the first finger of a two-finger tap).
  function dropCur(){if(!cur)return;if(!cur.erase||cur.hit)strokes=hist.pop()||[];cur=null;document.documentElement.classList.remove("inking");draw()}
  function fingerDown(e){
    // x, y: where the finger landed. cx, cy: where it is now. s: when it was last heard from (a finger whose lift was missed is forgotten).
    const now=Date.now();fingers.forEach((f,id)=>{if(now-f.s>3000)fingers.delete(id)});
    fingers.set(e.pointerId,{x:e.clientX,y:e.clientY,cx:e.clientX,cy:e.clientY,t:now,s:now});
    if(multi){if(now-multi.t<=MT.join&&fingers.size<=3)multi.n=Math.max(multi.n,fingers.size);else multi.ok=false;if(multi.pz)grab();return true}
    if(fingers.size!==2)return false;
    const [fid,first]=[...fingers.entries()][0];
    if((cur&&cur.type==="pen")||now-lastPen<MT.palm)return false;
    if(now-first.t>MT.join||first.moved){
      // Too late or too far for a tap. A finger already dragging the page, or resting still, plus this one is a pinch;
      // a finger that is writing carries on and this one is ignored, as before.
      if(pan&&pan.touch)pan=null; // the page stays where the drag has brought it
      else if(cur&&cur.id===fid&&!first.moved)dropCur();
      else return false;
      multi={n:2,t:first.t,ok:false,pz:true};grab();return true;
    }
    if(pan){cam.x=pan.cx;cam.y=pan.cy;pan=null;applyCam()}
    dropCur();multi={n:2,t:first.t,ok:true};return true;
  }
  cv.addEventListener("pointerdown",e=>{
    if(e.pointerType==="pen"){PEN_SEEN=true;lastPen=Date.now();if(multi){multi.ok=false;multi.dead=true;multi.g=null}} // the Pencil ends a pinch: those fingers were the hand
    if(e.button>0)return;
    activate();
    if(e.pointerType==="touch"&&fingerDown(e)){e.preventDefault();return}
    if(INK.tool==="move"||(PEN_SEEN&&e.pointerType==="touch")){
      // A finger (or the Move tool) drags the page. Touches right after Pencil ink are the resting palm: ignored.
      if(cur||pan||(INK.tool!=="move"&&Date.now()-lastPen<450))return;
      e.preventDefault();stopGlide();try{cv.setPointerCapture(e.pointerId)}catch(_){}
      pan={id:e.pointerId,touch:e.pointerType==="touch",x:e.clientX,y:e.clientY,cx:cam.x,cy:cam.y};return;
    }
    if(pan){cam.x=pan.cx;cam.y=pan.cy;pan=null;applyCam()}
    if(cur){
      // A resting palm that landed just before the Pencil: drop its stroke and let the Pencil write.
      if(e.pointerType==="pen"&&cur.type!=="pen")dropCur();
      else return;
    }
    e.preventDefault();selOff();document.documentElement.classList.add("inking");
    const ae=document.activeElement;if(ae&&ae!==document.body&&ae.blur)ae.blur();
    try{cv.setPointerCapture(e.pointerId)}catch(_){}
    const p=pt(e),g={id:e.pointerId,type:e.pointerType,t0:Date.now(),x0:e.clientX,y0:e.clientY,far:0};
    if(INK.tool==="erase"){cur=Object.assign(g,{erase:true,before:strokes});eraseAt(p);return}
    snap();const hi=INK.tool==="hi",q=INK[hi?"hi":"pen"];
    cur=Object.assign(g,{pts:[p],t:hi?"hi":"pen",c:q.c,w:q.w,before:hist[hist.length-1]});strokes.push(cur);
    if(hi)draw();else{ctx.fillStyle=penCol(cur);line(ctx,cur,cam.z,cam.x,cam.y)}
  });
  cv.addEventListener("pointermove",e=>{
    if(e.pointerType==="touch"){
      const f=fingers.get(e.pointerId);
      if(f){f.cx=e.clientX;f.cy=e.clientY;f.s=Date.now();if(!f.moved&&Math.hypot(e.clientX-f.x,e.clientY-f.y)>MT.move){f.moved=true;if(multi)multi.ok=false}}
      if(multi){
        e.preventDefault();
        if(multi.ok&&fingers.size===2&&Math.abs(spread("c")-spread(""))>MT.move)multi.ok=false;
        if(multi.pz)pinch();else if(!multi.ok&&!multi.dead&&multi.n===2&&fingers.size===2){multi.pz=true;grab()}
        return;
      }
    }
    if(pan&&e.pointerId===pan.id){e.preventDefault();cam.x=pan.cx-(e.clientX-pan.x)/cam.z;cam.y=pan.cy-(e.clientY-pan.y)/cam.z;camLater();return}
    if(!cur||e.pointerId!==cur.id)return;e.preventDefault();
    cur.far=Math.max(cur.far,Math.hypot(e.clientX-cur.x0,e.clientY-cur.y0));
    const evs=(e.getCoalescedEvents&&e.getCoalescedEvents())||[];
    for(const ev of (evs.length?evs:[e])){
      const p=pt(ev);if(cur.erase){eraseAt(p);continue}
      const last=cur.pts[cur.pts.length-1];if(Math.hypot(p.x-last.x,p.y-last.y)<0.7/cam.z)continue; // 0.7 screen px
      cur.pts.push(p);if(cur.t==="hi")redraw();else{ctx.strokeStyle=penCol(cur);line(ctx,cur,cam.z,cam.x,cam.y,cur.pts.length-1)}
    }
  });
  const end=e=>{
    if(e&&e.pointerType==="pen")lastPen=Date.now();
    if(e&&e.pointerType==="touch"){
      if(e.type==="pointercancel"&&multi)multi.ok=false;
      fingers.delete(e.pointerId);
      if(multi){if(!fingers.size){const m=multi;multi=null;if(m.ok&&!m.pz&&!cur&&Date.now()-m.t<=MT.dur&&Date.now()-lastPen>MT.palm)api.act(m.n===2?"undo":"redo",true)}else if(multi.pz)grab();return}
    }
    if(pan&&(!e||e.pointerId===pan.id)){pan=null;return}
    if(!cur||(e&&e.pointerId!==cur.id))return;
    const c=cur,now=Date.now(),before=c.before;cur=null;delete c.before;document.documentElement.classList.remove("inking");selOff();
    const isTap=!!e&&e.type==="pointerup"&&c.type==="pen"&&now-c.t0<=TAP.dur&&c.far<=TAP.move;
    if(isTap&&tap&&c.t0-tap.up<=TAP.gap&&Math.hypot(c.x0-tap.x,c.y0-tap.y)<=TAP.near){
      // The second tap of a double tap: put the page back as it was before the first one, then switch tools.
      const i=hist.lastIndexOf(tap.before);if(i>=0)hist.length=i;strokes=tap.before;tap=null;draw();flipEraser();changed();return;
    }
    tap=isTap?{up:now,x:c.x0,y:c.y0,before}:null;
    if(!c.erase)draw();if(!c.erase||c.hit)changed();
    if(late){const f=late;late=null;f()}
  };
  ["pointerup","pointercancel","lostpointercapture"].forEach(t=>cv.addEventListener(t,end));
  // iPad: stop the Pencil from selecting text, opening the callout or scrolling while it writes.
  const tguard=e=>{const t=e.changedTouches&&e.changedTouches[0];if(e.cancelable)e.preventDefault()};
  ["touchstart","touchmove","touchend"].forEach(t=>cv.addEventListener(t,tguard,{passive:false}));
  ["selectstart","contextmenu","dblclick","dragstart"].forEach(t=>wrap.addEventListener(t,e=>e.preventDefault()));
  // Desktop: Ctrl (or Cmd) + wheel zooms around the cursor; browsers send a trackpad pinch the same way. A plain wheel scrolls the page as ever.
  // A mouse wheel comes in big notches (100 or so), a trackpad pinch in small ones that need a stronger factor to feel right.
  pad.addEventListener("wheel",e=>{
    if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();if(cur||pan||multi)return;
    const r=cv.getBoundingClientRect(),d=Math.max(-120,Math.min(120,e.deltaY*(e.deltaMode===1?16:1)));
    activate();stopGlide();zoomAt(cam.z*Math.exp(-d*(e.deltaMode===0&&Math.abs(d)<40?.01:.002)),e.clientX-r.left,e.clientY-r.top);
  },{passive:false});
  // Safari: a pinch that starts on the pad must not zoom the whole site. On the iPad the fingers are already handled above (fingers is not empty);
  // on a Mac trackpad there are no touches, and the gesture itself carries the scale.
  let gz=0;
  pad.addEventListener("gesturestart",e=>{e.preventDefault();gz=fingers.size||cur||pan?0:cam.z;if(gz){activate();stopGlide()}});
  pad.addEventListener("gesturechange",e=>{e.preventDefault();if(gz&&!fingers.size&&e.scale>0){const r=cv.getBoundingClientRect();zoomAt(gz*e.scale,e.clientX-r.left,e.clientY-r.top)}});
  pad.addEventListener("gestureend",e=>{e.preventDefault();gz=0});
  // Which pad the mouse is over, for the zoom keys.
  pad.addEventListener("pointerenter",e=>{if(e.pointerType==="mouse")INK.hover=api});
  pad.addEventListener("pointerleave",()=>{if(INK.hover===api)INK.hover=null});
  // The pad's side of the shared tool dock.
  const api={pad,get zoom(){return cam.z},get blank(){return !strokes.some(s=>!s.calc&&s.t!=="hi")},get busy(){return busy},get undos(){return hist.length},get redos(){return redo.length},
  act(a,say){
    tap=null;
    if(a==="undo"||a==="redo"){
      const un=a==="undo",from=un?hist:redo,to=un?redo:hist;
      if(!cur&&from.length){to.push(strokes);strokes=from.pop();draw();changed();if(say)inkSay(un?"Undo":"Redo",900)}
      else if(!cur&&say)inkSay(un?"Nothing to undo":"Nothing to redo",1100);
    }
    // Clear wipes the ink, the corrections and the book answer, and takes a pad made taller back to its first height.
    if(a==="clear"&&!cur){clearSol();clearMarks();if(strokes.length){snap();strokes=[];changed()}if(H!==H0){H=H0;size();fitTask()}draw()}
    if(a==="calc")calc();
    if(a==="grow"){H+=220;size()}
    // Home is the way back when you are lost: the task and the work, at 100%.
    if(a==="home"){if(strokes.length){const b=bbox();panTo(Math.min(0,b.x-12),Math.min(0,b.y-12),1)}else panTo(0,0,1)}
    // Zoom buttons and keys: one step, around the middle of what is on screen. Taps in a row count from where the last one is heading.
    if(a==="zin"||a==="zout"||a==="zreset"){
      const z=zGoal||cam.z,nz=a==="zreset"?1:a==="zin"?ZOOM.steps.find(s=>s>z*1.02):ZOOM.steps.slice().reverse().find(s=>s<z/1.02);
      if(nz&&!cur&&!pan&&!multi){const c=mid();panTo(0,0,nz,c.x,c.y)}
    }
    syncDock();
  }};
  INK.pads.add(api);
  if(window.ResizeObserver)new ResizeObserver(()=>{if(pad.clientWidth!==W)size()}).observe(pad);
  size();
  function bbox(list){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;(list||strokes).forEach(s=>s.pts.forEach(q=>{x0=Math.min(x0,q.x);y0=Math.min(y0,q.y);x1=Math.max(x1,q.x);y1=Math.max(y1,q.y)}));const m=18;return{x:x0-m,y:y0-m,w:x1-x0+2*m,h:y1-y0+2*m}}
  // A PNG of some strokes for Claude: the page rectangle b at scale k, dark on white.
  function png(list,b,k){
    const c=document.createElement("canvas");c.width=Math.ceil(b.w*k);c.height=Math.ceil(b.h*k);
    const g=c.getContext("2d");g.fillStyle="#ffffff";g.fillRect(0,0,c.width,c.height);paint(g,list,k,b.x,b.y,true);
    return{w:c.width,h:c.height,blob:new Promise((res,rej)=>c.toBlob(q=>q?res(q):rej({code:"image_failed"}),"image/png"))};
  }
  // Export only the written area, so Claude sees it clearly. Calculator results are part of the work and go with it.
  function toBlob(){box=bbox();const o=png(strokes,box,Math.min(2,1500/Math.max(box.w,box.h)));lastSize={w:o.w,h:o.h};return o.blob}
  /* The calculator. It looks only at the line written last: starting from the newest pen stroke it gathers everything level with it
     (exponents, the parts of a fraction, the rest of the line), sends that small picture to Claude to be read, works the expression out
     here with Calc.evaluate, and writes the result after the equals sign as a page item of its own: it pans with the page, is in the
     PNG that is checked, is saved with the answer, and goes with Undo, Clear or a rub of the Eraser.
     If the line cannot be read, or cannot be calculated, nothing is written: the reason is shown next to the palette. */
  const sbox=s=>{let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;s.pts.forEach(q=>{x0=Math.min(x0,q.x);y0=Math.min(y0,q.y);x1=Math.max(x1,q.x);y1=Math.max(y1,q.y)});return{x0,y0,x1,y1,w:x1-x0,h:y1-y0,s}};
  const med=a=>{a=a.slice().sort((p,q)=>p-q);return a.length?a[a.length>>1]:0};
  const join=a=>a.length?{x0:Math.min(...a.map(q=>q.x0)),y0:Math.min(...a.map(q=>q.y0)),x1:Math.max(...a.map(q=>q.x1)),y1:Math.max(...a.map(q=>q.y1))}:null;
  function lastLine(){
    const B=strokes.filter(s=>s.t!=="hi"&&s!==cur).map(sbox),ink=B.filter(b=>!b.s.calc);if(!ink.length)return null;
    const tall=a=>med(a.filter(b=>!b.s.calc&&b.h>6).map(b=>b.h));
    // m: how far above or below the line a stroke may sit and still belong to it. Under half a digit, so the line above stays out.
    const gh=Math.max(14,Math.min(60,tall(B)||24)),m=Math.max(8,Math.min(22,gh*.4)),seed=ink[ink.length-1],inl=new Set([seed]);
    let y0=seed.y0,y1=seed.y1;
    for(let more=true;more;){more=false;B.forEach(b=>{if(!inl.has(b)&&b.y1>=y0-m&&b.y0<=y1+m){inl.add(b);y0=Math.min(y0,b.y0);y1=Math.max(y1,b.y1);more=true}})}
    const L=B.filter(b=>inl.has(b));return{L,list:L.map(b=>b.s),seed:seed.s,gh:Math.max(12,Math.min(70,tall(L)||gh))};
  }
  async function calc(){
    if(busy)return;
    const ln=lastLine();
    if(!ln){inkSay("Write a calculation first, then tap Calc.");return}
    if(!SAMPLE||!IMG||typeof Calc==="undefined"){inkSay("Reading handwriting isn't available in this view.");return}
    const b=bbox(ln.list),k=Math.min(2,1400/Math.max(b.w,b.h)),shot=png(ln.list,b,k);
    busy=true;syncDock();
    try{
      const r=await SAMPLE.json(CALC_PROMPT,{images:[await shot.blob],cache:false,modelTier:CALC_TIER});
      const ex=r&&typeof r==="object"&&typeof r.expr==="string"?r.expr.trim():"";
      if(!ex){inkSay("I couldn't read a calculation there. Write it a little clearer and tap Calc again.");return}
      const res=Calc.evaluate(ex),read=ex.replace(/\s*=\s*$/,"").replace(/\s*\*\s*/g,"·");
      if(!res.ok){inkSay("I read "+read+" and can't work it out. "+res.error);return}
      if(!strokes.includes(ln.seed))return; // undone, erased or cleared while Claude was reading
      // Boxes come back as fractions of the picture (or, from a careless reply, as pixels or thousandths): turn them into page rectangles.
      const rect=v=>{
        if(!Array.isArray(v)||v.length!==4)return null;v=v.map(Number);if(v.some(x=>!isFinite(x)))return null;
        const mx=Math.max(...v);if(mx>1.01)v=mx<=Math.max(shot.w,shot.h)+4?[v[0]/shot.w,v[1]/shot.h,v[2]/shot.w,v[3]/shot.h]:v.map(x=>x/1000);
        let [x0,y0,x1,y1]=v.map(x=>Math.min(1,Math.max(0,x)));if(x1<x0)[x0,x1]=[x1,x0];if(y1<y0)[y0,y1]=[y1,y0];
        return{x0:b.x+x0*b.w,y0:b.y+y0*b.h,x1:b.x+x1*b.w,y1:b.y+y1*b.h};
      };
      // Claude's box says roughly where; the strokes themselves say exactly. f narrows the search (the bars of an equals sign are flat).
      const ink=ln.L.filter(q=>!q.s.calc),near=(R,grow,f)=>{const gx=Math.max(10,(R.x1-R.x0)*grow),gy=Math.max(10,(R.y1-R.y0)*grow);
        return join(ink.filter(q=>{const cx=(q.x0+q.x1)/2,cy=(q.y0+q.y1)/2;return cx>=R.x0-gx&&cx<=R.x1+gx&&cy>=R.y0-gy&&cy<=R.y1+gy&&(!f||f(q))}))};
      const eq=rect(r.eq),bx=rect(r.box),sd=sbox(ln.seed);
      const R=eq?near(eq,.6,q=>q.w>=q.h*1.5)||eq:bx?near(bx,.1)||bx:{x0:sd.x0,y0:sd.y0,x1:Math.max(...ink.map(q=>q.x1)),y1:sd.y1};
      // Digit height: Claude's estimate if it agrees with the strokes, otherwise the strokes'.
      let dh=Number(r.h);dh=isFinite(dh)&&dh>0?(dh>1?dh/k:dh*b.h):0;if(!(dh>=ln.gh*.6&&dh<=ln.gh*1.6))dh=ln.gh;
      const put=()=>{
        if(!strokes.includes(ln.seed))return;
        const it={calc:1,txt:(eq?"":"= ")+res.text,x:Math.round((R.x1+dh*.45)*10)/10,y:Math.round((R.y0+R.y1)*5)/10,h:Math.round(dh/.7)};it.pts=calcPts(it);
        tap=null;snap();strokes.push(it);draw();changed();
        const q=sbox(it);ensure(q.x0-8,q.y0-10,q.x1+18,q.y1+10);
        inkSay("Read as "+read+" =",2600);
      };
      if(cur)late=put;else put(); // never while a stroke is being written
    }catch(e){
      if(hideFor(e&&e.code))SAMPLE=null;
      const m=e&&e.code==="invalid_json"?"The reading came back garbled. Tap Calc again.":errText(e);if(m)inkSay(m);
    }finally{busy=false;syncDock()}
  }
  // Marks are fractions of the exported image; map them back onto the pad.
  // Marks are fractions of the exported image; map them back onto the page. A red circle is then pulled tight around
  // the ink it covers: the model's box is a little loose, and the point is to show exactly which symbols are wrong.
  function setMarks(list){
    clearMarks();if(!box)return;let k=0;
    const ink=strokes.filter(s=>s.t!=="hi"&&s.pts.length).map(s=>{let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;s.pts.forEach(q=>{x0=Math.min(x0,q.x);y0=Math.min(y0,q.y);x1=Math.max(x1,q.x);y1=Math.max(y1,q.y)});return{x0,y0,x1,y1}});
    list.forEach(m=>{const [a,b,c,d]=m.f;const el=document.createElement("div");el.className="mk"+(m.ok?" ok":"");
      let x0=box.x+a*box.w,y0=box.y+b*box.h,x1=box.x+c*box.w,y1=box.y+d*box.h;
      if(!m.ok){
        // strokes whose middle lies in the box and that are not much wider than it (a long fraction bar is not "the 6")
        const g=6,w=x1-x0,hit=ink.filter(s=>{const cx=(s.x0+s.x1)/2,cy=(s.y0+s.y1)/2;return cx>=x0-g&&cx<=x1+g&&cy>=y0-g&&cy<=y1+g&&s.x1-s.x0<=1.5*w+20});
        if(hit.length){x0=Math.min(...hit.map(s=>s.x0));y0=Math.min(...hit.map(s=>s.y0));x1=Math.max(...hit.map(s=>s.x1));y1=Math.max(...hit.map(s=>s.y1))}
      }
      el.style.left=(x0-5)+"px";el.style.top=(y0-5)+"px";
      el.style.width=Math.max(22,x1-x0+10)+"px";el.style.height=Math.max(22,y1-y0+10)+"px";
      const n=document.createElement("b");n.textContent=m.ok?"✓":++k;el.append(n);mk.append(el);marks.push(el)});
  }
  function focus(i){marks.forEach((el,k)=>el.classList.toggle("on",k===i));const el=marks[i];if(i>=0&&el){ensure(el.offsetLeft-16,el.offsetTop-16,el.offsetLeft+el.offsetWidth+34,el.offsetTop+el.offsetHeight+16);pad.scrollIntoView({block:"nearest",behavior:"smooth"})}}
  return{isEmpty:()=>!strokes.length,toBlob,setMarks,focus,setSolution,reveal,revealAll,clearSol,get lastSize(){return lastSize},
    get strokes(){return strokes},
    /* A saved page is an array of strings, one per item, in the order written:
         "x,y,p;x,y,p;..."          a pen stroke in the theme's ink, medium size (every answer saved before colours existed looks like this)
         "p.blue.2|x,y,p;..."       a styled stroke: tool (p pen, h highlighter), colour key, size 0..2, then the points
         "=x,y,h|1124.864"          a calculator result: where its text starts (x), the line it is centred on (y), its height, and the text */
    pack:()=>strokes.map(s=>{
      if(s.calc)return"="+s.x+","+s.y+","+s.h+"|"+s.txt;
      const pts=s.pts.map(q=>Math.round(q.x*10)/10+","+Math.round(q.y*10)/10+","+Math.round(q.p*100)/100).join(";");
      return s.t==="hi"||(s.c&&s.c!=="ink")||(s.w!=null&&s.w!==1)?(s.t==="hi"?"h":"p")+"."+s.c+"."+s.w+"|"+pts:pts;
    }),
    // Takes what pack() wrote, or live strokes from another pad.
    load(st){
      strokes=(Array.isArray(st)?st:[]).map(s=>{
        if(s&&typeof s==="object")return s.calc?{calc:1,txt:String(s.txt||""),x:+s.x,y:+s.y,h:+s.h}:{t:s.t,c:s.c,w:s.w,pts:(s.pts||[]).map(q=>({x:q.x,y:q.y,p:q.p}))};
        if(typeof s!=="string")return null;
        const i=s.indexOf("|");
        if(s[0]==="="){const a=s.slice(1,i).split(",").map(Number);return i>0?{calc:1,txt:s.slice(i+1),x:a[0],y:a[1],h:a[2]}:null}
        const hd=i>=0?s.slice(0,i).split("."):[];
        return{t:hd[0]==="h"?"hi":"pen",c:hd[1],w:+hd[2],pts:s.slice(i+1).split(";").map(t=>{const a=t.split(",");return{x:+a[0],y:+a[1],p:+a[2]||.5}}).filter(q=>isFinite(q.x)&&isFinite(q.y))};
      }).filter(s=>{
        if(!s)return false;
        if(s.calc){if(!(isFinite(s.x)&&isFinite(s.y)&&s.h>=6&&s.h<=200&&s.txt&&s.txt.length<=40))return false;s.pts=calcPts(s);return true}
        s.t=s.t==="hi"?"hi":"pen";const hi=s.t==="hi";if(!(hi?HIS:PENS).includes(s.c))s.c=hi?"yellow":"ink";if(![0,1,2].includes(s.w))s.w=1;
        return s.pts.length>0;
      });
      if(strokes.length){const b=bbox();if(b.y+b.h>H&&b.y+b.h<3000){H=Math.ceil(b.y+b.h+30);size()}if(W&&(b.x>W/cam.z-40||b.x+b.w<40||b.y>H/cam.z-40||b.y+b.h<40)){cam.x=b.x-12;cam.y=b.y-12}}
      applyCam();syncDock();
    }};
}
// One answer field: handwriting pad or typed text.
function answerBox(host,opts={}){
  const el=document.createElement("div");el.className="abox";
  el.innerHTML=`<div class="mode" role="group" aria-label="Answer by"><button type="button" data-m="ink">Write</button><button type="button" data-m="text">${opts.speak?"Speak or type":"Type"}</button></div><div class="a-ink"></div><div class="a-mic" hidden></div><textarea class="a-text"></textarea>`;
  host.append(el);
  const ta=el.querySelector("textarea"),inkHost=el.querySelector(".a-ink");
  ta.placeholder=opts.placeholder||"Your attempt";if(opts.tall){ta.style.minHeight="110px";ta.style.fontFamily="var(--f-body)";ta.style.fontSize="15.5px"}
  let ink=null,mode=opts.mode||(TOUCHY?"ink":"text");
  const sv=opts.saved||null;let pend=sv&&Array.isArray(sv.strokes)&&sv.strokes.length?sv.strokes:null;
  if(sv){if(sv.mode==="ink"||sv.mode==="text")mode=sv.mode;if(sv.text)ta.value=String(sv.text)}
  const changed=()=>{if(opts.onChange)opts.onChange({mode,text:ta.value,strokes:ink?ink.pack():(pend||[])})};
  ta.addEventListener("input",changed);
  const mic=el.querySelector(".a-mic");
  if(opts.speak&&DICT){
    mic.innerHTML='<button type="button" class="btn sm primary" data-mic>\u25cf Speak my answer</button><select data-lang aria-label="Language I speak in"><option value="en">English</option><option value="de">Deutsch</option></select><span class="note live"></span>';
    const mb=mic.querySelector("[data-mic]"),lg=mic.querySelector("[data-lang]"),live=mic.querySelector(".live");
    lg.value=lsGet("qpr-lang")==="de"?"de":"en";lg.onchange=()=>lsSet("qpr-lang",lg.value);
    mb.onclick=()=>{
      if(!DICT)return;
      if(DICT.active()){DICT.stop().catch(()=>{});return}
      if(TTS&&TTS.active())TTS.stop().catch(()=>{});
      DICT_T={ta,btn:mb,live};live.textContent="";
      DICT.start({language:lg.value}).catch(e=>{
        const c=e&&e.code;
        live.textContent=c==="not_granted"?"The microphone is switched off for this site. Allow it in the browser, or type your answer instead.":c==="unavailable"?"Dictation isn't available here. Type your answer instead.":c==="rate_limited"?"The microphone is busy. Try again in a moment.":c==="dismissed"||c==="stopped"?"":"The microphone didn't start. Try again.";
        if(c==="not_granted"||c==="unavailable")mb.hidden=true;
      });
    };
  }else if(opts.speak&&TOUCHY){
    mic.innerHTML='<span class="note">To speak your answer here: tap the box, then the microphone key on the keyboard. German or English both work.</span>';
  }
  function set(m){mode=m;if(opts.qEl&&opts.task)opts.qEl.hidden=m==="ink";mic.hidden=m!=="text"||!mic.firstChild;el.querySelectorAll("[data-m]").forEach(b=>b.classList.toggle("on",b.dataset.m===m));inkHost.hidden=m!=="ink";ta.hidden=m!=="text";if(m==="ink"&&!ink){ink=makeInk(inkHost,{height:opts.height,task:opts.task,onChange:changed});if(pend){ink.load(pend);pend=null}}}
  el.querySelectorAll("[data-m]").forEach(b=>b.onclick=()=>{set(b.dataset.m);changed()});
  set(mode);
  return{get mode(){return mode},get ink(){return ink},ta,set,changed,
    text:()=>ta.value.trim(),hasInk:()=>!!ink&&!ink.isEmpty(),has(){return !!ta.value.trim()||(!!ink&&!ink.isEmpty())}};
}

/* ---------------- Checking work (handwritten or typed) ---------------- */
const VERD={correct:["good","Correct"],partly:["warn","Partly right"],wrong:["warn","Not right yet"]};
const CHECK_FMT=String.raw`Reply with only a JSON object of this shape:
{"verdict": "correct" | "partly" | "wrong",
 "read": "LaTeX of what the student wrote, one written line per row, rows separated by \\ (empty string if typed)",
 "summary": "Markdown, at most 60 words: first what the student did right (be specific), then the one thing to fix. Math in $...$",
 "say": "2-3 spoken sentences a tutor would say first: the verdict, what was done right, and in one phrase where it went off. Do not explain the mistake yet",
 "marks": [{"box": [x0, y0, x1, y1], "ok": false,
   "issue": "at most 10 words that name the exact symbols that are wrong as the student wrote them, then what is wrong with them, for example 'The sign > should have flipped' or 'The 6 should be 9'",
   "kind": "slip" | "rule",
   "rule": {"name": "the usual name of the rule or concept that was broken, at most 5 words", "is": "that rule stated correctly and in general, one line of at most 16 words, formula in $...$"},
   "why": "Markdown, at most 35 words: what the student did, the tempting wrong idea behind it, and why the rule does not allow it. Math in $...$",
   "fix": "this step done correctly, math in $...$, short enough to write next to handwriting",
   "check": "one quick self-check the student can do in their head next time, at most 25 words, math in $...$ (empty string if there is no good one)",
   "say": "3-5 short spoken sentences, see the rules below"},
  {"box": [x0, y0, x1, y1], "ok": true}],
 "board": [{"tex": "one line of the perfect written answer, as LaTeX without dollar signs, short enough for one handwritten line; words go in \\text{...}", "say": [{"part": "the exact piece of this line's tex that the sentence is about", "text": "one short spoken sentence about that piece"}]}],
 "next": {"q": "one similar short question that tests the same rule with different numbers, Markdown, math in $...$", "a": "its answer in one line, math in $...$"} | null}
Rules:
- verdict: "correct" = method and final answer are right. "partly" = the method is right but there is a slip, or the answer is unfinished, or one of several parts is wrong. "wrong" = a rule or concept is misapplied, or the answer does not address the question.
- box says where in the IMAGE that piece is written: fractions of the image width and height measured from the top-left corner (0 to 1), drawn tightly around the expression.
- Marks with ok false: one per independent error, at most 3. They are circled in red on the student's page. Circle the FIRST place where the error enters, and be exact about it: the box of an ok false mark covers ONLY the symbols that are wrong (one sign, one number, one exponent, one term), never the whole line and never the whole equation. If a single character is wrong, box that single character. The student must be able to see at a glance which symbols to change. Lines after it that follow correctly from the wrong line only carry the error forward: do not circle them and do not tick them.
- Marks with ok true: the written lines or steps that are right, at most 4. They get a green tick and need only box and ok. Tick what was right before the first error. Never tick a line whose value is wrong, even when the step into it was carried out correctly. Always tick the final answer if it is correct.
- If the answer was typed there is no image: give only the ok false marks, each with "box": null.
- kind: "slip" = the method was right and the mistake is arithmetic, a sign, or copying; then "rule" is null and "why" says exactly what went wrong (for example $3\\cdot 3=6$ instead of $9$). "rule" = a rule or concept was misapplied, forgotten or invented.
- rule: name the real rule the step needed and state it correctly with general letters, for example {"name": "Square of a sum", "is": "$(a+b)^2=a^2+2ab+b^2$"}. Never state the student's wrong version as the rule.
- why: name the misconception plainly, for example "You squared each term separately, as if powers distribute over a sum. They only distribute over products: $(ab)^2=a^2b^2$."
- check: a concrete test that would have caught THIS error: plug in small numbers (and give the two results, which must really differ), compare with a rough decimal, multiply back, or put the answer into the original. Verify the arithmetic of the check before you write it.
- board: the book answer exactly as it should be written on the page, following the reference answer, 2 to 6 lines, each following from the one before. The tutor writes it next to the student's work while speaking. Each line's "say" is 1 to 3 sentences, read aloud one after the other while that line is lit up. For every sentence, "part" is the piece of the line it talks about, and the page lights up exactly that piece while the sentence is read: copy it character for character out of this line's "tex", choose a complete sub-expression (a whole exponent, a numerator, one side of the equation, one factor, never half a command and never starting with ^ or _), prefer a piece that occurs only once in the line, and go through the line in the order a tutor would point at it: first what changed from the line above and which rule produced it, then the result. Use "part": "" only for a sentence about the line as a whole. Do not use \\hl.
- next: only when a mark has kind "rule". One or two lines of work, same rule, different numbers. null when the verdict is correct or there are only slips.
- Spoken text: "say", then each ok false mark's "say", then each board line's "say" are read aloud one after the other, like one tutor talking to "you". They must flow together and not repeat each other. No LaTeX and no symbols in spoken text: read the mathematics in words ("one plus r, all squared", "two thirds", "the natural log of a").
- A mark's "say", in this order: where it is ("in your second line"), the rule by name and in plain words, why your step breaks it, what the step should be, and the quick check if there is one. For a slip: say it is a slip and that the method was right, then give the right number. If later lines carry the error forward, say so in one short sentence.
- The board lines' "say" walk through the correct solution and do not explain the mistake again. The last one ends with the one thing to remember.
- Be warm and exact. Credit what is right before you correct. Plain, direct sentences, no em dashes.
- Judge the mathematics, not neatness. A different valid method counts as correct. If part of the handwriting is unreadable, say so in summary instead of guessing.
- This is JSON: write every LaTeX backslash as two backslashes (\\frac, \\ln, \\text, \\cdot). No HTML. Never use the dollar sign for money.`;
const texHL=t=>String(t||"").replace(/\$/g,"").replace(/#/g,"").replace(/\\hl\{/g,"\\textcolor{OrangeRed}{");
const normSteps=a=>(Array.isArray(a)?a:[]).filter(s=>s&&(s.tex||s.say)).slice(0,8).map(s=>({tex:String(s.tex||""),say:String(s.say||"")}));
const chkStr=x=>typeof x==="string"?x.trim():typeof x==="number"?String(x):"";
// Handwriting: every mark has a box on the image. Typed: only the mistakes, with no box.
// A mistake carries: issue, kind ("slip" | "rule" | ""), rule {name, is} or null, why, fix, check, say. Older replies have only issue, fix, say.
function normMarks(r,ab,useInk){
  const sz=ab.ink&&ab.ink.lastSize,hasBox=m=>Array.isArray(m.box)&&m.box.length===4;
  return (Array.isArray(r.marks)?r.marks:[]).filter(m=>m&&typeof m==="object"&&(useInk?hasBox(m):m.ok!==true&&!!(chkStr(m.issue)||chkStr(m.fix)||chkStr(m.why)||chkStr(m.say)))).slice(0,8).map(m=>{
    let f=null;
    if(useInk){
      let v=m.box.map(Number).map(x=>isFinite(x)?x:0);const mx=Math.max(...v);
      if(mx>1.01){if(sz&&mx<=Math.max(sz.w,sz.h)+4)v=[v[0]/sz.w,v[1]/sz.h,v[2]/sz.w,v[3]/sz.h];else v=v.map(x=>x/1000)}
      let [a,b,c,d]=v.map(x=>Math.min(1,Math.max(0,x)));if(c<a)[a,c]=[c,a];if(d<b)[b,d]=[d,b];f=[a,b,c,d];
    }
    if(m.ok===true)return{f,ok:true,issue:"",kind:"",rule:null,why:"",fix:"",check:"",say:""};
    const q=m.rule,ru=q&&typeof q==="object"?{name:chkStr(q.name).replace(/[.:\s]+$/,""),is:chkStr(q.is||q.statement||q.tex)}:{name:"",is:chkStr(q)};
    const slip=m.kind==="slip",rule=!slip&&(ru.name||ru.is)?ru:null,issue=chkStr(m.issue)||"Check this";
    return{f,ok:false,issue,kind:slip?"slip":rule||m.kind==="rule"?"rule":"",rule,why:chkStr(m.why),fix:chkStr(m.fix),check:chkStr(m.check),say:chkStr(m.say)||issue};
  });
}
// The exact prompt for one check. p: {q, a}. Handwriting sends the image with it; typed work goes in the text.
function checkPrompt(p,useInk,typed,pre){
  return "You are a patient, precise math tutor checking work for a beginner preparing for the UZH/ETH MSc Quantitative Finance admission interview. The student finds notation hard to read and learns most from knowing exactly which rule a mistake broke.\n\nQuestion:\n"+p.q+"\n\nReference answer:\n"+p.a+"\n\n"+(useInk?"The attached image is the student's handwritten work (dark ink on white). Read it line by line. The question is already printed on their page, so the writing may simply continue it, for example starting with an equals sign.":"The student's typed answer:\n"+typed)+(pre?"\n\nContext: this is a try-first attempt made BEFORE the lesson on this topic, so gaps are expected. Be encouraging, credit every correct idea, and explain each mistake so a beginner understands why.":"")+"\n\n"+CHECK_FMT;
}
async function checkWork(p,ab,fb,btn,opt={}){
  const useInk=ab.mode==="ink"&&ab.hasInk(),typed=ab.text();
  if(!useInk&&!typed){fb.hidden=false;fb.textContent=ab.mode==="ink"?"Write your attempt on the pad first, even a partial one.":"Write your attempt first, even if it's partial.";return null}
  if(useInk&&!IMG){fb.hidden=false;fb.textContent="Reading handwriting isn't available in this view. Switch to Type, or reveal the answer and compare.";return null}
  if(TTS&&TTS.prime)TTS.prime();
  if(btn)btn.disabled=true;fb.hidden=false;fb.innerHTML=`<span class="status">${useInk?"Reading your handwriting…":"Checking…"}</span>`;
  const prompt=checkPrompt(p,useInk,typed,opt.pre);
  try{
    // The fast "check" model, and the verdict on screen as soon as it is written: the rest of the reply fills in behind it.
    const o={cache:false,modelTier:"check"};if(useInk)o.images=[await ab.ink.toBlob()];
    let early="";
    o.onText=({text})=>{
      const m=/"verdict"\s*:\s*"(correct|partly|wrong)"/.exec(text);if(!m)return;
      const sm=/"summary"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(text);let sum="";
      if(sm){try{sum=JSON.parse('"'+sm[1].replace(/\\+$/,"")+'"')}catch(_){}}
      const key=m[1]+"|"+sum.length;if(key===early)return;early=key;
      const v=VERD[m[1]];fb.innerHTML='<p style="margin:0 0 6px"><span class="pill '+v[0]+'">'+v[1]+'</span> <span class="status">'+(useInk?"Marking your page…":"Writing the feedback…")+'</span></p><div class="prose sm"></div>';
      fb.querySelector(".sm").textContent=sum.replace(/\$/g,"");
    };
    const r=await SAMPLE.json(prompt,o);
    if(!r||typeof r!=="object")throw{code:"invalid_json"};
    renderCheck(r,ab,fb,useInk,!!opt.auto,String(p.a||""));
    return r;
  }catch(e){if(hideFor(e&&e.code))SAMPLE=null;fb.textContent=e&&e.code==="invalid_json"?"The check came back garbled. Try again.":(errText(e)||"Stopped.");return null}
  finally{if(btn)btn.disabled=false}
}
// The book answer, line by line. Each line is explained in a few short sentences, and each sentence names the piece
// of the line it is about, so exactly that piece can be lit up on the page while the sentence is read.
function normBoard(a){
  return (Array.isArray(a)?a:[]).filter(s=>s&&typeof s==="object"&&String(s.tex||"").trim()).slice(0,6).map(s=>{
    const tex=String(s.tex).replace(/\$/g,"").replace(/#/g,"").replace(/\\hl\{/g,"\\boxed{");
    const raw=Array.isArray(s.say)?s.say:[{part:"",text:s.say}];
    const beats=raw.map(b=>typeof b==="string"?{part:"",text:b}:{part:chkStr(b&&b.part).replace(/\$/g,"").trim(),text:chkStr(b&&(b.text||b.say)).trim()}).filter(b=>b.text).slice(0,4);
    return{tex,beats:beats.length?beats:[{part:"",text:""}]};
  });
}
// Wraps the named pieces of a line as \class{hp hp-<n>}{...} so each can be styled on its own. A piece is used only
// if it is a complete, balanced bit of the line's TeX and the line still typesets with it; otherwise that sentence
// lights up the whole line, as before. Sets beat.j to the piece's number, or -1.
function markParts(tex,beats){
  const spans=[];
  beats.forEach((b,j)=>{
    b.j=-1;const p=b.part;if(!p||p===tex)return;
    if(/^[\^_{}]/.test(p)||/[\^_{\\]$/.test(p))return;
    let depth=0;for(const ch of p){if(ch==="{")depth++;else if(ch==="}"&&--depth<0)return}
    if(depth)return;
    const i=tex.indexOf(p);if(i<0)return;
    const e=i+p.length;
    if(/\\[a-zA-Z]*$/.test(tex.slice(0,i))&&/^[a-zA-Z]/.test(p))return;   // would start inside a command name
    if(/\\[a-zA-Z]+$/.test(p)&&/^[a-zA-Z]/.test(tex.slice(e)))return;      // would end inside one
    if(spans.some(s=>i<s.e&&e>s.i))return;                                 // overlaps a piece already marked
    spans.push({i,e,j});b.j=j;
  });
  if(!spans.length)return tex;
  // From the right, so earlier positions stay valid. Each piece is kept only if the line still typesets with it.
  const ok=t=>{try{return !MathJax.tex2svg(t,{display:true}).querySelector("[data-mjx-error],mjx-merror")}catch(e){return false}};
  let out=tex;
  spans.sort((a,b)=>b.i-a.i).forEach(s=>{
    const t=out.slice(0,s.i)+"\\class{hp hp-"+s.j+"}{"+out.slice(s.i,s.e)+"}"+out.slice(s.e);
    if(ok(t))out=t;else beats[s.j].j=-1;
  });
  return out;
}
function renderCheck(r,ab,fb,useInk,auto,ref){
  r=r&&typeof r==="object"?r:{};
  const v=VERD[r.verdict]||VERD.partly;let marks=normMarks(r,ab,useInk);
  if(useInk&&r.verdict==="correct"&&!marks.length)marks=[{f:[0,0,1,1],ok:true,issue:"",kind:"",rule:null,why:"",fix:"",check:"",say:""}];
  const nErr=marks.filter(m=>!m.ok).length,nOk=marks.length-nErr;
  const where=!useInk?"":[nErr?nErr+" spot"+(nErr>1?"s":"")+" circled in red":"",nOk?nOk+" ticked green":""].filter(Boolean).join(", ");
  fb.innerHTML=`<p style="margin:0 0 6px"><span class="pill ${v[0]}">${v[1]}</span>${where?` <span class="note">${where} on your page</span>`:""}</p>
    <div class="read" hidden><div class="note">What I read:</div><div class="prose rd"></div></div><div class="prose sm"></div><ol class="issues${useInk?"":" flat"}"></ol><div class="walk"></div><details class="sol" hidden><summary>Correct solution</summary><div class="prose"></div></details>
    <div class="next" hidden><div class="eyebrow">Try a similar one</div><div class="prose nq"></div><details><summary>Show the answer</summary><div class="prose"></div></details></div>`;
  const read=chkStr(r.read).replace(/\$/g,"").trim();
  if(useInk&&read){const rd=fb.querySelector(".read");rd.hidden=false;renderMD("$$\\begin{array}{l}"+read+"\\end{array}$$",rd.querySelector(".rd"),false)}
  renderMD(chkStr(r.summary),fb.querySelector(".sm"),false);
  const ol=fb.querySelector(".issues");
  const errLines=[];
  // One labelled row of the explanation under the pad: Rule, Why, Correct step, Quick check.
  const row=(host,k,md,c)=>{if(!md)return;const d=document.createElement("div");d.className="ex-r"+(c?" "+c:"");d.innerHTML=`<span class="ex-k">${k}</span><div class="prose"></div>`;renderMD(md,d.lastChild,false);host.append(d)};
  marks.forEach((m,i)=>{if(m.ok)return;const n=errLines.length+1,slip=m.kind==="slip",ru=m.rule;
    // The note written next to the red circle stays short: the rule (or "Slip"), then this step done right.
    const head=slip?"**Slip.**":ru?("**"+(ru.name||"Rule")+".** "+ru.is).trim():"";
    const note=head?(slip?head+" "+(m.fix||m.issue):head+(m.fix?"\n\nHere: "+m.fix:"")):(m.fix||m.issue);
    errLines.push({kind:"mark",i,n,label:m.issue,note,say:m.say});
    const li=document.createElement("li");li.innerHTML=`<span class="n">${n}</span><div class="ex"><div class="ex-h"><div class="prose"></div>${m.kind?`<span class="tag${slip?" slip":""}">${slip?"Slip":"Rule"}</span>`:""}</div></div>`;
    const ex=li.querySelector(".ex");renderMD("**"+m.issue+"**",ex.querySelector(".prose"),false);
    if(ru)row(ex,"Rule",(ru.name?"**"+ru.name+".** ":"")+ru.is,"rule");
    row(ex,slip?"The slip":"Why",m.why);row(ex,"Correct step",m.fix);row(ex,"Quick check",m.check);
    li.onclick=()=>{if(useInk&&ab.ink)ab.ink.focus(i);ol.querySelectorAll("li").forEach(x=>x.classList.toggle("on",x===li))};ol.append(li)});
  // The corrected part of the book answer gets a box. Not a colour: \textcolor loads a MathJax extension on first use, and that load fails for good when two typesets overlap, as they do here. Not an underline: an underlined < reads as ≤.
  const bd=normBoard(r.board);
  // Handwriting: corrections and the book answer are written on the page, next to the work, whatever the verdict.
  const onPage=useInk,right=r.verdict==="correct",nE=errLines.length;
  const book=!onPage?[]:bd.length?bd.map(b=>({tex:markParts(b.tex,b.beats),beats:b.beats})):ref?[{md:ref,beats:[{j:-1,text:"Here is the book answer, written next to your work."}]}]:[];
  if(onPage)errLines.forEach((e,k)=>{e.r=k});
  if(ab.ink){ab.ink.setMarks(useInk?marks:[]);ab.ink.setSolution(onPage?[...errLines.map(e=>({n:e.n,md:e.note})),...book]:[])}
  // One similar question on the same rule, answer folded away. Only after a mistake.
  const nx=!right&&r.next&&typeof r.next==="object"?{q:chkStr(r.next.q),a:chkStr(r.next.a)}:null;
  if(nx&&nx.q){const d=fb.querySelector(".next"),da=d.querySelector("details");d.hidden=false;renderMD(nx.q,d.querySelector(".nq"),false);if(nx.a)renderMD(nx.a,da.querySelector(".prose"),false);else da.hidden=true}
  // Spoken order: the verdict, each circled mistake, then the correct solution step by step.
  const say=String(r.say||"").trim();
  const lines=[...(say?[{tex:"",say}]:[]),...errLines,...book.flatMap((b,k)=>b.beats.filter(bt=>bt.text).map(bt=>({kind:"sol",r:nE+k,part:bt.j,tex:"",say:bt.text})))];
  // Typed answers have no page to write on: the model answer goes under the feedback instead.
  if(!onPage&&bd.length){const dt=fb.querySelector(".sol");dt.hidden=false;renderMD(bd.map(b=>"$$"+b.tex+"$$").join("\n\n"),dt.querySelector(".prose"),false)}
  // A correct answer is not read out; the voice is for explaining what went wrong.
  const willSpeak=!!(auto&&TTS&&lines.length&&!right);
  if(lines.length){const pl=makePlayer(fb.querySelector(".walk"),lines,useInk?ab.ink:null,true);if(willSpeak)pl.play()}
  if(useInk&&!willSpeak)ab.ink.revealAll();
  typesetNow(fb);
}

/* ---------------- Voice + formula walkthrough ---------------- */
// Each line: {tex, say} (a formula step) or {kind:"mark", i, label, say} (a circled mistake).
function makePlayer(host,lines,ink,plain){
  if(plain&&!TTS){host.innerHTML="";return{at(){},state(){},play(){}}}
  // Voice, speed and the natural-voice switch live in the header's voice menu only; here it is just play and stop.
  host.innerHTML=`<div class="board${plain?" plain":""}"><div class="board-h"><span class="eyebrow">${plain?"Read aloud":"Walkthrough"}</span><div class="row">
    ${TTS?`<button type="button" class="btn sm primary" data-play>▶ Explain with voice</button><button type="button" class="btn sm" data-stop hidden>Stop</button>`:""}
    <button type="button" class="btn sm" data-prev aria-label="Previous step">‹ Back</button><button type="button" class="btn sm" data-next aria-label="Next step">Next ›</button></div></div><div class="bsteps"></div></div>`;
  const list=host.querySelector(".bsteps");
  lines.forEach((l,i)=>{
    const d=document.createElement("div");d.className="bstep";
    if(l.kind==="mark"){d.innerHTML=`<div class="bm"><span class="n">${l.n||l.i+1}</span><span class="lbl"></span></div><div class="cap"></div>`;d.querySelector(".lbl").textContent=l.label}
    else{d.innerHTML=`<div class="prose tx"></div><div class="cap"></div>`;if(l.tex.trim())renderMD("$$"+texHL(l.tex)+"$$",d.querySelector(".tx"),false)}
    d.querySelector(".cap").textContent=l.say;d.onclick=()=>me.at(i);list.append(d);
  });
  let idx=0;
  const play=host.querySelector("[data-play]"),stop=host.querySelector("[data-stop]");
  const me={
    at(i){idx=Math.max(0,Math.min(lines.length-1,i));[...list.children].forEach((el,k)=>el.classList.toggle("on",k===idx));const l=lines[idx];if(ink)ink.focus(l.kind==="mark"?l.i:-1);if(ink&&ink.reveal)ink.reveal(l.r!=null?l.r:-1,l.part);const el=list.children[idx];if(el&&!plain)el.scrollIntoView({block:"nearest",behavior:"smooth"})},
    state(s){if(s==="idle"&&ink&&ink.revealAll)ink.revealAll();if(!play)return;play.textContent=s==="speaking"||s==="starting"?"❚❚ Pause":s==="paused"?"▶ Resume":"▶ Explain with voice";stop.hidden=s==="idle"},
    play(){}
  };
  me.at(0);
  host.querySelector("[data-prev]").onclick=()=>me.at(idx-1);
  host.querySelector("[data-next]").onclick=()=>me.at(idx+1);
  if(play){
    play.onclick=()=>{
      if(!TTS)return;
      if(PLAYER===me&&TTS.active()){const p=play.textContent.includes("Resume")?TTS.resume():TTS.pause();p.catch(()=>{});return}
      start();
    };
    me.play=()=>{if(TTS&&play.isConnected)start()};
    const start=()=>{
      if(PLAYER&&PLAYER!==me)PLAYER.state("idle");
      PLAYER=me;const from=idx<lines.length-1?idx:0;
      TTS.speak(lines.slice(from).map((l,k)=>({text:(l.say||l.label||"…").slice(0,1900),id:String(from+k)})),{rate:TTS.rate()}).catch(e=>{
        if(ink&&ink.revealAll)ink.revealAll();
        if(e&&(e.code==="not_granted"||e.code==="unavailable")){TTS=null;play.remove();stop.remove()}
        else if(e&&e.code==="no_gesture"){play.textContent="▶ Tap again to play"}
        else if(e&&e.code==="busy"){play.textContent="▶ Busy, tap again"}
        else if(e&&e.code==="rate_limited"){play.textContent="Voice paused for now";play.disabled=true}
      });
    };
    stop.onclick=()=>{TTS&&TTS.stop().catch(()=>{})};
  }
  typesetNow(list);
  return me;
}
async function walkFor(what,host,btn,n){
  if(TTS&&TTS.prime)TTS.prime();
  if(btn)btn.disabled=true;host.innerHTML='<p class="status">Preparing the walkthrough…</p>';
  try{
    const r=await SAMPLE.json("You are a patient math tutor for a beginner preparing for the UZH/ETH MSc Quantitative Finance admission interview. Build a spoken, step-by-step walkthrough of the following.\n\n"+what+"\n\n"+String.raw`Reply with only JSON: {"steps": [{"tex": "display LaTeX for this step, no dollar signs, with the key part wrapped in \hl{...}", "say": "what the tutor says aloud for this step: 1-3 sentences, plain words, math read out in words, no LaTeX or symbols"}]}. `+(n||"3 to 7")+" steps. The first step states the goal, the last step the one-line takeaway. Every step shows a formula on the board. No HTML. Never use the dollar sign for money.");
    const steps=normSteps(r&&r.steps);if(!steps.length)throw{code:"empty_completion"};
    makePlayer(host,steps,null);
  }catch(e){if(hideFor(e&&e.code))SAMPLE=null;host.innerHTML="";const p=document.createElement("p");p.className="pill warn";p.textContent=e&&e.code==="invalid_json"?"The walkthrough came back garbled. Try again.":errText(e);host.append(p)}
  finally{if(btn)btn.disabled=false}
}

/* ---------------- Views ---------------- */
const V=document.getElementById("view");
let CUR=null, CTL=null;
function hush(){if(TTS&&TTS.active())TTS.stop().catch(()=>{});if(DICT&&DICT.active())DICT.stop().catch(()=>{})}
function setTab(v){document.querySelectorAll("nav.tabs a").forEach(a=>{if(a.dataset.v===v)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current")})}

function route(){
  const h=(location.hash||"#today").slice(1);
  if(CTL){try{CTL.abort()}catch(e){}CTL=null}
  hush();
  updateStats();
  if(h.startsWith("lesson-")&&IDX[h.slice(7)]!==undefined){setTab("today");return viewLesson(LESSONS[IDX[h.slice(7)]])}
  if(h==="plan"){setTab("plan");return viewPlan()}
  if(h==="targets"){setTab("targets");return viewTargets()}
  if(h==="books"){setTab("books");return viewBooks()}
  if(h==="symbols"){setTab("symbols");return viewSymbols()}
  if(h==="tutor"){setTab("tutor");return viewTutor()}
  if(h==="review"){setTab("review");return viewReview()}
  if(h==="train"){setTab("train");return viewTrain()}
  setTab("today");
  if(dueCards().length&&S.wu!==today())return viewReview();
  viewLesson(nextLesson());
}
window.addEventListener("hashchange",()=>{route();window.scrollTo(0,0)});

function sidebar(L){
  const dc=doneCount(),p=pace(),wk=WEEKS[L.w-1],ph=PHASES.find(x=>x.n===L.phase);
  const paceTxt=p.diff>=0?(p.diff>0?p.diff+" ahead of plan":"On plan"):(-p.diff)+" behind plan";
  const cls=p.diff>=0?"good":"warn";
  const items=[1,2,3,4,5,6].map(d=>{const l=LESSONS[IDX["w"+L.w+"d"+d]];return `<li><a href="#lesson-${l.id}" class="${l.id===L.id?"cur":""}"><span class="tick ${S.done[l.id]?"on":""}">${S.done[l.id]?"✓":""}</span><span>${esc(l.title)}</span></a></li>`}).join("");
  return `<aside>
   <div class="panel"><h3>Progress</h3><div class="big">${dc}<span class="note"> / ${LESSONS.length} sessions</span></div>
    <div class="bar"><i style="width:${(dc/LESSONS.length*100).toFixed(1)}%"></i></div>
    <dl class="kv"><dt>Streak</dt><dd>${streak()} d</dd><dt>Pace</dt><dd><span class="pill ${cls}">${paceTxt}</span></dd><dt>Finish at this pace</dt><dd>${fmtDate(finishDate())}</dd><dt>Started</dt><dd>${fmtDate(dateOf(S.start))}</dd></dl>
    <p class="note" style="margin:10px 0 0">Saved ${SYNC==="account"?"on your server, for all your devices":"in this browser only"}.</p></div>
   <div class="panel"><h3>Spaced review</h3><dl class="kv"><dt>Due today</dt><dd>${dueCards().length}</dd><dt>In your deck</dt><dd>${Object.keys(S.rev).length}</dd></dl><p class="note" style="margin:8px 0 0">Old problems return after 1, 4, 10, 30, 90 days. <a href="#review">Open review</a></p></div>
   <div class="panel"><h3>Week ${L.w} · ${esc(wk[0])}</h3><ul class="week-list">${items}</ul></div>
   <div class="panel"><h3>${esc(ph.n)} phase</h3><p style="margin:0;font-size:14px">${esc(ph.goal)}</p><p class="note" style="margin:8px 0 0">Weeks ${ph.from}–${ph.to}. Reading for it: <a href="#books">Books</a>.</p></div>
  </aside>`;
}

// Wire one problem card (needs [data-q], [data-ab], [data-rv], optional [data-ck], .fb, .ans, .rate inside d).
// cid: review card id, or a function that creates one on first rating.
function item(d,p,cid,srcTxt,onRated,opt={}){
  renderMD(p.q,d.querySelector("[data-q]"),false);
  const ab=answerBox(d.querySelector("[data-ab]"),{placeholder:opt.placeholder||"Your attempt",task:p.q,qEl:d.querySelector("[data-q]"),...(opt.ans||{})});
  const fb=d.querySelector(".fb"),ans=d.querySelector(".ans"),rt=d.querySelector(".rate"),rv=d.querySelector("[data-rv]"),ck=d.querySelector("[data-ck]");
  renderMD(p.a,ans,false);
  if(srcTxt){const s=document.createElement("p");s.className="note";s.style.margin="8px 0 0";s.textContent=srcTxt;ans.append(s)}
  let rated=false,wbtn=null;
  // verdict: the result of a check, which rates a course problem by itself. Training problems only join the deck
  // when missed or rated by hand, so those still ask.
  const showRate=verdict=>{if(rated||!cid||!rt)return;rated=true;const g=typeof cid==="string"?VERDICT_GRADE[verdict]:undefined;rateRow(typeof cid==="function"?cid():cid,rt,onRated,g===undefined?null:g)};
  if(SAMPLE&&rv){wbtn=document.createElement("button");wbtn.type="button";wbtn.className="btn";wbtn.textContent="Explain step by step";wbtn.hidden=true;rv.parentNode.append(wbtn);
    const wh=document.createElement("div");ans.after(wh);wbtn.onclick=()=>walkFor("Problem:\n"+p.q+"\n\nWorked solution:\n"+p.a,wh,wbtn)}
  if(rv)rv.onclick=()=>revealAnswer(rv,ab,fb,ans,()=>{showRate();if(wbtn)wbtn.hidden=false});
  // With checking available the answer stays out of reach until the work has been checked. Then it needs no extra tap:
  // on a handwritten page the book answer is already written next to the work, and for a typed answer it opens below.
  if(ck&&rv){rv.hidden=true;ck.classList.add("primary");rv.before(ck)}
  if(ck)ck.onclick=async()=>{const r=await checkWork(p,ab,fb,ck,{auto:true});if(!r)return;
    if(opt.onVerdict)opt.onVerdict(r);
    if(rv){rv.hidden=false;rv.dataset.seen="1";const typed=!(ab.mode==="ink"&&ab.hasInk());ans.hidden=!typed;rv.textContent=typed?"Hide answer":"Show the full written answer"}
    if(wbtn)wbtn.hidden=false;
    showRate(r.verdict)};
  typesetNow(d);
  return{ab,fb,ans,showRate,reveal(){ans.hidden=false;if(rv){rv.textContent="Hide answer";rv.dataset.seen="1"}if(wbtn)wbtn.hidden=false}};
}

async function viewReview(){
  const tok={};CUR=tok;
  const L=nextLesson(),ids=pickWarmup(6),warm=S.wu!==today();
  V.innerHTML=`<div class="grid"><article class="sheet">
    <div class="eyebrow">Warm-up · spaced review</div>
    <h1>${ids.length?"Warm-up: "+ids.length+" problem"+(ids.length>1?"s":"")+" from earlier lessons":"Nothing due right now"}</h1>
    <p class="note" style="margin:0;max-width:68ch">${ids.length?"Mixed problems from older lessons, timed to come back just as you would start to forget them. Solve each from memory, then check it. The topic stays hidden until then: choosing the right method is part of the practice.":"Practice problems from lessons you finish come back here on a schedule: tomorrow, then after 4, 10, 30 and 90 days. Each review takes 5–10 minutes at the start of a session."}</p>
    <div id="cards"></div>
    <div class="lesson-nav"><div></div><div><button class="btn ${ids.length?"":"primary"}" id="toLesson">${ids.length?(warm?"Skip warm-up today →":"Today's lesson →"):"Today's lesson →"}</button></div></div>
  </article>${sidebar(L)}</div>`;
  const toL=document.getElementById("toLesson");
  const go=()=>{if(S.wu!==today()){S.wu=today();save()}location.hash="lesson-"+L.id};
  toL.onclick=go;
  if(!ids.length)return;
  const box=document.getElementById("cards");let left=ids.length;
  const finish=()=>{if(S.wu!==today()){S.wu=today();save()}toL.className="btn primary";toL.textContent="Warm-up done · today's lesson →";updateStats()};
  for(let i=0;i<ids.length;i++){
    const cid=ids[i],[lid,ks]=cid.split("#");
    let p=null,srcTxt="";
    if(lid==="x"){p=BANK.items[ks];if(p)srcTxt="From training: "+p.t}
    else if(IDX[lid]!==undefined){const c=await loadLesson(lid);if(CUR!==tok)return;p=c&&c.practice&&c.practice[+ks];const src=LESSONS[IDX[lid]];srcTxt="From week "+src.w+": "+src.title}
    if(!p){delete S.rev[cid];left--;continue}
    const d=document.createElement("div");d.className="q";
    d.innerHTML=`<div class="qn">Problem ${i+1} of ${ids.length}</div><div class="prose" data-q></div><div data-ab></div>
      <div class="row"><button class="btn" data-rv>Show answer</button>${SAMPLE?`<button class="btn" data-ck>Check my work</button>`:""}</div>
      <div class="fb" hidden></div><div class="ans" hidden></div><div class="rate" hidden></div>`;
    box.append(d);
    item(d,p,cid,srcTxt,()=>{left--;if(left<=0)finish()});
  }
  if(left<=0)finish();
}

async function viewLesson(L){
  CUR=L;
  const i=IDX[L.id],prev=LESSONS[i-1],next=LESSONS[i+1],done=!!S.done[L.id];
  V.innerHTML=`<div class="grid"><article class="sheet" id="sheet">
    <div class="eyebrow">Week ${L.w} · Day ${L.d} of 6 · ${esc(L.phase)}</div>
    <h1>${esc(L.title)}</h1>
    <div class="meta"><span>Session ${i+1} of ${LESSONS.length}</span><span>·</span><span>about ${L.review?40:50} min</span>${done?`<span class="pill good">Done ${esc(S.done[L.id])}</span>`:""}</div>
    <div id="body" style="margin-top:22px"><p class="status">Loading the lesson…</p></div>
    <div id="explain"></div>
    <div id="practice"></div>
    <div class="lesson-nav">
      <div>${prev?`<a class="btn" href="#lesson-${prev.id}">← Previous</a>`:""}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${done?'<button class="btn sm" id="undoBtn">Undo done</button>':'<span class="note" id="doneNote" style="align-self:center">Marked done by itself once every practice problem is checked.</span>'}
        ${next?`<a class="btn" href="#lesson-${next.id}">Next →</a>`:""}
      </div>
    </div></article>${sidebar(L)}</div>`;
  const undo=document.getElementById("undoBtn");
  if(undo)undo.onclick=()=>{delete S.done[L.id];save();route()};
  const content=await loadLesson(L.id);
  await loadAns(L.id);
  if(CUR!==L)return;
  if(content)showContent(L,content);else showEmpty(L);
}
let CURC=null;const TRIED={};
function completeLesson(L){
  if(S.done[L.id])return;
  S.done[L.id]=today();save();updateStats();
  const n=document.getElementById("doneNote");if(n){n.className="pill good";n.textContent="Session done · saved"}
  const side=document.querySelector("#view aside");if(side)side.outerHTML=sidebar(L); // tick, streak and pace, without redrawing the pads
}
function showContent(L,c,fresh){
  CURC={id:L.id,c};
  const body=document.getElementById("body"),pr=document.getElementById("practice"),ex=document.getElementById("explain");
  const hasP=c.practice&&c.practice.length;
  if(fresh)TRIED[L.id]=TRIED[L.id]||"";
  // What is already saved for this lesson: an answer counts as worked if it has ink or text.
  const saved=ANS[L.id]?ANS[L.id].b:{},worked=a=>!!a&&((Array.isArray(a.strokes)&&a.strokes.length>0)||!!(a.text&&String(a.text).trim()));
  // A lesson whose problems were all worked but never rated (written before checks rated themselves, or done on
  // paper and only revealed) counts as done; what was never rated comes back in tomorrow's warm-up.
  if(hasP&&!S.done[L.id]&&c.practice.slice(0,c.own||c.practice.length).every((p,k)=>S.rev[L.id+"#"+k]||worked(saved["p"+k]))){
    c.practice.slice(0,c.own||c.practice.length).forEach((p,k)=>{const id=L.id+"#"+k;if(!S.rev[id])S.rev[id]={n:0,due:addDays(today(),1),last:today(),lapses:0}});
    completeLesson(L);
  }
  // Step 1: try first (pretesting), only on a lesson you haven't started yet. Coming back to a lesson you have
  // already written in goes straight to it.
  const started=Object.keys(saved).some(k=>worked(saved[k]));
  if(hasP&&!S.done[L.id]&&!(L.id in TRIED)&&!started){
    pr.innerHTML="";ex.innerHTML="";
    body.innerHTML=`<div class="gate"><div class="eyebrow step">Step 1 of 4 · Try first</div>
      <p style="margin:6px 0 0">Before reading, give this 2–3 minutes. You're not expected to solve it yet. Attempting first, even wrongly, makes the lesson stick better.${SAMPLE?" Then tap Check my attempt: your page gets marked, with green ticks for what is right and red circles where something went wrong, and the book answer is written next to your work. Mistakes are explained aloud.":""}</p>
      <div class="prose" id="pre" style="margin-top:10px"></div><div id="preAb"></div>
      <div class="row">${SAMPLE?'<button class="btn primary" id="preCk">Check my attempt</button>':""}<button class="btn ${SAMPLE?"":"primary"}" id="preGo">I've had a go · start the lesson</button><button class="btn" id="preSkip">Skip</button></div>
      <div class="fb" id="preFb" hidden></div></div>`;
    renderMD(c.practice[0].q,document.getElementById("pre"));
    const pab=answerBox(document.getElementById("preAb"),{placeholder:"Your first guess, idea or partial attempt",height:200,task:c.practice[0].q,qEl:document.getElementById("pre"),...bind(L.id,"pre")});
    const preCk=document.getElementById("preCk");
    if(preCk)preCk.onclick=()=>checkWork(c.practice[0],pab,document.getElementById("preFb"),preCk,{auto:true,pre:true});
    document.getElementById("preGo").onclick=()=>{hush();TRIED[L.id]={text:pab.ta.value,strokes:pab.ink?pab.ink.strokes:null,mode:pab.mode};showContent(L,c)};
    document.getElementById("preSkip").onclick=()=>{TRIED[L.id]="";showContent(L,c)};
    return;
  }
  // Step 2: the lesson.
  renderLesson(c.md,body);
  const tag=document.createElement("div");tag.className="eyebrow step";tag.style.marginBottom="6px";tag.textContent="Step 2 of 4 · Lesson";body.prepend(tag);
  if(!HAND[L.id]&&SAMPLE){const r=document.createElement("p");r.className="note";r.innerHTML='Written for you by Claude. <button class="btn" id="regen" style="margin-left:6px;padding:3px 9px;font-size:12.5px">Rewrite this lesson</button>';tag.after(r);document.getElementById("regen").onclick=()=>generate(L,true)}
  if(SAMPLE){const w=document.createElement("div");w.style.margin="4px 0 8px";w.innerHTML='<button type="button" class="btn sm" id="talk">Talk me through this lesson</button><span class="note" style="margin-left:8px">Tap any formula to see how to read it in words. All signs are listed under <a href="#symbols">Symbols</a>.</span><div id="talkBox"></div>';tag.after(w);
    document.getElementById("talk").onclick=e=>walkFor("The main ideas of this lesson ("+L.title+"):\n<<<\n"+String(c.md).slice(0,6000)+"\n>>>",document.getElementById("talkBox"),e.currentTarget,"5 to 8")}
  // Step 3: explain it back (self-explanation, from memory).
  ex.innerHTML=`<section class="practice"><div class="eyebrow step">Step 3 of 4 · Explain it back</div><h2>Say it in your own words</h2>
    <p class="note" style="margin:0;max-width:68ch">${L.review?"Without scrolling up, write the three most important results of this week, with one line on why each is true.":"Without scrolling up, explain today's main idea in 3–5 sentences, as if to a friend. Say it out loud or type it. Say why it's true, not just what it says. This is also practice for the oral interview."}</p>
    <div class="q"><div id="exAb"></div>
    <div class="row">${SAMPLE?'<button class="btn" id="exBtn">Get feedback</button>':'<span class="note">Then scroll up and compare: what did you leave out?</span>'}</div><div class="fb" id="exFb" hidden></div></div></section>`;
  const exAb=answerBox(document.getElementById("exAb"),{placeholder:"My explanation…",tall:true,height:240,speak:true,mode:"text",...bind(L.id,"ex")});
  const exBtn=document.getElementById("exBtn");if(exBtn)exBtn.onclick=()=>explainCheck(L,c,exBtn,exAb);
  // Step 4: closed-book practice, rated into the spaced-review deck.
  if(!hasP){pr.innerHTML="";const n=document.getElementById("doneNote");if(n){n.outerHTML='<button class="btn sm" id="doneBtn">This session has no practice · mark it done</button>';document.getElementById("doneBtn").onclick=()=>{S.done[L.id]=today();save();route()}}return}
  pr.innerHTML=`<section class="practice"><div class="eyebrow step">Step 4 of 4 · Practice, closed book</div><h2>Practice</h2><p class="note" style="margin:0;max-width:68ch">${SAMPLE?"Solve each one on the pad or in the box, then tap Check my work: your page is marked and the book answer is written next to your work. Then rate how it went: that decides when the problem comes back in your warm-up.":"Solve each one on paper or in the box before revealing. After revealing, rate how it went: that decides when the problem comes back in your warm-up."}</p>${c.practice.map((p,k)=>`
    <div class="q"><div class="qn">${L.id.toUpperCase()} · ${k+1}${k===0&&TRIED[L.id]?" · your first guess is filled in":""}</div><div class="prose" data-q></div><div data-ab></div>
      <div class="row"><button class="btn" data-rv>Show answer</button>${SAMPLE?`<button class="btn" data-ck>Check my work</button>`:""}</div>
      <div class="fb" hidden></div><div class="ans" hidden></div><div class="rate" hidden></div></div>`).join("")}</section>`;
  const cards=[...pr.querySelectorAll(".q")];
  // Done = every problem rated, whether today or on an earlier visit.
  // Extra problems asked for later are a bonus: the session is done when its own problems are.
  const allRated=()=>c.practice.slice(0,c.own||c.practice.length).every((p,k)=>S.rev[L.id+"#"+k]);
  const its=c.practice.map((p,k)=>item(cards[k],p,L.id+"#"+k,"",()=>{if(allRated())completeLesson(L)},{ans:bind(L.id,"p"+k)}));
  // More problems on this topic, as many rounds as wanted. They aim at what went badly so far.
  if(SAMPLE){
    const more=document.createElement("div");more.className="lesson-nav";more.style.marginTop="18px";
    more.innerHTML='<span class="note" style="align-self:center;max-width:46ch">Want it to sit deeper? Get more problems on this topic. They lean towards whatever went badly so far.</span><button type="button" class="btn" id="moreBtn">Write 4 more problems</button>';
    pr.querySelector("section").append(more);
    const mb=more.querySelector("#moreBtn"),note=more.querySelector(".note");
    mb.onclick=async()=>{
      mb.disabled=true;mb.textContent="Writing…";
      const weak=c.practice.map((p,k)=>({p,r:S.rev[L.id+"#"+k]})).filter(x=>x.r&&(x.r.n===0||x.r.lapses>0)).map(x=>x.p.q);
      try{
        const r=await SAMPLE.json("You write practice problems for a beginner preparing for the UZH/ETH MSc Quantitative Finance admission interview.\n\nThe lesson they just studied:\n<<<\n"+String(c.md).slice(0,6000)+"\n>>>\n\nProblems they already have (do not repeat these or simple renumberings of them):\n"+c.practice.map((p,k)=>(k+1)+". "+p.q).join("\n")+(weak.length?"\n\nThey struggled with these, so at least two of the new problems should train the same rule from another angle:\n"+weak.map(q=>"- "+q).join("\n"):"")+"\n\nWrite 4 NEW problems on this lesson's topic, ordered from easier to harder. Each trains one rule of the lesson; together they cover the rules that have had the least practice. Vary the form: a direct computation, one that has to be set up from words, one 'find the mistake in this working', one that needs two rules in a row. Each must be solvable by hand.\n\n"+String.raw`Reply with only a JSON array: [{"q": "the problem, Markdown with math in $...$", "a": "a complete worked solution, step by step, Markdown with math in $...$"}]. Double every LaTeX backslash inside the JSON strings. No HTML. Never use the dollar sign for money.`,{cache:false});
        const items=(Array.isArray(r)?r:(r&&Array.isArray(r.problems)?r.problems:[])).filter(x=>x&&x.q&&x.a).slice(0,4).map(x=>({q:String(x.q),a:String(x.a)}));
        if(!items.length)throw{code:"empty_completion"};
        await addMore(L.id,items);
        if(CUR!==L)return;
        const at=window.scrollY;showContent(L,await loadLesson(L.id));window.scrollTo(0,at);
      }catch(e){mb.disabled=false;mb.textContent="Write 4 more problems";note.textContent=e&&e.code==="invalid_json"?"The problems came back garbled. Try again.":(errText(e)||"Stopped.")}
    };
  }
  const t=TRIED[L.id];
  if(t&&typeof t==="object"&&its[0]&&!(ANS[L.id]&&ANS[L.id].b.p0)){const ab=its[0].ab;if(t.mode==="ink"&&t.strokes&&t.strokes.length){ab.set("ink");ab.ink.load(t.strokes)}else if(t.text){ab.set("text");ab.ta.value=t.text}ab.changed()}
  typesetNow(body);
}
async function explainCheck(L,c,btn,ab){
  const useInk=ab.mode==="ink"&&ab.hasInk(),mine=ab.text(),fb=document.getElementById("exFb");
  if(!useInk&&!mine){fb.hidden=false;fb.textContent="Write your explanation first. Rough is fine.";return}
  if(useInk&&!IMG){fb.hidden=false;fb.textContent="Reading handwriting isn't available in this view. Switch to Type, or scroll up and compare yourself.";return}
  btn.disabled=true;fb.hidden=false;fb.innerHTML='<span class="status">Reading your explanation…</span>';
  const prompt="You are a patient, honest math tutor for a beginner preparing for the UZH/ETH MSc Quantitative Finance admission interview.\n\nThe student just studied this lesson:\n<<<\n"+String(c.md).slice(0,7000)+"\n>>>\n\nWithout looking, they explained "+(L.review?"the key results of the week":"the main idea")+" in their own words (in English or in German; judge the content, not the language, and always reply in English)"+(useInk?", handwritten in the attached image.":":\n<<<\n"+mine+"\n>>>")+"\n\nIn under 170 words: say what they got right, name precisely anything wrong, vague or missing, and end with one 'why' question that tests real understanding (not recall). Markdown, math as $...$, no HTML, no dollar sign for money.";
  try{const o={cache:false,onText:({text})=>{fb.textContent=text}};if(useInk)o.images=[await ab.ink.toBlob()];const {text}=await SAMPLE(prompt,o);renderMD(text,fb)}
  catch(e){if(hideFor(e&&e.code))SAMPLE=null;fb.textContent=errText(e)||"Stopped."}
  finally{btn.disabled=false}
}
function showEmpty(L){
  const body=document.getElementById("body");
  const wk=WEEKS[L.w-1];
  if(SAMPLE){
    body.innerHTML=`<div class="prose"><p>This session's lesson hasn't been written yet. Claude writes it for you on demand, at your level, with worked examples and practice problems, and it stays saved here.</p></div>
    <button class="btn primary" id="genBtn">Write today's lesson</button>
    <p class="note">Takes about 30–90 seconds. Topic: ${esc(L.title)}.</p>`;
    document.getElementById("genBtn").onclick=()=>generate(L,false);
  }else{
    body.innerHTML=`<div class="prose"><p><b>Topic:</b> ${esc(L.title)}. This week: ${esc(wk[1].join(" · "))}.</p><p>Lessons from week 1 onward are written by Claude, which can't be reached right now. Until then, study this topic from the bridge book for this phase (see <a href="#books">Books</a>) and ask the tutor.</p></div>`;
  }
  document.getElementById("practice").innerHTML="";document.getElementById("explain").innerHTML="";
}
async function generate(L,regen){
  const body=document.getElementById("body");
  if(CTL)try{CTL.abort()}catch(e){}
  const ctl=new AbortController();CTL=ctl;
  body.innerHTML=`<p class="status" id="gst">Thinking… your lesson on “${esc(L.title)}” is being written.</p><div class="streaming" id="stream" hidden></div><button class="btn" id="stopBtn">Stop</button>`;
  document.getElementById("practice").innerHTML="";document.getElementById("explain").innerHTML="";
  document.getElementById("stopBtn").onclick=()=>ctl.abort();
  try{
    const {text}=await SAMPLE(lessonPrompt(L),{signal:ctl.signal,cache:false,onText:({text})=>{if(CUR!==L)return;const s=document.getElementById("stream");if(!s)return;s.hidden=false;document.getElementById("gst").textContent="Writing…";s.textContent=text.split(/===\s*PRACTICE/)[0];s.scrollTop=s.scrollHeight}});
    const obj=parseLesson(text);
    await storeLesson(L.id,obj);
    if(CUR===L)showContent(L,obj,true);
  }catch(e){
    if(CUR!==L)return;
    if(e&&e.code==="cancelled"){showEmpty(L);return}
    if(hideFor(e&&e.code))SAMPLE=null;
    showEmpty(L);
    const p=document.createElement("p");p.className="pill warn";p.textContent=errText(e);document.getElementById("body").prepend(p);
  }finally{if(CTL===ctl)CTL=null}
}

// Topic map: [id, label, column (phase), row, weeks] and "a>b" = b builds on a.
const MAPN=[["alg","Algebra & logs",0,0,[1]],["sets","Sets & proofs",0,1,[2]],["func","Functions",0,2,[3]],["seq","Sequences & binomial",0,3,[4]],
 ["lim","Limits",1,0,[5]],["der","Derivatives",1,1,[6,7]],["int","Integrals",1,2,[8,9]],["imp","Improper integrals, gamma",1,3,[10,11]],["ser","Series & Taylor",1,4,[12,13]],["multi","Several variables",1,5,[14]],
 ["vec","Vectors & matrices",2,0,[15]],["det","Determinants",2,1,[16]],["eig","Eigenvalues",2,2,[17]],["cov","Covariance, optimisation",2,3,[18]],
 ["count","Counting",3,0,[19]],["ps","Probability & Bayes",3,1,[20]],["rv","Random variables",3,2,[21]],["disc","Discrete distributions",3,3,[22]],["cont","Continuous distributions",3,4,[23,24]],["joint","Joint distributions",3,5,[25]],["mgf","Generating functions",3,6,[26]],["lln","LLN & CLT",3,7,[27]],["mc","Monte Carlo",3,8,[28]],["stat","Statistics",3,9,[29]],
 ["meas","Sigma-algebras, measure",4,0,[31]],["ce","Conditional expectation",4,1,[32]],["rw","Random walks",4,2,[33]],["mart","Martingales",4,3,[34]],["refl","Reflection & ruin",4,4,[35]],["bm","Brownian motion",4,5,[36]],
 ["ret","Returns",5,0,[38]],["micro","Microeconomics",5,1,[39,40]],["util","Utility & risk",5,2,[41]],["port","Portfolios & CAPM",5,3,[42]],["noarb","No-arbitrage pricing",5,4,[43]],["opt","Options",5,5,[44]]];
const MAPE="alg>func alg>seq sets>count sets>ps func>lim seq>lim seq>ser lim>der der>int int>imp lim>ser der>ser der>multi int>multi alg>vec vec>det det>eig eig>cov multi>cov count>disc ps>rv rv>disc rv>cont int>cont imp>cont ser>disc disc>joint cont>joint cov>joint joint>mgf ser>mgf joint>lln mgf>lln lln>mc int>mc lln>stat ps>meas meas>ce rv>ce ce>rw rw>mart mart>refl rw>bm lln>bm alg>ret der>micro micro>util rv>util util>port cov>port port>noarb ce>noarb mart>noarb noarb>opt bm>opt".split(" ").map(e=>e.split(">"));
function drawMap(){
  const host=document.getElementById("map"),info=document.getElementById("mapInfo");if(!host)return;
  const CW=200,NW=174,NH=36,RH=50,T=30,LM=30,P={},nl=nextLesson();
  MAPN.forEach(([id,label,c,r,ws])=>{P[id]={id,label,ws,x:LM+c*CW,y:T+r*RH}});
  const path=([a,b])=>{const s=P[a],t=P[b];
    if(s.x===t.x){if(t.y-s.y===RH)return `M${s.x+NW/2} ${s.y+NH}L${t.x+NW/2} ${t.y}`;const sy=s.y+NH/2,ty=t.y+NH/2;return `M${s.x} ${sy}C${s.x-24} ${sy},${s.x-24} ${ty},${t.x} ${ty}`}
    const sx=s.x+NW,sy=s.y+NH/2,tx=t.x,ty=t.y+NH/2,k=Math.max(14,(tx-sx)*.45);return `M${sx} ${sy}C${sx+k} ${sy},${tx-k} ${ty},${tx} ${ty}`};
  const st=n=>{const ls=LESSONS.filter(l=>n.ws.includes(l.w)),d=ls.filter(l=>S.done[l.id]).length;return (d===ls.length?" done":d?" part":"")+(n.ws.includes(nl.w)?" cur":"")};
  const w=LM+6*CW,h=T+10*RH;
  host.innerHTML=`<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="group" aria-label="Map of the topics and how they build on each other">
    ${PHASES.slice(0,6).map((p,i)=>`<text class="mp-h" x="${LM+i*CW}" y="16">${esc(p.n)}</text>`).join("")}
    ${MAPE.map((e,i)=>`<path class="mp-e" data-e="${i}" d="${path(e)}"/>`).join("")}
    ${MAPN.map(([id])=>{const n=P[id];return `<g class="mp-n${st(n)}" data-n="${id}" tabindex="0" role="button" aria-label="${esc(n.label)}"><rect x="${n.x}" y="${n.y}" width="${NW}" height="${NH}" rx="8"/><text x="${n.x+NW/2}" y="${n.y+NH/2+4.5}" text-anchor="middle">${esc(n.label)}</text></g>`}).join("")}</svg>`;
  let sel=null;
  const pick=id=>{
    sel=id&&sel!==id?id:null;const near=new Set(sel?[sel]:[]);
    host.querySelectorAll(".mp-e").forEach((el,i)=>{const [a,b]=MAPE[i],on=!!sel&&(a===sel||b===sel);el.classList.toggle("hi",on);if(on){near.add(a);near.add(b)}});
    host.querySelectorAll(".mp-n").forEach(g=>{g.classList.toggle("sel",g.dataset.n===sel);g.classList.toggle("dim",!!sel&&!near.has(g.dataset.n))});
    if(!sel){info.textContent="Tap a topic to see what it builds on and what it leads to. Lines run from left to right, and downwards inside a column.";return}
    const n=P[sel],need=MAPE.filter(e=>e[1]===sel).map(e=>P[e[0]].label),lead=MAPE.filter(e=>e[0]===sel).map(e=>P[e[1]].label);
    info.innerHTML=`<b>${esc(n.label)}</b> · week${n.ws.length>1?"s":""} ${n.ws.join("–")}<br>Builds on: ${need.length?esc(need.join(", ")):"nothing earlier; this is a starting point"}.<br>Leads to: ${lead.length?esc(lead.join(", ")):"the interview questions directly"}. <a href="#lesson-w${n.ws[0]}d1">Open week ${n.ws[0]} →</a>`;
  };
  host.querySelectorAll(".mp-n").forEach(g=>{g.onclick=()=>pick(g.dataset.n);g.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();pick(g.dataset.n)}}});
  pick(null);
}
function viewPlan(){
  const nl=nextLesson();
  const html=PHASES.map(ph=>{
    const rows=[];for(let w=ph.from;w<=ph.to;w++){
      const dots=[1,2,3,4,5,6].map(d=>{const l=LESSONS[IDX["w"+w+"d"+d]];return `<a class="dot ${S.done[l.id]?"on":""} ${l.id===nl.id?"cur":""}" href="#lesson-${l.id}" title="${esc(l.title)}" aria-label="Week ${w} day ${d}: ${esc(l.title)}" style="display:grid;place-items:center;text-decoration:none">${d===6?"R":d}</a>`}).join("");
      rows.push(`<div class="wk"><div class="n">W${w}</div><div class="t">${esc(WEEKS[w-1][0])} <span class="when">· from ${weekDate(w)}</span></div><div class="dots">${dots}</div></div>`);
    }
    const tot=(ph.to-ph.from+1)*6,dn=LESSONS.filter(l=>l.phase===ph.n&&S.done[l.id]).length;
    return `<section class="phase"><h2>${esc(ph.n)}</h2><div class="sub">Weeks ${ph.from}–${ph.to} · ${dn}/${tot} sessions · ${esc(ph.goal)}</div>${rows.join("")}</section>`;
  }).join("");
  V.innerHTML=`<article class="sheet"><div class="eyebrow">Your study plan</div><h1>52 weeks to the interview</h1>
   <div class="prose" style="font-size:16.5px"><p>Six sessions a week of about 45–60 minutes: five lessons and one review day. That is roughly 270 hours, which is what it takes to go from one business-math course to answering about 75% of the program's self-assessment questions comfortably.</p>
   <p><b>Timeline.</b> Starting ${fmtDate(dateOf(S.start))}, the plan ends around ${fmtDate((()=>{const d=dateOf(S.start);d.setDate(d.getDate()+52*7);return d})())}. Apply in the window that opens on 15 November 2027 (deadline 15 January 2028, if the program keeps its usual dates), interview in March 2028, start in September 2028. The current window (deadline 15 January 2027) is too soon to be ready.</p></div>
   <div class="panel" style="margin:18px 0 8px"><h3>How each session works</h3>
    <ol class="howto">
     <li><span><b>Warm-up, 5–10 min.</b> Mixed problems from older lessons, due on a 1 · 4 · 10 · 30 · 90-day schedule (spaced retrieval and interleaving).</span></li>
     <li><span><b>Try first.</b> One problem before the lesson, before you know how (pretesting).</span></li>
     <li><span><b>Lesson.</b> Intuition, then precise statements, then worked examples.</span></li>
     <li><span><b>Explain it back.</b> Today's idea in your own words, from memory (self-explanation).</span></li>
     <li><span><b>Practice, closed book.</b> Attempt, reveal, rate Forgot / Hard / Good / Easy. The rating schedules its return.</span></li>
    </ol>
    <p class="note" style="margin:10px 0 0">Readiness is checked with real interview questions in <a href="#targets">Interview set</a>, not by how ready you feel.</p></div>
   <section class="phase"><h2>How it all connects</h2><div class="sub">Every topic and what it builds on. Green is finished, the dashed box is where you are now.</div>
    <div class="mapwrap" id="map"></div><p class="note" id="mapInfo" style="margin:8px 0 0;min-height:4.4em"></p></section>
   <p class="note">Click any square to open that session. R is the weekly review day.</p>${html}</article>`;
  drawMap();
}

// S.can[topic] = "YYYY-MM-DD" when a quiz was passed, true when only self-rated (Claude unreachable).
const ALLT=TARGETS.flatMap(g=>g.items.map(it=>it[0]));
function targetStatus(t){
  const v=S.can[t];
  if(typeof v==="string"){const age=(dateOf(today())-dateOf(v))/864e5;return `<span class="pill good">Passed ${esc(fmtDate(dateOf(v)))}</span>`+(age>45?'<span class="pill warn">Re-test due</span>':"")}
  if(v===true)return '<span class="pill warn">Self-rated · not tested</span>';
  return "";
}
function targetCount(){
  const passed=ALLT.filter(t=>typeof S.can[t]==="string").length,self=ALLT.filter(t=>S.can[t]===true).length;
  const goal=Math.ceil(ALLT.length*.75);
  return `<span class="pill ${passed>=goal?"good":""}">${passed} of ${ALLT.length} passed · ${Math.round(passed/ALLT.length*100)}%</span><span>Goal: ${goal}</span>${self?`<span>${self} self-rated</span>`:""}`;
}
function viewTargets(){
  const quiz=!!SAMPLE;
  V.innerHTML=`<article class="sheet"><div class="eyebrow">Interview set</div><h1>What the interview asks</h1>
   <div class="prose" style="font-size:16.5px"><p>These are the topics of the program's <a href="https://msfinance.uzh.ch/dam/jcr:ca7ec1e1-7baa-4cda-8e23-39d0105d39a2/SelfAssessment_2023_1Nov.pdf" target="_blank" rel="noopener">self-assessment questions</a>, the same kind of questions asked in the 20-minute interview. The program suggests applying once you are comfortable with about 75% of them.</p>
   <p>${quiz?"A topic counts as ready only when you pass an interview-style question on it cold, without notes. Feeling ready isn't enough: right after studying, almost everyone overestimates what they can do. Passes older than 45 days ask for a re-test, since spacing is what makes it last.":"Quizzes need Claude, which can't be reached right now, so tick a topic when you could answer it out loud without notes."}</p></div>
   <div class="meta" id="tcount" style="margin:8px 0 4px">${targetCount()}</div>
   ${TARGETS.map(g=>`<section class="phase"><h2>${esc(g.g)}</h2>${g.items.map(([t,w],k)=>{const id="t-"+g.g.replace(/\W+/g,"").toLowerCase()+"-"+k;
     return quiz
      ? `<div class="target" data-row="${id}"><div class="tx"><div>${esc(t)}</div><div class="st">${targetStatus(t)}</div><div class="qz"></div></div><div class="side"><button class="btn sm" data-qz="${id}">Quiz me</button><a class="wref" href="#lesson-w${w}d1">Week ${w} →</a></div></div>`
      : `<div class="target"><input type="checkbox" id="${id}" data-i="${id}" ${S.can[t]?"checked":""}><label class="tx" for="${id}">${esc(t)}</label><a class="wref" href="#lesson-w${w}d1">Week ${w} →</a></div>`}).join("")}</section>`).join("")}
  </article>`;
  const topicOf={};TARGETS.forEach(g=>g.items.forEach(([t],k)=>{topicOf["t-"+g.g.replace(/\W+/g,"").toLowerCase()+"-"+k]=t}));
  V.querySelectorAll("input[data-i]").forEach(cb=>cb.onchange=()=>{const t=topicOf[cb.dataset.i];if(cb.checked){if(!S.can[t])S.can[t]=true}else delete S.can[t];save();document.getElementById("tcount").innerHTML=targetCount()});
  V.querySelectorAll("[data-qz]").forEach(b=>b.onclick=()=>runQuiz(topicOf[b.dataset.qz],b.closest(".target"),b));
}
async function runQuiz(t,row,btn){
  const box=row.querySelector(".qz");
  box.innerHTML='<div class="q"><p class="status" style="margin:0">The interviewer is picking a question…</p></div>';
  btn.disabled=true;
  const role="You are the interviewer in the 20-minute oral admission interview for the MSc Quantitative Finance jointly offered by UZH and ETH Zurich. The math part covers calculus, linear algebra, probability and statistics; there is also a finance and economics part.";
  try{
    const {text:q}=await SAMPLE(role+"\n\nAsk the candidate ONE question on this topic: "+t+"\n\nMake it the kind asked in that interview: short, answerable in a few minutes, needing a small derivation or a precise explanation in words. Vary it (seed "+Math.floor(Math.random()*1e6)+"). Output only the question. No answer, no hints, no preamble. Markdown, math as $...$, no HTML, no dollar sign for money.",{cache:false});
    box.innerHTML=`<div class="q"><div class="qn">Interview question</div><div class="prose" data-q></div>
      <textarea placeholder="Answer as you would out loud: key steps and why. No notes." style="min-height:96px"></textarea>
      <div class="row"><button class="btn primary" data-sub>Submit answer</button><button class="btn" data-new>Another question</button></div>
      <div class="fb" hidden></div></div>`;
    renderMD(q,box.querySelector("[data-q]"));
    const ta=box.querySelector("textarea"),fb=box.querySelector(".fb"),sub=box.querySelector("[data-sub]");
    box.querySelector("[data-new]").onclick=()=>runQuiz(t,row,btn);
    sub.onclick=async()=>{
      const a=ta.value.trim();if(!a){fb.hidden=false;fb.textContent="Write your answer first.";return}
      sub.disabled=true;fb.hidden=false;fb.innerHTML='<span class="status">Grading…</span>';
      try{
        const {text}=await SAMPLE(role+"\n\nTopic: "+t+"\n\nYour question:\n"+q+"\n\nCandidate's answer:\n"+a+"\n\nGrade it as the interviewer would. The FIRST line must be exactly 'VERDICT: PASS' or 'VERDICT: NOT YET'. PASS only if the answer is correct and the reasoning would satisfy you in the interview; small notation slips are fine, missing the key idea is not. Then, in under 160 words: what was right, what was wrong or missing, and the core of a full answer. Markdown, math as $...$, no HTML, no dollar sign for money.",{cache:false});
        const pass=/^\s*\**\s*VERDICT:\s*PASS/i.test(text);
        renderMD(text.replace(/^\s*\**\s*VERDICT:[^\n]*\n?/i,""),fb);
        const v=document.createElement("p");v.style.margin="0 0 6px";v.innerHTML=pass?'<span class="pill good">Pass</span>':'<span class="pill warn">Not yet</span> <span class="note">Review week material, then try another question in a few days.</span>';fb.prepend(v);
        if(pass){S.can[t]=today();save();row.querySelector(".st").innerHTML=targetStatus(t);document.getElementById("tcount").innerHTML=targetCount()}
      }catch(e){if(hideFor(e&&e.code))SAMPLE=null;fb.textContent=errText(e)||"Stopped."}
      finally{sub.disabled=false}
    };
  }catch(e){if(hideFor(e&&e.code))SAMPLE=null;box.innerHTML="";const p=document.createElement("p");p.className="pill warn";p.textContent=errText(e);box.append(p)}
  finally{btn.disabled=false}
}

function viewBooks(){
  V.innerHTML=`<article class="sheet"><div class="eyebrow">Books</div><h1>What to get</h1>
   <div class="panel" style="background:var(--accent-soft);border-color:transparent"><h3 style="color:var(--accent)">Buy these five</h3><ol style="margin:0;padding-left:20px">${BUY.map(b=>`<li>${esc(b)}</li>`).join("")}</ol><p class="note" style="margin:8px 0 0">Plus a free calculus text for weeks 5–14. Check the edition before buying: get the latest edition listed below.</p></div>
   ${BOOKS.map(s=>`<section class="phase"><h2>${esc(s.h)}</h2><div class="sub">${esc(s.note)}</div>${s.list.map(b=>`<div class="book"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline"><span class="bt">${esc(b.t)}</span><span class="tag ${/Free/.test(b.tag)?"off":""}">${esc(b.tag)}</span></div><div class="ba">${esc(b.a)}</div><div class="why">${esc(b.why)}${b.link?` <a href="${b.link}" target="_blank" rel="noopener">Open</a>`:""}</div></div>`).join("")}</section>`).join("")}
   <p class="note" style="margin-top:22px">Source for the first list: the program's <a href="https://msfinance.uzh.ch/en/admission/eligibilityandprerequisites.html" target="_blank" rel="noopener">eligibility and prerequisites page</a>.</p>
  </article>`;
}

/* ---------------- Notation in words ---------------- */
// Each sign: [TeX, how to say it, what it means, how to spot it in a lesson's TeX, a small example to read].
// The fourth entry lets a lesson explain a sign on the spot the first time it shows up (see notationBoxes).
const SYMS=[
 [String.raw`\sum_{k=1}^{n} a_k`,"the sum of a k, for k from 1 to n","Add up all the terms. The sign is a capital Greek sigma. Below it is where the counter k starts, above it where it stops.",/\\sum/,String.raw`$\sum_{k=1}^{3} k^2 = 1+4+9 = 14$`],
 [String.raw`\prod_{k=1}^{n} a_k`,"the product of a k, for k from 1 to n","Multiply all the terms. The sign is a capital Greek pi.",/\\prod/,String.raw`$\prod_{k=1}^{4} k = 1\cdot2\cdot3\cdot4 = 24$`],
 [String.raw`n!`,"n factorial","1 times 2 times 3, up to n.",/[\w)}]\s*!/,String.raw`$4! = 4\cdot3\cdot2\cdot1 = 24$`],
 [String.raw`\binom{n}{k}`,"n choose k","The number of ways to pick k things out of n, when the order does not matter.",/\\binom|\\choose/,String.raw`$\binom{4}{2}=6$: there are six ways to pick 2 people out of 4`],
 [String.raw`x \in A`,"x is in A, or x is an element of A","x is one of the things in the set A.",/\\in(?![a-zA-Z])/,String.raw`$3 \in \{1,2,3\}$ is true, $5 \in \{1,2,3\}$ is false`],
 [String.raw`A \subseteq B`,"A is a subset of B","Everything in A is also in B.",/\\subseteq|\\subset(?![a-z])/,String.raw`$\{1,2\} \subseteq \{1,2,3\}$`],
 [String.raw`A \cup B`,"A union B","Everything that is in A or in B, or in both.",/\\cup(?![a-z])/,String.raw`$\{1,2\} \cup \{2,3\} = \{1,2,3\}$`],
 [String.raw`A \cap B`,"A intersect B","Only what is in both A and B.",/\\cap(?![a-z])/,String.raw`$\{1,2\} \cap \{2,3\} = \{2\}$`],
 [String.raw`A^{\mathsf c},\ \emptyset`,"A complement; the empty set","Everything not in A; the set with nothing in it.",/\\emptyset|\\varnothing|\^\{\\mathsf c\}|\^c(?![a-z])/,""],
 [String.raw`\mathbb{R},\ \mathbb{N}`,"the real numbers; the natural numbers","All numbers on the number line; the counting numbers 1, 2, 3 and so on.",/\\mathbb\{[RNZQ]\}/,String.raw`$\sqrt2 \in \mathbb{R}$, but $\sqrt2 \notin \mathbb{N}$`],
 [String.raw`\forall x`,"for all x","The statement that follows holds for every single x, with no exception. One counterexample makes it false.",/\\forall/,String.raw`$\forall x \in \mathbb{R}:\ x^2 \ge 0$. Read: for all real x, x squared is at least zero`],
 [String.raw`\exists x`,"there exists an x","At least one such x can be found. It does not say which one, or how many.",/\\exists/,String.raw`$\exists x \in \mathbb{R}:\ x^2 = 2$. Read: there is a real x whose square is 2`],
 [String.raw`\Rightarrow,\ \iff`,"implies; if and only if","One arrow: if the left side is true, then the right side is true too (it says nothing when the left is false). Double arrow: each side forces the other, so both are true or both are false.",/\\Rightarrow|\\implies|\\iff|\\Leftrightarrow|\\Longrightarrow/,String.raw`$x=2 \Rightarrow x^2=4$ is true, but not the other way round, because $x=-2$ also works. $x^2=4 \iff x=2 \text{ or } x=-2$`],
 [String.raw`f: A \to B`,"f from A to B","A function that takes inputs from the set A and gives outputs in the set B. A is the domain, B the codomain.",/:\s*[^$]*\\to(?![a-z])|\\colon/,String.raw`$\ln:(0,\infty)\to\mathbb{R}$: the log takes positive numbers and returns real numbers`],
 [String.raw`x \mapsto x^2`,"x maps to x squared",String.raw`The rule of a function: on the left what goes in, on the right what comes out. The arrow with the small bar is about single values; the plain arrow in $f:A\to B$ is about whole sets.`,/\\mapsto/,String.raw`$x \mapsto x^2$ sends 3 to 9 and $-3$ to 9`],
 [String.raw`|x|`,"the absolute value of x","The size of x without its sign: its distance from zero. $|x-a|$ is the distance between x and a.",/\|[^|$]+\|/,String.raw`$|-3| = 3$, and $|x-5|<1$ means x is between 4 and 6`],
 [String.raw`\approx,\ \neq,\ \le,\ \propto`,"approximately equal; not equal; less than or equal to; proportional to","",/\\approx|\\neq|\\le(?![a-zA-Z])|\\leq(?![a-z])|\\ge(?![a-zA-Z])|\\geq(?![a-z])|\\propto/,""],
 [String.raw`\infty`,"infinity","Larger than any number. Not a number itself: it says that something grows without bound.",/\\infty/,""],
 [String.raw`\lim_{x\to a} f(x)`,"the limit of f of x as x goes to a","The value f of x gets close to when x gets close to a.",/\\lim(?![a-z])/,String.raw`$\lim_{n\to\infty}\frac1n = 0$`],
 [String.raw`\varepsilon,\ \delta`,"epsilon; delta","Greek letters used for very small positive numbers.",/\\varepsilon|\\epsilon|\\delta/,""],
 [String.raw`\Delta x`,"delta x","A change in x. Capital Greek delta.",/\\Delta/,String.raw`from $x=2$ to $x=5$: $\Delta x = 3$`],
 [String.raw`f'(x),\ \frac{df}{dx}`,"f prime of x; d f d x","The derivative: how fast f changes when x changes.",/[a-zA-Z]'|\\frac\{d[a-zA-Z]?\}\{d[a-zA-Z]\}/,String.raw`$f(x)=x^2 \Rightarrow f'(x)=2x$`],
 [String.raw`\frac{\partial f}{\partial x}`,"partial f, partial x","The derivative with respect to x while the other variables stay fixed.",/\\partial/,""],
 [String.raw`\int_a^b f(x)\,dx`,"the integral from a to b of f of x, d x","The area under the curve of f between a and b.",/\\int/,String.raw`$\int_0^1 x\,dx = \frac12$`],
 [String.raw`e^x,\ \ln x`,"e to the x; the natural log of x","The exponential function and its inverse. In this course, log always means the natural log.",/e\^|\\ln(?![a-z])|\\exp(?![a-z])/,String.raw`$\ln(e^3) = 3$`],
 [String.raw`\mathbf{A}^{\top},\ \mathbf{A}^{-1},\ \det \mathbf{A}`,"A transpose; A inverse; the determinant of A","Rows and columns swapped; the matrix that undoes A; one number that tells whether A can be inverted.",/\\top(?![a-z])|\\mathbf\{[A-Z]\}\^\{-1\}|\\det(?![a-z])/,""],
 [String.raw`\Omega,\ \omega`,"capital omega; omega","The sample space, meaning all possible outcomes; one single outcome.",/\\Omega|\\omega/,String.raw`one die: $\Omega=\{1,2,3,4,5,6\}$`],
 [String.raw`P(A \mid B)`,"the probability of A given B","How likely A is once you know B happened. The bar is read as given.",/P\([^)$]*(\\mid|\|)/,""],
 [String.raw`E[X]`,"the expected value of X, or E of X","The long-run average of the random variable X.",/E\[/,String.raw`a fair die: $E[X]=3.5$`],
 [String.raw`\operatorname{Var}(X),\ \sigma^2`,"the variance of X; sigma squared","How spread out X is around its mean.",/\\operatorname\{Var\}|\\mathrm\{Var\}|\\text\{Var\}|\\sigma\^2/,""],
 [String.raw`\mu,\ \sigma,\ \lambda`,"mu; sigma; lambda","Greek letters: usually the mean, the standard deviation, and a rate.",/\\mu(?![a-z])|\\sigma(?![a-z])|\\lambda/,""],
 [String.raw`X \sim N(\mu,\sigma^2)`,"X is distributed normal with mean mu and variance sigma squared","The wavy line is read as: is distributed as.",/\\sim(?![a-z])/,""],
 [String.raw`\Gamma(a)`,"gamma of a","The gamma function. Capital Greek gamma.",/\\Gamma/,""],
 [String.raw`\mathcal{F}`,"script F","A sigma-algebra: the collection of events you can assign a probability to.",/\\mathcal\{[FG]\}/,""],
 [String.raw`E[X \mid \mathcal{G}]`,"the conditional expectation of X given G","The best guess of X using only the information in G.",/E\[[^\]$]*\\mid/,""]
];
function viewSymbols(){
  V.innerHTML=`<article class="sheet"><div class="eyebrow">Symbols</div><h1>How to read the signs</h1>
   <p class="note" style="margin:0;max-width:68ch">Each sign with the words you say when you read it aloud.${SAMPLE?" In lessons, tap any formula to have that exact formula read out in words.":""}</p>
   <div class="syms">${SYMS.map(([t,say,what])=>`<div class="sym"><div class="prose st">$${t}$</div><div><div class="say">“${esc(say)}”</div>${what?`<div class="note">${esc(what)}</div>`:""}</div></div>`).join("")}</div></article>`;
  typesetNow(V);
}
const WORDS={};
function texOf(node){try{for(const it of MathJax.startup.document.math){if(it.typesetRoot===node)return String(it.math||"")}}catch(e){}return ""}
document.getElementById("view").addEventListener("click",async e=>{
  if(!SAMPLE||!e.target.closest)return;
  const m=e.target.closest("mjx-container");
  if(!m||!m.closest(".prose,.ans")||m.closest(".ink,.inwords,.bstep,.syms,button,a,summary"))return;
  const tex=texOf(m);if(!tex)return;
  const host=m.closest("p,blockquote,table,ul,ol,h2,h3")||m;
  const old=host.nextElementSibling;
  if(old&&old.classList.contains("inwords")){const same=old.dataset.tex===tex;old.remove();if(same)return}
  const n=document.createElement("div");n.className="inwords";n.dataset.tex=tex;n.textContent="Reading it…";host.after(n);
  try{
    const txt=WORDS[tex]||(WORDS[tex]=String((await SAMPLE("Read this mathematical expression aloud for a beginner who finds notation hard. First the whole expression in plain English words, exactly as you would say it. Then, on a new line starting with 'Signs:', name each sign or piece of notation a beginner may not know and say in a few words what it means. At most 60 words in total. Plain text only: no LaTeX, no Markdown, and no mathematical symbols in the spoken part.\n\nExpression (LaTeX): "+tex,{modelTier:"quick"})).text||"").trim());
    if(!n.isConnected)return;
    n.textContent="";const b=document.createElement("b");b.textContent="In words: ";n.append(b,document.createTextNode(txt));
    if(TTS){const p=document.createElement("button");p.type="button";p.className="btn sm";p.style.marginLeft="8px";p.textContent="▶ Say it";p.onclick=()=>{if(TTS)TTS.speak(txt.slice(0,1900)).catch(()=>{})};n.append(p)}
  }catch(err){if(hideFor(err&&err.code)){SAMPLE=null;document.body.classList.remove("canread")}n.textContent=errText(err)||"Couldn't read it. Tap the formula again."}
});

const TURNS=[];
function viewTutor(){
  const L=nextLesson();
  V.innerHTML=`<div class="grid"><article class="sheet"><div class="eyebrow">Tutor</div><h1>Ask anything</h1>
   <p class="note" style="margin:0">Stuck on a step, want another example, or want to be quizzed? The tutor knows you're on <b>${esc(L.title)}</b> (week ${L.w}).</p>
   <div class="chat" id="chat"></div>
   <div id="tutorBox"></div></article>${sidebar(L)}</div>`;
  const chat=document.getElementById("chat");
  if(!TURNS.length){const m=document.createElement("div");m.className="msg ai";m.innerHTML='<div class="prose">Hi! Ask me to explain today\'s topic differently, check a proof, or quiz you. Example: <i>“Why is the derivative of xⁿ equal to n·xⁿ⁻¹? Show me from the definition.”</i></div>';chat.append(m)}
  TURNS.forEach(t=>addMsg(t.role,t.content));
  const box=document.getElementById("tutorBox");
  if(!SAMPLE){box.innerHTML='<p class="note">The tutor cannot reach Claude right now. Reload the page in a moment.</p>';return}
  box.innerHTML='<div class="composer"><textarea id="tutorIn" placeholder="Type a question… (math like x^2 or $\\int_0^1 x\\,dx$ is fine)"></textarea><button class="btn primary" id="sendBtn">Send</button></div>';
  const inp=document.getElementById("tutorIn"),btn=document.getElementById("sendBtn");
  inp.addEventListener("keydown",e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();btn.click()}});
  btn.onclick=async()=>{
    const q=inp.value.trim();if(!q)return;
    inp.value="";TURNS.push({role:"user",content:q});addMsg("user",q);
    const el=addMsg("assistant","");el.innerHTML='<span class="status">Thinking…</span>';btn.disabled=true;
    const rules="You are a friendly, rigorous tutor helping a beginner (one business-math course at WU Vienna) prepare for the UZH/ETH MSc Quantitative Finance admission interview. They are currently on week "+L.w+" ("+WEEKS[L.w-1][0]+"), topic: "+L.title+". Explain step by step in plain language, then precisely. When useful, end with one short question to check understanding. Markdown with math as $...$ and $$...$$, no HTML, no dollar sign for money.";
    const ctl=new AbortController();CTL=ctl;
    try{const {text}=await SAMPLE([{role:"user",content:rules},...TURNS.slice(-12)],{cache:false,signal:ctl.signal,onText:({text})=>{el.textContent=text}});TURNS.push({role:"assistant",content:text});renderMD(text,el)}
    catch(e){TURNS.pop();if(hideFor(e&&e.code))SAMPLE=null;el.textContent=errText(e)||"Stopped."}
    finally{btn.disabled=false;if(CTL===ctl)CTL=null}
  };
}
function addMsg(role,content){
  const chat=document.getElementById("chat");if(!chat)return document.createElement("div");
  const m=document.createElement("div");m.className="msg "+(role==="user"?"me":"ai");
  const p=document.createElement("div");p.className="prose";m.append(p);chat.append(m);
  if(role==="user")p.textContent=content;else if(content)renderMD(content,p);
  return p;
}

/* ---------------- Training: fresh problems on demand, practice or timed test ---------------- */
function trainTopic(v){
  if(v==="mix"){const ws=[...new Set(LESSONS.filter(l=>S.done[l.id]).map(l=>l.w))];return{label:"Mix of finished weeks",text:"a shuffled mix across these topics the student has already studied: "+ws.map(w=>WEEKS[w-1][0]+" ("+WEEKS[w-1][1].join(", ")+")").join("; ")+". Spread the problems across different topics and don't group them."}}
  if(v==="mock"){const pool=ALLT.slice().sort(()=>Math.random()-.5).slice(0,8);return{label:"Mock interview",text:"a mock admission interview: one question each on different topics from this list: "+pool.join("; ")+". Mix calculus, probability and finance"}}
  if(v[0]==="w"){const w=+v.slice(1);return{label:"Week "+w+" · "+WEEKS[w-1][0],text:"week "+w+" of the course, "+WEEKS[w-1][0]+": "+WEEKS[w-1][1].join("; ")}}
  const t=ALLT[+v.slice(1)];return{label:t,text:"the interview topic: "+t};
}
const LVL={warm:"easy, to build confidence: one or two steps each",exam:"at the level of the admission interview: short, but needing a small derivation or a precise explanation in words",hard:"harder than the interview: multi-step, combining ideas, including one short proof"};
function viewTrain(){
  const tok={};CUR=tok;
  const L=nextLesson(),done=new Set(LESSONS.filter(l=>S.done[l.id]).map(l=>l.w)).size;
  V.innerHTML=`<div class="grid"><article class="sheet"><div class="eyebrow">Training</div><h1>Test yourself</h1>
   <p class="note" style="margin:0;max-width:68ch">Fresh problems on any topic, as many rounds as you like. <b>Practice</b> checks each answer as you go. <b>Timed test</b> gives no hints and grades everything at the end, like the interview. Anything you miss joins your spaced review.</p>
   <div class="trainform">
    <label>Topic<select id="tTopic">${done?`<option value="mix">Mix of everything I've finished</option>`:""}<option value="mock">Mock interview · mixed topics</option>
     <optgroup label="One week">${WEEKS.map((w,i)=>`<option value="w${i+1}"${!done&&i+1===L.w?" selected":""}>Week ${i+1} · ${esc(w[0])}</option>`).join("")}</optgroup>
     <optgroup label="One interview topic">${ALLT.map((t,i)=>`<option value="t${i}">${esc(t)}</option>`).join("")}</optgroup></select></label>
    <label>Level<select id="tLvl"><option value="warm">Warm-up</option><option value="exam" selected>Interview level</option><option value="hard">Hard</option></select></label>
    <label>Problems<select id="tN"><option>3</option><option selected>5</option><option>8</option></select></label>
    <label>Mode<select id="tMode"><option value="practice">Practice</option><option value="test">Timed test</option></select></label>
    <button type="button" class="btn primary" id="tGo">Start</button></div>
   <div id="drill"></div></article>${sidebar(L)}</div>`;
  const go=document.getElementById("tGo"),drill=document.getElementById("drill");
  if(!SAMPLE){go.disabled=true;drill.innerHTML='<p class="note">Training writes new problems with Claude, which cannot be reached right now. Reload the page in a moment.</p>';return}
  go.onclick=()=>startDrill(tok);
}
async function startDrill(tok){
  const v=document.getElementById("tTopic").value,lvl=document.getElementById("tLvl").value,n=+document.getElementById("tN").value,mode=document.getElementById("tMode").value;
  const T=trainTopic(v),drill=document.getElementById("drill"),go=document.getElementById("tGo");
  go.disabled=true;drill.innerHTML=`<p class="status" style="margin-top:18px">Writing ${n} problems…</p>`;
  try{
    const r=await SAMPLE.json("You write practice problems for a student preparing for the UZH/ETH MSc Quantitative Finance admission interview (background: one business-math course, now studying daily).\n\nWrite "+n+" new problems on "+T.text+".\nDifficulty: "+LVL[lvl]+".\nVary the type: computations, a short proof, and 'explain why' questions like the oral interview asks. Each must be solvable by hand on paper.\n\n"+String.raw`Reply with only a JSON array: [{"q": "the problem, Markdown with math in $...$", "a": "a complete worked solution, Markdown with math in $...$", "topic": "short topic label"}]. No HTML. Never use the dollar sign for money.`,{cache:false});
    if(CUR!==tok)return;
    const arr=(Array.isArray(r)?r:(r&&Array.isArray(r.problems)?r.problems:[])).filter(x=>x&&x.q&&x.a).slice(0,n).map(x=>({q:String(x.q),a:String(x.a),topic:String(x.topic||T.label)}));
    if(!arr.length)throw{code:"empty_completion"};
    renderDrill(tok,arr,mode,T.label);
  }catch(e){if(CUR!==tok)return;if(hideFor(e&&e.code))SAMPLE=null;drill.innerHTML="";const p=document.createElement("p");p.className="pill warn";p.style.marginTop="18px";p.textContent=e&&e.code==="invalid_json"?"The problems came back garbled. Try again.":errText(e);drill.append(p)}
  finally{go.disabled=false}
}
function renderDrill(tok,arr,mode,label){
  const drill=document.getElementById("drill"),test=mode==="test";
  drill.innerHTML=`<div class="drillhead"><div><span class="pill">${test?"Timed test":"Practice"} · ${arr.length} problems</span> <span class="note" data-lbl></span></div>${test?'<span class="timer" id="tTimer"></span>':""}</div><div data-items></div>
   ${test?'<div class="lesson-nav"><div class="note">Answers stay hidden until you finish.</div><button type="button" class="btn primary" id="tFinish">Finish and grade</button></div>':""}<div id="tResult"></div>`;
  drill.querySelector("[data-lbl]").textContent=label;
  const host=drill.querySelector("[data-items]");
  const its=arr.map((p,k)=>{
    const d=document.createElement("div");d.className="q";
    d.innerHTML=`<div class="qn">${k+1} of ${arr.length}${test?"":" · "+esc(p.topic)}</div><div class="prose" data-q></div><div data-ab></div>
     ${test?"":`<div class="row"><button class="btn" data-rv>Show answer</button><button class="btn" data-ck>Check my work</button></div>`}<div class="fb" hidden></div><div class="ans" hidden></div><div class="rate" hidden></div>`;
    host.append(d);
    // Practice: a wrong check sends it to review at once; a reveal lets you rate it in.
    let cid=null;
    return item(d,p,test?null:()=>cid||(cid=bankAdd(p,false)),"Topic: "+p.topic,null,{onVerdict:r=>{if(r.verdict!=="correct"&&!cid){cid=bankAdd(p,true);updateStats()}}});
  });
  if(!test)return;
  const end=Date.now()+arr.length*4*60000,tm=document.getElementById("tTimer"),fin=document.getElementById("tFinish");
  let over=false,iv=0;
  const tick=()=>{if(CUR!==tok||over){clearInterval(iv);return}const s=Math.max(0,Math.round((end-Date.now())/1000));tm.textContent=Math.floor(s/60)+":"+String(s%60).padStart(2,"0");tm.classList.toggle("low",s<60);if(s<=0)finish(true)};
  async function finish(timeUp){
    if(over)return;over=true;clearInterval(iv);fin.disabled=true;fin.textContent="Grading…";
    let score=0;
    for(let k=0;k<arr.length;k++){
      if(CUR!==tok)return;
      const it=its[k];let r=null;
      if(it.ab.has())r=await checkWork(arr[k],it.ab,it.fb,null);else{it.fb.hidden=false;it.fb.textContent="No answer given."}
      const v=r&&r.verdict;score+=v==="correct"?1:v==="partly"?.5:0;
      if(v!=="correct")bankAdd(arr[k],true);
      it.reveal();
    }
    updateStats();fin.textContent="Graded";
    const res=document.getElementById("tResult");
    res.innerHTML=`<div class="panel" style="margin-top:18px"><h3>Result${timeUp?" · time ran out":""}</h3><div class="score">${score} / ${arr.length}</div><p class="note" style="margin:6px 0 0">${score>=arr.length*.75?"At or above the 75% mark the program suggests.":"Below the 75% mark the program suggests."} Everything you missed is in your spaced review from tomorrow.</p></div>`;
    res.scrollIntoView({block:"nearest",behavior:"smooth"});
  }
  fin.onclick=()=>finish(false);
  iv=setInterval(tick,1000);tick();
}

/* ---------------- Voice control in the header ---------------- */
function hookVoice(t){
  TTS=t;
  t.onLine(e=>{if(PLAYER&&e.id!=null)PLAYER.at(+e.id)});
  t.onState(e=>{if(PLAYER)PLAYER.state(e.state)});
}
function voiceUI(t){
  const btn=document.getElementById("voiceBtn"),lbl=document.getElementById("voiceLbl"),pop=document.getElementById("voicePop");
  const WORD={ready:"Natural voice",starting:"Voice starting…",stopping:"Voice stopping…",off:"Device voice"};
  function paint(){
    const i=t.info(),st=i.enabled?i.state:"off";
    btn.dataset.state=st;lbl.textContent=WORD[st]||"Voice";
    if(pop.hidden)return;
    const about=!i.enabled?"The natural voice isn't set up on this server, so explanations are read in this device's own voice."
      :st==="ready"?`The natural voice is on${i.device?" ("+i.device+")":""}. It switches itself off after ${i.idleMinutes} minutes without speech.`
      :st==="starting"?"Starting a GPU session on Colab. This usually takes one to three minutes, longer when Colab is busy. Until then this device's voice reads, and everything else works as usual."
      :st==="stopping"?"Releasing the GPU…"
      :"Explanations are read in this device's own voice. The natural voice runs on a Colab GPU and uses roughly 2 compute units per hour while it is on.";
    const voices=t.list(),cur=t.current(),rate=t.rate();
    pop.innerHTML=`<h3>Tutor voice</h3><p></p>${i.error?'<p class="pill warn" data-err></p>':""}
      <div class="row">${!i.enabled?"":st==="off"?'<button type="button" class="btn sm primary" data-start>Start natural voice</button>':st==="ready"||st==="starting"?'<button type="button" class="btn sm" data-stop>Switch it off</button>':""}
</div>
      ${voices.length>1?`<label class="vrow"><span>Voice</span><select data-nat aria-label="Voice">${voices.map(n=>`<option value="${esc(n)}"${n===cur?" selected":""}>${esc(t.label(n))}</option>`).join("")}</select></label>`:""}
      <label class="vrow"><span>Speed</span><select data-rate aria-label="Speed">${[[0.85,"Slower"],[1,"Normal"],[1.2,"Faster"]].map(([v,n])=>`<option value="${v}"${v===rate?" selected":""}>${n}</option>`).join("")}</select></label>
      ${i.enabled?`<label><input type="checkbox" data-auto ${t.auto()?"checked":""}><span>Start the natural voice by itself when I begin studying</span></label>`:""}
      <div class="foot"><span class="note">Signed in</span><button type="button" class="btn sm" data-out>Sign out</button></div>`;
    pop.querySelector("p").textContent=about;
    const er=pop.querySelector("[data-err]");if(er)er.textContent="The natural voice didn't start. Colab may have no GPU free right now. This device's voice reads instead; try again in a few minutes.";
    const on=(sel,ev,f)=>{const el=pop.querySelector(sel);if(el)el.addEventListener(ev,f)};
    on("[data-start]","click",()=>{t.prime();t.startSession()});
    on("[data-stop]","click",()=>t.stopSession());
    on("[data-nat]","change",e=>t.setVoice(e.target.value));
    on("[data-rate]","change",e=>t.setRate(+e.target.value));
    on("[data-auto]","change",e=>t.setAuto(e.target.checked));
    on("[data-out]","click",()=>Platform.logout());
  }
  // The menu hangs under its button but never leaves the window, wherever the header has wrapped the button to.
  const place=()=>{const r=btn.getBoundingClientRect(),w=pop.offsetWidth;pop.style.left=Math.max(10,Math.min(window.innerWidth-w-10,r.right-w))+"px";pop.style.top=(r.bottom+8)+"px"};
  const open=o=>{pop.hidden=!o;btn.setAttribute("aria-expanded",String(o));if(o){t.refresh();paint();place()}};
  window.addEventListener("resize",()=>{if(!pop.hidden)place()});
  btn.onclick=()=>open(pop.hidden);
  document.addEventListener("pointerdown",e=>{if(!pop.hidden&&!e.target.closest(".voicebox"))open(false)});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!pop.hidden){open(false);btn.focus()}});
  t.onInfo(paint);paint();
  // "Once I'm using the app": the first tap or key press of a visit brings the natural voice up, if that is switched on.
  let used=false;
  const wake=()=>{if(used&&t.mayWake())t.startSession()};
  const first=()=>{used=true;wake()};
  ["pointerdown","keydown"].forEach(ev=>document.addEventListener(ev,first,{once:true,capture:true}));
  t.refresh().then(wake);
}

/* ---------------- Boot ---------------- */
(async function connect(){
  const voice=Platform.makeVoice();hookVoice(voice);voiceUI(voice);
  const dict=Platform.makeDictation();
  if(dict){DICT=dict;
    dict.onFinal(e=>{const t=DICT_T;if(!t)return;t.ta.value=t.ta.value?t.ta.value+e.text:String(e.text).replace(/^\s+/,"");t.ta.dispatchEvent(new Event("input"))});
    dict.onPartial(e=>{if(DICT_T)DICT_T.live.textContent=e.text});
    dict.onState(e=>{const t=DICT_T;if(!t)return;
      t.btn.textContent=e.state==="listening"?"■ Stop":e.state==="starting"?"Starting…":e.state==="finishing"?"Finishing…":"● Speak my answer";
      t.btn.classList.toggle("on",e.state==="listening");if(e.state==="idle")t.live.textContent=""});
  }
  SAMPLE=Platform.sample;IMG={max:4};document.body.classList.add("canread");
  COL=Platform.store;SYNC="account";
  route();
  // Progress lives on the server, so the iPad and the desktop see the same thing; this browser keeps a copy for speed.
  try{
    for(const k in ANS)delete ANS[k];
    const snap=await Promise.race([COL.doc("progress").get(),new Promise((_,r)=>setTimeout(()=>r({code:"timeout"}),10000))]);
    const sd=snap.exists?snap.data():null;
    // Draw the page again only if the server knew something this browser did not: a second render would
    // wipe whatever is being written at that moment.
    const before=JSON.stringify(S);
    if(sd&&sd.r===RESET){S=mergeState(S,sd);lsSet(LKEY,JSON.stringify(S))}
    const changed=JSON.stringify(S)!==before;
    await save();
    try{const b=await COL.doc("drillbank").get();const d=b.exists?b.data():null;if(d&&d.r===RESET){BANK.items=Object.assign({},d.items||{},BANK.items);lsSet(BKEY,JSON.stringify(BANK))}else if(b.exists||Object.keys(BANK.items).length)saveBank()}catch(e){}
    if(changed)route();else updateStats();
  }catch(e){SYNC="device"}
})();
