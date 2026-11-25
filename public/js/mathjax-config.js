// MathJax setup. \class (html) marks the piece of a formula a spoken sentence is about. The colour extension is loaded up front: left to load on first use, two overlapping
// typesets could leave \textcolor broken for the rest of the visit.
window.MathJax={loader:{load:["[tex]/color","[tex]/html"]},tex:{inlineMath:[["$","$"]],displayMath:[["$$","$$"]],packages:{"[+]":["color","html"]}},svg:{fontCache:"global"},
  startup:{typeset:false,ready(){MathJax.startup.defaultReady();MathJax.startup.promise.then(()=>{typesetNow(document.getElementById("main"))})}}};
// Typesets run one after another, never side by side.
let typesetQueue=Promise.resolve();
function typesetNow(el){try{if(window.MathJax&&MathJax.typesetPromise&&el)typesetQueue=typesetQueue.then(()=>MathJax.typesetPromise([el])).catch(()=>{})}catch(e){}}
