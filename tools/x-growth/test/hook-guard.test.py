"""Guard test: a bare number must do nothing unless a fresh pending batch exists."""
import asyncio, json, os, sys, tempfile, time
from pathlib import Path

tmp = Path(tempfile.mkdtemp())
os.environ["DERABONA_STATE"] = str(tmp)
sys.path.insert(0, str(Path.home() / ".hermes/hooks/derabona-approvals"))

import handler
handler.STATE = tmp
handler.DRAFTS = tmp / "drafts.json"

spawned = []
handler.subprocess.Popen = lambda cmd, **kw: spawned.append(cmd)
handler._send = lambda text: None

def write(batches):
    handler.DRAFTS.write_text(json.dumps({"batches": batches}))

def batch(age_s, status="pending"):
    at = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(time.time() - age_s))
    return {"id": "b1", "at": at, "drafts": [
        {"id": "b1-1", "n": 1, "status": status, "handle": "x"},
        {"id": "b1-2", "n": 2, "status": status, "handle": "y"},
    ]}

def run(msg):
    spawned.clear()
    asyncio.run(handler.handle("agent:start", {"platform": "telegram", "message": msg}))
    return list(spawned)

fails = 0
def check(name, cond):
    global fails
    if not cond: fails += 1
    print(f"{'PASS' if cond else 'FAIL'} {name}")

# no drafts file at all
check("bare '1' with no drafts file does nothing", run("1") == [])

# stale batch
write([batch(13 * 3600)])
check("bare '1' with a 13h-old batch does nothing", run("1") == [])

# already-decided batch
write([batch(600, status="approved")])
check("bare '1' with no pending drafts does nothing", run("1") == [])

# fresh pending batch
write([batch(600)])
out = run("1")
check("bare '1' with fresh pending batch spawns approve", len(out) == 1 and out[0][-1] == "b1-1")

write([batch(600)])
out = run("1,2")
check("'1,2' approves both", len(out) == 1 and out[0][-2:] == ["b1-1", "b1-2"])

write([batch(600)])
check("out-of-range '7' does nothing", run("7") == [])

write([batch(600)])
out = run("skip")
check("'skip' spawns skip", len(out) == 1 and out[0][-1] == "skip")

write([batch(600)])
check("ordinary chat text does nothing", run("hola, todo bien?") == [])
check("number inside a sentence does nothing", run("dale, el 1 me gusta mas") == [])

# non-telegram platform
write([batch(600)])
spawned.clear()
asyncio.run(handler.handle("agent:start", {"platform": "cli", "message": "1"}))
check("non-telegram platform ignored", spawned == [])

print("\n" + ("ALL HOOK GUARD TESTS PASSED" if not fails else f"{fails} FAILED"))
sys.exit(1 if fails else 0)
