import { parseResults } from "./search.js";
const html = `
<div class="result"><h2><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fdocs.python.org%2F3%2Ftutorial%2Fintroduction.html&amp;rut=abc">An <b>Informal</b> Introduction &amp; more</a></h2>
<a class="result__snippet" href="x">Numbers, <b>strings</b> and lists.</a></div>
<div class="result"><a rel="nofollow" class="result__a" href="//duckduckgo.com/y.js?ad=1">Ad</a></div>
<div class="result"><a class="result__a" href="https://realpython.com/python-variables/">Variables</a></div>`;
const hits = parseResults(html);
console.log(hits);
if (hits.length !== 2 || hits[0].url !== "https://docs.python.org/3/tutorial/introduction.html"
  || hits[0].title !== "An Informal Introduction & more" || hits[0].snippet !== "Numbers, strings and lists.") process.exit(1);
console.log("search parser OK");
