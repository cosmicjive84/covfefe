(() => {
  "use strict";

  // --- Config -------------------------------------------------------------
  const ROUNDS = 20;
  const OPTIONS_PER_ROUND = 4;
  const TRUMP_SHARE = 0.5;        // fraction of rounds that are Trump quotes
  const TRUMP_ID = "trump";
  // Only quotes with verified: true are used.
  const REQUIRE_VERIFIED = true;

  // --- State --------------------------------------------------------------
  let presidents = {};   // id -> president
  let allQuotes = [];
  let rounds = [];       // [{ quote, options: [presidentId] }]
  let current = 0;
  let results = [];      // [{ quote, guess, correct }]

  const $ = (id) => document.getElementById(id);

  // --- Helpers ------------------------------------------------------------
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
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

  function initials(name) {
    return name.split(" ").filter((w) => /^[A-Z]/.test(w) && !w.endsWith(".")).map((w) => w[0]).join("");
  }

  // Always include the right answer and Trump; fill the rest at random.
  function buildOptions(answerId) {
    const picks = new Set([answerId, TRUMP_ID]);
    const pool = shuffle(Object.keys(presidents).filter((id) => !picks.has(id)));
    while (picks.size < OPTIONS_PER_ROUND && pool.length) picks.add(pool.pop());
    return shuffle([...picks]);
  }

  function buildRounds() {
    const usable = allQuotes.filter((q) => !REQUIRE_VERIFIED || q.verified);
    const trump = shuffle(usable.filter((q) => q.president === TRUMP_ID));
    const others = shuffle(usable.filter((q) => q.president !== TRUMP_ID));
    const total = Math.min(ROUNDS, usable.length);
    const nTrump = Math.min(trump.length, Math.round(total * TRUMP_SHARE));
    const picked = trump.slice(0, nTrump).concat(others.slice(0, total - nTrump));
    return shuffle(picked).map((quote) => ({ quote, options: buildOptions(quote.president) }));
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

  function renderRound() {
    const { quote, options } = rounds[current];
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
    const score = results.filter((r) => r.correct).length;
    $("final-score").textContent = score;
    $("final-total").textContent = results.length;
    $("final-line").textContent = scoreLine(score, results.length);
    $("final-grid").textContent = results.map((r) => (r.correct ? "✅" : "❌")).join("");

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
    track("Game Finished", { score: `${score}/${results.length}` });
  }

  async function share() {
    const score = results.filter((r) => r.correct).length;
    const grid = results.map((r) => (r.correct ? "🟩" : "🟥")).join("");
    const text = `Covfefe or Coolidge? ${score}/${results.length}\n${grid}\n${location.origin}${location.pathname}`;
    try {
      if (navigator.share) {
        await navigator.share({ text });
        track("Shared", { method: "share sheet" });
      } else {
        await navigator.clipboard.writeText(text);
        $("share-status").textContent = "Copied to clipboard.";
        track("Shared", { method: "clipboard" });
      }
    } catch {
      // User cancelled the share sheet, or clipboard is blocked: nothing to do.
    }
  }

  // --- Flow ---------------------------------------------------------------
  function start() {
    rounds = buildRounds();
    current = 0;
    results = [];
    show("screen-round");
    renderRound();
    track("Game Started");
  }

  function next() {
    current++;
    if (current < rounds.length) renderRound();
    else renderResults();
  }

  async function init() {
    const [presList, quotes] = await Promise.all([
      fetch("data/presidents.json").then((r) => r.json()),
      fetch("data/quotes.json").then((r) => r.json()),
    ]);
    presidents = Object.fromEntries(presList.map((p) => [p.id, p]));
    allQuotes = quotes;

    const usable = allQuotes.filter((q) => !REQUIRE_VERIFIED || q.verified);
    const nPresidents = new Set(usable.map((q) => q.president)).size;
    $("quote-count").textContent = `${usable.length} verified quotes from ${nPresidents} presidents`;

    $("btn-start").addEventListener("click", start);
    $("btn-next").addEventListener("click", next);
    $("btn-again").addEventListener("click", start);
    $("btn-share").addEventListener("click", share);
  }

  init().catch((err) => {
    console.error(err);
    $("app").innerHTML = "<p>Couldn't load quotes. Serve this folder over HTTP (see README).</p>";
  });
})();
