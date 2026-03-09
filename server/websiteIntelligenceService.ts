import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage";
import type { ExtractedCategory, InsertCapture } from "@shared/schema";

const activeJobs = new Map<string, { status: string; completedAt?: number; noDataFound?: boolean }>();

export function getWebsiteExtractionStatus(userId: string, entityName: string): { status: string; noDataFound?: boolean } | null {
  const key = `${userId}:${entityName}`;
  const job = activeJobs.get(key);
  if (!job) return null;
  if (job.completedAt && Date.now() - job.completedAt > 60000) {
    activeJobs.delete(key);
    return null;
  }
  return { status: job.status, noDataFound: job.noDataFound };
}

export async function runWebsiteIntelligenceExtraction(
  userId: string,
  entityName: string,
  categoryName: string,
  websiteUrl: string
): Promise<void> {
  const key = `${userId}:${entityName}`;
  activeJobs.set(key, { status: "running" });

  try {
    const normalizedUrl = websiteUrl.replace(/\/+$/, "");

    const discoveredUrls = await discoverPages(normalizedUrl);
    if (discoveredUrls.length === 0) {
      activeJobs.set(key, { status: "completed", completedAt: Date.now(), noDataFound: true });
      return;
    }

    const prioritizedUrls = prioritizeUrls(discoveredUrls, normalizedUrl);
    const pagesToFetch = prioritizedUrls.slice(0, 5);

    const pageContents = await fetchPages(pagesToFetch);
    if (pageContents.length === 0) {
      activeJobs.set(key, { status: "completed", completedAt: Date.now(), noDataFound: true });
      return;
    }

    const intelligence = await extractIntelligence(entityName, pageContents);
    if (!intelligence) {
      activeJobs.set(key, { status: "completed", completedAt: Date.now(), noDataFound: true });
      return;
    }

    await createCaptures(userId, entityName, categoryName, intelligence, pageContents);

    try {
      await regenerateSummary(userId, entityName, categoryName);
    } catch (summaryErr) {
      console.error(`[WebsiteIntel] Summary regeneration failed for "${entityName}":`, summaryErr);
    }

    activeJobs.set(key, { status: "completed", completedAt: Date.now(), noDataFound: false });
  } catch (error) {
    console.error(`[WebsiteIntel] Extraction failed for "${entityName}":`, error);
    activeJobs.set(key, { status: "completed", completedAt: Date.now(), noDataFound: true });
  }
}

async function discoverPages(websiteUrl: string): Promise<string[]> {
  const sitemapUrl = `${websiteUrl}/sitemap.xml`;
  const jinaUrl = `https://r.jina.ai/${sitemapUrl}`;

  try {
    const jinaHeaders: Record<string, string> = { "Accept": "text/plain" };
    if (process.env.JINA_API_KEY) {
      jinaHeaders["Authorization"] = `Bearer ${process.env.JINA_API_KEY}`;
    }
    const response = await fetch(jinaUrl, {
      headers: jinaHeaders,
      signal: AbortSignal.timeout(15000),
    });

    if (response.ok) {
      const text = await response.text();
      const urlMatches = text.match(/<loc>(https?:\/\/[^<]+)<\/loc>/gi);
      if (urlMatches && urlMatches.length > 0) {
        const urls = urlMatches.map(match => {
          const locMatch = match.match(/<loc>(https?:\/\/[^<]+)<\/loc>/i);
          return locMatch ? locMatch[1] : "";
        }).filter(Boolean);

        if (urls.length > 0) {
          return urls;
        }
      }

      const markdownUrls = extractUrlsFromMarkdown(text, websiteUrl);
      if (markdownUrls.length > 0) {
        return markdownUrls;
      }
    }
  } catch (err) {
    console.log(`[WebsiteIntel] Sitemap fetch failed, falling back to homepage:`, (err as Error).message);
  }

  // Always add known high-value subpaths as fallback
  const commonPaths = [
    "",
    "/services",
    "/treatments",
    "/pricing",
    "/rates",
    "/packages",
    "/about",
    "/about-us",
    "/team",
    "/menu",
    "/our-services",
    "/what-we-offer",
    "/blog",
  ];

  const fallbackUrls = commonPaths.map(path => `${websiteUrl}${path}`);

  try {
    const homepageJinaUrl = `https://r.jina.ai/${websiteUrl}`;
    const homepageHeaders: Record<string, string> = { "Accept": "text/plain" };
    if (process.env.JINA_API_KEY) {
      homepageHeaders["Authorization"] = `Bearer ${process.env.JINA_API_KEY}`;
    }
    const response = await fetch(homepageJinaUrl, {
      headers: homepageHeaders,
      signal: AbortSignal.timeout(15000),
    });

    if (response.ok) {
      const text = await response.text();
      const discoveredUrls = extractUrlsFromMarkdown(text, websiteUrl);
      const combined = [...new Set([websiteUrl, ...discoveredUrls, ...fallbackUrls])];
      return combined;
    }
  } catch (err) {
    console.log(`[WebsiteIntel] Homepage fetch failed:`, (err as Error).message);
  }

  return fallbackUrls;
}

function extractUrlsFromMarkdown(markdown: string, baseUrl: string): string[] {
  const domain = new URL(baseUrl).hostname;
  const urlRegex = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
  const urls: string[] = [];
  let match;

  while ((match = urlRegex.exec(markdown)) !== null) {
    const url = match[2];
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.hostname === domain || parsedUrl.hostname === `www.${domain}` || domain === `www.${parsedUrl.hostname}`) {
        urls.push(url);
      }
    } catch {}
  }

  const plainUrlRegex = /(?:^|\s)(https?:\/\/[^\s<>"]+)/g;
  while ((match = plainUrlRegex.exec(markdown)) !== null) {
    const url = match[1];
    try {
      const parsedUrl = new URL(url);
      if ((parsedUrl.hostname === domain || parsedUrl.hostname === `www.${domain}` || domain === `www.${parsedUrl.hostname}`) && !urls.includes(url)) {
        urls.push(url);
      }
    } catch {}
  }

  return [...new Set(urls)];
}

function prioritizeUrls(urls: string[], homepage: string): string[] {
  const buckets: { priority: number; url: string }[] = [];

  for (const url of urls) {
    const lower = url.toLowerCase();
    const path = lower.replace(/https?:\/\/[^/]+/i, "");

    if (path === "/" || path === "" || lower === homepage.toLowerCase() || lower === homepage.toLowerCase() + "/") {
      buckets.push({ priority: 0, url });
    } else if (/\/(pricing|services|treatments|packages|rates|fees)/i.test(path)) {
      buckets.push({ priority: 1, url });
    } else if (/\/(about|team|our-team|staff|leadership|who-we-are)/i.test(path)) {
      buckets.push({ priority: 2, url });
    } else if (/\/(blog|news|articles|updates|journal|posts)/i.test(path)) {
      buckets.push({ priority: 3, url });
    } else {
      buckets.push({ priority: 4, url });
    }
  }

  buckets.sort((a, b) => a.priority - b.priority);

  const result: string[] = [];
  const seenPriorities = new Set<number>();
  const blogLimit = 1;
  let blogCount = 0;

  for (const item of buckets) {
    if (result.length >= 5) break;
    if (item.priority === 3) {
      if (blogCount >= blogLimit) continue;
      blogCount++;
    }
    result.push(item.url);
  }

  if (!result.some(u => {
    const lower = u.toLowerCase();
    const path = lower.replace(/https?:\/\/[^/]+/i, "");
    return path === "/" || path === "" || lower === homepage.toLowerCase() || lower === homepage.toLowerCase() + "/";
  })) {
    result.unshift(homepage);
    if (result.length > 5) result.pop();
  }

  return result;
}

async function fetchPages(urls: string[]): Promise<{ url: string; content: string }[]> {
  const results: { url: string; content: string }[] = [];

  for (const url of urls) {
    try {
      const jinaUrl = `https://r.jina.ai/${url}`;
      const scrapeHeaders: Record<string, string> = { "Accept": "text/plain" };
      if (process.env.JINA_API_KEY) {
        scrapeHeaders["Authorization"] = `Bearer ${process.env.JINA_API_KEY}`;
      }
      const response = await fetch(jinaUrl, {
        headers: scrapeHeaders,
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        const text = await response.text();
        if (text.trim().length > 50) {
          results.push({ url, content: text.slice(0, 8000) });
        }
      }
    } catch (err) {
      console.log(`[WebsiteIntel] Failed to fetch page ${url}:`, (err as Error).message);
    }
  }

  return results;
}

interface WebsiteIntelligence {
  services?: { name: string; price?: string; description?: string }[];
  team_size_signal?: string;
  locations?: string[];
  founded_year?: number;
  key_differentiators?: string[];
  current_promotions?: string[];
  recent_blog_topics?: string[];
}

async function extractIntelligence(
  entityName: string,
  pages: { url: string; content: string }[]
): Promise<WebsiteIntelligence | null> {
  const anthropic = new Anthropic({
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  });

  const pagesText = pages.map((p, i) => `--- Page ${i + 1}: ${p.url} ---\n${p.content}`).join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `Extract structured intelligence from these website pages for ${entityName}. Return JSON with these fields: services (array of objects with name, price if found, description), team_size_signal (text, e.g. solo practitioner / small team / large team), locations (array), founded_year (if found), key_differentiators (array of short phrases), current_promotions (array), recent_blog_topics (array of titles). Only include fields where data was actually found. Do not fabricate.\n\nPages:\n${pagesText}`
      }
    ],
  });

  const textContent = response.content.find(block => block.type === "text");
  if (!textContent || textContent.type !== "text") return null;

  try {
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as WebsiteIntelligence;

    const hasData = (parsed.services && parsed.services.length > 0) ||
      parsed.team_size_signal ||
      (parsed.locations && parsed.locations.length > 0) ||
      parsed.founded_year ||
      (parsed.key_differentiators && parsed.key_differentiators.length > 0) ||
      (parsed.current_promotions && parsed.current_promotions.length > 0) ||
      (parsed.recent_blog_topics && parsed.recent_blog_topics.length > 0);

    return hasData ? parsed : null;
  } catch {
    return null;
  }
}

async function createCaptures(
  userId: string,
  entityName: string,
  categoryName: string,
  intelligence: WebsiteIntelligence,
  pages: { url: string; content: string }[]
): Promise<void> {
  const captureRecords: InsertCapture[] = [];
  const primaryUrl = pages[0]?.url || "";

  if (intelligence.services && intelligence.services.length > 0) {
    const servicesList = intelligence.services
      .map(s => {
        let line = `• ${s.name}`;
        if (s.price) line += ` — ${s.price}`;
        if (s.description) line += `: ${s.description}`;
        return line;
      })
      .join("\n");

    const pricingPageUrl = pages.find(p => /pricing|services|treatments/i.test(p.url))?.url || primaryUrl;

    captureRecords.push({
      userId,
      type: "web_search",
      content: `[Website extraction] Services offered by ${entityName}:\n${servicesList}`,
      matchedEntity: entityName,
      matchedCategory: categoryName,
      matchReason: `[source_type:website_extraction] [source_url:${pricingPageUrl}] Services and pricing extracted from website`,
    });

    const pricingServices = intelligence.services.filter(s => s.price);
    if (pricingServices.length > 0) {
      for (const service of pricingServices) {
        captureRecords.push({
          userId,
          type: "web_search",
          content: `[Website extraction] Pricing detected: ${service.name} — ${service.price}${service.description ? `. ${service.description}` : ""}`,
          matchedEntity: entityName,
          matchedCategory: categoryName,
          matchReason: `[source_type:website_extraction] [source_url:${pricingPageUrl}] [signal_type:pricing_signal] Pricing data from website: ${service.name} at ${service.price}`,
        });
      }
    }
  }

  if (intelligence.team_size_signal) {
    const aboutPageUrl = pages.find(p => /about|team/i.test(p.url))?.url || primaryUrl;
    captureRecords.push({
      userId,
      type: "web_search",
      content: `[Website extraction] Team size signal for ${entityName}: ${intelligence.team_size_signal}`,
      matchedEntity: entityName,
      matchedCategory: categoryName,
      matchReason: `[source_type:website_extraction] [source_url:${aboutPageUrl}] Team size signal from website`,
    });
  }

  if (intelligence.locations && intelligence.locations.length > 0) {
    captureRecords.push({
      userId,
      type: "web_search",
      content: `[Website extraction] ${entityName} locations: ${intelligence.locations.join(", ")}`,
      matchedEntity: entityName,
      matchedCategory: categoryName,
      matchReason: `[source_type:website_extraction] [source_url:${primaryUrl}] Location data from website`,
    });
  }

  if (intelligence.key_differentiators && intelligence.key_differentiators.length > 0) {
    captureRecords.push({
      userId,
      type: "web_search",
      content: `[Website extraction] Key differentiators for ${entityName}: ${intelligence.key_differentiators.join("; ")}`,
      matchedEntity: entityName,
      matchedCategory: categoryName,
      matchReason: `[source_type:website_extraction] [source_url:${primaryUrl}] Key differentiators from website`,
    });
  }

  if (intelligence.current_promotions && intelligence.current_promotions.length > 0) {
    captureRecords.push({
      userId,
      type: "web_search",
      content: `[Website extraction] Current promotions at ${entityName}: ${intelligence.current_promotions.join("; ")}`,
      matchedEntity: entityName,
      matchedCategory: categoryName,
      matchReason: `[source_type:website_extraction] [source_url:${primaryUrl}] [high] Current promotions from website`,
    });
  }

  if (intelligence.recent_blog_topics && intelligence.recent_blog_topics.length > 0) {
    const blogPageUrl = pages.find(p => /blog|news/i.test(p.url))?.url || primaryUrl;
    captureRecords.push({
      userId,
      type: "web_search",
      content: `[Website extraction] Recent blog topics from ${entityName}: ${intelligence.recent_blog_topics.join("; ")}`,
      matchedEntity: entityName,
      matchedCategory: categoryName,
      matchReason: `[source_type:website_extraction] [source_url:${blogPageUrl}] Blog topics from website`,
    });
  }

  if (intelligence.founded_year) {
    captureRecords.push({
      userId,
      type: "web_search",
      content: `[Website extraction] ${entityName} was founded in ${intelligence.founded_year}`,
      matchedEntity: entityName,
      matchedCategory: categoryName,
      matchReason: `[source_type:website_extraction] [source_url:${primaryUrl}] Founded year from website`,
    });
  }

  if (captureRecords.length > 0) {
    await storage.createCaptures(captureRecords);
  }
}

async function regenerateSummary(userId: string, entityName: string, categoryName: string): Promise<void> {
  const allCaptures = await storage.getCapturesByUserId(userId);
  const entityCaptures = allCaptures.filter(c => c.matchedEntity === entityName);

  if (entityCaptures.length === 0) return;

  const contentSnippets = entityCaptures
    .slice(0, 10)
    .map((c, i) => `[${i + 1}] (${c.type}) ${c.content.slice(0, 500)}`)
    .join("\n\n");

  const anthropic = new Anthropic({
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  });

  const message = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are an intelligence analyst. Based on the captured intel items below about "${entityName}" (category: "${categoryName}"), write a concise 2-3 sentence intelligence summary. Focus on what is known, key developments, and any notable patterns. Be direct and analytical — no filler.\n\nCaptured intel:\n${contentSnippets}\n\nReturn only the summary paragraph, no JSON, no formatting.`
      }
    ]
  });

  const textContent = message.content.find(block => block.type === "text");
  if (textContent && textContent.type === "text") {
    await storage.updateEntityAiSummary(userId, entityName, textContent.text.trim());
  }
}
