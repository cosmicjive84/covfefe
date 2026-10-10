(() => {
  "use strict";

  // --- Config -------------------------------------------------------------
  const ROUNDS = 10;              // practice game length
  const DAILY_ROUNDS = 10;
  const DAILY_EPOCH = [2026, 9, 10]; // Daily #1 is Oct 10, 2026 (month is 0-based)
  const OPTIONS_PER_ROUND = 4;
  const TRUMP_SHARE = 0.5;        // fraction of rounds that are Trump quotes
  const TRUMP_ID = "trump";
  // Only quotes with verified: true are used.
  const REQUIRE_VERIFIED = true;

  // --- State --------------------------------------------------------------
  let presidents = {};   // id -> president
  let allQuotes = [];
  let mode = "practice"; // "daily" | "practice"
  let day = 0;           // daily number for the current game
  let rounds = [];       // [{ quote, options: [presidentId] }]
  let current = 0;
  let results = [];      // [{ quote, guess, correct }]

  const $ = (id) => document.getElementById(id);

  // --- Helpers ------------------------------------------------------------
  function shuffle(arr, rand = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // FNV-1a string hash and mulberry32 PRNG, so every player gets the same daily.
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function seededRandom(seed) {
    let a = hash(seed);
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Days since the epoch in the player's local time zone, starting at 1.
  function todayNumber() {
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((today - Date.UTC(...DAILY_EPOCH)) / 86400000) + 1;
  }

  function untilTomorrow() {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const mins = Math.ceil((midnight - now) / 60000);
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  function show(screenId) {
    for (const el of document.querySelectorAll(".screen")) el.hidden = el.id !== screenId;
  }

  function formatDate(iso) {
    if (!iso) return "Date unknown";
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }

  // Plausible custom event; a no-op if the script is blocked or missing.
  function track(name, props) {
    if (typeof window.plausible === "function") window.plausible(name, props ? { props } : undefined);
  }

  // Saved daily results. Storage can be unavailable (private mode), so never rely on it.
  function loadDaily(n) {
    try { return JSON.parse(localStorage.getItem(`daily-${n}`)); } catch { return null; }
  }

  function saveDaily(n, result) {
    try { localStorage.setItem(`daily-${n}`, JSON.stringify(result)); } catch { /* ignore */ }
  }

  function initials(name) {
    return name.split(" ").filter((w) => /^[A-Z]/.test(w) && !w.endsWith(".")).map((w) => w[0]).join("");
  }

  function usableQuotes() {
    return allQuotes.filter((q) => !REQUIRE_VERIFIED || q.verified);
  }

  // Always include the right answer and Trump; fill the rest at random.
  function buildOptions(answerId, rand = Math.random) {
    const picks = new Set([answerId, TRUMP_ID]);
    const pool = shuffle(Object.keys(presidents).filter((id) => !picks.has(id)).sort(), rand);
    while (picks.size < OPTIONS_PER_ROUND && pool.length) picks.add(pool.pop());
    return shuffle([...picks].sort(), rand);
  }

  function buildRounds() {
    const usable = usableQuotes();
    const trump = shuffle(usable.filter((q) => q.president === TRUMP_ID));
    const others = shuffle(usable.filter((q) => q.president !== TRUMP_ID));
    const total = Math.min(ROUNDS, usable.length);
    const nTrump = Math.min(trump.length, Math.round(total * TRUMP_SHARE));
    const picked = trump.slice(0, nTrump).concat(others.slice(0, total - nTrump));
    return shuffle(picked).map((quote) => ({ quote, options: buildOptions(quote.president) }));
  }

  // The daily walks through each pool (Trump / everyone else) in a fixed
  // hash order, so quotes don't repeat until the whole pool has been used.
  // Adding or removing a quote shifts that order by one, which can swap a
  // quote in that day's set.
  // Vary the Trump count by one either way so players can't count their way to answers.
  function dailyTrumpCount(n) {
    const lo = Math.max(0, Math.floor(DAILY_ROUNDS * TRUMP_SHARE) - 1);
    const hi = Math.min(DAILY_ROUNDS, Math.ceil(DAILY_ROUNDS * TRUMP_SHARE) + 1);
    return lo + Math.floor(seededRandom(`trump-count:${n}`)() * (hi - lo + 1));
  }

  function buildDailyRounds(n) {
    const byHash = (list) => list.slice().sort((a, b) => hash(a.id) - hash(b.id) || (a.id < b.id ? -1 : 1));
    const usable = usableQuotes();
    const trump = byHash(usable.filter((q) => q.president === TRUMP_ID));
    const others = byHash(usable.filter((q) => q.president !== TRUMP_ID));

    let tStart = 0;
    for (let i = 1; i < n; i++) tStart += dailyTrumpCount(i);
    const oStart = (n - 1) * DAILY_ROUNDS - tStart;
    const nTrump = Math.min(trump.length, dailyTrumpCount(n));
    const nOthers = Math.min(others.length, DAILY_ROUNDS - nTrump);
    const take = (list, start, k) => Array.from({ length: k }, (_, i) => list[(start + i) % list.length]);

    const picked = take(trump, tStart, nTrump).concat(take(others, oStart, nOthers));
    return shuffle(picked, seededRandom(`daily:${n}`)).map((quote) => ({
      quote,
      options: buildOptions(quote.president, seededRandom(`daily:${n}:${quote.id}`)),
    }));
  }

  function shareText(r) {
    const label = r.mode === "daily" ? `Daily #${r.day} ` : "";
    return `Covfefe or Coolidge? ${label}${r.score}/${r.total}\n${r.grid}\n${location.origin}${location.pathname}`;
  }

  function currentResult() {
    return {
      mode,
      day,
      score: results.filter((r) => r.correct).length,
      total: results.length,
      grid: results.map((r) => (r.correct ? "🟩" : "🟥")).join(""),
    };
  }

  // --- Rendering ----------------------------------------------------------
  function portraitEl(p) {
    const img = document.createElement("img");
    img.className = "portrait";
    img.src = `img/portraits/${p.id}.jpg`;
    img.alt = p.name;
    img.onerror = () => {
      const fallback = document.createElement("div");
      fallback.className = "portrait portrait-fallback";
      fallback.textContent = initials(p.name);
      img.replaceWith(fallback);
    };
    return img;
  }

  function renderStart() {
    const n = todayNumber();
    const done = loadDaily(n);
    $("daily-label").textContent = `Daily #${n}`;
    $("btn-daily").hidden = !!done;
    $("daily-done").hidden = !done;
    if (done) {
      $("daily-done-score").textContent = `${done.score}/${done.total}`;
      $("daily-done-grid").textContent = done.grid;
      $("daily-next").textContent = `Next daily in ${untilTomorrow()}.`;
    }
    $("start-share-status").textContent = "";
    show("screen-start");
  }

  function renderRound() {
    const { quote, options } = rounds[current];
    $("round-mode").textContent = mode === "daily" ? `Daily #${day} · ` : "";
    $("round-num").textContent = current + 1;
    $("round-total").textContent = rounds.length;
    $("score").textContent = results.filter((r) => r.correct).length;
    $("quote-text").textContent = quote.text;
    $("reveal").hidden = true;

    const container = $("options");
    container.innerHTML = "";
    for (const id of options) {
      const p = presidents[id];
      const btn = document.createElement("button");
      btn.className = "option";
      btn.dataset.id = id;
      btn.appendChild(portraitEl(p));
      const name = document.createElement("span");
      name.className = "option-name";
      name.textContent = p.name;
      btn.appendChild(name);
      btn.addEventListener("click", () => guess(id));
      container.appendChild(btn);
    }
  }

  function guess(guessId) {
    const { quote } = rounds[current];
    const correct = guessId === quote.president;
    results.push({ quote, guess: guessId, correct });

    for (const btn of $("options").children) {
      btn.disabled = true;
      const id = btn.dataset.id;
      if (id === quote.president) btn.classList.add("correct");
      else if (id === guessId) btn.classList.add("wrong");
      else btn.classList.add("faded");
    }

    const verdict = $("reveal-verdict");
    verdict.textContent = correct ? "Correct!" : "Nope.";
    verdict.className = "reveal-verdict " + (correct ? "is-correct" : "is-wrong");
    $("reveal-who").textContent = `${presidents[quote.president].name}, ${formatDate(quote.date)}`;
    $("reveal-context").textContent = quote.context;

    const src = $("reveal-source");
    src.textContent = "Source: ";
    if (quote.source_url) {
      const a = document.createElement("a");
      a.href = quote.source_url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = quote.source;
      src.appendChild(a);
    } else {
      src.appendChild(document.createTextNode(quote.source));
    }

    $("btn-next").textContent = current + 1 < rounds.length ? "Next" : "See results";
    $("score").textContent = results.filter((r) => r.correct).length;
    $("reveal").hidden = false;
    $("btn-next").focus();
  }

  function scoreLine(score, total) {
    const pct = score / total;
    if (pct === 1) return "Perfect. You have the best words.";
    if (pct >= 0.8) return "Very stable genius territory.";
    if (pct >= 0.5) return "Not bad. Many people are saying so.";
    if (pct >= 0.3) return "Nobody knew this could be so complicated.";
    return "You've been misunderestimated. Or not.";
  }

  function renderResults() {
    const result = currentResult();
    if (mode === "daily") saveDaily(day, result);

    $("final-mode").textContent = mode === "daily" ? `Daily #${day}` : "Practice";
    $("final-score").textContent = result.score;
    $("final-total").textContent = result.total;
    $("final-line").textContent = scoreLine(result.score, result.total);
    $("final-grid").textContent = results.map((r) => (r.correct ? "✅" : "❌")).join("");
    $("final-next").textContent = mode === "daily" ? `Next daily in ${untilTomorrow()}.` : "";
    $("btn-again").textContent = mode === "daily" ? "Practice round" : "Play again";

    // The fun part: who got mixed up with Trump?
    const fooled = $("final-fooled");
    fooled.innerHTML = "";
    for (const r of results) {
      if (r.correct) continue;
      const actual = presidents[r.quote.president].name;
      const guessed = presidents[r.guess].name;
      let msg = null;
      if (r.guess === TRUMP_ID) msg = `You thought ${actual} was Trump.`;
      else if (r.quote.president === TRUMP_ID) msg = `You thought Trump was ${guessed}.`;
      if (msg) {
        const li = document.createElement("li");
        li.textContent = msg;
        fooled.appendChild(li);
      }
    }
    $("share-status").textContent = "";
    show("screen-results");
    track("Game Finished", { mode, score: `${result.score}/${result.total}` });
  }

  async function share(result, statusEl) {
    const text = shareText(result);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        track("Shared", { mode: result.mode, method: "share sheet" });
      } else {
        await navigator.clipboard.writeText(text);
        statusEl.textContent = "Copied to clipboard.";
        track("Shared", { mode: result.mode, method: "clipboard" });
      }
    } catch {
      // User cancelled the share sheet, or clipboard is blocked: nothing to do.
    }
  }

  // --- Flow ---------------------------------------------------------------
  function start(gameMode) {
    mode = gameMode;
    if (mode === "daily") {
      day = todayNumber();
      if (loadDaily(day)) return renderStart(); // already played, e.g. in another tab
      rounds = buildDailyRounds(day);
    } else {
      rounds = buildRounds();
    }
    current = 0;
    results = [];
    show("screen-round");
    renderRound();
    track("Game Started", { mode });
  }

  function next() {
    current++;
    if (current < rounds.length) renderRound();
    else renderResults();
  }

  async function init() {
    const [presList, quotes] = await Promise.all([
      // no-cache: always check for new data (a cheap 304 if unchanged).
      fetch("data/presidents.json", { cache: "no-cache" }).then((r) => r.json()),
      fetch("data/quotes.json", { cache: "no-cache" }).then((r) => r.json()),
    ]);
    presidents = Object.fromEntries(presList.map((p) => [p.id, p]));
    allQuotes = quotes;

    const usable = usableQuotes();
    const nPresidents = new Set(usable.map((q) => q.president)).size;
    $("quote-count").textContent = `${usable.length} verified quotes from ${nPresidents} presidents`;

    $("btn-daily").addEventListener("click", () => start("daily"));
    $("btn-practice").addEventListener("click", () => start("practice"));
    $("btn-next").addEventListener("click", next);
    $("btn-again").addEventListener("click", () => start("practice"));
    $("btn-home").addEventListener("click", renderStart);
    $("btn-share").addEventListener("click", () => share(currentResult(), $("share-status")));
    $("btn-share-daily").addEventListener("click", () => {
      const n = todayNumber();
      const saved = loadDaily(n);
      if (saved) share({ ...saved, mode: "daily", day: n }, $("start-share-status"));
    });
    // Coming back to an open tab on a new day should offer the new daily.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && !$("screen-start").hidden) renderStart();
    });

    renderStart();
  }

  init().catch((err) => {
    console.error(err);
    $("app").innerHTML = "<p>Couldn't load quotes. Serve this folder over HTTP (see README).</p>";
  });
})();
