"""Write the front door: one graph whose cards are every graph the manifest lists.

Reads spider/manifest.json and writes spider/data/overview.json in the receiver's node and edge shape.
The overview node contains one card per manifest entry; each card's External road opens that graph on the
dashboard (?graph=<id>), and its GitHub road is the repository that publishes it, when the entry names one.

Generated from the manifest so it can never list a graph the dashboard does not have, and never miss one it
does. Run after update_manifest.py by .github/workflows/spider-features.yml. index.html is not touched: the
receiver reads the overview like any other manifest entry. Designed as data on 2026-09-14 (MSI lab draft,
overview-graph.json), so the reference page stays unchanged.
"""
import datetime
import json
import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
MANIFEST = HERE / "manifest.json"
OUT = HERE / "data" / "overview.json"
DASHBOARD = "https://ventusltd.github.io/ventus-grid-engine/"
SELF_ID = "overview"


def repo_of(entry):
    owner = entry.get("registry") or entry.get("path") or ""
    m = re.match(r"https://ventusltd\.github\.io/([^/]+)/", owner)
    if m:
        return f"https://github.com/Ventusltd/{m.group(1)}"
    return "https://github.com/Ventusltd/ventus-grid-engine"


manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
graphs = [g for g in manifest["graphs"] if g.get("id") and g["id"] != SELF_ID]
nodes = [{
    "id": SELF_ID,
    "label": "GLOBALGRID2050 architecture",
    "type": "estate",
    "rag": "green",
    "reason": (f"The map of maps: {len(graphs)} graphs of the estate's code, its reuse, its blocks, its tests and its "
               "decisions. Tap a card's External road to open that graph."),
    "gh": "https://github.com/Ventusltd",
    "ext": DASHBOARD,
}]
edges = []
for g in graphs:
    verified = g.get("verified") or ""
    placeholder = "empty slot" in (g.get("description") or "").lower()
    nodes.append({
        "id": f"graph:{g['id']}",
        "label": g.get("title") or g["id"],
        "type": "graph",
        "rag": "grey" if placeholder else "green",
        "reason": ((g.get("description") or "").split(". ")[0].strip(". ") + "." if g.get("description") else "")
                  + (f" Verified {verified}." if verified else "")
                  + (" Placeholder: no data published yet." if placeholder else ""),
        "gh": repo_of(g),
        "ext": f"{DASHBOARD}?graph={g['id']}",
    })
    edges.append({"from": SELF_ID, "to": f"graph:{g['id']}", "type": "contains"})

out = {
    "schema": "overview-graph.v1",
    "label": "GLOBALGRID2050 architecture",
    "generated_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "note": "Generated from spider/manifest.json by spider/overview.py; one card per registered graph.",
    "counts": {"graphs": len(graphs)},
    "nodes": nodes,
    "edges": edges,
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
# The overview is written after update_manifest.py measured it, so its own measured count is refreshed here,
# from the file just written, rather than left one run behind.
for g in manifest["graphs"]:
    if g.get("id") == SELF_ID:
        g["measured"] = {"nodes": len(nodes), "edges": len(edges)}
MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"overview: {len(graphs)} graphs -> {OUT.relative_to(HERE.parent)}")
