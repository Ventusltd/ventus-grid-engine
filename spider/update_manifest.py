"""Add newly published graphs to the Spider dashboard's manifest, once they are proven reachable.

Reads spider/sources.yml (registries published by other repositories), fetches each registry's
features.yml, fetches every graph it lists, counts what the receiver would see (nodes or features;
edges or links), and merges the proven entries into spider/manifest.json.

Rules, in the spirit of the receiver's own README:
- an entry written by hand (no "registry" field) is never changed;
- an entry this script added is updated when its registry changes it, and never deleted;
- a graph that cannot be fetched, or is empty, is not added and is reported instead;
- index.html is never touched: the receiver already reads every manifest entry it is given;
- every entry, hand-written or not, gets a "measured" field ({"nodes": n, "edges": e}) refreshed on every
  run from what its path actually serves. Hand-written prose is never rewritten: a count lives in
  "measured", not in a description, so it cannot go stale the way a typed number does. An entry whose
  path cannot be read loses its "measured" field (no stale count is left standing) and is reported;
  spider/manifest.proof.mjs then fails on it.
"""
import datetime
import json
import os
import pathlib
import sys
import urllib.request

import yaml

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
MANIFEST = HERE / "manifest.json"
SOURCES = HERE / "sources.yml"
FIELDS = ("title", "path", "edges_path", "source_spider", "description")


def fetch(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": "ventus-grid-engine spider-features", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read()


def count(raw):
    """Nodes and edges as index.html's normaliseGenericGraph would count them. A bare list (the
    globalgrid2050 contents cartridge publishes nodes.json and edges.json as plain arrays) is its own count."""
    if isinstance(raw, list):
        return len(raw), len(raw)
    nodes = raw.get("nodes") if isinstance(raw.get("nodes"), list) else raw.get("features") if isinstance(raw.get("features"), list) else []
    edges = raw.get("edges") if isinstance(raw.get("edges"), list) else raw.get("links") if isinstance(raw.get("links"), list) else []
    return len(nodes), len(edges)


def read_graph(path):
    """(HTTP status, parsed JSON) for a manifest path: https URLs are fetched, ./paths are read from this
    checkout, which is what GitHub Pages serves from main."""
    if path.startswith("http://") or path.startswith("https://"):
        status, body = fetch(path)
        return status, json.loads(body.decode("utf-8-sig"))
    return 200, json.loads((ROOT / path).read_text(encoding="utf-8-sig"))


def measure(entry):
    """(status, nodes, edges) as the receiver counts the entry: nodes from path, edges from edges_path
    when the entry has one, otherwise from path."""
    status, raw = read_graph(entry["path"])
    n, e = count(raw)
    if entry.get("edges_path"):
        _, ef = read_graph(entry["edges_path"])
        e = count(ef)[1]
    return status, n, e


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
            status, n, e = measure(g)
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

# Every entry's measured count, refreshed from what its path serves right now.
measured, unmeasured = [], []
for g in manifest["graphs"]:
    if not g.get("path"):
        continue
    try:
        _, n, e = measure(g)
        if g.get("measured") != {"nodes": n, "edges": e}:
            measured.append((g["id"], f"{n} nodes / {e} edges (was {g.get('measured')})"))
        g["measured"] = {"nodes": n, "edges": e}
    except Exception as exc:
        g.pop("measured", None)
        unmeasured.append((g["id"], f"{g['path']} — {str(exc)[:120]}"))

if added or updated or unchanged or measured or unmeasured:
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

lines = ["## Spider features", ""]
for label, items in (("Added", added), ("Updated", updated), ("Unchanged", unchanged), ("Not added", refused),
                     ("Count refreshed", measured), ("Could not be measured", unmeasured)):
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
