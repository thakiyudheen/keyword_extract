import fs from "fs";
import path from "path";
import { CONFIG } from "../core/config.js";
import type { UrlAnalysis } from "./aggregatorService.js";
import type { AggregatedResult } from "./aggregatorService.js";
import type { GeminiGapAnalysis } from "./geminiService.js";

export class ReportService {
  private outputDir = CONFIG.OUTPUT.DIR;

  constructor() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  writeAllReports(
    perUrlResults: UrlAnalysis[],
    aggregated: AggregatedResult,
    geminiAnalysis: GeminiGapAnalysis,
  ): void {
    // 1. Per-URL: keyword frequency map + topic clusters
    this.writeUrlAnalysis(perUrlResults);

    // 2. Overall: commonly used keywords across all URLs
    this.writeCommonKeywords(aggregated);

    // 3. Gemini: underutilized keyword suggestions for better ranking
    this.writeGeminiAnalysis(geminiAnalysis);
  }

  /** Per-URL: frequency map + topic clusters combined */
  private writeUrlAnalysis(results: UrlAnalysis[]): void {
    const data = results
      .filter(r => !r.error)
      .map(r => ({
        url: r.url,
        keyword_frequency_map: r.frequencyMap,
        topic_clusters: r.clusters,
      }));
    this.writeJson("url_analysis.json", data);
  }

  /** Common keywords found across all URLs (appear in ≥50% of pages) */
  private writeCommonKeywords(aggregated: AggregatedResult): void {
    const data = {
      common_keywords: aggregated.common_keywords,
      topic_clusters: aggregated.topic_clusters,
    };
    this.writeJson("common_keywords.json", data);
  }

  /** Gemini gap analysis: underutilized keywords for better ranking */
  private writeGeminiAnalysis(analysis: GeminiGapAnalysis): void {
    this.writeJson("gemini_gap_analysis.json", analysis);
  }

  private writeJson(filename: string, data: unknown): void {
    const filePath = path.join(this.outputDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    console.log(`  [Report] Written: ${filePath}`);
  }
}
