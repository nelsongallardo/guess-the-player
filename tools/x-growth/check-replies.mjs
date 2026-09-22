import { XBrowserPublisher } from './lib/x-browser-publisher.mjs';
const publisher=new XBrowserPublisher({launchOptions:{channel:'chrome',headless:true,chromiumSandbox:true}});
try {
  const result=await publisher.preflight();
  console.log(JSON.stringify(result));
  if(!result.authenticated||result.challengePresent||result.accountHandle!=='derabona_club')process.exitCode=1;
} finally {await publisher.close();}
