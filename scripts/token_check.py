"""Refresh the long-lived Instagram token and warn before it expires.
Docs: https://developers.facebook.com/docs/instagram-platform/reference/refresh_access_token
"""
import json, os, urllib.request, urllib.parse
tok = os.environ["IG_TOKEN"]
q = urllib.parse.urlencode({"grant_type": "ig_refresh_token", "access_token": tok})
with urllib.request.urlopen(f"https://graph.instagram.com/refresh_access_token?{q}", timeout=60) as r:
    d = json.load(r)
days = d.get("expires_in", 0) / 86400
same = d.get("access_token") == tok
print(f"refreshed: expires in {days:.1f} days; token string unchanged: {same}")
out = os.environ.get("GITHUB_OUTPUT")
if out:
    with open(out, "a") as f:
        f.write(f"changed={'false' if same else 'true'}\n")
        if not same:
            f.write(f"new_token={d['access_token']}\n")
