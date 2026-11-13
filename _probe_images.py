import asyncio, hashlib, json, re
import aiohttp

GOOD = "WorldOfInventionsBot/1.0 (https://github.com/world-of-inventions; museum-bot@example.org) aiohttp"
BAD = "WorldOfInventionsBot/1.0 (educational project)"

items = json.load(open("data/inventions.json", encoding="utf-8"))


def md5_prefix(name):
    h = hashlib.md5(name.replace(" ", "_").encode("utf-8")).hexdigest()
    return f"{h[0]}/{h[0]}{h[1]}"


def to_upload(name, width=900):
    if name.lower().endswith((".svg",)):
        return f"https://upload.wikimedia.org/wikipedia/commons/thumb/{md5_prefix(name)}/{name}/{width}px-{name}.png"
    return f"https://upload.wikimedia.org/wikipedia/commons/thumb/{md5_prefix(name)}/{name}/{width}px-{name}"


async def probe(session, url, label, follow=True):
    try:
        async with session.get(url, allow_redirects=follow) as r:
            ctype = r.headers.get("Content-Type", "")
            ok = r.status == 200 and ctype.startswith("image/")
            data = await r.content.read(300) if ok else b""
            print(f"  {label:34} {r.status:>4} {ctype[:22]:22} {len(data):>4}b")
            return r.status, ctype
    except Exception as e:
        print(f"  {label:34} EXC  {type(e).__name__}: {str(e)[:60]}")
        return None, None


async def main():
    name = "Newton_telescope.jpg"
    tests = [
        ("redirect/file width=900", f"https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/{name}&width=900"),
        ("redirect/file no width", f"https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/{name}"),
        ("Special:FilePath?width", f"https://commons.wikimedia.org/wiki/Special:FilePath/{name}?width=900"),
        ("Special:FilePath plain", f"https://commons.wikimedia.org/wiki/Special:FilePath/{name}"),
        ("upload.wikimedia computed", to_upload(name)),
    ]
    for ua_label, ua in (("OLD UA", BAD), ("POLICY UA", GOOD)):
        print(f"\n{ua_label}:")
        async with aiohttp.ClientSession(headers={"User-Agent": ua, "Accept-Encoding": "identity"},
                                         timeout=aiohttp.ClientTimeout(total=30)) as s:
            for label, url in tests:
                await probe(s, url, label)

    print("\nAction API (metadata + real thumburl):")
    api = "https://commons.wikimedia.org/w/api.php"
    async with aiohttp.ClientSession(headers={"User-Agent": GOOD}, timeout=aiohttp.ClientTimeout(total=30)) as s:
        params = {"action": "query", "titles": f"File:{name}", "prop": "imageinfo",
                  "iiprop": "url|extmetadata", "iiurlwidth": "900", "format": "json"}
        async with s.get(api, params=params) as r:
            d = await r.json()
        page = list(d["query"]["pages"].values())[0]
        if "imageinfo" not in page:
            print("  MISSING FILE on Commons:", name, page)
        else:
            ii = page["imageinfo"][0]
            print("  thumburl:", ii.get("thumburl"))
            print("  url     :", ii.get("url"))
            em = ii.get("extmetadata", {})
            print("  license :", em.get("LicenseShortName", {}).get("value"))
            print("  artist  :", re.sub("<[^>]+>", "", em.get("Artist", {}).get("value", ""))[:60])
            await probe(s, ii.get("thumburl"), "API thumburl")

asyncio.run(main())
