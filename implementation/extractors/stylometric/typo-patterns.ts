/**
 * Typo / error-pattern taxonomy and counters (§4.3.5).
 *
 * Rule-based matchers over a fixed English taxonomy. No spell-checker
 * network calls; configuration is this file + extractor version.
 *
 * Two signal families:
 *   1. Hard errors — missing apostrophes, known misspellings, repeated
 *      letters, QWERTY-adjacent swaps that yield a common word.
 *   2. Confusion-form fingerprints — relative use of their/there/they're
 *      (etc.). These are not labeled "wrong"; the distribution shape is
 *      the linkage signal.
 *
 * False-positive modes (paper §4.3.5): shared autocorrect dictionaries;
 * shared L1 transfer effects (same first language → similar L2 errors).
 * False-negative modes: editorial cleanup; AI writing assistants.
 */

export const HARD_ERROR_CATEGORIES = [
  'missing_apostrophe',
  'common_misspelling',
  'repeated_letter',
  'qwerty_adjacent_swap',
] as const;

export type HardErrorCategory = (typeof HARD_ERROR_CATEGORIES)[number];

/** Confusion-form tokens tracked as fingerprint distributions. */
export const CONFUSION_FORMS = [
  'their',
  'there',
  "they're",
  'theyre',
  'then',
  'than',
  'its',
  "it's",
  'your',
  "you're",
  'youre',
  'to',
  'too',
  'two',
] as const;

/** Common misspellings (autocorrect / habit signatures). */
const COMMON_MISSPELLINGS = new Set([
  'teh',
  'recieve',
  'seperate',
  'occured',
  'definately',
  'untill',
  'wich',
  'becuase',
  'freind',
  'wierd',
  'thier',
  'enviroment',
  'goverment',
  'tommorow',
  'tommorrow',
  'accomodate',
  'begining',
  'beleive',
  'calender',
  'concious',
  'exmaple',
  'happend',
  'knowlege',
  'lenght',
  'neccessary',
  'oppertunity',
  'prefered',
  'priviledge',
  'realy',
  'succesful',
  'tomatos',
  'truely',
  'usefull',
  'writting',
]);

const MISSING_APOSTROPHE = new Set([
  'dont',
  'cant',
  'wont',
  'isnt',
  'arent',
  'wasnt',
  'werent',
  'havent',
  'hasnt',
  'hadnt',
  'doesnt',
  'didnt',
  'couldnt',
  'shouldnt',
  'wouldnt',
  'im',
  'youre',
  'theyre',
  'thats',
  'whats',
  'heres',
  'theres',
]);

const QWERTY_ADJACENT = buildQwertyAdjacent();

function buildQwertyAdjacent(): Set<string> {
  const rows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  const adj = new Set<string>();
  for (const row of rows) {
    for (let i = 0; i < row.length - 1; i++) {
      const a = row[i];
      const b = row[i + 1];
      adj.add(a < b ? `${a}${b}` : `${b}${a}`);
    }
  }
  return adj;
}

function tokenizeWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z']+/g) ?? []).filter((w) => w.length > 0);
}

export interface TypoScanResult {
  hardErrors: Record<HardErrorCategory, number>;
  confusionForms: Record<string, number>;
  tokenCount: number;
}

/**
 * Scan text for hard-error hits and confusion-form fingerprint counts.
 */
export function scanTypos(text: string): TypoScanResult {
  const hardErrors = Object.fromEntries(
    HARD_ERROR_CATEGORIES.map((c) => [c, 0])
  ) as Record<HardErrorCategory, number>;
  const confusionForms: Record<string, number> = {};

  const words = tokenizeWords(text);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = i + 1 < words.length ? words[i + 1] : '';

    if ((CONFUSION_FORMS as readonly string[]).includes(w)) {
      confusionForms[w] = (confusionForms[w] ?? 0) + 1;
    }

    if (MISSING_APOSTROPHE.has(w)) {
      hardErrors.missing_apostrophe++;
    }

    if (COMMON_MISSPELLINGS.has(w)) {
      hardErrors.common_misspelling++;
    }

    if (/([a-z])\1{2,}/.test(w) && w.length >= 4) {
      hardErrors.repeated_letter++;
    }

    if (w.length >= 3 && w.length <= 8 && !w.includes("'")) {
      if (looksLikeQwertySwap(w)) {
        hardErrors.qwerty_adjacent_swap++;
      }
    }

    void next;
  }

  return { hardErrors, confusionForms, tokenCount: words.length };
}

const SWAP_TARGETS = new Set([
  'the',
  'and',
  'for',
  'you',
  'are',
  'that',
  'with',
  'this',
  'have',
  'from',
  'they',
  'been',
  'were',
  'what',
  'when',
  'your',
  'which',
  'there',
  'their',
]);

function looksLikeQwertySwap(word: string): boolean {
  if (SWAP_TARGETS.has(word)) return false;
  const chars = word.split('');
  for (let i = 0; i < chars.length - 1; i++) {
    const a = chars[i];
    const b = chars[i + 1];
    if (a === b) continue;
    const key = a < b ? `${a}${b}` : `${b}${a}`;
    if (!QWERTY_ADJACENT.has(key)) continue;
    const swapped = chars.slice();
    swapped[i] = b;
    swapped[i + 1] = a;
    if (SWAP_TARGETS.has(swapped.join(''))) return true;
  }
  return false;
}

export function totalHardErrors(
  counts: Record<HardErrorCategory, number>
): number {
  let n = 0;
  for (const c of HARD_ERROR_CATEGORIES) n += counts[c];
  return n;
}

export function sparsePositiveCounts(
  counts: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) {
    if (v > 0) out[k] = v;
  }
  return out;
}
