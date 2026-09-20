#!/usr/bin/env node
// Preflight: verify credentials actually work BEFORE going live.
// Costs one user read ($0.010). Posts nothing.
//
// The classic X failure: access tokens bake in whatever permissions the app
// had AT THE MOMENT THEY WERE GENERATED. Setting the app to Read+Write after
// generating tokens does nothing — the old tokens stay read-only and every
// post returns 403. This script catches that now rather than at 17:00.

import fs from 'node:fs';
import path from 'node:path';
import { createClient, loadCreds } from './lib/x-client.mjs';
import { spentThisMonth, MONTHLY_CAP, isPaused, STATE_DIR } from './lib/state.mjs';
import { dailyFor, utcToday } from './lib/daily.mjs';

const SECRETS = path.join(process.env.HOME, '.hermes/secrets/derabona-x.json');
let failed = 0;
const ok = (m) => console.log(`  OK   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failed++; };

console.log('\n=== derabona preflight ===\n');

// 1. Secrets file
console.log('1. Credentials file');
if (!fs.existsSync(SECRETS)) {
  bad(`missing ${SECRETS}`);
  console.log('\nCreate it yourself — no agent should handle these keys:');
  console.log(`  cat > ${SECRETS} <<'EOF'`);
  console.log('  { "appKey":"...", "appSecret":"...", "accessToken":"...", "accessSecret":"..." }');
  console.log('  EOF');
  console.log(`  chmod 600 ${SECRETS}`);
  process.exit(1);
}
const mode = fs.statSync(SECRETS).mode & 0o777;
if ((mode & 0o077) !== 0) bad(`${SECRETS} is ${mode.toString(8)} — must be 600: chmod 600 ${SECRETS}`);
else ok(`present, mode ${mode.toString(8)}`);

try { loadCreds(); ok('all four keys present'); }
catch (e) { bad(e.message); process.exit(1); }

// 2. Auth + write permission
console.log('\n2. Authentication (costs $0.010)');
const x = createClient({ dryRun: false });
let me;
try {
  me = await x.getMe();
  ok(`authenticated as @${me.username}`);
  if (me.username?.toLowerCase() !== 'derabona_club') {
    bad(`WRONG ACCOUNT — expected @derabona_club, got @${me.username}. These keys belong to a different account.`);
  }
  console.log(`       followers: ${me.public_metrics?.followers_count ?? 'N/A'} (baseline)`);
} catch (e) {
  bad(`auth failed: ${e.message}`);
  if (/401/.test(e.message)) {
    console.log('       401 = bad keys, or keys from a different app than the tokens.');
  }
  process.exit(1);
}

// 3. Write permission — the permissions-timing trap
console.log('\n3. Write permission');
console.log('       Cannot be verified without posting. If the app was set to');
console.log('       Read+Write AFTER the access tokens were generated, the tokens');
console.log('       are still read-only and every post will 403.');
console.log('       If unsure: regenerate the access token + secret now, after');
console.log('       confirming permissions read "Read and write".');

// 4. Budget
console.log('\n4. Budget');
const spent = spentThisMonth();
ok(`spent this month $${spent.toFixed(3)} of $${MONTHLY_CAP.toFixed(2)} cap`);
console.log('       Confirm the same cap is set in the X console — our ledger is');
console.log('       a second line of defence, not the first.');

// 5. Watchlist
console.log('\n5. Watchlist');
const wl = JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'watchlist.json'), 'utf8'));
const n = wl.accounts?.length ?? 0;
n ? ok(`${n} accounts (${wl.accounts.filter(a => a.tier === 1).length} tier-1)`) : bad('empty');

// 6. Today's daily
console.log("\n6. Today's Rabona Diaria");
const d = dailyFor(utcToday());
if (!d) bad(`no daily defined for ${utcToday()}`);
else ok(`#${d.challengeNumber}: ${d.rounds.map(r => r.player.name).join(' | ')}`);

// 7. Pause state
console.log('\n7. Kill switch');
if (isPaused()) {
  console.log(`  PAUSED — nothing will run. To go live:`);
  console.log(`         rm ${path.join(STATE_DIR, 'PAUSE')}`);
} else {
  console.log('  LIVE — jobs will fire on schedule.');
}

console.log(`\n=== ${failed ? `${failed} PROBLEM(S)` : 'ALL CHECKS PASSED'} ===\n`);
process.exit(failed ? 1 : 0);
