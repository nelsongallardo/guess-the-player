import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const context=vm.createContext({});
for(const id of ['roster-data','game-model'])vm.runInContext(html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`))[1],context);
const {g,players}=vm.runInContext('({g:CareerGame,players:PLAYERS})',context);
const byName=new Map(g.candidates.map(p=>[p.name,p]));
const rows=players.map(p=>{
  const candidates=g.eligibleRivals(p).map(n=>byName.get(n));
  const contemporaries=candidates.filter(q=>g.matchTier(p,q)===0);
  return {id:p.id,name:p.name,system:g.originFor(p).system,contemporaries:contemporaries.length,
    sameSystem:candidates.filter(q=>g.originTier(p,q)===0).length,
    peers:contemporaries.map(q=>q.name)};
});
console.log(JSON.stringify({playable:players.length,extraProfiles:g.candidates.length-players.length,
  fullyCovered:rows.filter(r=>r.contemporaries>=4).length,gaps:rows.filter(r=>r.contemporaries<4),rows},null,2));
if(rows.some(r=>r.contemporaries<4))process.exitCode=1;
