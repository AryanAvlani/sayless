"""Add a finished reel to the posting system.

  python3 scripts/add_reel.py <video.mp4> <slug> "<caption>" [publish_at]

- publish_at: ISO time with zone, e.g. 2026-11-08T19:00:00+05:30. Omit it to add the reel as a DRAFT
  (stored and hosted, but never posted until a time is set and status becomes "queued").
- The video is re-encoded to Instagram specs (H.264 High, <=5 Mbps, AAC 48 kHz, faststart) and put on the
  `media` branch, which is rebuilt from scratch every time so old videos never pile up in git history.
- Run from a clone of AryanAvlani/sayless with push access. Needs ffmpeg + git.
"""
import json, os, shutil, subprocess, sys, tempfile
from datetime import datetime

def sh(*a, cwd=None): subprocess.run(a, check=True, cwd=cwd)

src, slug, caption = sys.argv[1], sys.argv[2], sys.argv[3]
when = sys.argv[4] if len(sys.argv) > 4 else None
if when: datetime.fromisoformat(when)                      # validate
repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
qpath = os.path.join(repo, "queue", "queue.json")
q = json.load(open(qpath))
if any(i["id"] == slug for i in q["items"]): sys.exit(f"'{slug}' is already in the queue")
fname = f"{slug}.mp4"

# 1) rebuild the media branch with every not-yet-published video + this one
tmp = tempfile.mkdtemp()
remote = subprocess.check_output(["git", "remote", "get-url", "origin"], cwd=repo, text=True).strip()
have = subprocess.run(["git", "ls-remote", "--exit-code", "--heads", remote, "media"], cwd=repo).returncode == 0
old = tempfile.mkdtemp()
if have: sh("git", "clone", "-q", "--depth", "1", "--branch", "media", remote, old)
keep = {i["file"] for i in q["items"] if i["status"] != "published"}
for f in keep:
    if os.path.exists(os.path.join(old, f)): shutil.copy(os.path.join(old, f), tmp)
sh("ffmpeg", "-v", "error", "-y", "-i", src, "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-maxrate", "5M", "-bufsize", "10M",
   "-pix_fmt", "yuv420p", "-profile:v", "high", "-g", "30", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-movflags", "+faststart",
   os.path.join(tmp, fname))
open(os.path.join(tmp, ".nojekyll"), "w").close()
open(os.path.join(tmp, "index.html"), "w").write("<!doctype html><title>sayless</title>")
sh("git", "init", "-q", cwd=tmp); sh("git", "checkout", "-q", "--orphan", "media", cwd=tmp)
sh("git", "add", "-A", cwd=tmp)
sh("git", "-c", "user.name=sayless-bot", "-c", "user.email=sayless-bot@users.noreply.github.com", "commit", "-q", "-m", f"media: {slug}", cwd=tmp)
sh("git", "push", "-q", "-f", remote, "media", cwd=tmp)

# 2) add the queue entry on main
q["items"].append({"id": slug, "file": fname, "caption": caption, "publish_at": when or "", "status": "queued" if when else "draft"})
json.dump(q, open(qpath, "w"), indent=2)
sh("git", "add", "queue/queue.json", cwd=repo)
sh("git", "-c", "user.name=sayless-bot", "-c", "user.email=sayless-bot@users.noreply.github.com", "commit", "-q", "-m", f"queue: add {slug}", cwd=repo)
sh("git", "push", "-q", cwd=repo)
print(f"added {slug} as {'queued for ' + when if when else 'DRAFT'}; video will be live at https://aryanavlani.github.io/sayless/{fname} in ~2 min")
