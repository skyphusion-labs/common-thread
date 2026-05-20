/**
 * Canonical 150-word function-word list for stylometric analysis.
 *
 * Adapted from standard stylometric references:
 *   - Burrows, J. (2002). "Delta: A measure of stylistic difference
 *     and a guide to likely authorship."
 *   - Mosteller, F. & Wallace, D. (1964). "Inference and Disputed
 *     Authorship: The Federalist."
 *   - Koppel, M. & Argamon, S. (2005). "Computational methods in
 *     authorship attribution."
 *
 * The list contains pure function words: articles, pronouns,
 * prepositions, conjunctions, modal/auxiliary verbs, common adverbs,
 * negations, and common contractions. Content words (nouns, verbs,
 * adjectives that carry topical meaning) are deliberately excluded
 * because their frequency is topic-driven rather than stylistic.
 *
 * The list is intentionally fixed at 150 entries to match the
 * methodology paper's §4.3.1 specification. Practitioners who need
 * a different list (language other than English, domain-specific
 * adjustments) should fork this file and version the new list
 * separately, since changing the list invalidates frequency-vector
 * comparisons across runs.
 *
 * All entries are lowercase ASCII. Contractions use the typographer's
 * apostrophe NOT — they use the straight ASCII apostrophe (U+0027) to
 * match the tokenizer's output.
 */

export const FUNCTION_WORDS_150: ReadonlyArray<string> = Object.freeze([
  // Articles (3)
  'a', 'an', 'the',

  // Personal pronouns subject (7)
  'i', 'you', 'he', 'she', 'it', 'we', 'they',

  // Personal pronouns object (5)
  'me', 'him', 'us', 'them', 'one',

  // Possessive determiners (7)
  'my', 'your', 'his', 'her', 'its', 'our', 'their',

  // Possessive pronouns (5)
  'mine', 'yours', 'hers', 'ours', 'theirs',

  // Reflexive pronouns (6)
  'myself', 'yourself', 'himself', 'herself', 'itself', 'themselves',

  // Demonstratives (4)
  'this', 'that', 'these', 'those',

  // Indefinite pronouns / quantifiers (10)
  'some', 'any', 'no', 'none', 'all', 'every', 'each', 'both', 'neither', 'either',

  // Relative / interrogative (7)
  'who', 'whom', 'whose', 'which', 'what', 'when', 'where',

  // Common prepositions (22)
  'of', 'in', 'to', 'for', 'with', 'on', 'at', 'by', 'from', 'about',
  'into', 'through', 'before', 'after', 'between', 'against', 'under',
  'over', 'across', 'around', 'as', 'than',

  // Conjunctions (10)
  'and', 'but', 'or', 'nor', 'so', 'yet', 'if', 'because', 'while', 'although',

  // Modal verbs (8)
  'can', 'could', 'may', 'might', 'must', 'shall', 'should', 'would',

  // Forms of 'be' (8)
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',

  // Forms of 'have' (4)
  'have', 'has', 'had', 'having',

  // Forms of 'do' (3)
  'do', 'does', 'did',

  // Will / get (3)
  'will', 'get', 'got',

  // Negation (3)
  'not', 'never', 'nothing',

  // Common adverbs (15)
  'very', 'also', 'only', 'just', 'even', 'still', 'more', 'most',
  'too', 'here', 'there', 'now', 'then', 'again', 'always',

  // Contractions and clitics (20) - the tokenizer keeps these as single tokens
  "n't", "'s", "'ve", "'re", "'ll", "'d", "'m",
  "don't", "won't", "can't", "isn't", "wasn't", "aren't", "weren't",
  "didn't", "doesn't", "i'm", "you're", "it's", "that's",
]);

/**
 * Indexed lookup map: function_word → its position in FUNCTION_WORDS_150.
 * Used by the extractor to build the frequency vector in O(n) time.
 */
export const FUNCTION_WORD_INDEX: ReadonlyMap<string, number> = new Map(
  FUNCTION_WORDS_150.map((w, i) => [w, i] as const)
);

/**
 * The fixed length of the function-word frequency vector. Always 150.
 * Exported as a constant to make downstream pair-extractor code explicit
 * about the expected vector size.
 */
export const FUNCTION_WORD_VECTOR_LENGTH = FUNCTION_WORDS_150.length;
