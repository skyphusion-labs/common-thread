/**
 * Deterministic register + intra-post code-switch classifiers (§4.3.4).
 *
 * Auxiliary tooling is intentionally rule-based (no ML / network):
 * versioned with the account extractor that consumes these helpers.
 * Configuration is fixed here so signal-table provenance is the
 * extractor name + version alone.
 */

export type RegisterLabel = 'formal' | 'neutral' | 'informal';

/** Unicode script buckets used for intra-post code-switch detection. */
export type ScriptBucket =
  | 'Latn'
  | 'Cyrl'
  | 'Arab'
  | 'Hans'
  | 'Hira'
  | 'Kana'
  | 'Grek'
  | 'Hebr'
  | 'Deva'
  | 'Other';

const INFORMAL_MARKERS =
  /\b(lol|lmao|omg|wtf|idk|imo|imho|tbh|afaik|gonna|wanna|gotta|kinda|sorta|yeah|nah|hey|dude|bro|y'all|ain't|can't|don't|won't|didn't|isn't|aren't|i'm|you're|they're|we're|it's|that's|what's|u|ur|tho|thru|smh|fyi|btw)\b/gi;

const FORMAL_MARKERS =
  /\b(however|therefore|furthermore|moreover|nevertheless|accordingly|regarding|concerning|whereas|herein|thereof|whom|amongst|pursuant|consequently|thus|hence)\b/gi;

const CONTRACTION_RE =
  /\b(?:[A-Za-z]+'(?:[A-Za-z]+|t|s|re|ve|ll|d)|n't)\b/g;

/** Compact stopword sets for Latin-script bilingual detection. */
const STOPWORDS: Record<string, Set<string>> = {
  en: new Set(
    'the a an and or but in on at to for of is are was were be been being this that with from as by it its you your we they he she not'.split(
      ' '
    )
  ),
  es: new Set(
    'el la los las un una y o pero en de a para con por es son era eran ser este esta eso con del al no que'.split(
      ' '
    )
  ),
  fr: new Set(
    'le la les un une et ou mais dans en a pour de est sont etait etre ce cette ces avec du des ne pas que'.split(
      ' '
    )
  ),
  de: new Set(
    'der die das ein eine und oder aber in auf an zu fur von ist sind war waren sein dieser diese mit dem den nicht'.split(
      ' '
    )
  ),
  pt: new Set(
    'o a os as um uma e ou mas em de para com por e sao era eram ser este esta isso com do da nao que'.split(
      ' '
    )
  ),
};

/**
 * Classify a post's register as formal / neutral / informal.
 * Scores are relative marker densities; ties prefer neutral.
 */
export function classifyRegister(text: string): RegisterLabel {
  const cleaned = text.trim();
  if (cleaned.length === 0) return 'neutral';

  const tokens = cleaned.match(/[A-Za-z']+/g) ?? [];
  const tokenCount = Math.max(tokens.length, 1);

  const informalHits = (cleaned.match(INFORMAL_MARKERS) ?? []).length;
  const formalHits = (cleaned.match(FORMAL_MARKERS) ?? []).length;
  const contractions = (cleaned.match(CONTRACTION_RE) ?? []).length;
  const bangRuns = (cleaned.match(/!{2,}|\?{2,}/g) ?? []).length;
  const emojiApprox = (cleaned.match(/\p{Extended_Pictographic}/gu) ?? []).length;

  let informalScore =
    informalHits * 2 +
    contractions * 0.5 +
    bangRuns * 1.5 +
    (emojiApprox > 0 ? 1 : 0);
  let formalScore = formalHits * 2.5;

  // Normalize lightly by length so long posts don't dominate.
  informalScore /= Math.sqrt(tokenCount);
  formalScore /= Math.sqrt(tokenCount);

  if (informalScore >= 0.8 && informalScore > formalScore + 0.15) {
    return 'informal';
  }
  if (formalScore >= 0.6 && formalScore > informalScore + 0.15) {
    return 'formal';
  }
  return 'neutral';
}

/**
 * Map a code point to a coarse script bucket. Returns null for
 * non-letter characters (digits, punctuation, whitespace).
 */
export function scriptBucket(ch: string): ScriptBucket | null {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return null;
  // ASCII letters
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) return 'Latn';
  // Latin-1 Supplement / Extended letters (still Latn for our purposes)
  if (cp >= 0xc0 && cp <= 0x24f) {
    // Skip pure symbols in Latin-1
    if (/\p{L}/u.test(ch)) return 'Latn';
    return null;
  }
  if (cp >= 0x400 && cp <= 0x4ff) return 'Cyrl';
  if (cp >= 0x600 && cp <= 0x6ff) return 'Arab';
  if (cp >= 0x900 && cp <= 0x97f) return 'Deva';
  if (cp >= 0x370 && cp <= 0x3ff) return 'Grek';
  if (cp >= 0x590 && cp <= 0x5ff) return 'Hebr';
  if (cp >= 0x4e00 && cp <= 0x9fff) return 'Hans';
  if (cp >= 0x3040 && cp <= 0x309f) return 'Hira';
  if (cp >= 0x30a0 && cp <= 0x30ff) return 'Kana';
  if (/\p{L}/u.test(ch)) return 'Other';
  return null;
}

/**
 * Count letters per script bucket in text.
 */
export function countScripts(text: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const ch of text) {
    const b = scriptBucket(ch);
    if (!b) continue;
    counts[b] = (counts[b] ?? 0) + 1;
  }
  return counts;
}

/**
 * Detect Latin-script bilingual mix via stopword hits in ≥2 languages.
 * Requires at least `minHits` stopword matches per language.
 */
export function detectLatinLanguageMix(
  text: string,
  minHits = 2
): string[] {
  const tokens = (text.toLowerCase().match(/[a-z']+/g) ?? []).filter(
    (t) => t.length >= 2
  );
  if (tokens.length < 4) return [];

  const hits: Record<string, number> = {};
  for (const [lang, words] of Object.entries(STOPWORDS)) {
    let n = 0;
    for (const t of tokens) {
      if (words.has(t)) n++;
    }
    if (n >= minHits) hits[lang] = n;
  }
  return Object.keys(hits).sort();
}

export interface IntraPostCodeSwitch {
  switched: boolean;
  /** Sorted script labels present with ≥ minScriptLetters letters. */
  scripts: string[];
  /** Sorted language codes from Latin stopword mix (may be empty). */
  languages: string[];
  /** Canonical pair key for fingerprinting, e.g. "Latn+Cyrl" or "en+es". */
  patternKey: string | null;
}

const MIN_SCRIPT_LETTERS = 3;

/**
 * Decide whether a single post shows intra-post code-switching.
 * True when ≥2 scripts each have enough letters, or ≥2 Latin
 * languages are evidenced by stopword hits.
 */
export function classifyIntraPostCodeSwitch(text: string): IntraPostCodeSwitch {
  const scriptCounts = countScripts(text);
  const scripts = Object.entries(scriptCounts)
    .filter(([, n]) => n >= MIN_SCRIPT_LETTERS)
    .map(([s]) => s)
    .sort();
  const languages = detectLatinLanguageMix(text);

  let patternKey: string | null = null;
  if (scripts.length >= 2) {
    patternKey = scripts.slice(0, 3).join('+');
  } else if (languages.length >= 2) {
    patternKey = languages.slice(0, 3).join('+');
  }

  return {
    switched: patternKey !== null,
    scripts,
    languages,
    patternKey,
  };
}

/**
 * Fraction of consecutive ordered posts whose register labels differ.
 */
export function registerSwitchRate(labels: RegisterLabel[]): number {
  if (labels.length < 2) return 0;
  let switches = 0;
  for (let i = 1; i < labels.length; i++) {
    if (labels[i] !== labels[i - 1]) switches++;
  }
  return switches / (labels.length - 1);
}

/**
 * Fraction of consecutive posts whose language codes differ.
 * Null/empty langs are skipped (do not count as a switch boundary).
 */
export function languageSwitchRate(langs: Array<string | null>): number {
  const cleaned = langs.map((l) => (l && l.trim() ? l.trim().toLowerCase() : null));
  let pairs = 0;
  let switches = 0;
  for (let i = 1; i < cleaned.length; i++) {
    const a = cleaned[i - 1];
    const b = cleaned[i];
    if (!a || !b) continue;
    pairs++;
    if (a !== b) switches++;
  }
  return pairs === 0 ? 0 : switches / pairs;
}
