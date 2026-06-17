export type TopicClusters = Record<string, string[]>;

/**
 * Seed terms that map to each topic cluster.
 * If a keyword contains ANY of these seed terms it gets assigned to that cluster.
 */
const CLUSTER_SEEDS: Record<string, string[]> = {
  "Work Permits": [
    "work permit", "work visa", "employment visa", "labour market", "job offer",
    "employer", "sponsored", "sponsorship", "lmia", "work authorization",
    "temporary worker", "skilled worker", "professional visa", "h1b", "h-1b",
    "tier 2", "intracompany", "intra-company",
  ],
  "Permanent Residency": [
    "permanent resident", "permanent residency", "green card", "pr application",
    "express entry", "skilled immigrant", "points based", "pr status",
    "indefinite leave", "settlement", "permanent stay", "pr visa",
  ],
  "Visas & Entry": [
    "tourist visa", "visitor visa", "entry visa", "travel visa", "e-visa",
    "evisa", "visa application", "visa requirements", "visa fee", "visa approval",
    "schengen", "multiple entry", "single entry", "visa on arrival",
    "transit visa", "airport transit",
  ],
  "EU Blue Card": [
    "blue card", "eu blue card", "european blue card", "bluecard",
    "highly qualified", "high salary", "minimum salary", "salary threshold",
  ],
  "Family Immigration": [
    "family reunification", "family visa", "spouse visa", "dependent visa",
    "partner visa", "child visa", "family member", "join family",
    "family immigration", "family sponsorship",
  ],
  "Study & Student Visas": [
    "student visa", "study visa", "study permit", "student permit",
    "university", "college", "educational institution", "academic",
    "enrollment", "tuition", "international student",
  ],
  "Citizenship & Naturalization": [
    "citizenship", "naturalization", "naturalisation", "passport",
    "dual citizenship", "nationality", "citizen", "national",
  ],
  "Application Process": [
    "application form", "apply online", "submit application", "processing time",
    "application fee", "biometrics", "medical exam", "background check",
    "interview", "appointment", "documentation", "supporting documents",
    "required documents", "checklist",
  ],
  "Costs & Fees": [
    "cost", "fee", "price", "charge", "payment", "salary", "minimum wage",
    "income requirement", "financial requirement", "bank statement",
  ],
  "Country-Specific": [
    "canada", "australia", "germany", "france", "united kingdom", "spain",
    "netherlands", "sweden", "norway", "denmark", "new zealand", "portugal",
    "ireland", "austria", "belgium", "switzerland", "usa", "united states",
    "india", "china", "brazil", "mexico",
  ],
  "Relocation & Settlement": [
    "relocat", "settlement", "moving abroad", "expat", "expatriate",
    "housing", "accommodation", "rent", "cost of living", "banking",
    "healthcare", "insurance", "language requirement",
  ],
};

export class ClusterService {
  /**
   * Assign keywords to topic clusters based on seed-term matching.
   * Keywords not matching any cluster go into "General".
   */
  clusterKeywords(keywords: string[]): TopicClusters {
    const clusters: TopicClusters = {};

    // Initialize all cluster buckets
    for (const topic of Object.keys(CLUSTER_SEEDS)) {
      clusters[topic] = [];
    }
    clusters["General"] = [];

    for (const keyword of keywords) {
      const lower = keyword.toLowerCase();
      let assigned = false;

      for (const [topic, seeds] of Object.entries(CLUSTER_SEEDS)) {
        if (seeds.some(seed => lower.includes(seed))) {
          clusters[topic].push(keyword);
          assigned = true;
          break;
        }
      }

      if (!assigned) {
        clusters["General"].push(keyword);
      }
    }

    // Remove empty clusters for cleaner output
    return Object.fromEntries(
      Object.entries(clusters).filter(([, kws]) => kws.length > 0),
    );
  }
}
