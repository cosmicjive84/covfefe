# Covfefe or Coolidge?

A static guessing game: you see a real presidential quote and pick who said it from four portraits. About half the quotes are Donald Trump's. The rest come from other presidents, and the game is built on the contrast between the two.

No build step, no backend. Plain HTML, CSS and JS.

## Run locally

`fetch()` doesn't work over `file://`, so serve the folder over HTTP:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Layout

```
index.html                 page shell with start, round and results screens
css/style.css              styles
js/app.js                  game logic (config constants at the top)
data/quotes.json           the quotes
data/presidents.json       presidents shown as answer choices
img/portraits/<id>.jpg     portraits, one per president id
img/og-image.png           1200×630 link-preview image
img/favicon-32.png         favicon (plus apple-touch-icon.png)
scripts/fetch_portraits.py downloads portraits from Wikipedia/Commons
CNAME                      custom domain for GitHub Pages
```

## Adding a quote

Add an entry to `data/quotes.json`:

```json
{
  "id": "unique-slug",
  "text": "The exact words.",
  "president": "trump",
  "date": "2019-06-07",
  "context": "Where and when it was said, plus any punchline.",
  "source": "Short human-readable citation",
  "source_url": "https://link-to-primary-source",
  "verified": true
}
```

New quotes stay hidden until they're verified (see below). `president` must match an `id` in `data/presidents.json`. To add a president, add them there and run `python3 scripts/fetch_portraits.py`.

## Verifying quotes

`REQUIRE_VERIFIED` is `true` in `js/app.js`, so the game only uses quotes marked `"verified": true`. All quotes currently in `data/quotes.json` are verified and have a `source_url`.

Before marking a new quote as verified:

1. Find a primary source: a transcript, video, archived tweet or letter.
2. Make the wording match the source exactly.
3. Fill in `source_url` and set `"verified": true`.

Good sources:
- [The American Presidency Project](https://www.presidency.ucsb.edu/) (UCSB) for speeches and remarks
- [Roll Call Factba.se](https://rollcall.com/factbase/) for Trump transcripts and posts
- [Miller Center](https://millercenter.org/) (UVA) for speeches and the Nixon/LBJ tapes
- [Trump Twitter Archive](https://www.thetrumparchive.com/) for tweets
- Wikiquote is useful for finding leads, but follow its citations rather than citing it directly

One wrong quote gives critics an easy reason to dismiss the whole site.

## Deploy

Any static host works: GitHub Pages, Netlify or Cloudflare Pages. Point it at this folder; there's no build command.

When you change `css/style.css` or `js/app.js`, bump the `?v=` number on both links in `index.html` (e.g. `?v=2` → `?v=3`) so browsers fetch the new files instead of a cached copy. Quote and president data is always rechecked, so editing the JSON files needs no bump.

If the site moves to a new address, update the absolute URLs in the link-preview tags in `index.html` (`canonical`, `og:url` and `og:image`). Social sites can't load a preview image from a relative path.
