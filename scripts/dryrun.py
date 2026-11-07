"""Dry run: ask Instagram to ingest a video from the media URL, wait until it is processed,
then STOP - nothing is published (an unpublished container expires on its own after 24 h)."""
import json, os, sys, time, urllib.parse, urllib.request
API = "https://graph.facebook.com/v25.0"
TOKEN, IG = os.environ["IG_TOKEN"], os.environ["IG_USER_ID"]
f = sys.argv[1] if len(sys.argv) > 1 else "gps.mp4"
url = f"https://aryanavlani.github.io/sayless/{f}"
def call(method, path, **p):
    p["access_token"] = TOKEN; data = urllib.parse.urlencode(p).encode()
    req = urllib.request.Request(f"{API}/{path}", data=data, method="POST") if method == "POST" else urllib.request.Request(f"{API}/{path}?{data.decode()}")
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return json.load(r)
    except urllib.error.HTTPError as e: raise SystemExit(f"API error {e.code}: {e.read().decode()[:400]}")
c = call("POST", f"{IG}/media", media_type="REELS", video_url=url, caption="dry run - not published", is_ai_generated="true")
print("container created:", c["id"], "for", url)
for i in range(20):
    time.sleep(30)
    s = call("GET", c["id"], fields="status_code,status")
    print("status:", s.get("status_code"), s.get("status", ""))
    if s.get("status_code") in ("FINISHED", "ERROR", "EXPIRED"): break
print("RESULT:", s.get("status_code"), "- not published (dry run)")
if s.get("status_code") != "FINISHED": sys.exit(1)
