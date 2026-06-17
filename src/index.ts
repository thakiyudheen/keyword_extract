import fs from "fs";
import { parse } from "csv-parse/sync";
import { CONFIG } from "./core/config.js";
import { ScraperService } from "./services/scraperService.js";
import { KeywordService } from "./services/keywordService.js";
import { ClusterService } from "./services/clusterService.js";
import { AggregatorService } from "./services/aggregatorService.js";
import { GeminiService } from "./services/geminiService.js";
import { ReportService } from "./services/reportService.js";
import type { UrlAnalysis } from "./services/aggregatorService.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readUrlsFromCsv(csvPath: string): string[] {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const content = fs.readFileSync(csvPath, "utf-8");
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  // Accept both "URL" and "url" column names
  const urls = records
    .map(row => row["URL"] || row["url"] || "")
    .filter(url => url.startsWith("http"));

  return urls;
}

function printBanner(): void {
  console.log("\n=========================================");
  console.log("🔍  Keyword Extract & Gap Analysis Tool  ");
  console.log("=========================================\n");
}

function printProgress(current: number, total: number, url: string): void {
  console.log(`\n[${current}/${total}] Processing: ${url}`);
}

// ─── Main Pipeline ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  printBanner();

  // Determine input CSV path (CLI arg > env > default)
  const csvPath = process.argv[2] || CONFIG.INPUT.CSV_PATH;
  console.log(`📂 Input CSV: ${csvPath}`);

  // Read URLs
  let allUrls: string[];
  try {
    allUrls = readUrlsFromCsv(csvPath);
  } catch (err: any) {
    console.error(`\n💥 Failed to read CSV: ${err.message}`);
    process.exit(1);
  }

  const maxUrls = CONFIG.INPUT.MAX_URLS as unknown as number;
  const urls = isFinite(maxUrls) ? allUrls.slice(0, maxUrls) : allUrls;

  if (urls.length === 0) {
    console.error("⚠️  No URLs found in CSV. Exiting.");
    process.exit(1);
  }

  console.log(`🌐 URLs to process: ${urls.length}\n`);
  console.log("-----------------------------------------");

  // Instantiate services
  const scraper     = new ScraperService();
  const keywords    = new KeywordService();
  const clusters    = new ClusterService();
  const aggregator  = new AggregatorService();
  const gemini      = new GeminiService();
  const reporter    = new ReportService();

  // ── Step 1–4: Scrape, extract keywords, cluster — sequentially ──────────────
  const perUrlResults: UrlAnalysis[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    printProgress(i + 1, urls.length, url);

    try {
      // 1. Fetch & clean page text
      const text = await scraper.fetchPageContent(url);

      if (!text || text.length < 100) {
        console.warn(`  ⚠️  Very little content extracted (${text.length} chars), skipping.`);
        perUrlResults.push({
          url,
          keywords: [],
          frequencyMap: {},
          clusters: {},
          error: "Insufficient content extracted",
        });
        continue;
      }

      console.log(`  ✅ Content extracted: ${text.length.toLocaleString()} chars`);

      // 2. Extract keywords + frequency map
      const { keywords: kws, frequencyMap } = keywords.extractKeywords(text);
      console.log(`  🔑 Keywords found: ${kws.length}`);

      // 3. Cluster keywords into topics
      const topicClusters = clusters.clusterKeywords(kws);
      const clusterCount = Object.keys(topicClusters).length;
      console.log(`  📦 Topic clusters: ${clusterCount}`);

      perUrlResults.push({
        url,
        keywords: kws,
        frequencyMap,
        clusters: topicClusters,
      });
    } catch (err: any) {
      console.error(`  ❌ Error processing ${url}: ${err.message}`);
      perUrlResults.push({
        url,
        keywords: [],
        frequencyMap: {},
        clusters: {},
        error: err.message,
      });
    }
  }

  // ── Step 5: Cross-URL aggregation ────────────────────────────────────────────
  console.log("\n-----------------------------------------");
  console.log("📊 Aggregating cross-URL keyword data...");
  const aggregated = aggregator.aggregate(perUrlResults);
  console.log(`  ✅ Total keywords in aggregated map: ${Object.keys(aggregated.keyword_frequency_map).length}`);
  console.log(`  ✅ Common keywords: ${aggregated.common_keywords.length}`);

  // ── Step 6: Gemini keyword gap analysis ──────────────────────────────────────
  console.log("\n🤖 Running Gemini keyword gap analysis...");
  let geminiResult;
  try {
    geminiResult = await gemini.analyzeKeywordGaps(perUrlResults);
  } catch (err: any) {
    console.error(`\n  ${err.message}`);
    geminiResult = {
      commonly_used_keywords: [],
      underutilized_opportunities: [],
      long_tail_opportunities: [],
      semantic_keywords: [],
      ranking_recommendations: [],
    };
  }

  // ── Step 7: Write output JSON files ──────────────────────────────────────────
  console.log("\n💾 Writing output reports...");
  reporter.writeAllReports(perUrlResults, aggregated, geminiResult);

  // ── Summary ──────────────────────────────────────────────────────────────────
  const successful = perUrlResults.filter(r => !r.error).length;
  const failed     = perUrlResults.length - successful;

  console.log("\n=========================================");
  console.log("✅  Analysis Complete!");
  console.log("-----------------------------------------");
  console.log(`  URLs processed:    ${successful}/${urls.length}`);
  if (failed > 0) {
    console.log(`  URLs failed:       ${failed}`);
  }
  console.log(`  Output directory:  ${CONFIG.OUTPUT.DIR}/`);
  console.log("\n  Files written:");
  console.log("  📄 url_analysis.json       ← per-URL: frequency map + clusters");
  console.log("  📄 common_keywords.json    ← commonly used keywords across all URLs");
  console.log("  📄 gemini_gap_analysis.json ← underutilized keywords for better ranking");
  console.log("=========================================\n");
}

main().catch((err: unknown) => {
  console.error(
    `\n💥 Fatal error: ${err instanceof Error ? err.stack : String(err)}`,
  );
  process.exit(1);
});
