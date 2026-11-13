import json, re, sys, importlib
from pathlib import Path
src = Path("handlers.py").read_text(encoding="utf-8")
kb  = Path("keyboards.py").read_text(encoding="utf-8")

# 1. every callback_data prefix produced
produced = set()
for m in re.finditer(r'(?:callback_data=)?f?"([a-z]+:[^"]*)"', src + kb):
    produced.add(m.group(1))
handled = set()
for m in re.finditer(r'F\.data == "([^"]+)"', src):
    handled.add(("exact", m.group(1)))
for m in re.finditer(r'F\.data\.startswith\("([^"]+)"\)', src):
    handled.add(("prefix", m.group(1)))

print("=== callback routes ===")
print("exact:", sorted(x[1] for x in handled if x[0]=="exact"))
print("prefix:", sorted(x[1] for x in handled if x[0]=="prefix"))

print("\n=== callback_data length check (telegram limit 64 bytes) ===")
import itertools
items = json.load(open("data/inventions.json", encoding="utf-8"))
HALLS = {"1","2","3","4"}
countries = sorted({c for i in items for c in i["map_countries"]})
periods = sorted({i["period"] for i in items})
cands = []
for i in items:
    cands += [f"map:country:{c}" for c in i["map_countries"]]
    cands += [f"filter:country:{c}" for c in i["map_countries"]]
    cands += [f"item:{i['id']}", f"how:{i['id']}", f"favorite:toggle:{i['id']}"]
cands += [f"filter:period:{p}" for p in periods] + [f"filter:hall:{h}" for h in HALLS]
bad = sorted({c for c in cands if len(c.encode()) > 64})
print("over-limit:", bad if bad else "none")

# 2. does every exhibit appear in every hall list / catalogue?
print("\n=== catalogue coverage ===")
print("items:", len(items), "ids unique:", len({i['id'] for i in items}))
print("no image_url:", [i['id'] for i in items if not i.get('image_url')])
print("has image_credit but unused in handlers:", "image_credit" in src)
