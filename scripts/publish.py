"""Publish due reels from queue/queue.json to Instagram (Instagram API, system-user token via Facebook Login for Business).
Runs in GitHub Actions. Env: IG_TOKEN, IG_USER_ID, PAGES_BASE (e.g. https://aryanavlani.github.io/sayless). Media files live on the "media" branch (served by GitHub Pages); that branch is force-pushed fresh each week so videos never pile up in git history.
Docs: https://developers.facebook.com/docs/instagram-platform/content-publishing
"""
import json, os, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone

API = "https://graph.facebook.com/v25.0"   # system-user token (never expires) works on the Facebook host
TOKEN, IG = os.environ["IG_TOKEN"], os.environ["IG_USER_ID"]
BASE = os.environ.get("PAGES_BASE", "https://aryanavlani.github.io/sayless").rstrip("/")
QUEUE = "queue/queue.json"

def call(method, path, **params):
    params["access_token"] = TOKEN
    data = urllib.parse.urlencode(params).encode()
    url = f"{API}/{path}"
    req = urllib.request.Request(url, data=data, method="POST") if method == "POST" else urllib.request.Request(f"{url}?{data.decode()}")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise SystemExit(f"API error {e.code} on {method} {path}: {body}")

def publish(item):
    url = f"{BASE}/{item['file']}"
    c = call("POST", f"{IG}/media", media_type="REELS", video_url=url, caption=item["caption"], share_to_feed="true")
    cid = c["id"]; print("container", cid)
    for _ in range(20):                       # up to ~10 min
        time.sleep(30)
        st = call("GET", cid, fields="status_code,status").get("status_code")
        print("status", st)
        if st == "FINISHED": break
        if st in ("ERROR", "EXPIRED"): raise SystemExit(f"container {cid} failed: {st}")
    else:
        raise SystemExit(f"container {cid} not ready in time")
    m = call("POST", f"{IG}/media_publish", creation_id=cid)
    return m["id"]

def main():
    q = json.load(open(QUEUE))
    now = datetime.now(timezone.utc)
    due = [i for i in q["items"] if i["status"] == "queued" and datetime.fromisoformat(i["publish_at"]) <= now]
    if not due:
        print("nothing due"); return
    item = sorted(due, key=lambda i: i["publish_at"])[0]     # one per run, oldest first
    print("publishing", item["id"])
    mid = publish(item)
    item.update(status="published", media_id=mid, published_at=now.isoformat(timespec="seconds"))
    json.dump(q, open(QUEUE, "w"), indent=2)
    print("published", mid)

if __name__ == "__main__":
    main()
