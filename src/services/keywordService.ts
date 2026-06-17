import natural from "natural";
import nlp from "compromise";
import { CONFIG } from "../core/config.js";

export interface KeywordResult {
  keywords: string[];
  frequencyMap: Record<string, number>;
}

/** Inline n-gram generator — avoids CJS/ESM import issues with the n-gram package */
function getNgrams(tokens: string[], n: number): string[] {
  const result: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    result.push(tokens.slice(i, i + n).join(" "));
  }
  return result;
}

export class KeywordService {
  private tokenizer = new natural.WordTokenizer();

  // Extended stop words covering English boilerplate + immigration-domain noise
  private stopwords = new Set<string>([
    ...(natural.stopwords as string[]),
    // Web boilerplate
    "privacy", "policy", "rights", "reserved", "copyright",
    "cookies", "terms", "conditions", "contact", "about", "home",
    "read", "more", "click", "login", "signup", "register",
    "subscribe", "newsletter", "share", "follow", "like", "tweet",
    "menu", "search", "close", "back", "next", "previous", "page",
    "loading", "error", "skip", "content", "section", "article",
    "updated", "published", "author", "posted", "date", "time",
    "year", "month", "day", "week", "hour", "minute",
    "also", "including", "please", "note", "however", "therefore",
    "within", "without", "between", "through", "during",
    "https", "http", "www", "com", "org", "net", "html",
    // Generic weak words
    "information", "details", "process", "services", "service",
    "platform", "system", "company", "business", "solution",
    "available", "provide", "required", "need", "ensure",
    "different", "various", "general", "specific", "important",
    "following", "example", "includes", "related",
  ]);

  /**
   * Extract keywords and frequency map from plain text.
   * Includes single-word, bigram, and trigram keywords.
   */
  extractKeywords(text: string): KeywordResult {
    if (!text || text.trim().length === 0) {
      return { keywords: [], frequencyMap: {} };
    }

    const lowerText = text.toLowerCase();
    const tokens = this.tokenizer.tokenize(lowerText) || [];

    // --- Single word frequency scoring ---
    const wordFreq: Record<string, number> = {};
    tokens.forEach((word, idx) => {
      if (this.shouldSkipWord(word)) return;

      // TF score: base + length bonus + position bonus (earlier = more relevant)
      let score = 1;
      score += Math.min(word.length * 0.3, 3);
      if (idx < 150) score += 3; // early-position boost
      if (idx < 50)  score += 5; // title/intro boost

      // NLP noun boost via compromise
      try {
        const isNoun = nlp(word).nouns().out("array").length > 0;
        if (isNoun) score += 8;
      } catch (_) { /* ignore */ }

      wordFreq[word] = (wordFreq[word] || 0) + score;
    });

    // --- Bigrams + Trigrams via inline generator ---
    const words = tokens.filter(w => !this.shouldSkipWord(w));
    const bigrams  = getNgrams(words, 2);
    const trigrams = getNgrams(words, 3);

    const ngramFreq: Record<string, number> = {};
    [...bigrams, ...trigrams].forEach(phrase => {
      ngramFreq[phrase] = (ngramFreq[phrase] || 0) + 1;
    });

    // Merge: filter n-grams by minimum frequency to reduce noise
    const combinedFreq: Record<string, number> = { ...wordFreq };
    Object.entries(ngramFreq).forEach(([phrase, count]) => {
      const wordCount = phrase.split(" ").length;
      const minFreq = wordCount === 2
        ? CONFIG.KEYWORD.BIGRAM_MIN_FREQ
        : CONFIG.KEYWORD.TRIGRAM_MIN_FREQ;
      if (count >= minFreq) {
        // Scale n-gram score: bigram x6, trigram x9 (higher specificity = higher value)
        combinedFreq[phrase] = count * (wordCount === 2 ? 6 : 9);
      }
    });

    // Sort by frequency score descending
    const sorted = Object.entries(combinedFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, CONFIG.KEYWORD.MAX_KEYWORDS_PER_URL);

    // Build clean frequency map (integer counts)
    const frequencyMap: Record<string, number> = {};
    sorted.forEach(([kw, score]) => {
      frequencyMap[kw] = Math.round(score);
    });

    return {
      keywords: sorted.map(([kw]) => kw),
      frequencyMap,
    };
  }

  private shouldSkipWord(word: string): boolean {
    return (
      this.stopwords.has(word) ||
      word.length < CONFIG.KEYWORD.MIN_WORD_LENGTH ||
      !isNaN(Number(word)) ||            // pure numbers
      !/^[a-z][a-z'-]*[a-z]$/.test(word) // must be valid word chars
    );
  }
}
