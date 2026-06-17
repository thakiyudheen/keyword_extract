import { GoogleGenerativeAI } from "@google/generative-ai";
import { CONFIG } from "../core/config.js";
import { GeminiError } from "../core/errors.js";
import type { UrlAnalysis } from "./aggregatorService.js";

export interface GeminiGapAnalysis {
  commonly_used_keywords: string[];          // keywords competitors dominate
  underutilized_opportunities: string[];     // low-competition keywords worth targeting
  long_tail_opportunities: string[];         // specific long-tail phrases with ranking potential
  semantic_keywords: string[];               // related terms to boost topical authority
  ranking_recommendations: string[];         // actionable advice to outrank competitors
}

const EMPTY_ANALYSIS: GeminiGapAnalysis = {
  commonly_used_keywords: [],
  underutilized_opportunities: [],
  long_tail_opportunities: [],
  semantic_keywords: [],
  ranking_recommendations: [],
};

export class GeminiService {
  private client: GoogleGenerativeAI | null = null;

  constructor() {
    if (CONFIG.GEMINI.ENABLED && CONFIG.GEMINI.API_KEY) {
      this.client = new GoogleGenerativeAI(CONFIG.GEMINI.API_KEY);
    }
  }

  /**
   * Send aggregated keyword data to Gemini and return keyword gap analysis.
   * Returns an empty structure if Gemini is not configured.
   */
  async analyzeKeywordGaps(
    perUrlResults: UrlAnalysis[],
  ): Promise<GeminiGapAnalysis> {
    if (!this.client || !CONFIG.GEMINI.ENABLED) {
      console.log(
        "  [Gemini] GEMINI_API_KEY not set — skipping gap analysis.",
      );
      return EMPTY_ANALYSIS;
    }

    console.log("  [Gemini] Sending raw per-URL data for Gemini to analyze overall context...");

    // Format the per-URL data for the prompt
    const urlDataFormatted = perUrlResults
      .filter(r => !r.error)
      .map((r, i) => {
        const topKeywords = Object.entries(r.frequencyMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 30) // top 30 per URL to save tokens
          .map(([kw]) => kw)
          .join(", ");
        return `URL ${i + 1}: ${r.url}\nTop Keywords: ${topKeywords}\nTopics: ${Object.keys(r.clusters).join(", ")}`;
      })
      .join("\n\n");

    const prompt = `
You are a senior SEO strategist specializing in immigration and visa-related content.

Below is the raw keyword data extracted individually from several top-ranking competitor pages for an immigration query.

## Per-URL Keyword Data:
${urlDataFormatted}

Your task:
1. Check the data in the overall context of all the provided URLs.
2. Output the keywords commonly used across these competitors.
3. Suggest immigration keywords that are NOT used a lot by these competitors but could be utilized for ranking better against these URLs (gap opportunities).
4. Suggest specific long-tail immigration phrases a new article could rank for.
5. Give actionable recommendations on which keywords to target to rank better.

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation, no code fences):

{
  "commonly_used_keywords": ["keywords competitors dominate — high competition"],
  "underutilized_opportunities": ["immigration keywords NOT used much by competitors — ranking gaps"],
  "long_tail_opportunities": ["specific long-tail phrases with low competition but real intent"],
  "semantic_keywords": ["related immigration terms to strengthen topical authority"],
  "ranking_recommendations": ["actionable steps to outrank these competitor URLs"]
}

Each array: 8–15 items. Be specific, immigration-domain focused, and prioritize real ranking opportunities.
`.trim();

    try {
      const model = this.client.getGenerativeModel({
        model: CONFIG.GEMINI.MODEL,
      });

      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();

      // Strip markdown code fences if present
      const jsonText = responseText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const parsed = JSON.parse(jsonText) as GeminiGapAnalysis;
      console.log("  [Gemini] ✅ Keyword gap analysis received.");
      return parsed;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      // Detect quota exhaustion and surface a clean, actionable error
      if (message.includes("429") || message.includes("quota") || message.includes("Quota")) {
        throw new GeminiError(
          "❌ Gemini API quota exceeded. Your free tier limit has been reached.\n" +
          "   → Check usage: https://ai.dev/rate-limit\n" +
          "   → Quota resets daily. Try again tomorrow or enable billing."
        );
      }

      throw new GeminiError(`Gemini error: ${message}`);
    }
  }
}
