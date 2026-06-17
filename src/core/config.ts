import "dotenv/config";
import path from "path";

export interface IConfig {
  INPUT: {
    CSV_PATH: string;
    MAX_URLS: number;
  };
  SCRAPER: {
    TIMEOUT_MS: number;
    CHROME_PATH: string;
  };
  KEYWORD: {
    MAX_KEYWORDS_PER_URL: number;
    MIN_WORD_LENGTH: number;
    BIGRAM_MIN_FREQ: number;
    TRIGRAM_MIN_FREQ: number;
  };
  OUTPUT: {
    DIR: string;
  };
  GEMINI: {
    API_KEY: string;
    MODEL: string;
    ENABLED: boolean;
  };
  USER_AGENTS: string[];
}

export const CONFIG: IConfig = {
  INPUT: {
    CSV_PATH:
      process.env.INPUT_CSV_PATH ||
      path.resolve("../serp_extract/search_results.csv"),
    MAX_URLS: parseInt(process.env.MAX_URLS || "0") || Infinity as unknown as number,
  },
  SCRAPER: {
    TIMEOUT_MS: 30_000,
    CHROME_PATH:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  },
  KEYWORD: {
    MAX_KEYWORDS_PER_URL: 50,
    MIN_WORD_LENGTH: 3,
    BIGRAM_MIN_FREQ: 2,
    TRIGRAM_MIN_FREQ: 2,
  },
  OUTPUT: {
    DIR: path.resolve("output"),
  },
  GEMINI: {
    API_KEY: process.env.GEMINI_API_KEY || "",
    MODEL: "gemini-2.0-flash",
    ENABLED: !!process.env.GEMINI_API_KEY,
  },
  USER_AGENTS: [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  ],
};

export const getRandomUA = (): string =>
  CONFIG.USER_AGENTS[Math.floor(Math.random() * CONFIG.USER_AGENTS.length)];
