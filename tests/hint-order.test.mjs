import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const block=id=>html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))[1];
const plain=x=>JSON.parse(JSON.stringify(x));
const context=vm.createContext({});
vm.runInContext(block('roster-data')+block('crest-data')+block('game-model')+block('game-ui').match(/const COPY = [\s\S]*?\n};/)[0],context);
const {g,copy}=vm.runInContext('({g:CareerGame,copy:COPY})',context);

test('both locale hint labels and help describe position, nationality, years in order',()=>{
  assert.deepEqual(plain(copy.en.hints),['Position','Nationality','Years']);
  assert.deepEqual(plain(copy.es.hints),['Posición','Nacionalidad','Años']);
  assert.match(copy.en.rules,/position → nationality → each club’s years/);
  assert.match(copy.es.rules,/posición → nacionalidad → los años en cada club/);
  assert.match(html,/posición, nacionalidad o los años en cada club/);
  assert.match(html,/position, nationality, or each club's years/);
});

test('all four shipped renderers pair labels with the right values and gate unreached clues',()=>{
  const game=block('game-ui'),daily=block('daily-ui');
  const guestHelper=game.match(/const hintValues=p=>([^;]+);/)[1];
  const fragments=[
    ['guest Unlimited',`const values=${guestHelper};`+game.match(/\$\('hints'\)\.replaceChildren\([^\n]+/)[0]],
    ['guest Daily',daily.match(/const values=\[[^\n]+/)[0]],
    ['ranked Daily',game.match(/const values=\[round\.clue[^\n]+/)[0]+'\n'+game.match(/document\.getElementById\('hints'\)\.replaceChildren\([^\n]+/)[0]],
    ['ranked Unlimited',game.match(/const clues=\[[^\n]+/)[0]+'\n'+game.match(/\$\('hints'\)\.replaceChildren\(\.\.\.x\.hints[^\n]+/)[0]]
  ];
  for(const language of ['en','es'])for(const hints of [0,1,2,3])for(const [name,source] of fragments){
    let items=[];const target={replaceChildren:(...x)=>items=x};
    const c=copy[language],p={country:'Argentina',position:'Forward'};
    const r={hints,clueCountry:p.country,cluePosition:p.position};
    // Deliberately send both fields at every count: client may not reveal extras.
    vm.runInNewContext(source,{p,r,round:r,language,x:c,y:c,t:c,copy:()=>c,
      country:()=> 'Argentina',position:()=>language==='es'?'Delantero':'Forward',
      COUNTRIES_ES:{Argentina:'Argentina'},POSITIONS_ES:{Forward:'Delantero'},
      el:(tag,text,className)=>({text,className}),$:()=>target,document:{getElementById:()=>target}});
    const values=[language==='es'?'Delantero':'Forward','Argentina',c.yearsRevealed];
    assert.deepEqual(items.map(x=>x.text),Array.from(c.hints,(label,i)=>i<hints?`${label}: ${values[i]}`:`${i+1}. ${label}`),`${name} ${language} ${hints}`);
    assert.equal(items.filter(x=>x.className==='revealed').length,hints);
  }
});

test('ranked renderers never synthesize a missing server clue from the local roster',()=>{
  const game=block('game-ui');
  for(const fragment of [game.match(/const values=\[round\.clue[^\n]+/)[0],game.match(/const clues=\[[^\n]+/)[0]]){
    assert.doesNotMatch(fragment,/country\(p\)|position\(p\)|p\.country|p\.position/);
  }
});

test('legacy Unlimited saves with one/two/three hints retain engaged rounds and scoring',()=>{
  const saved=JSON.parse(readFileSync(new URL('legacy-save-160.json',import.meta.url),'utf8'));
  for(const hints of [1,2,3]){
    const s=structuredClone(saved);g.roundAt(s).hints=hints;
    const before=JSON.stringify(s);assert.equal(g.validate(s),true);
    assert.equal(g.refreshUnstartedRivals(s),false);assert.equal(JSON.stringify(s),before);
    assert.deepEqual(plain(g.hintValues(g.playerAt(s))),[g.playerAt(s).position,g.playerAt(s).country]);
    assert.deepEqual([0,1,2,3].map(n=>g.pointsFor(n,1000)),[100,80,60,40]);
  }
});

test('existing Daily one/two/three-hint documents reload without rewriting rounds or frozen payloads',()=>{
  const c=vm.createContext({structuredClone,Date,JSON,Map,Set,URL});
  vm.runInContext(block('daily-challenge')+';globalThis.api=DailyChallenge',c);
  for(const hints of [1,2,3]){
    let value=null;const storage={getItem:()=>value,setItem:(k,v)=>value=v,removeItem:()=>{value=null;}};
    const config={now:()=>Date.parse('2026-10-04T12:00:00Z')},p=c.api.createPersistence(storage,config);
    p.today();for(let i=0;i<hints;i++)p.hint();
    const before=JSON.stringify(p.today());
    const reloaded=c.api.createPersistence(storage,config).today();
    assert.equal(JSON.stringify(reloaded),before);assert.equal(reloaded.game.rounds[0].hints,hints);
  }
});
