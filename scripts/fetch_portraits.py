#!/usr/bin/env python3
"""Download a portrait for each president in data/presidents.json.

Uses the lead image of each president's English Wikipedia article (usually
the official portrait, hosted on Wikimedia Commons). Saves to
img/portraits/<id>.jpg. Skips files that already exist; pass --force to
re-download.
"""
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "img" / "portraits"
API = "https://en.wikipedia.org/w/api.php"
UA = "who-said-it/0.1 (https://github.com/; portrait fetch script) python-urllib"
THUMB_WIDTH = 400


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def thumbnail_url(title):
    params = urllib.parse.urlencode({
        "action": "query",
        "format": "json",
        "prop": "pageimages",
        "piprop": "thumbnail",
        "pithumbsize": THUMB_WIDTH,
        "titles": title,
        "redirects": 1,
    })
    data = json.loads(get(f"{API}?{params}"))
    page = next(iter(data["query"]["pages"].values()))
    return page.get("thumbnail", {}).get("source")


def main():
    force = "--force" in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)
    presidents = json.loads((ROOT / "data" / "presidents.json").read_text())
    for p in presidents:
        dest = OUT / f"{p['id']}.jpg"
        if dest.exists() and not force:
            print(f"skip  {p['id']}")
            continue
        try:
            url = thumbnail_url(p["wiki"])
            if not url:
                print(f"MISS  {p['id']}: no lead image")
                continue
            dest.write_bytes(get(url))
            print(f"ok    {p['id']}  <- {url}")
            time.sleep(2)  # be polite; Wikimedia rate-limits bursts
        except Exception as e:
            print(f"FAIL  {p['id']}: {e}")


if __name__ == "__main__":
    main()
