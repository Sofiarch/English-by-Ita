// Builds vocabulary quizzes from the books' word lists (works offline).

export const QUIZ_TYPES = ["mcq_meaning", "mcq_word", "spell", "listen"];

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const keyOf = (w) => (w.lemma || w.word).toLowerCase();

/**
 * Plausible misspellings of `word` for the spelling question: swapped,
 * doubled or dropped letters and common English mix-ups (ie/ei, c/k, -tion/-sion…).
 */
export function misspellings(word, n = 3) {
  const w = word.toLowerCase();
  if (!/^[a-z]{4,}$/.test(w)) return [];
  const out = new Set();
  const add = (x) => x && x !== w && /^[a-z]+$/.test(x) && out.add(x);
  for (let i = 1; i < w.length - 1; i++) add(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2));           // swap
  for (let i = 1; i < w.length; i++) {
    if (w[i] === w[i - 1]) add(w.slice(0, i) + w.slice(i + 1));                                          // undouble
    else if (!"aeiou".includes(w[i]) && i < w.length - 1) add(w.slice(0, i + 1) + w[i] + w.slice(i + 1));   // double
    if (i < w.length - 1) add(w.slice(0, i) + w.slice(i + 1));                                           // drop
  }
  const swaps = [["ie", "ei"], ["ei", "ie"], ["ea", "ee"], ["ee", "ea"], ["ou", "ow"], ["tion", "sion"], ["sion", "tion"],
    ["ible", "able"], ["able", "ible"], ["ph", "f"], ["ck", "k"], ["c", "k"], ["k", "c"], ["s", "c"], ["y", "i"], ["i", "y"],
    ["a", "e"], ["e", "a"], ["o", "u"], ["u", "o"], ["er", "ar"], ["or", "er"]];
  for (const [from, to] of swaps) {
    const i = w.indexOf(from, 1);
    if (i > 0) add(w.slice(0, i) + to + w.slice(i + from.length));
  }
  const picked = shuffle([...out]).slice(0, n);
  const cap = word[0] === word[0].toUpperCase();
  return picked.map((x) => (cap ? x[0].toUpperCase() + x.slice(1) : x));
}

/** Up to `n` other words whose `field` differs — same part of speech first, so options are plausible. */
function distractors(w, pool, field, n = 3) {
  const seen = new Set([String(w[field]).toLowerCase()]);
  const out = [];
  const ranked = [
    ...shuffle(pool.filter((p) => p.part_of_speech === w.part_of_speech)),
    ...shuffle(pool.filter((p) => p.part_of_speech !== w.part_of_speech)),
  ];
  for (const p of ranked) {
    const v = String(p[field] || "").toLowerCase();
    if (!v || seen.has(v) || keyOf(p) === keyOf(w)) continue;
    seen.add(v);
    out.push(p);
    if (out.length === n) break;
  }
  return out;
}

/**
 * @param pool   word rows ({ word, lemma, translation, example, part_of_speech, … })
 * @param types  which QUIZ_TYPES to mix
 * @param count  number of questions
 * @param words  optional fixed word list (for "retry these words")
 */
export function buildQuiz(pool, { types, count, words }) {
  const unique = [...new Map(pool.map((w) => [keyOf(w), w])).values()];
  const chosen = words || shuffle(unique).slice(0, count);
  const allowed = types.length ? [...types] : ["mcq_meaning"];

  return chosen.map((w, i) => {
    let type = allowed[(i + Math.floor(Math.random() * allowed.length)) % allowed.length];
    let options = null;

    if (type === "spell") {
      const wrong = misspellings(w.word);
      if (wrong.length === 3) {
        options = shuffle([w.word, ...wrong]).map((label, j) => ({ id: `${w.id}-s${j}`, label, correct: label === w.word }));
      } else {
        type = "mcq_word"; // too short / multi-word to misspell convincingly
      }
    }
    if (type === "mcq_meaning" || type === "mcq_word") {
      const field = type === "mcq_meaning" ? "translation" : "word";
      const others = distractors(w, unique, field);
      if (others.length === 3) {
        options = shuffle([w, ...others]).map((o) => ({ id: o.id, label: o[field], correct: keyOf(o) === keyOf(w) }));
      } else {
        type = "listen"; // not enough different words for 4 options: fall back to typing
      }
    }
    return { id: `${w.id}-${i}`, type, word: w, options };
  });
}

function levenshtein(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

const norm = (s) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();

/** → "correct" | "close" (one small typo) | "wrong". Accepts the form in the story or the dictionary form. */
export function checkTyped(input, w) {
  const got = norm(input);
  if (!got) return "wrong";
  const targets = [...new Set([w.word, w.lemma].filter(Boolean).map(norm))];
  if (targets.includes(got)) return "correct";
  const best = Math.min(...targets.map((t) => levenshtein(got, t)));
  const len = Math.max(...targets.map((t) => t.length));
  if ((len >= 4 && best === 1) || (len >= 8 && best === 2)) return "close";
  return "wrong";
}
