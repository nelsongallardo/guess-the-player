#!/usr/bin/env node
// Read-only live regression: opens source/dialog, never types or submits.
import fs from 'node:fs';
import path from 'node:path';
import {acquireProcessLock} from '../lib/process-lock.mjs';
import {XBrowserPublisher} from '../lib/x-browser-publisher.mjs';
import {assertSourceSnapshot} from '../lib/source-snapshot.mjs';
const home=process.env.HERMES_HOME;
if(!home)throw Error('explicit HERMES_HOME required');
const c=JSON.parse(fs.readFileSync(path.join(home,'derabona-replies.json')));
const release=acquireProcessLock(path.join(c.state,'reply-service.lock'));
if(!release)throw Error('service busy');
let publisher;
try {
 const queuePath=path.join(c.state,'reply-jobs.json');
 const before=fs.readFileSync(queuePath);
 const q=JSON.parse(before);
 if(q.jobs.some(j=>['queued','publishing'].includes(j.status)))throw Error('pending work; cannot inspect');
 const job=q.jobs.find(j=>j.id===process.argv[2]);
 if(!job)throw Error('unknown job');
 publisher=new XBrowserPublisher({launchOptions:{channel:'chrome',headless:true,chromiumSandbox:true}});
 const preflight=await publisher.preflight();
 if(!preflight.authenticated||preflight.accountHandle!=='derabona_club'||preflight.challengePresent)throw Error('manual login required');
 await publisher.inspectSource(job);
 await publisher.page.locator('article').filter({has:publisher.page.locator(`a[href="/${job.sourceHandle}/status/${job.sourceId}"]`)}).locator('[data-testid="reply"]').click();
 const dialog=publisher.page.locator('[role="dialog"]:not(:has([role="dialog"])):visible');
 await dialog.locator('[data-testid="tweetText"]').waitFor();
 await assertSourceSnapshot(job,dialog,{destinations:publisher.destinations});
 if(!before.equals(fs.readFileSync(queuePath)))throw Error('queue changed during verification');
 console.log(JSON.stringify({authenticated:true,sourceMatches:true,dialogMatches:true,typed:false,submitted:false,jobStateUnchanged:true}));
} finally {await publisher?.close();release();}
