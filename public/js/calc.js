/* The pocket calculator behind the writing pad's "= Calc" button.
   Calc.evaluate("1000*1.04^3 =") -> {ok:true, value, text} | {ok:false, error}
   Claude only transcribes the handwriting; the arithmetic happens here, the same way every time.
   A small recursive-descent parser: nothing is ever handed to eval or Function.

   What it reads: + - * / (also · × ÷ : and a fraction as (a)/(b)), ^ and ** for powers, ( ) [ ] { }, implicit products like 2(3+4) or 2pi,
   decimal points and decimal commas (1,04 = 1.04; 1,000 and 1'000 and 1.000.000 are thousands; 1.000,5 = 1000.5), 1.5e3, 5% (= 0.05),
   sqrt(x) √x cbrt(x) root(n,x), ln(x), log(x) (natural, as in this course), log10(x) lg(x) log2(x) log_b(x), exp(x), e, pi,
   n!, C(n,k) = nCr(n,k) = binom(n,k) = "n choose k", nPr(n,k), sin cos tan (radians; 30° is degrees) and asin acos atan, abs(x) and |x|.
   A trailing "=" is dropped, and of "a = b = c =" only c is worked out. */
const Calc=(()=>{
  class CalcError extends Error{}
  const fail=m=>{throw new CalcError(m)};
  const SUP={"⁰":"0","¹":"1","²":"2","³":"3","⁴":"4","⁵":"5","⁶":"6","⁷":"7","⁸":"8","⁹":"9","⁻":"-","⁺":"+"};
  const UNSUP=Object.fromEntries(Object.entries(SUP).map(([k,v])=>[v,k]));
  const ARGS={c:2,ncr:2,binom:2,choose:2,npr:2,root:2}; // functions that take two values
  const near=x=>Math.abs(x-Math.round(x))<1e-9;

  // Written forms and a little LaTeX, brought down to one plain alphabet.
  function norm(src){
    let s=String(src==null?"":src);
    if(s.length>400)fail("That is too long for the calculator.");
    s=s.replace(/\\(?:left|right|displaystyle|,|;|!|:|quad|qquad)(?![a-zA-Z])|\$/g," ").replace(/\\(?:cdot|times|ast)(?![a-zA-Z])/g,"*").replace(/\\div(?![a-zA-Z])/g,"/").replace(/\\%/g,"%").replace(/\\([a-zA-Z]+)/g," $1 ")
      .replace(/[−–—‒﹣－]/g,"-").replace(/[×·∙⋅•∗✕]/g,"*").replace(/\*\*/g,"^").replace(/[÷∕⁄:]/g,"/")
      .replace(/[π𝜋]/g," pi ").replace(/≈|≅/g,"=").replace(/[’‘ʼ]/g,"'").replace(/[{]/g,"(").replace(/[}]/g,")").replace(/\s+/g," ")
      .replace(/[⁰¹²³⁴-⁹⁻⁺]+/g,m=>"^("+[...m].map(c=>SUP[c]).join("")+")");
    s=s.replace(/[=\s]+$/,"");                       // the trailing equals sign
    const k=s.lastIndexOf("=");if(k>=0)s=s.slice(k+1); // "K = 1000*1.04^3" -> the right-hand side
    s=s.trim();if(!s)fail("There is nothing to calculate yet.");
    return s;
  }
  // One written number: decide what its points, commas and apostrophes mean.
  function num(run){
    const bad=()=>fail("I can't tell what number "+run+" is.");
    let t=run.replace(/'/g,"");const dots=(t.match(/\./g)||[]).length,commas=(t.match(/,/g)||[]).length;
    if(commas===0){if(dots>1){if(!/^\d{1,3}(\.\d{3})+$/.test(t))bad();t=t.replace(/\./g,"")}}
    else if(dots===0){if(/^[1-9]\d{0,2}(,\d{3})+$/.test(t))t=t.replace(/,/g,"");else if(commas===1)t=t.replace(",",".");else bad()}
    else if(t.lastIndexOf(",")>t.lastIndexOf(".")){if(commas>1)bad();t=t.replace(/\./g,"").replace(",",".")}
    else{if(dots>1)bad();t=t.replace(/,/g,"")}
    const v=Number(t);if(!isFinite(v))bad();return v;
  }
  function fact(n){if(!near(n)||n<-1e-9)fail("A factorial needs a whole number, 0 or more.");n=Math.round(n);if(n>170)fail("That factorial is too large to show.");let r=1;for(let i=2;i<=n;i++)r*=i;return r}
  function whole2(n,k,what){if(!near(n)||!near(k)||n<-1e-9||k<-1e-9)fail(what+" needs whole numbers, 0 or more.");n=Math.round(n);k=Math.round(k);if(k>n)fail(what+": the second number can't be larger than the first.");return[n,k]}
  function binom(n,k){[n,k]=whole2(n,k,"n choose k");k=Math.min(k,n-k);let r=1;for(let i=1;i<=k;i++)r=r*(n-k+i)/i;return Math.round(r)}
  function perm(n,k){[n,k]=whole2(n,k,"nPr");let r=1;for(let i=0;i<k;i++)r*=n-i;return r}
  function pow(b,e){
    if(b===0&&e<0)fail("That divides by zero.");
    let r=Math.pow(b,e);
    if(isNaN(r)&&b<0){const q=1/e;if(near(q)&&Math.abs(Math.round(q))%2===1)r=-Math.pow(-b,e);else fail("A negative number to that power is not a real number.")}
    return r;
  }
  function root(n,x){
    if(n===0)fail("There is no 0th root.");
    if(x<0){if(near(n)&&Math.abs(Math.round(n))%2===1)return -Math.pow(-x,1/n);fail("An even root of a negative number is not a real number.")}
    if(x===0&&n<0)fail("That divides by zero.");
    return Math.pow(x,1/n);
  }
  const lnv=(x,name)=>x>0?Math.log(x):fail(name+" needs a number above zero.");
  const snap=x=>Math.round(x*1e15)/1e15; // sin(pi) is 0, not 1.2e-16
  const F1={
    ln:x=>lnv(x,"ln"),log:x=>lnv(x,"log"),log10:x=>lnv(x,"log10")/Math.LN10,lg:x=>lnv(x,"lg")/Math.LN10,log2:x=>lnv(x,"log2")/Math.LN2,exp:x=>Math.exp(x),
    sqrt:x=>x<0?fail("The square root of a negative number is not a real number."):Math.sqrt(x),cbrt:x=>Math.cbrt(x),abs:x=>Math.abs(x),
    sin:x=>snap(Math.sin(x)),cos:x=>snap(Math.cos(x)),tan:x=>Math.abs(snap(Math.cos(x)))<1e-15?fail("tan has no value there."):snap(Math.sin(x))/snap(Math.cos(x)),
    asin:x=>Math.abs(x)>1?fail("arcsin needs a number between -1 and 1."):Math.asin(x),acos:x=>Math.abs(x)>1?fail("arccos needs a number between -1 and 1."):Math.acos(x),atan:x=>Math.atan(x)
  };
  const ALIAS={arcsin:"asin",arccos:"acos",arctan:"atan",dfrac:"frac",tfrac:"frac",nck:"ncr",comb:"ncr",tg:"tan"};

  function parse(s,vars){
    let pos=0,tok=null,last=null,bars=0;const modes=[false]; // modes: does a comma separate two values here (inside C(5,2)) or is it a decimal comma
    function lex(){
      while(s[pos]===" ")pos++;
      if(pos>=s.length)return{t:"end"};
      const rest=s.slice(pos),sep=modes[modes.length-1];
      let m=rest.match(sep?/^(?:\d|[.'](?=\d))+/:/^(?:\d|[.,'](?=\d))+/);
      if(m){pos+=m[0].length;let v=num(m[0]);const x=s.slice(pos).match(/^[eE]([+-]?\d+)/);if(x){pos+=x[0].length;v=Number(v+"e"+x[1]);if(!isFinite(v))fail("That number is too large to show.")}return{t:"num",v}}
      m=rest.match(/^[A-Za-z]+/);
      if(m){
        pos+=m[0].length;let v=m[0].toLowerCase();v=ALIAS[v]||v;
        if(v==="log"){const b=s.slice(pos).match(/^(10|2)(?=\s*[(\[])/);if(b){pos+=b[0].length;v="log"+b[0]}} // log10(x), log2(x); "log 10" stays the natural log of 10
        return{t:"id",v,raw:m[0]};
      }
      pos++;const ch=rest[0];
      if("+-*/^()[]!%|,;_√∛∜°".includes(ch))return{t:"op",v:ch};
      fail("I can't use \""+ch+"\" in a calculation.");
    }
    const adv=()=>{last=tok;tok=lex()},is=v=>tok.t==="op"&&tok.v===v;
    const show=()=>tok.t==="end"?"the end":tok.t==="num"?String(tok.v):tok.t==="id"?tok.raw:tok.v;
    const CLOSE={"(":")","[":"]"};
    function group(){ // tok is ( or [
      const c=CLOSE[tok.v];modes.push(false);adv();const v=expr();
      if(!is(c))fail(tok.t==="end"?"A bracket is not closed.":"I can't use \""+show()+"\" there.");
      modes.pop();adv();return v;
    }
    // Inside C( ... ): a semicolon anywhere at this level means the commas are decimal commas.
    function semi(){let d=0;for(let i=pos;i<s.length;i++){const c=s[i];if(c==="("||c==="[")d++;else if(c===")"||c==="]"){if(!d)return false;d--}else if(c===";"&&!d)return true}return false}
    function args(name,n,two){ // tok is (
      modes.push((two||n>1)&&!semi());adv();const a=[expr()];
      while(is(",")||is(";")){adv();a.push(expr())}
      if(!is(")"))fail(tok.t==="end"?"A bracket is not closed.":"I can't use \""+show()+"\" there.");
      modes.pop();adv();
      if(n&&a.length!==n)fail(name+" takes "+(n===1?"one value":n+" values")+", and "+a.length+" are written.");
      return a;
    }
    // ln 2, sqrt 16: without brackets a function takes just the next number (and its power).
    const operand=()=>is("(")||is("[")?group():is("-")?(adv(),-power()):power();
    function ident(){
      const name=tok.v,raw=tok.raw;adv();
      if(vars&&Object.prototype.hasOwnProperty.call(vars,name))return vars[name];
      if(name==="pi")return Math.PI;
      if(name==="e")return Math.E;
      if(name==="frac"){if(!is("("))fail("A fraction needs a top and a bottom.");const a=group();if(!is("("))fail("A fraction needs a top and a bottom.");const b=group();if(b===0)fail("That divides by zero.");return a/b}
      if(name==="sqrt"&&is("[")){const n=group();return root(n,operand())}
      if(name==="log"&&is("_")){adv();const b=tok.t==="num"?(adv(),last.v):is("(")?group():fail("The base of the log is missing.");if(b<=0||b===1)fail("That is not a base a log can have.");return lnv(operand(),"log")/Math.log(b)}
      if(ARGS[name]){
        if(!is("("))fail(raw+" needs its two numbers in brackets, like "+raw+"(5,2).");
        let a=args(raw,name==="binom"?0:2,true);
        if(name==="binom"&&a.length===1&&is("("))a=[a[0],group()]; // \binom{5}{2}
        if(a.length!==2)fail(raw+" takes 2 values, and "+a.length+" are written.");
        return name==="root"?root(a[0],a[1]):name==="npr"?perm(a[0],a[1]):binom(a[0],a[1]);
      }
      if(F1[name]){
        if(tok.t==="end")fail(raw+" needs a number after it.");
        return F1[name](is("(")?args(raw,1)[0]:operand());
      }
      fail(raw.length===1?"\""+raw+"\" is a letter, not a number. Put in its value first.":"I don't know \""+raw+"\". Only numbers can be calculated.");
    }
    function primary(){
      if(tok.t==="num"){const v=tok.v;adv();return v}
      if(tok.t==="id")return ident();
      if(tok.t==="end")fail("The calculation stops too early. Something is missing at the end.");
      if(is("(")||is("["))return group();
      if(is("|")){bars++;adv();const v=expr();if(!is("|"))fail("An absolute value bar is not closed.");bars--;adv();return Math.abs(v)}
      if(is("√")){adv();return F1.sqrt(operand())}
      if(is("∛")){adv();return Math.cbrt(operand())}
      if(is("∜")){adv();return root(4,operand())}
      fail("A number is missing before \""+show()+"\".");
    }
    function postfix(){
      let v=primary();
      for(;;){
        if(is("!")){adv();v=fact(v)}
        else if(is("%")){adv();v/=100}
        else if(is("°")){adv();v=v*Math.PI/180}
        else if(tok.t==="id"&&(tok.v==="choose"||((tok.v==="c"||tok.v==="ncr")&&!/^\s*\(/.test(s.slice(pos))))){adv();v=binom(v,primary())} // 5 choose 2, 5C2
        else return v;
      }
    }
    function power(){const b=postfix();if(is("^")){adv();return pow(b,unary())}return b}
    function unary(){if(is("-")){adv();return -unary()}if(is("+")){adv();return unary()}return power()}
    const starts=()=>tok.t==="num"||tok.t==="id"||is("(")||is("[")||is("√")||is("∛")||is("∜")||(is("|")&&!bars);
    function term(){
      let v=unary();
      for(;;){
        if(is("*")){adv();v*=unary()}
        else if(is("/")){adv();const d=unary();if(d===0)fail("That divides by zero.");v/=d}
        else if(starts()){ // 2(3+4), 2pi, (1+2)(3+4)
          if(tok.t==="num"&&last&&last.t==="num")fail("Two numbers stand next to each other with no sign between them.");
          v*=power();
        }
        else return v;
      }
    }
    function expr(){let v=term();for(;;){if(is("+")){adv();v+=term()}else if(is("-")){adv();v-=term()}else return v}}
    adv();const v=expr();
    if(tok.t!=="end")fail(is(")")||is("]")?"There is one closing bracket too many.":is("|")?"An absolute value bar is not closed.":"I can't use \""+show()+"\" there.");
    return v;
  }

  // Whole numbers in full, otherwise what a pocket calculator would show: short decimals as they are, long ones to about 6 significant digits.
  function format(v){
    if(!isFinite(v))return"";
    if(Number.isInteger(v)&&Math.abs(v)<1e15)return(v<0?"−":"")+String(Math.abs(v));
    const neg=v<0?"−":"",a=Number(Math.abs(v).toPrecision(12)),trim=t=>t.indexOf(".")<0?t:t.replace(/0+$/,"").replace(/\.$/,"");
    if(a===0)return"0";
    if(Number.isInteger(a)&&a<1e15)return neg+String(a);
    if(a>=1e12||a<1e-4){const [m,e]=a.toExponential(5).split("e");return neg+trim(m)+"·10"+[...String(+e)].map(c=>UNSUP[c]).join("")}
    const t=String(Number(a.toPrecision(10)));
    if(t.replace(".","").replace(/^0+/,"").length<=8)return neg+t;
    return neg+trim(a>=1?a.toFixed(Math.max(0,6-String(Math.floor(a)).length)):a.toPrecision(6));
  }

  function evaluate(src){
    try{
      const v=parse(norm(src));
      if(isNaN(v))fail("That has no value.");
      if(!isFinite(v))fail("The result is too large to show.");
      const value=Number.isInteger(v)&&Math.abs(v)<1e15?v:Number(v.toPrecision(12)); // 8^(2/3) is 4, not 3.9999999999999996
      return{ok:true,value,text:format(v)};
    }catch(e){
      if(e instanceof CalcError)return{ok:false,error:e.message};
      return{ok:false,error:e instanceof RangeError?"That is nested too deeply for the calculator.":"The calculator can't work that out."};
    }
  }
  // A formula in one letter, for drawing graphs: compile("x^2-1") gives a function of x that returns a number,
  // or NaN where the formula has no value (ln of a negative number, a division by zero). null if it can't be read.
  function compile(src,name){
    name=name||"x";let s;
    try{s=norm(src)}catch(e){return null}
    const f=v=>{try{const r=parse(s,{[name]:v});return isFinite(r)?r:NaN}catch(e){return NaN}};
    // Readable at all? Somewhere on a spread of test values it has to give a number.
    return[0.37,1.3,-1.3,2.6,7.1,-7.1,0.01,25,1,2,3,10].some(v=>!isNaN(f(v)))?f:null;
  }
  return{evaluate,format,compile};
})();
