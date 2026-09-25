"""Render the static dashboard from its small, reviewed live-route catalogue."""
from pathlib import Path
import html
import json
from urllib.parse import urlparse

root=Path(__file__).resolve().parents[1]
data=json.loads((root/'data/dashboard.json').read_text())
cards=[]
for e in data['entries']:
    u=urlparse(e['url'])
    assert u.scheme=='https' and u.hostname in {'globalgrid2050.com','ventusltd.github.io'} and not u.username
    v={k:html.escape(value,quote=True) for k,value in e.items()}
    cards.append(f'<article class="entry" id="{v["id"]}"><span class="category">{v["category"]}</span><h2>{v["label"]}</h2><p>{v["description"]}</p><a href="{v["url"]}">Open {v["label"]} &rarr;</a></article>')
page='''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Explore VENTUS Grid Engine experiments, solar topology drawings and engine maps."><title>VENTUS Grid Engine</title><link rel="icon" href="data:,"><link rel="stylesheet" href="assets/dashboard.css"><script defer src="assets/dashboard.js"></script></head><body>
<header><div class="brand">VENTUS / GLOBALGRID2050</div><h1>VENTUS Grid Engine</h1><p>Explore how a pulse travels, how solar strings connect and how the grid tools fit together.</p></header>
<main><nav class="topnav"><a href="https://globalgrid2050.com/">GlobalGrid2050</a><a href="spider-sandbox.html">Spider Sandbox</a><a href="genome/">Engine map</a></nav><label for="search">Find an engine or drawing</label><input id="search" type="search" autocomplete="off" placeholder="Search pulse, DC, AC, grid…"><p id="status" role="status">5 places to explore.</p><section class="entries" aria-label="Engines and drawings">'''+''.join(cards)+'''</section><p class="scope">The AC view is a block diagram, not an SLD or a full electrical system. These destinations provide experiments, topology screening and engine exploration; they do not establish connection capacity or engineering approval.</p></main><footer>VENTUS Grid Engine · Connected tools, with their original workspaces preserved.</footer></body></html>
'''
(root/'index.html').write_text(page,encoding='utf-8')
print(f"Rendered {len(cards)} dashboard entries")
