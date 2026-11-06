"""Read-only check that IG_TOKEN works. Prints no secrets. Posts nothing."""
import json, os, urllib.request, urllib.parse
tok, ig = os.environ["IG_TOKEN"], os.environ["IG_USER_ID"]
print("token length:", len(tok), "prefix:", tok[:4])
for host in ("https://graph.instagram.com/v25.0", "https://graph.facebook.com/v25.0"):
    for path, fields in (("me", "id,username,user_id,account_type"), (ig, "id,username"), (f"{ig}/content_publishing_limit", "config,quota_usage")):
        url = f"{host}/{path}?" + urllib.parse.urlencode({"fields": fields, "access_token": tok})
        try:
            with urllib.request.urlopen(url, timeout=30) as r: print("OK ", host.split('//')[1].split('/')[0], path.replace(ig, "<IG>"), json.load(r))
        except urllib.error.HTTPError as e:
            print("ERR", host.split('//')[1].split('/')[0], path.replace(ig, "<IG>"), e.code, e.read().decode()[:200])
