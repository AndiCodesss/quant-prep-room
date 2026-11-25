/* ---------------- Curriculum ---------------- */
const PHASES=[
 {n:"Foundations",from:1,to:4,goal:"Algebra, logs, functions, notation and your first proofs."},
 {n:"Calculus",from:5,to:14,goal:"Limits, derivatives, integrals, series and Taylor expansions — the whole calculus part of the self-assessment."},
 {n:"Linear algebra",from:15,to:18,goal:"Matrices, determinants, eigenvalues and why they matter for portfolios."},
 {n:"Probability",from:19,to:30,goal:"Counting, distributions, expectations, LLN, CLT and simulation."},
 {n:"Stochastic processes",from:31,to:37,goal:"σ-algebras, conditional expectation, random walks and martingales."},
 {n:"Finance & economics",from:38,to:45,goal:"Returns, microeconomics, portfolio theory and no-arbitrage pricing."},
 {n:"Review & application",from:46,to:52,goal:"Full self-assessment runs, mock interviews and the application itself."}
];
const WEEKS=[
 ["Algebra toolkit",["Fractions and exponent rules","Logarithms and the number e","Solving equations and inequalities","Functions and their graphs","Sum (Σ) and product (Π) notation"]],
 ["Sets, logic and proofs",["Sets and notation: ∈, ⊆, ∪, ∩, ℕ, ℝ","Logic: implications and quantifiers","Direct proof and proof by contradiction","Proof by induction","Factorials and n choose k"]],
 ["Functions in depth",["Polynomials and their roots","Exponential and logarithmic functions","Trigonometry basics: sin, cos, the unit circle","Composition and inverse functions","Absolute values, intervals and inequalities"]],
 ["Sequences and the binomial theorem",["Sequences and the idea of a limit","Arithmetic and geometric sequences","The finite geometric sum formula","The binomial theorem","Checkpoint: foundations quiz"]],
 ["Limits and continuity",["Limits, informally and with ε–δ","Limit laws","Continuity","Special limits: sin x / x and (1 + 1/n)^n","Limits at infinity"]],
 ["Derivatives",["The derivative as a limit (Newton quotient)","Derivative of xⁿ from the definition","Sum, product and quotient rules","The chain rule","Derivatives of eˣ and ln x"]],
 ["Using derivatives",["Tangent lines and linear approximation","Finding maxima and minima","Convexity and the second derivative","L'Hôpital's rule","The mean value theorem"]],
 ["Integrals",["Area and Riemann sums","Antiderivatives","Fundamental theorem of calculus, part 1","Fundamental theorem of calculus, part 2","Table of basic integrals"]],
 ["Integration techniques",["Substitution","Integration by parts","Partial fractions","Odd and even functions on symmetric intervals","Mixed integration practice"]],
 ["Improper integrals",["Integrals over infinite intervals","When does an improper integral converge?","x/(1+x²) and the Cauchy principal value","Integrals of e^(−x) and friends","The Gaussian integral"]],
 ["The gamma function and tricky integrals",["Definition of the gamma function","Γ(a) = (a−1)Γ(a−1) by integration by parts","Γ(n) = (n−1)! and Γ(1/2) = √π","Substitution over improper bounds: spotting divergence","Integral practice set"]],
 ["Infinite series",["Series and partial sums","The geometric series and its proof","Divergence: the harmonic series","Alternating series and log 2","Convergence tests: ratio and comparison"]],
 ["Taylor series",["Taylor polynomials","The remainder term","The series of eˣ (and a Poisson mean)","The series of log(1+x)","log x around 1 and power series practice"]],
 ["Several variables",["Functions of two variables","Partial derivatives and the gradient","Double integrals","Changing the order of integration (Fubini)","Checkpoint: calculus self-assessment section"]],
 ["Vectors and matrices",["Vectors and the dot product","Matrix multiplication","Identity and inverse matrices","Systems of linear equations","Gaussian elimination"]],
 ["Determinants and quadratic forms",["Determinants","Rank and linear independence","Transpose and symmetric matrices","Quadratic forms","Positive definite matrices"]],
 ["Eigenvalues",["Eigenvalues and eigenvectors","The characteristic polynomial","Trace = sum, determinant = product of eigenvalues","The spectral theorem for symmetric matrices","Diagonalization"]],
 ["Linear algebra for finance",["Covariance matrices","Jacobians and change of variables","Lagrange multipliers","Minimum-variance portfolio with matrices","Checkpoint: linear algebra"]],
 ["Counting",["Permutations","Combinations and the symmetry C(n,k) = C(n,n−k)","Pascal's triangle","Inclusion–exclusion","The birthday problem"]],
 ["Probability spaces",["Sample spaces and events","What a σ-algebra is (intuition)","Kolmogorov's three axioms","Conditional probability","Bayes' rule"]],
 ["Random variables",["Independence","Random variables, pmf and cdf","Expectation","Variance","Linearity of expectation"]],
 ["Discrete distributions",["Bernoulli and binomial","Geometric","Negative binomial: waiting for r successes","Poisson and its mean via the eˣ series","Hypergeometric and discrete uniform"]],
 ["Continuous distributions",["Densities (pdf) and cdfs","Uniform","Exponential: pdf, cdf, memorylessness","Normal and standardizing","Moments of N(0,σ²) without calculation"]],
 ["Distributions built from normals",["Gamma: sums of exponentials","Chi-square from normals","Student's t from normals","Cauchy: a distribution with no mean","Lognormal prices"]],
 ["Joint distributions",["Joint pmf and pdf","Marginal distributions","Covariance and correlation","Uncorrelated vs independent","Sums of independent variables (convolution)"]],
 ["Generating and characteristic functions",["Moment generating functions","Characteristic functions","From characteristic function to pdf (inversion)","Sums via MGFs: Bin + Bin with the same p","Sum of binomials with different p"]],
 ["Limit theorems",["Markov and Chebyshev inequalities","Weak law of large numbers","Strong law of large numbers","Central limit theorem","LLN vs CLT, and when the LLN fails"]],
 ["Simulation and Monte Carlo",["Random numbers and the inverse transform","Simulating χ² and t from normals","Monte Carlo integration","Error of order 1/√n: a probabilistic statement","Why the rate does not depend on dimension"]],
 ["Statistics basics",["Estimators and bias","Sample mean and sample variance","Maximum likelihood","Confidence intervals","Hypothesis tests"]],
 ["Probability checkpoint",["Mock set: counting and discrete distributions","Mock set: continuous distributions","Mock set: limit theorems","Explain out loud: LLN vs CLT","Redo your weakest topic"]],
 ["Measure theory, gently",["σ-algebras precisely","Generated σ-algebras","Measurable functions = random variables","The Lebesgue integral (intuition)","Expectation as an integral"]],
 ["Conditional expectation",["Conditional expectation on a finite space","The case G = {∅, Ω, A, Aᶜ}","Properties: tower rule, taking out what is known","Best estimate in the mean-square sense","Worked examples"]],
 ["Random walks",["The simple symmetric random walk","Mean and variance of Sₙ","E[Sₙ | past] = Sₙ₋₁","The biased walk (2/3, 1/3)","Drift and compensation"]],
 ["Martingales and stopping times",["Definition of a discrete-time martingale","Examples and non-examples","Sub- and supermartingales","Stopping times","Optional stopping and when it fails (E[S_τ] at level 5)"]],
 ["Reflection principle and gambler's ruin",["The reflection principle","The ballot problem","Distribution of the running maximum","Gambler's ruin","Hitting probabilities"]],
 ["Towards continuous time",["From random walk to Brownian motion","Properties of Brownian motion","Scaling and quadratic variation","Itô's formula (intuition only)","Geometric Brownian motion"]],
 ["Stochastic checkpoint",["Mock set: conditional expectation","Mock set: random walks and martingales","Mock set: LLN, CLT and Monte Carlo","Explain out loud: why E[X|G] is the best estimate","Redo your weakest topic"]],
 ["Returns and stylized facts",["Simple returns vs log returns","Compounding and annualizing","Stylized facts of daily returns","Measuring volatility","Fat tails and volatility clustering in real data"]],
 ["Microeconomics I: consumers",["Preferences and utility","Budget constraints","The consumer's optimum","Demand and elasticity","Income and substitution effects"]],
 ["Microeconomics II: firms and markets",["Costs and production","Perfect competition","Monopoly","Game theory basics","Equilibrium and welfare"]],
 ["Choice under uncertainty",["Expected utility","Risk aversion and concave utility","Certainty equivalent and risk premium","CARA and CRRA utility","Mean–variance preferences"]],
 ["Portfolio theory",["Two-asset portfolios","Diversification","The efficient frontier","The tangency portfolio","CAPM and beta"]],
 ["No-arbitrage pricing",["Time value of money and discounting","Bonds and yields","The no-arbitrage principle","State prices","Risk-neutral probabilities"]],
 ["Derivatives and options",["Forwards and futures","Option payoffs","Put–call parity","The one-period binomial model","Black–Scholes intuition"]],
 ["Corporate finance and markets",["NPV and IRR","Modigliani–Miller","Cost of capital","Efficient markets","Checkpoint: finance and economics"]],
 ["Full self-assessment pass",["Self-assessment: calculus questions","Self-assessment: probability questions","Self-assessment: stochastic processes","Self-assessment: asset pricing","Score yourself and list weak spots"]],
 ["Fix weak spots",["Weak spot 1","Weak spot 2","Weak spot 3","Weak spot 4","Re-test the weak spots"]],
 ["Mock interview: mathematics",["Calculus out loud, 20 minutes","Probability out loud, 20 minutes","Stochastic processes out loud","Proofs at the whiteboard","Full math mock"]],
 ["Mock interview: finance",["Microeconomics out loud","Portfolio theory out loud","Asset pricing out loud","Why quant finance, why Zurich","Full mock interview"]],
 ["Application documents",["CV on the program template","Motivation letter: first draft","Course summary: map your courses to the prerequisites","Ask two referees","Collect degree certificate and transcripts"]],
 ["Submit and polish",["Final self-assessment run","Motivation letter: final version","Check eligibility and deadlines again","Submit the application (window opens 15 Nov)","Plan the weeks before the March interview"]],
 ["Buffer and spaced review",["Spaced review: calculus","Spaced review: probability","Spaced review: stochastic processes","Spaced review: finance","Rest and look back"]]
];
const LESSONS=[];
WEEKS.forEach(([wt,days],wi)=>{
  const w=wi+1, ph=PHASES.find(p=>w>=p.from&&w<=p.to);
  days.forEach((t,di)=>LESSONS.push({id:"w"+w+"d"+(di+1),w,d:di+1,title:t,week:wt,phase:ph.n,review:false}));
  LESSONS.push({id:"w"+w+"d6",w,d:6,title:"Review & practice: "+wt,week:wt,phase:ph.n,review:true});
});
const IDX=Object.fromEntries(LESSONS.map((l,i)=>[l.id,i]));

/* ---------------- Hand-written week 1 ---------------- */
const HAND={
"w1d1":{md:String.raw`Everything in the interview — Taylor series, integrals, probability — is built from a small set of algebra moves. When these are automatic, the hard topics feel much easier. Today: fractions and powers.

## Fractions

Three rules cover almost everything:

$$\frac{a}{b}+\frac{c}{d}=\frac{ad+bc}{bd},\qquad \frac{a}{b}\cdot\frac{c}{d}=\frac{ac}{bd},\qquad \frac{a/b}{c/d}=\frac{ad}{bc}.$$

**Example.** $\frac{1}{2}+\frac{1}{3}=\frac{3+2}{6}=\frac{5}{6}$. And dividing by a fraction means multiplying by its flip: $\frac{3}{4}\div\frac{1}{2}=\frac{3}{4}\cdot 2=\frac{3}{2}$.

## Exponent rules

For $a>0$ and any real numbers $x, y$:

$$a^x a^y=a^{x+y},\qquad \frac{a^x}{a^y}=a^{x-y},\qquad (a^x)^y=a^{xy},$$
$$a^0=1,\qquad a^{-x}=\frac{1}{a^x},\qquad a^{1/n}=\sqrt[n]{a}.$$

Why $a^0=1$? Because $\frac{a^x}{a^x}=1$ and also $=a^{x-x}=a^0$. Most rules can be re-derived like this, so you never need to memorize blindly.

The rules as a picture. Every curve passes through $(0,1)$, because $a^0=1$. To the left of zero the exponent is negative, so the power is a fraction: small, but never zero and never negative. And a base below 1 falls where a base above 1 rises.

~~~plot
title: The power $a^x$ for three bases
f: 2^x | $2^x$
f: 3^x | $3^x$
f: 0.5^x | $\left(\frac12\right)^x=2^{-x}$
x: -3..3
y: 0..9
point: 0, 1 | a⁰ = 1
~~~

**Worked examples.**

1. $\dfrac{2^5\cdot 2^{-2}}{2^2}=2^{5-2-2}=2^1=2$.
2. $\dfrac{(x^3)^2}{x^4}=\dfrac{x^6}{x^4}=x^2$.
3. $8^{2/3}=\left(\sqrt[3]{8}\right)^2=2^2=4$.

## Classic traps

- $(a+b)^2\neq a^2+b^2$. The correct expansion is $a^2+2ab+b^2$.
- $a^x b^x=(ab)^x$ is true, but $a^x+a^y$ does **not** simplify to one power.
- $\sqrt{a+b}\neq\sqrt a+\sqrt b$.

## Why this matters for quant finance

Compounding is pure exponent algebra. CHF 100 at 5% a year for 10 years grows to $100\cdot 1.05^{10}\approx 162.89$. Growth over two periods multiplies: $(1+r_1)(1+r_2)$. Next lesson we turn these products into sums with logarithms.

Look at how far apart the curves end up. The straight line pays 5 francs every year and nothing on the interest already earned. The curve above it is the same 5%, with interest on interest: that gap is the whole point of the exponent.

~~~plot
title: CHF 100 left alone for 40 years
f: 100*1.05^x | 5% a year, compounded
f: 100+5x | 5% a year without interest on interest
f: 100*1.02^x | 2% a year, compounded
x: 0..40
xlabel: years
ylabel: CHF
~~~

> [!use] Where you meet fractions and powers
>
> - **Comparing prices in a shop.** 750 g for CHF 4.20, or 1.2 kg for CHF 6.30? Per kilo that is $\frac{4.20}{0.75}=5.60$ against $\frac{6.30}{1.2}=5.25$. The larger pack is cheaper, and all it took was dividing by a fraction.
> - **A savings account or a loan.** CHF 10 000 at 3% a year for 20 years becomes $10\,000\cdot1.03^{20}\approx 18\,061$. The same power tells you what a debt grows to when nothing is paid back.
> - **Inflation.** At 2% a year, prices multiply by $1.02^{10}\approx1.22$ in ten years. Going the other way is a negative exponent: CHF 100 in ten years buys what $100\cdot1.02^{-10}\approx 82$ francs buy today.
> - **Computers.** Each extra bit doubles the number of values: $2^{10}=1024$ and $2^{32}\approx 4.3$ billion. That is why a 32-bit counter runs out, and why one more bit is always "twice as much".

> [!remember] Things to remember
>
> - Add fractions over a common denominator: $\frac{a}{b}+\frac{c}{d}=\frac{ad+bc}{bd}$. Dividing by a fraction means multiplying by its flip.
> - Same base: multiply by adding exponents, divide by subtracting them, and a power of a power multiplies them.
> - $a^0=1$, $a^{-x}=\frac{1}{a^x}$, $a^{1/n}=\sqrt[n]{a}$.
> - Powers and roots do not split over a sum: $(a+b)^2=a^2+2ab+b^2$.
> - Compounding is a power: $n$ years at rate $r$ multiply by $(1+r)^n$.`,
practice:[
 {q:String.raw`Simplify $\dfrac{3^4\cdot 3^{-1}}{3^2}$.`,a:String.raw`$3^{4-1-2}=3^1=3$.`},
 {q:String.raw`Compute $\frac{2}{3}+\frac{3}{4}$.`,a:String.raw`$\frac{2\cdot4+3\cdot3}{12}=\frac{17}{12}$.`},
 {q:String.raw`Simplify $\dfrac{x^{5}y^{2}}{x^{2}y^{-1}}$.`,a:String.raw`$x^{5-2}y^{2-(-1)}=x^3y^3$.`},
 {q:String.raw`Write $\sqrt{x}\cdot x^{3/2}$ as a single power of $x$.`,a:String.raw`$x^{1/2}\cdot x^{3/2}=x^{2}$.`},
 {q:String.raw`Expand $(1+r)^2$. Why is it not $1+r^2$?`,a:String.raw`$(1+r)^2=1+2r+r^2$. The cross term $2r$ comes from multiplying $1\cdot r$ twice. In finance it is the main effect: two years at rate $r$ gives about $2r$, plus a small interest-on-interest term $r^2$.`},
 {q:String.raw`CHF 1000 is invested at 4% per year for 3 years. What is it worth?`,a:String.raw`$1000\cdot 1.04^3=1124.86$ (CHF, rounded).`},
 {q:String.raw`Compute $\frac{5}{6}-\frac{1}{4}$.`,a:String.raw`Common denominator 12: $\frac{10}{12}-\frac{3}{12}=\frac{7}{12}$.`},
 {q:String.raw`Simplify $\left(\dfrac{2x^2}{y}\right)^3\cdot\dfrac{y^2}{4x^5}$.`,a:String.raw`The power goes onto every factor: $\frac{8x^6}{y^3}\cdot\frac{y^2}{4x^5}=\frac{8}{4}\,x^{6-5}\,y^{2-3}=\frac{2x}{y}$.`},
 {q:String.raw`Write $\dfrac{1}{\sqrt[3]{x^2}}$ as a single power of $x$. Then evaluate it at $x=8$.`,a:String.raw`$\sqrt[3]{x^2}=x^{2/3}$, so the expression is $x^{-2/3}$. At $x=8$: $8^{-2/3}=\frac{1}{(\sqrt[3]{8})^2}=\frac14$.`},
 {q:String.raw`Without a calculator: which is larger, $2^{30}$ or $10^{9}$? Explain.`,a:String.raw`$2^{10}=1024>10^3$. Raise both sides to the power 3: $2^{30}=(2^{10})^3>(10^3)^3=10^9$. So $2^{30}$ is larger.`}
]},
"w1d2":{md:String.raw`Logarithms undo powers. They turn multiplication into addition, which is why quants love them: log returns add up over time.

## Definition

$$\log_a y=x \iff a^x=y \qquad (a>0,\ a\neq1,\ y>0).$$

So $\log_{10}1000=3$ because $10^3=1000$, and $\log_2 8=3$ because $2^3=8$.

## The rules

$$\log(xy)=\log x+\log y,\qquad \log\frac{x}{y}=\log x-\log y,\qquad \log(x^p)=p\log x.$$

Each one is an exponent rule read backwards. For example, if $x=a^u$ and $y=a^v$ then $xy=a^{u+v}$, so $\log_a(xy)=u+v$.

## The number e

Invest 1 franc at 100% interest, compounded $n$ times a year. After one year you have $\left(1+\frac1n\right)^n$:

| $n$ | $\left(1+\frac1n\right)^n$ |
|---|---|
| 1 | 2 |
| 2 | 2.25 |
| 12 | 2.613 |
| 365 | 2.7146 |

As $n\to\infty$ this approaches $e\approx 2.71828$. More generally $\left(1+\frac{r}{n}\right)^{nt}\to e^{rt}$: continuous compounding.

The table as a picture: each dot is one way of splitting the year. The dots climb quickly at first and then hardly at all. They never cross the dashed line.

~~~plot
title: Compounding more and more often approaches e
seq: (1+1/n)^n | $\left(1+\frac1n\right)^n$
n: 1..24
y: 1.9..2.8
hline: e | e ≈ 2.718
xlabel: times compounded per year
~~~

## The natural log

$\ln x=\log_e x$. In the program's documents, **"log" always means the natural log**. Key facts:

$$e^{\ln x}=x\ (x>0),\qquad \ln(e^x)=x,\qquad \ln 1=0,\qquad \ln e=1.$$

"Undo each other" has a picture: the two graphs are mirror images in the line $y=x$. Whatever point $(a,b)$ lies on $e^x$, the point $(b,a)$ lies on $\ln x$. You can also see that $\ln x$ exists only to the right of zero, is negative between 0 and 1, and keeps growing, but ever more slowly.

~~~plot
title: ln undoes the exponential: mirror images in the line y = x
f: exp(x) | $e^x$
f: ln(x) | $\ln x$
f: x | $y=x$
x: -3..5
y: -3..5
point: 0, 1 | e⁰ = 1
point: 1, 0 | ln 1 = 0
~~~

## Why this matters: log returns

If a price goes from $P_0$ to $P_1$, the log return is $\ln(P_1/P_0)$. Over two periods

$$\ln\frac{P_2}{P_0}=\ln\frac{P_2}{P_1}+\ln\frac{P_1}{P_0},$$

so log returns simply **add**. Simple returns do not. This is the first question in the asset pricing part of the self-assessment.

> [!use] Where you meet logarithms
>
> - **How long until my money doubles?** At 3% a year you solve $1.03^t=2$, so $t=\frac{\ln 2}{\ln 1.03}\approx 23.4$ years. Bankers use the shortcut "72 divided by the rate in percent": $72/3=24$.
> - **Earthquakes and loudness.** The Richter and decibel scales are logarithms. Magnitude 7 shakes the ground 10 times as much as magnitude 6, and 10 decibels more is 10 times the sound power. Logs squeeze numbers that range over many powers of ten onto a short scale.
> - **Chemistry.** pH is $-\log_{10}$ of the hydrogen ion concentration, so pH 3 is ten times as acidic as pH 4.
> - **Stock charts.** A long-run price chart is drawn on a log axis, so that the same percentage move has the same height whether the price was 10 or 1000. And the "daily return" in a risk model is usually the log return $\ln(P_1/P_0)$, because those add up over days.

> [!remember] Things to remember
>
> - $\log_a y=x$ means $a^x=y$. A logarithm is the exponent you are looking for.
> - $\ln(xy)=\ln x+\ln y$, $\ln\frac{x}{y}=\ln x-\ln y$, $\ln(x^p)=p\ln x$. There is no rule for $\ln(x+y)$.
> - $e^{\ln x}=x$ and $\ln(e^x)=x$: the two undo each other. $\ln 1=0$, $\ln e=1$.
> - $\left(1+\frac{r}{n}\right)^{nt}\to e^{rt}$: continuous compounding.
> - Log returns add over time. Simple returns do not.`,
practice:[
 {q:String.raw`Compute $\ln(e^5)$ and $e^{\ln 7}$.`,a:String.raw`$5$ and $7$: $\ln$ and $e^x$ undo each other.`},
 {q:String.raw`Solve $e^{2x}=7$.`,a:String.raw`Take $\ln$: $2x=\ln 7$, so $x=\frac{\ln 7}{2}\approx 0.973$.`},
 {q:String.raw`Simplify $\ln(a^2b)-\ln(ab)$.`,a:String.raw`$2\ln a+\ln b-\ln a-\ln b=\ln a$.`},
 {q:String.raw`With continuous compounding at 7% a year, how long until money doubles?`,a:String.raw`Solve $e^{0.07t}=2$: $t=\frac{\ln 2}{0.07}\approx 9.9$ years.`},
 {q:String.raw`A price goes 100 → 110 → 99. Give the simple and log returns of each step, and the total.`,a:String.raw`Simple: $+10\%$, then $-10\%$; total $-1\%$, which is **not** $10\%-10\%=0$. Log: $\ln 1.1\approx 0.0953$, $\ln 0.9\approx-0.1054$; sum $-0.0101=\ln 0.99$, the total log return. Log returns add.`},
 {q:String.raw`Compute $\log_2 32$ and $\log_{10} 0.01$.`,a:String.raw`$\log_2 32=5$ because $2^5=32$. $\log_{10}0.01=-2$ because $10^{-2}=0.01$.`},
 {q:String.raw`Simplify $e^{2\ln 3-\ln 2}$.`,a:String.raw`$2\ln 3=\ln 9$, so the exponent is $\ln 9-\ln 2=\ln\frac92$. Then $e^{\ln(9/2)}=\frac92$.`},
 {q:String.raw`Solve $\ln x+\ln(x-1)=\ln 6$.`,a:String.raw`$\ln\big(x(x-1)\big)=\ln 6$, so $x^2-x-6=0$, that is $(x-3)(x+2)=0$. Both logs need $x>1$, so only $x=3$ works.`},
 {q:String.raw`CHF 500 grows to CHF 800 in 6 years with continuous compounding. What is the yearly rate?`,a:String.raw`$800=500\,e^{6r}$, so $e^{6r}=1.6$ and $r=\frac{\ln 1.6}{6}\approx 0.078$: about 7.8% per year.`}
]},
"w1d3":{md:String.raw`Today is about solving for $x$ — and about the inequality notation that later defines limits.

## Linear equations

Do the same thing to both sides until $x$ stands alone: $3x-7=11 \Rightarrow 3x=18 \Rightarrow x=6$.

## Quadratic equations

$ax^2+bx+c=0$ with $a\neq0$ has solutions

$$x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}.$$

The **discriminant** $\Delta=b^2-4ac$ tells you how many real solutions there are: two if $\Delta>0$, one if $\Delta=0$, none if $\Delta<0$.

Often factoring is faster: $x^2-5x+6=(x-2)(x-3)=0$, so $x=2$ or $x=3$. A product is zero exactly when one factor is zero.

Solving $ax^2+bx+c=0$ means asking where the parabola $y=ax^2+bx+c$ meets the $x$-axis. That is what the discriminant counts: the blue parabola crosses twice, the green one just touches, the violet one stays above the axis and has no real solution.

~~~plot
title: The solutions of a quadratic are where its parabola meets the x-axis
f: x^2-5x+6 | $x^2-5x+6$: two solutions
f: x^2-4x+4 | $x^2-4x+4$: one solution
f: x^2-2x+3 | $x^2-2x+3$: none
x: -1..6
y: -1..8
point: 2, 0 | x = 2
point: 3, 0 | x = 3
~~~

## Inequalities

Same moves as equations, with one rule: **multiplying or dividing by a negative number flips the sign.**

$$-2x>6 \iff x<-3.$$

Why the sign flips: the line $-2x+4$ falls from left to right. It is above 10 only to the **left** of $x=-3$. Drag across the picture and watch the value pass 10.

~~~plot
title: −2x + 4 > 10 holds where the line lies above the dashed level
f: -2x+4 | $-2x+4$
hline: 10 | 10
vline: -3 | x = −3
x: -6..2
~~~

## Absolute value and distance

$|x-a|$ is the distance between $x$ and $a$. So

$$|x-a|<\varepsilon \iff a-\varepsilon<x<a+\varepsilon.$$

Read it as: "$x$ is within $\varepsilon$ of $a$". In week 5 the definition of a limit is written exactly in this language.

The graph of $|x-3|$ is a V with its tip at 3. It is below the dashed line $0.5$ exactly between $2.5$ and $3.5$.

~~~plot
title: |x − 3| < 0.5 means x lies between 2.5 and 3.5
f: abs(x-3) | $|x-3|$
hline: 0.5 | ε = 0.5
vline: 2.5 | 2.5
vline: 3.5 | 3.5
x: 1..5
y: 0..2
~~~

## Two equations, two unknowns

$x+y=10$ and $x-y=4$. Add them: $2x=14$, so $x=7$ and then $y=3$. In week 15 you'll do this with matrices.

Each equation is a line, and the solution is the one point that lies on both.

~~~plot
title: Two equations, two lines: the solution is where they cross
f: 10-x | $x+y=10$
f: x-4 | $x-y=4$
x: 0..10
point: 7, 3 | (7, 3)
~~~

> [!use] Where you solve equations and inequalities
>
> - **Break-even.** A coffee stall costs CHF 300 a day and earns CHF 2.50 per cup. $2.5x-300=0$ gives $x=120$ cups, and the inequality $2.5x-300>0$ says "anything above 120 is profit".
> - **Which phone plan is cheaper?** Plan A costs CHF 20 plus 0.10 per minute, plan B a flat CHF 35. $20+0.1x<35$ gives $x<150$: below 150 minutes take A. It is the two-lines picture above.
> - **Braking.** Driving schools use: stopping distance in metres $\approx 3u+u^2$ with $u=\frac{v}{10}$ and $v$ in km/h. "How fast may I go to stop within 40 m?" is the quadratic $u^2+3u-40=0$, so $(u+8)(u-5)=0$, $u=5$, and $v=50$ km/h.
> - **Tolerances and limits.** A part of 20 mm that may be off by 0.05 mm: $|x-20|\le 0.05$. A bank's risk limit reads the same way: "the position stays within CHF 1 million of the target".
> - **The yield of an investment.** CHF 1000 grew to 1102.50 in two years. $1000(1+r)^2=1102.5$ is a quadratic in $r$, with the sensible solution $r=5\%$.

> [!remember] Things to remember
>
> - $ax^2+bx+c=0$ has $x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}$. The discriminant $b^2-4ac$ tells you how many real solutions there are.
> - A product is zero exactly when one of its factors is zero. Try factoring first.
> - Multiplying or dividing an inequality by a negative number flips the sign.
> - $|x-a|<\varepsilon$ means $a-\varepsilon<x<a+\varepsilon$: $x$ is within $\varepsilon$ of $a$.`,
practice:[
 {q:String.raw`Solve $3x-7=11$.`,a:String.raw`$x=6$.`},
 {q:String.raw`Solve $2x^2+x-1=0$.`,a:String.raw`$x=\frac{-1\pm\sqrt{1+8}}{4}=\frac{-1\pm3}{4}$, so $x=\frac12$ or $x=-1$.`},
 {q:String.raw`Solve $-2x+4>10$.`,a:String.raw`$-2x>6$, divide by $-2$ and flip: $x<-3$.`},
 {q:String.raw`Write $|x-3|<0.5$ without absolute values.`,a:String.raw`$2.5<x<3.5$.`},
 {q:String.raw`For which $c$ does $x^2+2x+c=0$ have no real solution?`,a:String.raw`$\Delta=4-4c<0 \iff c>1$.`},
 {q:String.raw`Solve $x+2y=8,\ 3x-y=3$.`,a:String.raw`From the second, $y=3x-3$. Then $x+6x-6=8$, so $x=2$, $y=3$.`},
 {q:String.raw`Solve $\dfrac{x+1}{3}=\dfrac{2x-5}{4}$.`,a:String.raw`Multiply both sides by 12: $4(x+1)=3(2x-5)$, so $4x+4=6x-15$ and $x=\frac{19}{2}$.`},
 {q:String.raw`Solve $x^2-6x+7=0$.`,a:String.raw`$x=\frac{6\pm\sqrt{36-28}}{2}=\frac{6\pm2\sqrt2}{2}=3\pm\sqrt2$.`},
 {q:String.raw`Solve $|2x-1|\le 5$.`,a:String.raw`$-5\le 2x-1\le 5$. Add 1: $-4\le 2x\le 6$. Divide by 2: $-2\le x\le 3$.`},
 {q:String.raw`Solve $\dfrac{3-x}{-2}<4$.`,a:String.raw`Multiply by $-2$ and flip the sign: $3-x>-8$. Then $-x>-11$, and multiplying by $-1$ flips again: $x<11$.`}
]},
"w1d4":{md:String.raw`A function is a rule that gives exactly one output for each input. The interview cares about precise notation, so we write the sets too.

## Notation

$$f:A\to B,\qquad x\mapsto f(x).$$

$A$ is the **domain** (allowed inputs), $B$ the **codomain**. Example: $f:\mathbb{R}\to\mathbb{R},\ f(x)=x^2$. And $\ln:(0,\infty)\to\mathbb{R}$, because $\ln x$ only exists for $x>0$. The self-assessment explicitly asks you to "indicate the sets on which the variables are defined" — this is what they mean.

## A function as a graph

A function can be seen in two ways. As a **rule**: put in $x$, get out $f(x)$. And as a **graph**: draw every point $(x, f(x))$, and the rule becomes a curve you can look at.

To read a value off a graph, start at the input on the horizontal axis, go straight up (or down) to the curve, then straight across to the vertical axis. There is the output. Drag your finger across the picture and the page does it for you.

~~~plot
title: Reading $f(x)=x^2$ off its graph: input 2, output 4
f: x^2 | $f(x)=x^2$
x: -3..3
vline: 2 | input 2
hline: 4 | output 4
point: 2, 4 | (2, f(2))
~~~

> [!intuition] What a graph tells you at a glance
>
> - **Where it crosses the horizontal axis**: the solutions of $f(x)=0$.
> - **Rising or falling**: whether a larger input gives a larger or a smaller output. In week 6 the derivative measures how steeply.
> - **Gaps**: inputs that are not allowed. $\ln x$ has no graph to the left of zero.
> - **One output per input**: any vertical line meets the graph at most once. A circle is not the graph of a function, because a vertical line through it hits two points.

## Shapes to know

- **Linear** $f(x)=mx+b$: a line with slope $m=\frac{\Delta y}{\Delta x}$.
- **Quadratic** $f(x)=ax^2+bx+c$: a parabola, opening up if $a>0$.
- **Exponential** $e^x$: always positive, grows faster than any polynomial.
- **Logarithm** $\ln x$: the mirror image of $e^x$ in the line $y=x$.

All four in one picture. Use the "Try your own" field below it to change them: what does $2x+1$ do to the line, and $-x^2$ to the parabola?

~~~plot
title: The four shapes to know
f: 0.5x+1 | linear: $\frac12x+1$
f: x^2 | quadratic: $x^2$
f: exp(x) | exponential: $e^x$
f: ln(x) | logarithm: $\ln x$
x: -3..4
y: -3..8
~~~

## Composition and inverses

$(f\circ g)(x)=f(g(x))$: apply $g$ first, then $f$. Order matters.

The inverse $f^{-1}$ undoes $f$: $f^{-1}(f(x))=x$. To find it, write $y=f(x)$ and solve for $x$. Example: $y=3x+2 \Rightarrow x=\frac{y-2}{3}$, so $f^{-1}(y)=\frac{y-2}{3}$.

Swapping input and output swaps the two axes, so the graph of the inverse is the mirror image in the line $y=x$.

~~~plot
title: A function and its inverse are mirror images in y = x
f: 3x+2 | $f(x)=3x+2$
f: (x-2)/3 | $f^{-1}(x)=\frac{x-2}{3}$
f: x | $y=x$
x: -6..8
y: -6..8
~~~

## Even and odd functions

- **Even:** $f(-x)=f(x)$ (mirror symmetric), like $x^2$.
- **Odd:** $f(-x)=-f(x)$ (point symmetric), like $x^3$ or $\frac{x}{1+x^2}$.

~~~plot
title: Even: a mirror image left and right. Odd: the same after half a turn about 0
f: x^2 | even: $x^2$
f: x^3 | odd: $x^3$
f: x/(1+x^2) | odd: $\frac{x}{1+x^2}$
x: -2..2
y: -3..4
~~~

Odd functions have a useful property you'll prove in week 9: over a symmetric interval, $\int_{-K}^{K}f(x)\,dx=0$. The self-assessment uses exactly this with $\frac{x}{1+x^2}$. An integral is an area, counted negative below the axis, and in the picture the area on the left cancels the one on the right.

~~~plot
title: Why an odd function integrates to zero over [−K, K]: the two areas cancel
f: x/(1+x^2) | $\frac{x}{1+x^2}$
x: -4..4
shade: -4..4
~~~

> [!use] Where functions turn up
>
> - **Every price list is a function.** A taxi charges CHF 6.80 to get in plus 3.80 per km: $f(x)=6.8+3.8x$. The slope is the price per km, and the value at 0 is what you pay before moving. For 12 km: $6.8+3.8\cdot12=52.40$.
> - **Converting back is an inverse.** $F=1.8C+32$ turns Celsius into Fahrenheit. Solving for $C$ gives the function for the way back, $C=\frac{F-32}{1.8}$: 68 °F is 20 °C.
> - **One thing after another is a composition.** 20% off, then 8.1% VAT: $g(f(p))=1.081\cdot0.8\,p$. A currency conversion after a price change, or tax on a bonus, works the same way.
> - **An option's payoff.** A call option with strike 100 pays $\max(S-100,\,0)$ at expiry, a function of the share price $S$: nothing up to 100, then one franc for every franc above. Traders think in these pictures all day.

~~~plot
title: Payoff of a call option with strike 100
f: (abs(x-100)+x-100)/2 | payoff $\max(S-100,\,0)$
x: 60..140
xlabel: share price S at expiry
ylabel: payoff
~~~

> [!remember] Things to remember
>
> - A function gives exactly one output for each input. Always say where it lives: $f:A\to B$.
> - $\ln$ needs a positive input and a square root a non-negative one. Check the domain first.
> - $(f\circ g)(x)=f(g(x))$: apply $g$ first. The order matters.
> - To find an inverse, write $y=f(x)$ and solve for $x$.
> - Even: $f(-x)=f(x)$. Odd: $f(-x)=-f(x)$, and then $\int_{-K}^{K}f(x)\,dx=0$.`,
practice:[
 {q:String.raw`$f(x)=x^2+1$, $g(x)=2x-3$. Compute $f(g(x))$ and $g(f(x))$.`,a:String.raw`$f(g(x))=(2x-3)^2+1=4x^2-12x+10$. $g(f(x))=2(x^2+1)-3=2x^2-1$. Different: order matters.`},
 {q:String.raw`What is the largest possible domain of $h(x)=\ln(x-2)$?`,a:String.raw`Need $x-2>0$, so $h:(2,\infty)\to\mathbb{R}$.`},
 {q:String.raw`Find the inverse of $f(x)=e^{2x}$, with its domain.`,a:String.raw`$y=e^{2x}\Rightarrow x=\frac{\ln y}{2}$. So $f^{-1}:(0,\infty)\to\mathbb{R}$, $f^{-1}(y)=\frac{\ln y}{2}$.`},
 {q:String.raw`Is $\frac{x}{1+x^2}$ even, odd or neither?`,a:String.raw`$\frac{-x}{1+(-x)^2}=-\frac{x}{1+x^2}$: odd.`},
 {q:String.raw`Slope of the line through $(1,2)$ and $(3,8)$?`,a:String.raw`$m=\frac{8-2}{3-1}=3$.`},
 {q:String.raw`$f(x)=\dfrac{1}{x-3}$. Give its largest possible domain, and compute $f(f(4))$.`,a:String.raw`The denominator must not be zero: $f:\mathbb{R}\setminus\{3\}\to\mathbb{R}$. $f(4)=1$, and $f(1)=\frac{1}{1-3}=-\frac12$.`},
 {q:String.raw`Find the inverse of $f(x)=\dfrac{2x+1}{x-1}$ for $x\neq 1$.`,a:String.raw`$y(x-1)=2x+1$, so $xy-2x=y+1$ and $x=\frac{y+1}{y-2}$. So $f^{-1}(y)=\frac{y+1}{y-2}$ for $y\neq 2$.`},
 {q:String.raw`Is $g(x)=x^2\cdot x^3+x$ even, odd or neither?`,a:String.raw`$g(x)=x^5+x$, and $g(-x)=-x^5-x=-g(x)$: odd.`},
 {q:String.raw`A line has slope $-3$ and passes through $(2,5)$. Give its equation. Where does it cross the $x$-axis?`,a:String.raw`$y=5-3(x-2)=-3x+11$. It crosses the axis where $y=0$: $x=\frac{11}{3}$.`}
]},
"w1d5":{md:String.raw`Expectations, series and the binomial theorem are all written with $\Sigma$. Today you make it your own.

## Reading Σ

$$\sum_{k=1}^{n}a_k=a_1+a_2+\dots+a_n.$$

$k$ is a **dummy index**: $\sum_{k=1}^n k^2$ and $\sum_{j=1}^n j^2$ are the same number.

**Rules.** Constants come out and sums split:

$$\sum_{k=1}^{n}(c\,a_k+b_k)=c\sum_{k=1}^{n}a_k+\sum_{k=1}^{n}b_k,\qquad \sum_{k=1}^{n}c=nc.$$

## Three sums to know

$$\sum_{k=1}^{n}k=\frac{n(n+1)}{2},\qquad \sum_{k=1}^{n}k^2=\frac{n(n+1)(2n+1)}{6},\qquad \sum_{k=0}^{n-1}r^k=\frac{1-r^n}{1-r}\ (r\neq1).$$

**Proof of the geometric sum** (you will be asked this in the interview, in its infinite form). Let $S=1+r+\dots+r^{n-1}$. Then $rS=r+r^2+\dots+r^n$. Subtract: everything cancels except the ends,

$$S-rS=1-r^n \ \Rightarrow\ S=\frac{1-r^n}{1-r}.$$

A sum can be drawn too: one dot per term. Blue is what is added at each step, green is the total so far. With $r=\frac12$ the terms shrink so fast that the total never gets past 2.

~~~plot
title: 1 + 1/2 + 1/4 + …: the terms shrink, the total approaches 2
seq: 0.5^n | the term $\left(\frac12\right)^n$
seq: 2-0.5^n | the sum up to that term
n: 0..10
hline: 2 | the totals approach 2
~~~

Compare that with adding $1+2+3+\dots$, where the terms grow and the total runs away like half of $n^2$:

~~~plot
title: 1 + 2 + … + n
seq: n | the term $k$
seq: n(n+1)/2 | the sum $\frac{n(n+1)}{2}$
n: 1..10
~~~

## Shifting the index

$\sum_{k=3}^{10}a_k$ with $j=k-2$ becomes $\sum_{j=1}^{8}a_{j+2}$. Change the bounds and the term together.

## Products

$$\prod_{k=1}^{n}a_k=a_1a_2\cdots a_n,\qquad \prod_{k=1}^{n}k=n!.$$

## Preview: expectation

For a random variable taking values $x$ with probabilities $P(X=x)$,

$$E[X]=\sum_x x\,P(X=x).$$

A fair die: $E[X]=\sum_{k=1}^{6}k\cdot\frac16=\frac{21}{6}=3.5$.

Think of the probabilities as weights on a ruler. The expectation is the point where the ruler balances, and for the die that is 3.5, a value the die never shows.

~~~plot
title: A fair die: six equal weights, balancing at 3.5
seq: 1/6 | $P(X=k)=\frac16$
n: 1..6
y: 0..0.3
vline: 3.5 | E[X] = 3.5
~~~

> [!use] Where sums turn up
>
> - **A savings plan.** CHF 200 at the end of every month for 10 years at 0.25% a month is a geometric sum: $200\cdot\frac{1.0025^{120}-1}{0.0025}\approx 27\,950$, of which 24 000 were paid in.
> - **Bond prices and mortgages.** The price of a bond is the sum of its discounted payments, $\sum_{k=1}^{n}\frac{C}{(1+r)^k}$. A mortgage payment is found by setting such a sum equal to the loan.
> - **Averages.** A mean is a sum divided by a count: $\bar x=\frac1n\sum_{k=1}^{n}x_k$. Every statistic in a report starts as a $\Sigma$.
> - **The fair price of an insurance.** Expected payout is each payout times its probability, added up. For a 1-in-200 chance of a CHF 30 000 claim the insurer needs at least $\frac{1}{200}\cdot30\,000=150$ per customer.
> - **Counting work.** In a league of 10 teams where everyone plays everyone once there are $9+8+\dots+1=\frac{9\cdot10}{2}=45$ matches.

> [!remember] Things to remember
>
> - $\sum_{k=1}^{n}a_k$ adds the terms $a_1$ to $a_n$. The index $k$ is a dummy: any letter gives the same sum.
> - Constants come out of a sum, and a sum of sums splits: $\sum(c\,a_k+b_k)=c\sum a_k+\sum b_k$.
> - $\sum_{k=1}^{n}k=\frac{n(n+1)}{2}$.
> - $\sum_{k=0}^{n-1}r^k=\frac{1-r^n}{1-r}$ for $r\neq1$. Proof: multiply the sum by $r$ and subtract.
> - $E[X]=\sum_x x\,P(X=x)$: each value times its probability, added up.`,
practice:[
 {q:String.raw`Compute $\sum_{k=1}^{5}(2k+1)$.`,a:String.raw`$2\cdot15+5=35$.`},
 {q:String.raw`Compute $\sum_{k=1}^{100}k$.`,a:String.raw`$\frac{100\cdot101}{2}=5050$.`},
 {q:String.raw`Compute $\sum_{k=0}^{4}2^k$ with the formula.`,a:String.raw`$\frac{1-2^5}{1-2}=31$.`},
 {q:String.raw`Compute $\prod_{k=1}^{4}\frac{k+1}{k}$.`,a:String.raw`$\frac21\cdot\frac32\cdot\frac43\cdot\frac54=5$. It telescopes.`},
 {q:String.raw`Rewrite $\sum_{k=2}^{6}k^2$ so the index starts at 0.`,a:String.raw`With $j=k-2$: $\sum_{j=0}^{4}(j+2)^2$.`},
 {q:String.raw`If $|r|<1$, what happens to $\frac{1-r^n}{1-r}$ as $n\to\infty$?`,a:String.raw`$r^n\to0$, so the sum tends to $\frac{1}{1-r}$: the infinite geometric series. You will prove this properly in week 12.`},
 {q:String.raw`Write $3+6+9+\dots+60$ with a $\Sigma$ and compute it.`,a:String.raw`$\sum_{k=1}^{20}3k=3\cdot\frac{20\cdot21}{2}=630$.`},
 {q:String.raw`Compute $\sum_{k=1}^{4}k^2$ with the formula, then check by adding the terms.`,a:String.raw`$\frac{4\cdot5\cdot9}{6}=30$, and $1+4+9+16=30$.`},
 {q:String.raw`Compute $\sum_{k=0}^{9}\left(\frac12\right)^k$.`,a:String.raw`Geometric sum with $r=\frac12$ and 10 terms: $\frac{1-(1/2)^{10}}{1-1/2}=2-\frac{1}{512}=\frac{1023}{512}\approx 1.998$.`},
 {q:String.raw`A game pays 0 with probability $\frac12$, 10 with probability $\frac14$ and 20 with probability $\frac14$. Compute $E[X]$.`,a:String.raw`$E[X]=0\cdot\frac12+10\cdot\frac14+20\cdot\frac14=7.5$.`}
]},
"w1d6":{md:String.raw`Review day. No new material: work through the mixed set below without looking back, then check. Anything you get wrong, reopen that day's lesson.

**Recap of the week**

- Exponents: $a^xa^y=a^{x+y}$, $(a^x)^y=a^{xy}$, $a^{-x}=1/a^x$.
- Logs: $\ln(xy)=\ln x+\ln y$, $\ln(x^p)=p\ln x$; $\ln$ and $e^x$ are inverses.
- Quadratics: $x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}$. Flip the inequality when multiplying by a negative.
- Functions: always state domain and codomain. Odd means $f(-x)=-f(x)$.
- Sums: $\sum_{k=1}^n k=\frac{n(n+1)}2$, $\sum_{k=0}^{n-1}r^k=\frac{1-r^n}{1-r}$.`,
practice:[
 {q:String.raw`Simplify $\dfrac{(2x)^3}{4x}$.`,a:String.raw`$\frac{8x^3}{4x}=2x^2$.`},
 {q:String.raw`Solve $\ln(3x)=2$.`,a:String.raw`$3x=e^2$, so $x=\frac{e^2}{3}\approx2.46$.`},
 {q:String.raw`Solve $x^2-4x+4=0$. How many solutions, and why?`,a:String.raw`$(x-2)^2=0$: one solution, $x=2$, because $\Delta=16-16=0$.`},
 {q:String.raw`Give domain and codomain for $f(x)=\sqrt{x-1}$.`,a:String.raw`$f:[1,\infty)\to[0,\infty)$ (or $\to\mathbb{R}$).`},
 {q:String.raw`Compute $\sum_{k=1}^{10}(3k-1)$.`,a:String.raw`$3\cdot55-10=155$.`},
 {q:String.raw`A stock returns +20% then −20%. Total simple return? Sum of log returns?`,a:String.raw`$1.2\cdot0.8=0.96$: total $-4\%$. Log: $\ln1.2+\ln0.8=\ln0.96\approx-0.0408$.`},
 {q:String.raw`Show that $f(x)=x^3-x$ is odd.`,a:String.raw`$f(-x)=-x^3+x=-(x^3-x)=-f(x)$.`}
]}
};

/* ---------------- Short videos ---------------- */
// One YouTube explanation under five minutes per lesson: [video id, title, channel, length in seconds].
// Weeks 1 to 4. Length and embedding were checked on 25 Nov 2026. A lesson without an entry asks for a link instead.
const VIDEOS={
 w1d1:{id:"aiTRQzVHAVE",title:"Laws of Exponents Explained with Examples",by:"Rashi Goel",sec:115},
 w1d2:{id:"daUlTsnCNRQ",title:"Natural Logarithms",by:"The Organic Chemistry Tutor",sec:169},
 w1d3:{id:"OmxdT5RzMq0",title:"Quadratic Formula: When to Use?",by:"Mario's Math Tutoring",sec:200},
 w1d4:{id:"IEzlvswCdn4",title:"Domain, Codomain and Notation of a Function",by:"Math Stuff",sec:268},
 w1d5:{id:"bjiDMt1X7oQ",title:"Introduction to Basic Statistical Notation: Sigma and Summation",by:"Jason Popan",sec:207},
 w2d1:{id:"lZuwL-AvEsc",title:"Set Notation(s)",by:"Steve Stein",sec:156},
 w2d2:{id:"6GisBl2PE84",title:"Big Conjunctions, Big Disjunctions and Quantifiers",by:"FREGE: A Logic Course",sec:229},
 w2d3:{id:"2FlMkP7jqQo",title:"Proof: Square Root of 2 is Irrational",by:"Wrath of Math",sec:241},
 w2d4:{id:"B2Qp3efqn0g",title:"What is Mathematical Induction?",by:"Karen Strader",sec:164},
 w2d5:{id:"BOzT6viUGyM",title:"Factorials and combinations",by:"Whiteboard Maths",sec:289},
 w3d1:{id:"0xbQNShjqqY",title:"Polynomials and the Factor Theorem",by:"Andrew Misseldine",sec:181},
 w3d2:{id:"esP-OiELrzM",title:"Graphing exponential functions and inverses",by:"Naomi Anderegg",sec:194},
 w3d3:{id:"pwo0dDf2Z7w",title:"Using the Unit Circle for Sine and Cosine",by:"Math with Dr. Claire",sec:205},
 w3d4:{id:"H4-ajAtbdd0",title:"Functions, Composite Functions and Inverses",by:"mathsquared",sec:288},
 w3d5:{id:"11WRjGhcnYc",title:"Solve Basic Absolute Value Equations (Graph and Interval Notation)",by:"Mathispower4u",sec:288},
 w4d1:{id:"RSGlurzBbYY",title:"Convergence of Sequences Explained",by:"Sciwords",sec:226},
 w4d2:{id:"ikXZLVxy8dM",title:"Comparing Sequences",by:"OpenStax",sec:129},
 w4d3:{id:"4baQj2-BZHM",title:"Sum of a Geometric Progression: Derivation of the Formula",by:"MathsSmart",sec:290},
 w4d4:{id:"jDTCKoPFFqc",title:"Pascal's Triangle Explained: An Easy Way to Expand (a + b)^n",by:"Classroom with Mr Precious",sec:263}
};

/* ---------------- Interview set (self-assessment topics) ---------------- */
const TARGETS=[
 {g:"Calculus",items:[
  ["Fundamental theorem of calculus, both parts",8],["Taylor's formula with remainder",13],["Taylor series of eˣ, and using it to get the Poisson mean",13],
  ["Series of log(1+x) and of log x around 1; why log 2 = 1 − ½ + ⅓ − …",13],["Improper integrals of x/(1+x²) and the Cauchy principal value",10],
  ["Binomial coefficient, and why C(n,k) = C(n,n−k) (in words and algebraically)",2],["Binomial theorem, with the sets the variables live in",4],
  ["Derivative as a limit; d/dx xⁿ from the definition",6],["Closed form of the infinite geometric series, with proof",12],
  ["Evaluating integrals by substitution over (−∞, ∞), and spotting divergence",11],["Gamma function recursion Γ(a) = (a−1)Γ(a−1)",11]]},
 {g:"Probability",items:[
  ["Distribution, mean and variance of a sum of independent binomials with the same p",25],["A computable cdf for a sum of binomials with different p",26],
  ["Expected number of trials until r successes",22],["E[X²], E[X³], E[X⁴] for N(0,σ²) without calculation",23],
  ["Simulating χ²ₙ and Student's t from standard normals",28],["Kolmogorov's three axioms, and what the σ-algebra is",20],
  ["From a characteristic function to the pdf, in words",26],["Weak LLN vs CLT: what each says and how they differ",27],
  ["Five common discrete distributions",22],["A common distribution whose expectation does not exist",24],
  ["Exponential pdf and cdf; distribution of a sum of iid exponentials",24],["Eigenvalues vs trace and determinant of a symmetric matrix",17]]},
 {g:"Stochastic processes",items:[
  ["Sub-σ-algebra and E[X|G] on a finite space, for G = {∅, Ω, A, Aᶜ}",32],["Why E[X|G] is the best estimate (and best in what sense)",32],
  ["Random walk: prove E[Sₙ | X₁…Xₙ₋₁] = Sₙ₋₁",33],["The same with probabilities 2/3 and 1/3",33],
  ["E[S_τ] for the first hitting time of level 5, and why",34],["The reflection principle, in words and formally",35],
  ["Definition of a discrete-time martingale; is the walk one?",34],["Strong LLN and CLT as formulas",27],
  ["An example where the LLN fails",27],["Uncorrelated vs independent; what the LLN needs",27],
  ["Monte Carlo integration on [0,1]ᵈ: algorithm and error ~ 1/√n",28],["Why the Monte Carlo rate does not get worse with d",28]]},
 {g:"Asset pricing & economics",items:[
  ["Simple vs log returns and how they relate",38],["Stylized facts of daily asset returns",38],
  ["Microeconomics at the level of one standard textbook",40],["Portfolio choice, CAPM and no-arbitrage at the level of Luenberger",44]]}
];

/* ---------------- Books ---------------- */
const BOOKS=[
 {h:"Named by the program",note:"From the program's eligibility page. The probability books are expected before you start; for the interview you discuss micro along one book of your choice; one finance book is strongly recommended.",list:[
  {t:"Probability Essentials",a:"Jean Jacod & Philip Protter · Springer (2nd edition)",tag:"Expected",why:"Measure-theoretic probability, compact and rigorous. Read it in weeks 31–37, after Blitzstein & Hwang."},
  {t:"Fundamental Probability: A Computational Approach",a:"Marc S. Paolella · Wiley",tag:"Expected",why:"Paolella teaches at UZH. Long, example-rich and close to the style of the self-assessment questions."},
  {t:"Intermediate Microeconomics: A Modern Approach",a:"Hal R. Varian · W. W. Norton",tag:"Pick one micro book",why:"The most readable of the three options. Use it for weeks 39–41."},
  {t:"Microeconomic Theory: Basic Principles and Extensions",a:"Walter Nicholson & Christopher Snyder · Cengage",tag:"Pick one micro book",why:"More mathematical alternative to Varian."},
  {t:"Microeconomics",a:"Robert Pindyck & Daniel Rubinfeld · Pearson",tag:"Pick one micro book",why:"Less mathematical alternative."},
  {t:"Investment Science",a:"David G. Luenberger · Oxford University Press (2nd edition)",tag:"Pick one finance book",why:"Best fit for you: returns, portfolios, CAPM, bonds and options with clear math. Use it for weeks 38 and 42–45."},
  {t:"Principles of Financial Economics",a:"Stephen F. LeRoy & Jan Werner · Cambridge University Press (2nd edition)",tag:"Pick one finance book",why:"Theory-heavy (state prices, no-arbitrage). Good after Luenberger."},
  {t:"Finance and Financial Intermediation",a:"Harold L. Cole · Oxford University Press",tag:"Pick one finance book",why:"Finance with a banking focus. The third option on the list."}
 ]},
 {h:"Bridge books for starting from zero",note:"Not on the program's list. These get you from one business-math course to the level the program's books assume.",list:[
  {t:"How to Prove It: A Structured Approach",a:"Daniel J. Velleman · Cambridge University Press (3rd edition)",tag:"Weeks 2–4",why:"Teaches you to read and write proofs, which the interview expects."},
  {t:"Calculus, Volumes 1 and 2",a:"OpenStax (Gilbert Strang, Edwin Herman et al.)",tag:"Free · Weeks 5–14",link:"https://openstax.org/details/books/calculus-volume-1",why:"Free, complete calculus textbook. Volume 2 covers integration techniques, improper integrals and series."},
  {t:"Introduction to Linear Algebra",a:"Gilbert Strang · Wellesley-Cambridge Press",tag:"Weeks 15–18",why:"Pairs with Strang's free MIT 18.06 video lectures."},
  {t:"Introduction to Probability",a:"Joseph K. Blitzstein & Jessica Hwang · CRC Press (2nd edition)",tag:"Free PDF · Weeks 19–30",link:"https://projects.iq.harvard.edu/stat110",why:"The best first probability book. Free online with the Harvard Stat 110 lectures."}
 ]}
];
const BUY=["Introduction to Probability — Blitzstein & Hwang (or the free PDF)","Fundamental Probability — Paolella","Probability Essentials — Jacod & Protter","Intermediate Microeconomics — Varian","Investment Science — Luenberger"];

