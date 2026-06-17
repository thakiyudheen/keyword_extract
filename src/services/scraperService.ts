import * as cheerio from "cheerio";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import axios from "axios";
import fs from "fs";
import { CONFIG, getRandomUA } from "../core/config.js";
import { ScrapingError, TimeoutError } from "../core/errors.js";

puppeteer.use(StealthPlugin());

const SYSTEM_CHROME = CONFIG.SCRAPER.CHROME_PATH;

export class ScraperService {
  /**
   * Fetch page content using Puppeteer (headless Chrome) with an axios fallback.
   * Returns normalized plain text suitable for keyword analysis.
   */
  async fetchPageContent(url: string): Promise<string> {
    console.log(`  [Scraper] Fetching: ${url}`);

    // Try Puppeteer first
    try {
      return await this.fetchWithPuppeteer(url);
    } catch (err: any) {
      // If Puppeteer gets a hard block (403, 401) or navigation error, fall back to axios
      const msg = err.message || "";
      const isBlockedOrNavError =
        msg.includes("403") ||
        msg.includes("401") ||
        msg.includes("Execution context was destroyed") ||
        msg.includes("navigation");

      if (isBlockedOrNavError) {
        console.log(`  [Scraper] Puppeteer blocked/failed (${msg.split(":")[0]}), trying axios fallback...`);
        try {
          return await this.fetchWithAxios(url);
        } catch (axiosErr: any) {
          throw new ScrapingError(
            `Both Puppeteer and axios failed for ${url}: ${axiosErr.message}`,
            url,
          );
        }
      }
      throw err;
    }
  }

  // ─── Puppeteer fetch ──────────────────────────────────────────────────────

  private async fetchWithPuppeteer(url: string): Promise<string> {
    let browser: any = null;
    try {
      const launchOptions: any = {
        headless: "new",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
          "--lang=en-US,en",
        ],
        defaultViewport: { width: 1280, height: 800 },
      };

      if (fs.existsSync(SYSTEM_CHROME)) {
        launchOptions.executablePath = SYSTEM_CHROME;
      }

      browser = await (puppeteer as any).launch(launchOptions);
      const page = await browser.newPage();
      await page.setUserAgent(getRandomUA());

      // Block non-essential resources for speed
      await page.setRequestInterception(true);
      page.on("request", (req: any) => {
        const rt = req.resourceType();
        if (["image", "stylesheet", "font", "media"].includes(rt)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      // Use networkidle2 for SPA sites (Reddit, etc.) — waits for JS to settle
      const response = await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: CONFIG.SCRAPER.TIMEOUT_MS,
      });

      if (!response) {
        throw new ScrapingError(`No response received for ${url}`, url);
      }

      // Allow any post-load redirects to settle
      await new Promise(r => setTimeout(r, 1500));

      const statusCode = response.status();
      if (statusCode === 403 || statusCode === 401 || statusCode === 429) {
        throw new ScrapingError(`HTTP ${statusCode} for ${url}`, url);
      }

      const html = await page.content();
      return this.extractText(html);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes("timeout")) {
        throw new TimeoutError(`Timeout fetching ${url}`, url);
      }
      if (error instanceof ScrapingError) throw error;
      throw new ScrapingError(`Puppeteer failed for ${url}: ${message}`, url);
    } finally {
      if (browser) {
        try { await browser.close(); } catch (_) {}
      }
    }
  }

  // ─── Axios HTTP fallback ──────────────────────────────────────────────────

  private async fetchWithAxios(url: string): Promise<string> {
    const response = await axios.get<string>(url, {
      timeout: CONFIG.SCRAPER.TIMEOUT_MS,
      headers: {
        "User-Agent": getRandomUA(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
      },
      maxRedirects: 5,
    });

    console.log(`  [Scraper] Axios fallback succeeded (${response.status})`);
    return this.extractText(response.data);
  }

  // ─── HTML → plain text ────────────────────────────────────────────────────

  /**
   * Parse HTML with Cheerio, strip boilerplate, return clean plain text.
   */
  private extractText(html: string): string {
    const $ = cheerio.load(html);

    // Remove all non-content elements
    $(
      [
        "script", "style", "noscript", "iframe",
        "nav", "footer", "header", "aside", "menu",
        "form", "input", "textarea", "select", "button", "label",
        "svg", "canvas", "dialog",
        "[role='dialog']", "[aria-hidden='true']",
        ".ads", "#ads", ".ad", ".advertisement",
        ".modal", ".popup", ".cookie", ".cookie-banner",
        ".banner", ".newsletter", ".sidebar", ".widget",
        ".breadcrumb", ".pagination", ".social-share",
        "[class*='cookie']", "[class*='banner']", "[class*='popup']",
        "[class*='modal']", "[id*='cookie']", "[id*='banner']",
      ].join(", "),
    ).remove();

    // Try main content area selectors first, fall back to body
    const mainSelectors = [
      "main", "article", "[role='main']",
      ".content", "#content", "#main",
      ".post-content", ".entry-content", ".article-body",
      "body",
    ];

    let text = "";
    for (const sel of mainSelectors) {
      const el = $(sel);
      if (el.length && el.text().trim().length > 200) {
        text = el.text();
        break;
      }
    }

    if (!text) {
      text = $("body").text();
    }

    // Normalize whitespace
    return text.replace(/\s+/g, " ").trim();
  }
}
