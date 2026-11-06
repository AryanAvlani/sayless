"""Weekly stats snapshot -> insights/<date>.json (followers, and per-reel likes/comments + insights when permitted)."""
import json, os, urllib.parse, urllib.request
from datetime import date
API = "https://graph.facebook.com/v25.0"
TOKEN, IG = os.environ["IG_TOKEN"], os.environ["IG_USER_ID"]
def get(path, **p):
    p["access_token"] = TOKEN
    try:
        with urllib.request.urlopen(f"{API}/{path}?{urllib.parse.urlencode(p)}", timeout=60) as r: return json.load(r)
    except urllib.error.HTTPError as e: return {"error": json.loads(e.read().decode() or "{}").get("error", {}).get("message", str(e.code))}
acct = get(IG, fields="username,followers_count,media_count")
media = get(f"{IG}/media", fields="id,caption,media_product_type,timestamp,like_count,comments_count,permalink", limit=50).get("data", [])
for m in media:
    m["caption"] = (m.get("caption") or "")[:80]
    m["insights"] = {}
    for metric in ("reach", "views", "shares", "saved", "total_interactions", "ig_reels_avg_watch_time"):
        r = get(f"{m['id']}/insights", metric=metric)
        m["insights"][metric] = r["data"][0]["values"][0]["value"] if "data" in r and r["data"] else r.get("error")
out = {"date": date.today().isoformat(), "account": acct, "media": media}
os.makedirs("insights", exist_ok=True)
json.dump(out, open(f"insights/{out['date']}.json", "w"), indent=2)
print(json.dumps(acct), len(media), "media")
