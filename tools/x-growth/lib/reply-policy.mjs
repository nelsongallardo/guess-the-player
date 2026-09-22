import { isPaused, loadPosts, today } from './state.mjs';
const MAX = 5;
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
export function similarity(a,b) { a=norm(a);b=norm(b); if(!a||!b)return 0; const p=Array.from({length:b.length+1},(_,i)=>i); for(let i=1;i<=a.length;i++){const c=[i];for(let j=1;j<=b.length;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p.splice(0,p.length,...c);} return 1-p[b.length]/Math.max(a.length,b.length); }
export function checkReplyPolicy(draft,{queue=[],now=new Date(),posts=loadPosts()}={}) {
 if(isPaused()) return {ok:false,reason:'paused'};
 if((now-new Date(draft.batchAt||now))/3.6e6>=12) return {ok:false,reason:'stale'};
 const day=new Date(now).toISOString().slice(0,10);
 const unresolved=queue.filter(q=>['published','uncertain','publishing'].includes(q.status)&&!posts.some(p=>q.publishedId&&p.tweetId===q.publishedId)).map(q=>({kind:'reply',at:q.publishedAt||q.attemptStartedAt||q.createdAt,date:(q.publishedAt||q.attemptStartedAt||q.createdAt||'').slice(0,10),handle:q.sourceHandle,text:q.replyText}));
 const history=[...posts,...unresolved];
 const recentPosts=history.filter(p=>p.kind==='reply'&&new Date(p.at||p.date).getTime()>=new Date(now).getTime()-14*864e5);
 const todays=history.filter(p=>p.kind==='reply'&&p.date===day);
 if(todays.length>=MAX)return {ok:false,reason:'daily cap'};
 if(todays.some(p=>p.handle===draft.handle||p.handle===draft.sourceHandle))return {ok:false,reason:'already replied today'};
 if(recentPosts.some(p=>similarity(p.text,draft.reply)>=.85))return {ok:false,reason:'too similar'};
 return {ok:true};
}
export function autoSendEligible(draft,{enabled=process.env.DERABONA_REPLY_AUTO_SEND==='1',now=new Date(),approvalHistory=[]}={}) {
 if(!enabled)return false;
 const decided=approvalHistory.filter(x=>x.decision);
 const clean=decided.filter(x=>x.decision==='approved'&&!x.edited);
 const oldest=decided.map(x=>new Date(x.at||now).getTime()).filter(Number.isFinite).sort((a,b)=>a-b)[0];
 const age=(now-new Date(draft.created_at||now))/36e5;
 return decided.length>0&&oldest<=now.getTime()-21*24*36e5&&clean.length/decided.length>=.9&&age>=24&&draft.tag==='nostalgia'&&!/https?:\/\//i.test(draft.reply)&&!draft.newsAdjacent;
}
