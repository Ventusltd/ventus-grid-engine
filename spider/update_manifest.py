"""Add newly published graphs to the Spider dashboard's manifest, once they are proven reachable.

Reads spider/sources.yml (registries published by other repositories), fetches each registry's
features.yml, fetches every graph it lists, counts what the receiver would see (nodes or features;
edges or links), and merges the proven entries into spider/manifest.json.

Rules, in the spirit of the receiver's own README:
- an entry written by hand (no "registry" field) is never changed;
- an entry this script added is updated when its registry changes it, and never deleted;
- a graph that cannot be fetched, or is empty, is not added and is reported instead;
- index.html is never touched: the receiver already reads every manifest entry it is given.
"""
import datetime
import json
import os
import pathlib
import sys
import urllib.request

import yaml

HERE = pathlib.Path(__file__).resolve().parent
MANIFEST = HERE / "manifest.json"
SOURCES = HERE / "sources.yml"
FIELDS = ("title", "path", "edges_path", "source_spider", "description")


def fetch(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": "ventus-grid-engine spider-features", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read()


def count(raw):
    """Nodes and edges as index.html's normaliseGenericGraph would count them."""
    nodes = raw.get("nodes") if isinstance(raw.get("nodes"), list) else raw.get("features") if isinstance(raw.get("features"), list) else []
    edges = raw.get("edges") if isinstance(raw.get("edges"), list) else raw.get("links") if isinstance(raw.get("links"), list) else []
    return len(nodes), len(edges)


manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
by_id = {g["id"]: g for g in manifest["graphs"]}
sources = yaml.safe_load(SOURCES.read_text(encoding="utf-8"))
today = datetime.date.today().isoformat()
added, updated, refused, unchanged = [], [], [], []

for reg in sources.get("registries") or []:
    url = reg["url"]
    try:
        status, body = fetch(url)
        features = yaml.safe_load(body.decode("utf-8"))
    except Exception as exc:  # the registry itself is unreachable: report, change nothing
        refused.append((url, f"registry unreachable: {str(exc)[:120]}"))
        continue
    for g in features.get("graphs") or []:
        gid = g.get("id")
        if not gid or not g.get("path"):
            continue
        existing = by_id.get(gid)
        if existing is not None and "registry" not in existing:
            unchanged.append((gid, "written by hand; left alone"))
            continue
        try:
            status, body = fetch(g["path"])
            n, e = count(json.loads(body.decode("utf-8-sig")))
            if n == 0:
                raise ValueError("no nodes")
        except Exception as exc:
            refused.append((gid, f"{g['path']} — {str(exc)[:120]}"))
            continue
        entry = {"id": gid}
        for f in FIELDS:
            entry[f] = g.get(f)
        entry["verified"] = f"{today} HTTP {status}, {n} nodes / {e} edges"
        entry["registry"] = url
        if existing is None:
            manifest["graphs"].append(entry)
            by_id[gid] = entry
            added.append((gid, entry["verified"]))
        elif any(existing.get(f) != entry[f] for f in FIELDS):
            existing.update(entry)
            updated.append((gid, entry["verified"]))
        else:
            existing["verified"] = entry["verified"]
            unchanged.append((gid, entry["verified"]))

if added or updated or unchanged:
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

lines = ["## Spider features", ""]
for label, items in (("Added", added), ("Updated", updated), ("Unchanged", unchanged), ("Not added", refused)):
    if items:
        lines.append(f"**{label}:**")
        lines += [f"- `{gid}` — {why}" for gid, why in items]
        lines.append("")
report = "\n".join(lines)
print(report)
if os.environ.get("GITHUB_STEP_SUMMARY"):
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
        f.write(report + "\n")
sys.exit(0)
