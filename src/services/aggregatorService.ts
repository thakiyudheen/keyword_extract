import type { TopicClusters } from "./clusterService.js";

export interface UrlAnalysis {
  url: string;
  keywords: string[];
  frequencyMap: Record<string, number>;
  clusters: TopicClusters;
  error?: string;
}

export interface AggregatedResult {
  totalUrls: number;
  processedUrls: number;
  common_keywords: string[];
  keyword_frequency_map: Record<string, number>;
  topic_clusters: TopicClusters;
}

export class AggregatorService {
  /**
   * Aggregate per-URL analysis into a cross-URL summary.
   * - Merge all frequency maps (sum scores)
   * - Find keywords appearing in >= 50% of URLs
   * - Merge topic clusters (union across all URLs)
   */
  aggregate(results: UrlAnalysis[]): AggregatedResult {
    const successful = results.filter(r => !r.error);
    const totalUrls = results.length;
    const processedUrls = successful.length;

    // Merged frequency map: sum all per-URL scores
    const mergedFreq: Record<string, number> = {};
    // Track keyword → how many URLs contain it
    const urlCountMap: Record<string, number> = {};

    for (const result of successful) {
      const seenInThisUrl = new Set<string>();

      for (const [kw, score] of Object.entries(result.frequencyMap)) {
        mergedFreq[kw] = (mergedFreq[kw] || 0) + score;
        if (!seenInThisUrl.has(kw)) {
          urlCountMap[kw] = (urlCountMap[kw] || 0) + 1;
          seenInThisUrl.add(kw);
        }
      }
    }

    // Sort by aggregated frequency descending
    const sortedFreq: Record<string, number> = Object.fromEntries(
      Object.entries(mergedFreq).sort(([, a], [, b]) => b - a),
    );

    // Common keywords: appear in >= 50% of successfully processed URLs
    const threshold = Math.max(2, Math.ceil(processedUrls * 0.5));
    let common_keywords = Object.entries(urlCountMap)
      .filter(([, count]) => count >= threshold)
      .sort(([, a], [, b]) => b - a)
      .map(([kw]) => kw);

    // Deduplicate common keywords: remove single words if they are part of a longer phrase
    common_keywords = common_keywords.filter((kw, _, arr) => {
      // If it's a multi-word phrase, keep it
      if (kw.includes(" ")) return true;
      // If it's a single word, check if a longer phrase contains it as a distinct word
      const isFragment = arr.some(
        other => other !== kw && other.includes(" ") && new RegExp(`\\b${kw}\\b`).test(other)
      );
      return !isFragment;
    });

    // Merge topic clusters: union of keywords per topic across all URLs
    const mergedClusters: TopicClusters = {};
    for (const result of successful) {
      for (const [topic, keywords] of Object.entries(result.clusters)) {
        if (!mergedClusters[topic]) {
          mergedClusters[topic] = [];
        }
        for (const kw of keywords) {
          if (!mergedClusters[topic].includes(kw)) {
            mergedClusters[topic].push(kw);
          }
        }
      }
    }

    // Sort and deduplicate each cluster's keywords
    for (const topic of Object.keys(mergedClusters)) {
      let clusterKws = mergedClusters[topic].sort(
        (a, b) => (sortedFreq[b] || 0) - (sortedFreq[a] || 0),
      );

      // Remove redundant fragments within the same cluster
      clusterKws = clusterKws.filter((kw, _, arr) => {
        if (kw.includes(" ")) return true;
        return !arr.some(other => other !== kw && other.includes(" ") && new RegExp(`\\b${kw}\\b`).test(other));
      });

      mergedClusters[topic] = clusterKws;
    }

    return {
      totalUrls,
      processedUrls,
      common_keywords,
      keyword_frequency_map: sortedFreq,
      topic_clusters: mergedClusters,
    };
  }
}
