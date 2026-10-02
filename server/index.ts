import dotenv from "dotenv";
import express, { Request, Response } from "express";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(root, ".env.local"), quiet: true });
dotenv.config({ path: path.join(root, ".env"), quiet: true });
dotenv.config({ quiet: true });

type ChatHistoryItem = {
  sender: "user" | "golu";
  text: string;
};

type SearchResult = {
  title: string;
  link: string;
  snippet: string;
  displayLink?: string;
};

type SpotifyResult = {
  id: string;
  type: "track" | "artist" | "playlist";
  name: string;
  subtitle: string;
  url: string;
  uri?: string;
  image?: string;
};

type LiveContext = {
  kind: "time" | "date" | "weather" | "live";
  answer?: string;
  source: string;
  fetchedAt: string;
  data?: Record<string, unknown>;
  error?: string;
};

type LongTermMemory = {
  id: string;
  category: string;
  text: string;
  updatedAt: string;
  source: "auto" | "manual";
};

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction =
  process.env.NODE_ENV === "production" || process.argv.includes("--production");
const memoryStorePath = path.join(root, "data", "golu-memory.json");

app.set("trust proxy", true);
app.use(express.json({ limit: "1mb" }));

function isConfigured(value?: string) {
  if (!value) return false;
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return false;

  return ![
    /^MY_/i,
    /^YOUR_/i,
    /^PASTE_/i,
    /^REPLACE_/i,
    /^TODO$/i,
    /^CHANGE_ME$/i,
    /^CHANGEME$/i,
    /^XXX$/i,
    /^sk-xxx/i,
    /placeholder/i,
    /YOUR_/i,
    /MY_/i,
  ].some((pattern) => pattern.test(trimmed));
}

function firstConfiguredEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (isConfigured(value)) return value?.trim().replace(/^['"]|['"]$/g, "");
  }
  return undefined;
}

function getGeminiConfig() {
  return {
    apiKey: firstConfiguredEnv("GEMINI_API_KEY", "VITE_GEMINI_API_KEY"),
    model: firstConfiguredEnv("GEMINI_MODEL") || "gemini-2.5-flash",
  };
}

function getGoogleConfig() {
  return {
    key: firstConfiguredEnv("GOOGLE_API_KEY", "GOOGLE_SEARCH_API_KEY"),
    cx: firstConfiguredEnv(
      "GOOGLE_SEARCH_ENGINE_ID",
      "GOOGLE_CSE_ID",
      "GOOGLE_CX",
      "GOOGLE_PROGRAMMABLE_SEARCH_ENGINE_ID",
    ),
  };
}

function getSpotifyConfig() {
  return {
    clientId: firstConfiguredEnv("SPOTIFY_CLIENT_ID"),
    clientSecret: firstConfiguredEnv("SPOTIFY_CLIENT_SECRET"),
    redirectUri: firstConfiguredEnv("SPOTIFY_REDIRECT_URI"),
  };
}

function getOpenAIConfig() {
  return {
    apiKey: firstConfiguredEnv("OPENAI_API_KEY"),
    model: firstConfiguredEnv("OPENAI_MODEL") || "gpt-5-mini",
    fallbackModels: (process.env.OPENAI_FALLBACK_MODELS || "gpt-4.1-mini,gpt-4o-mini")
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean),
  };
}

function appStatus(req?: Request) {
  const gemini = getGeminiConfig();
  const google = getGoogleConfig();
  const spotify = getSpotifyConfig();
  const openai = getOpenAIConfig();
  const spotifyConfigured =
    isConfigured(spotify.clientId) && isConfigured(spotify.clientSecret);

  return {
    gemini: {
      configured: isConfigured(gemini.apiKey),
      model: gemini.model,
      missing: isConfigured(gemini.apiKey) ? [] : ["GEMINI_API_KEY"],
    },
    openai: {
      configured: isConfigured(openai.apiKey),
      model: openai.model,
      missing: isConfigured(openai.apiKey) ? [] : ["OPENAI_API_KEY"],
    },
    google: {
      configured: isConfigured(google.key) && isConfigured(google.cx),
      missing: [
        !isConfigured(google.key) ? "GOOGLE_API_KEY" : "",
        !isConfigured(google.cx) ? "GOOGLE_SEARCH_ENGINE_ID" : "",
      ].filter(Boolean),
    },
    spotify: {
      configured: spotifyConfigured,
      connected: Boolean(req && getCookie(req, "golu_spotify_refresh")),
      authUrl: spotifyConfigured ? "/api/spotify/connect" : null,
      missing: [
        !isConfigured(spotify.clientId) ? "SPOTIFY_CLIENT_ID" : "",
        !isConfigured(spotify.clientSecret) ? "SPOTIFY_CLIENT_SECRET" : "",
      ].filter(Boolean),
    },
  };
}

app.get("/api/status", (req, res) => {
  res.json(appStatus(req));
});

app.get("/api/search", async (req, res) => {
  const query = String(req.query.q || "").trim();
  if (!query) {
    res.status(400).json({ error: "Missing search query." });
    return;
  }

  try {
    res.json(await searchGoogle(query));
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Google search failed.",
      results: [],
      searchUrl: buildGoogleSearchUrl(query),
      configured: appStatus(req).google.configured,
    });
  }
});

app.get("/api/live", async (req, res) => {
  const query = String(req.query.q || "").trim();
  const timezone = String(req.query.timezone || "").trim();
  if (!query) {
    res.status(400).json({ error: "Missing live data query." });
    return;
  }

  try {
    const live = await getLiveContext(query, timezone);
    if (!live) {
      res.status(404).json({
        error: "No live data handler matched this query.",
      });
      return;
    }

    res.json(live);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Live data lookup failed.",
    });
  }
});

app.get("/api/memory", async (_req, res) => {
  res.json({ memories: await readServerMemories() });
});

app.post("/api/memory", async (req, res) => {
  const incoming = Array.isArray(req.body?.memories) ? req.body.memories : [];
  const sanitized = sanitizeMemories(incoming);
  if (sanitized.length === 0) {
    res.json({ memories: await readServerMemories() });
    return;
  }

  const existing = await readServerMemories();
  const memories = dedupeServerMemories([...existing, ...sanitized]).slice(-80);
  await writeServerMemories(memories);
  res.json({ memories });
});

app.delete("/api/memory/:id", async (req, res) => {
  const existing = await readServerMemories();
  const memories = existing.filter((memory) => memory.id !== req.params.id);
  await writeServerMemories(memories);
  res.json({ memories });
});



app.post("/api/chat", async (req, res) => {
  const body = req.body as {
    message?: string;
    history?: ChatHistoryItem[];
    systemInstruction?: string;
    useWebSearch?: boolean;
    clientTimezone?: string;
    pdfContext?: string;
  };

  const message = (body.message || "").trim();
  if (!message) {
    res.status(400).json({ error: "Message is required." });
    return;
  }

  try {
    const live = await getLiveContext(message, body.clientTimezone);
    const gemini = getGeminiConfig();
    const openai = getOpenAIConfig();
    const serverMemories = await readServerMemories();

    const search = body.useWebSearch || live?.kind === "live"
      ? await safeSearchGoogle(message)
      : null;

    const fullInstruction = appendServerMemoryToInstruction(
      ensureAssistantEnhancementLayer(body.systemInstruction || defaultSystemInstruction()),
      serverMemories,
    );

    // If Gemini key is configured, use Gemini
    if (isConfigured(gemini.apiKey)) {
      try {
        const text = await askGemini({
          apiKey: gemini.apiKey as string,
          model: gemini.model,
          message,
          history: body.history || [],
          systemInstruction: fullInstruction,
          searchResults: search?.results || [],
          searchError: search?.error,
          liveContext: live,
          pdfContext: body.pdfContext,
        });

        res.json({
          text,
          provider: "gemini",
          model: gemini.model,
          searchResults: search?.results || [],
          searchConfigured: search?.configured || false,
          searchError: search?.error,
          liveContext: live,
        });
        return;
      } catch (geminiError) {
        console.error("Gemini server error:", geminiError);
        // If OpenAI is also configured, try fallback to OpenAI
        if (!isConfigured(openai.apiKey)) {
          const isRateLimit =
            (geminiError as any)?.status === 429 ||
            String(geminiError).includes("429") ||
            String(geminiError).toLowerCase().includes("quota");

          const fallbackMsg = isRateLimit
            ? "I am receiving a high volume of requests on the Gemini free tier right now. Please wait a few seconds and try again."
            : `Assistant processing encountered an issue: ${(geminiError as Error)?.message || "Please try again."}`;

          res.json({
            text: fallbackMsg,
            provider: "gemini",
            model: gemini.model,
            searchResults: search?.results || [],
            searchConfigured: search?.configured || false,
            searchError: search?.error,
            liveContext: live,
          });
          return;
        }
      }
    }

    if (isConfigured(openai.apiKey)) {
      const text = await askOpenAI({
        message,
        history: body.history || [],
        systemInstruction: fullInstruction,
        searchResults: search?.results || [],
        searchError: search?.error,
        liveContext: live,
        pdfContext: body.pdfContext,
      });

      res.json({
        text,
        provider: "openai",
        model: openai.model,
        searchResults: search?.results || [],
        searchConfigured: search?.configured || false,
        searchError: search?.error,
        liveContext: live,
      });
      return;
    }

    if (live?.answer) {
      res.json({
        text: live.answer,
        provider: "live",
        model: "deterministic-live-data",
        searchResults: [],
        searchConfigured: false,
        liveContext: live,
      });
      return;
    }

    res.status(503).json({
      error:
        "AI provider is not configured. Set GEMINI_API_KEY or OPENAI_API_KEY in .env.local to enable responses.",
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Chat request failed.",
    });
  }
});

app.get("/api/spotify/search", async (req, res) => {
  const query = String(req.query.q || "").trim();
  if (!query) {
    res.status(400).json({ error: "Missing Spotify search query." });
    return;
  }

  try {
    res.json(await searchSpotify(query));
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Spotify search failed.",
      results: [],
      searchUrl: buildSpotifySearchUrl(query),
      configured: appStatus(req).spotify.configured,
    });
  }
});

app.get("/api/spotify/connect", (req, res) => {
  const config = getSpotifyConfig();
  if (!isConfigured(config.clientId) || !isConfigured(config.clientSecret)) {
    res.status(503).send("Spotify is not configured. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env.local.");
    return;
  }

  const state = crypto.randomBytes(16).toString("hex");
  setCookie(res, "golu_spotify_state", state, 600);
  res.redirect(buildSpotifyAuthUrl(req, state));
});

app.get("/api/spotify/callback", async (req, res) => {
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");
  const savedState = getCookie(req, "golu_spotify_state");

  if (!code || !state || state !== savedState) {
    res.status(400).send("Spotify authorization failed. State did not match.");
    return;
  }

  try {
    const token = await exchangeSpotifyCode(req, code);
    if (token.refresh_token) {
      setCookie(res, "golu_spotify_refresh", token.refresh_token, 60 * 60 * 24 * 30);
    }
    clearCookie(res, "golu_spotify_state");
    res.redirect("/?spotify=connected");
  } catch (error) {
    res.status(500).send(error instanceof Error ? error.message : "Spotify authorization failed.");
  }
});

app.post("/api/spotify/play", async (req, res) => {
  const uri = String(req.body?.uri || "").trim();
  if (!uri) {
    res.status(400).json({ error: "Spotify URI is required." });
    return;
  }

  try {
    const token = await getSpotifyUserAccessToken(req);
    if (!token) {
      res.status(409).json({
        error: "Spotify is not connected. Connect Spotify first, or open the item in Spotify.",
        authUrl: appStatus(req).spotify.authUrl,
      });
      return;
    }

    const response = await fetch("https://api.spotify.com/v1/me/player/play", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: [uri] }),
    });

    if (response.status === 204) {
      res.json({ ok: true });
      return;
    }

    const data = await response.json().catch(() => ({}));
    res.status(response.status).json({
      error:
        data?.error?.message ||
        "Spotify could not start playback. Make sure Spotify is open on an active device and your account supports playback control.",
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Spotify playback failed.",
    });
  }
});

async function askGemini(args: {
  apiKey: string;
  model: string;
  message: string;
  history: ChatHistoryItem[];
  systemInstruction: string;
  searchResults: SearchResult[];
  searchError?: string;
  liveContext?: LiveContext | null;
  pdfContext?: string;
}) {
  const ai = new GoogleGenAI({ apiKey: args.apiKey });
  const recentHistory = args.history.slice(-20);
  const formattedHistory: any[] = [];
  let currentRole = "";
  let currentText = "";

  for (const msg of recentHistory) {
    const role = msg.sender === "user" ? "user" : "model";
    if (role === currentRole) {
      currentText += "\n" + msg.text;
    } else {
      if (currentRole !== "") {
        formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
      }
      currentRole = role;
      currentText = msg.text;
    }
  }
  if (currentRole !== "") {
    formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
  }
  if (formattedHistory.length > 0 && formattedHistory[0].role !== "user") {
    formattedHistory.shift();
  }

  let prompt = args.message;
  if (args.pdfContext) {
    prompt = `[ATTACHED DOCUMENT CONTENT]:\n${args.pdfContext}\n\n[USER MESSAGE]:\n${args.message}`;
  }
  if (args.liveContext?.answer) {
    prompt = `[Verified Live Data: ${args.liveContext.answer}]\n${prompt}`;
  } else if (args.liveContext) {
    prompt = `[Live Context: ${JSON.stringify(args.liveContext)}]\n${prompt}`;
  }
  if (args.searchResults?.length) {
    const searchContext = args.searchResults
      .map((r, i) => `${i + 1}. ${r.title} (${r.link}): ${r.snippet}`)
      .join("\n");
    prompt = `[Google Search Grounding Results:\n${searchContext}]\n\n${prompt}`;
  }

  const systemInstruction = `${args.systemInstruction}\n\nREAL-TIME ACCURACY RULES:\n- For current time, date, weather, temperature, or live factual queries, use the verified live data context first.\n- Keep answers natural, warm, clear, and well-structured.`;

  const chat = ai.chats.create({
    model: args.model || "gemini-2.5-flash",
    config: {
      systemInstruction,
      tools: [{ googleSearch: {} }],
    },
    history: formattedHistory,
  });

  const response = await chat.sendMessage({ message: prompt });
  return response.text || "I processed your request.";
}

async function askOpenAI(args: {
  message: string;
  history: ChatHistoryItem[];
  systemInstruction: string;
  searchResults: SearchResult[];
  searchError?: string;
  liveContext?: LiveContext | null;
  pdfContext?: string;
}) {
  const openai = getOpenAIConfig();
  const recentHistory = args.history
    .slice(-16)
    .map((item) => `${item.sender === "user" ? "User" : "Golu"}: ${item.text}`)
    .join("\n");

  const pdfContextText = args.pdfContext ? `\n\n[ATTACHED DOCUMENT CONTENT]:\n${args.pdfContext}` : "";
  const searchContext = args.searchResults.length
    ? `\n\nGoogle search results for context:\n${args.searchResults
        .map(
          (result, index) =>
            `${index + 1}. ${result.title}\nURL: ${result.link}\nSnippet: ${result.snippet}`,
        )
        .join("\n\n")}`
    : "";
  const searchErrorContext = args.searchError
    ? `\n\nGoogle search was requested but unavailable: ${args.searchError}`
    : "";
  const liveContextText = args.liveContext
    ? `\n\nVerified live data context:\n${JSON.stringify(args.liveContext, null, 2)}`
    : "";

  const input = [
    recentHistory ? `Recent conversation:\n${recentHistory}` : "",
    pdfContextText,
    liveContextText,
    searchContext,
    searchErrorContext,
    `Current user message:\n${args.message}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const models = [openai.model, ...openai.fallbackModels].filter(
    (model, index, all) => model && all.indexOf(model) === index,
  );

  let lastError: Error | null = null;
  for (const model of models) {
    try {
      return await createOpenAIResponse({
        apiKey: openai.apiKey as string,
        model,
        instructions: `${args.systemInstruction}\n\nREAL-TIME ACCURACY RULES:\n- For current time, date, weather, temperature, or live factual queries, use the verified live data context first.\n- If verified live data is present, do not contradict it or invent fresher values.\n- If live data or search is unavailable, say that clearly and answer only what can be known safely.\n- Keep simple live-data answers concise unless the user asks for detail.\n\nUse provided Google search results when present. If search was unavailable, say that clearly instead of inventing live facts. Cite source titles or URLs naturally when using search results.`,
        input,
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("OpenAI request failed.");
      if (!shouldTryNextOpenAIModel(lastError)) break;
    }
  }

  throw lastError || new Error("OpenAI request failed.");
}

async function createOpenAIResponse(args: {
  apiKey: string;
  model: string;
  instructions: string;
  input: string;
}) {
  const body: Record<string, unknown> = {
    model: args.model,
    instructions: args.instructions,
    input: args.input,
    max_output_tokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 1400),
  };

  if (/^(gpt-5|o\d)/.test(args.model)) {
    body.reasoning = {
      effort: process.env.OPENAI_REASONING_EFFORT || "minimal",
    };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || response.statusText;
    const code = data?.error?.code ? ` (${data.error.code})` : "";
    throw new Error(`OpenAI API error: ${detail}`);
  }

  const outputText = extractOpenAIText(data);
  if (!outputText) {
    throw new Error("OpenAI returned an empty response.");
  }

  return outputText;
}

function shouldTryNextOpenAIModel(error: Error) {
  const message = error.message.toLowerCase();
  return (
    message.includes("model") ||
    message.includes("not found") ||
    message.includes("does not exist") ||
    message.includes("unsupported") ||
    message.includes("invalid")
  );
}

async function readServerMemories(): Promise<LongTermMemory[]> {
  try {
    if (!fs.existsSync(memoryStorePath)) return [];
    const raw = await fs.promises.readFile(memoryStorePath, "utf8");
    return sanitizeMemories(JSON.parse(raw)).slice(-80);
  } catch {
    return [];
  }
}

async function writeServerMemories(memories: LongTermMemory[]) {
  await fs.promises.mkdir(path.dirname(memoryStorePath), { recursive: true });
  await fs.promises.writeFile(
    memoryStorePath,
    JSON.stringify(dedupeServerMemories(memories).slice(-80), null, 2),
    "utf8",
  );
}

function sanitizeMemories(input: unknown): LongTermMemory[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item): item is LongTermMemory => (
      item &&
      typeof item === "object" &&
      typeof (item as LongTermMemory).id === "string" &&
      typeof (item as LongTermMemory).text === "string" &&
      (item as LongTermMemory).text.trim().length > 0 &&
      (item as LongTermMemory).text.length < 300
    ))
    .map((item) => ({
      id: item.id,
      category: item.category || "personalization",
      text: item.text.trim(),
      updatedAt: item.updatedAt || new Date().toISOString(),
      source: item.source === "manual" ? "manual" : "auto",
    }));
}

function dedupeServerMemories(memories: LongTermMemory[]) {
  const map = new Map<string, LongTermMemory>();
  for (const memory of memories) {
    const key = memory.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key) continue;
    const current = map.get(key);
    if (!current || memory.updatedAt >= current.updatedAt) {
      map.set(key, memory);
    }
  }
  return Array.from(map.values());
}

function appendServerMemoryToInstruction(instruction: string, memories: LongTermMemory[]) {
  if (memories.length === 0) return instruction;
  const memoryText = memories
    .slice(-50)
    .map((memory) => `- ${memory.text}`)
    .join("\n");
  return `${instruction}\n\nServer-synced long-term memories. Use relevant memories naturally before answering, but do not force them into every reply:\n${memoryText}`;
}

function ensureAssistantEnhancementLayer(instruction: string) {
  if (instruction.includes("ADDITIVE ENHANCEMENT LAYER:")) return instruction;
  return `${instruction}\n\n${assistantEnhancementLayer()}`;
}

async function getLiveContext(
  query: string,
  clientTimezone?: string,
): Promise<LiveContext | null> {
  const lower = query.toLowerCase();
  const timezone = normalizeTimezone(clientTimezone) || process.env.DEFAULT_TIMEZONE || "Asia/Kolkata";

  if (/\b(time|samay|waqt|kitna baje|baje kya|current time)\b/i.test(lower)) {
    return getTimeContext(timezone);
  }

  if (/\b(date|today|aaj|tarikh|tareekh|din|day)\b/i.test(lower) && !isWeatherQuery(lower)) {
    return getDateContext(timezone);
  }

  if (isWeatherQuery(lower)) {
    return getWeatherContext(query, timezone);
  }

  if (/\b(latest|current|live|right now|breaking|news|score|stock|price|exchange rate)\b/i.test(lower)) {
    return {
      kind: "live",
      source: "Google Custom Search context when configured",
      fetchedAt: new Date().toISOString(),
      data: {
        note: "This query needs live or recently updated information. Use verified search results if available; otherwise state that live lookup is unavailable.",
      },
    };
  }

  return null;
}

function getTimeContext(timezone: string): LiveContext {
  const now = new Date();
  const parts = getDateParts(now, timezone);
  const label = formatTimezoneLabel(timezone);

  return {
    kind: "time",
    source: "Server runtime clock with Intl timezone formatting",
    fetchedAt: now.toISOString(),
    answer: `The current time is ${parts.time} in ${label}.`,
    data: {
      timezone,
      date: parts.date,
      time: parts.time,
      isoUtc: now.toISOString(),
    },
  };
}

function getDateContext(timezone: string): LiveContext {
  const now = new Date();
  const parts = getDateParts(now, timezone);
  const label = formatTimezoneLabel(timezone);

  return {
    kind: "date",
    source: "Server runtime clock with Intl timezone formatting",
    fetchedAt: now.toISOString(),
    answer: `Today is ${parts.weekday}, ${parts.date} in ${label}.`,
    data: {
      timezone,
      weekday: parts.weekday,
      date: parts.date,
      time: parts.time,
      isoUtc: now.toISOString(),
    },
  };
}

async function getWeatherContext(query: string, timezone: string): Promise<LiveContext> {
  const requestedLocation = extractWeatherLocation(query) || process.env.DEFAULT_WEATHER_LOCATION || "";
  const fetchedAt = new Date().toISOString();

  if (!requestedLocation) {
    return {
      kind: "weather",
      source: "Open-Meteo weather API",
      fetchedAt,
      answer: "Which city should I check the weather for?",
      error: "Missing weather location.",
    };
  }

  try {
    const place = await geocodeLocation(requestedLocation);
    if (!place) {
      return {
        kind: "weather",
        source: "Open-Meteo geocoding API",
        fetchedAt,
        answer: `I could not find a reliable weather location for "${requestedLocation}". Please try a city name.`,
        error: "Location not found.",
      };
    }

    const weather = await fetchCurrentWeather(place.latitude, place.longitude);
    const unit = weather.current_units?.temperature_2m || "C";
    const apparentUnit = weather.current_units?.apparent_temperature || unit;
    const windUnit = weather.current_units?.wind_speed_10m || "km/h";
    const current = weather.current || {};
    const temperature = typeof current.temperature_2m === "number"
      ? formatTemperature(current.temperature_2m, unit)
      : "unavailable";
    const feelsLike = typeof current.apparent_temperature === "number"
      ? formatTemperature(current.apparent_temperature, apparentUnit)
      : "unavailable";
    const condition = weatherCodeToText(Number(current.weather_code));
    const humidity = typeof current.relative_humidity_2m === "number"
      ? `${current.relative_humidity_2m}%`
      : "unavailable";
    const wind = typeof current.wind_speed_10m === "number"
      ? `${Math.round(current.wind_speed_10m)} ${windUnit}`
      : "unavailable";
    const label = [place.name, place.admin1, place.country].filter(Boolean).join(", ");

    return {
      kind: "weather",
      source: "Open-Meteo geocoding and forecast APIs",
      fetchedAt,
      answer: `Right now in ${label}: ${temperature}, feels like ${feelsLike}, ${condition}. Humidity ${humidity}, wind ${wind}.`,
      data: {
        location: label,
        latitude: place.latitude,
        longitude: place.longitude,
        timezone: weather.timezone || timezone,
        observedAt: current.time,
        temperature,
        feelsLike,
        condition,
        humidity,
        wind,
      },
    };
  } catch (error) {
    return {
      kind: "weather",
      source: "Open-Meteo weather API",
      fetchedAt,
      answer: "I could not verify the live weather right now. Please try again in a moment.",
      error: error instanceof Error ? error.message : "Weather lookup failed.",
    };
  }
}

function isWeatherQuery(lowerQuery: string) {
  return /\b(weather|temperature|temp|mausam|mosam|garmi|sardi|rain|raining|barish|humidity|forecast)\b/i.test(lowerQuery);
}

function extractWeatherLocation(query: string) {
  const cleaned = query
    .replace(/[?.!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const patterns = [
    /\b(?:weather|temperature|temp|mausam|mosam|forecast)\s+(?:in|at|for|of)\s+(.+)$/i,
    /\b(?:in|at)\s+([a-zA-Z\s,.'-]+)$/i,
    /\b([a-zA-Z\s,.'-]+)\s+(?:weather|temperature|temp|mausam|mosam|forecast)$/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    const value = match?.[1]?.trim();
    if (value) {
      return value
        .replace(/\b(right now|currently|today|aaj|please|pls|now)\b/gi, "")
        .trim();
    }
  }

  return "";
}

async function geocodeLocation(name: string) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", name);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const response = await fetchWithTimeout(url, 12000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.reason || "Location lookup failed.");
  }

  return data.results?.[0] as
    | {
        name: string;
        latitude: number;
        longitude: number;
        admin1?: string;
        country?: string;
      }
    | undefined;
}

async function fetchCurrentWeather(latitude: number, longitude: number) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
  );
  url.searchParams.set("timezone", "auto");

  const response = await fetchWithTimeout(url, 15000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.reason || "Weather lookup failed.");
  }

  return data;
}

async function fetchWithTimeout(url: URL, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeTimezone(timezone?: string) {
  if (!timezone) return "";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return "";
  }
}

function getDateParts(date: Date, timezone: string) {
  const dateFormatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const weekdayFormatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    weekday: "long",
  });

  return {
    date: dateFormatter.format(date),
    time: timeFormatter.format(date),
    weekday: weekdayFormatter.format(date),
  };
}

function formatTimezoneLabel(timezone: string) {
  return timezone.replace(/_/g, " ");
}

function formatTemperature(value: number, unit: string) {
  const normalizedUnit = unit.includes("°") ? unit : `°${unit}`;
  return `${Math.round(value)}${normalizedUnit}`;
}

function weatherCodeToText(code: number) {
  if ([0].includes(code)) return "clear sky";
  if ([1, 2, 3].includes(code)) return "partly cloudy";
  if ([45, 48].includes(code)) return "foggy";
  if ([51, 53, 55, 56, 57].includes(code)) return "drizzle";
  if ([61, 63, 65, 66, 67].includes(code)) return "rain";
  if ([71, 73, 75, 77].includes(code)) return "snow";
  if ([80, 81, 82].includes(code)) return "rain showers";
  if ([85, 86].includes(code)) return "snow showers";
  if ([95, 96, 99].includes(code)) return "thunderstorm";
  return "weather condition unavailable";
}

function extractOpenAIText(data: any): string {
  if (typeof data?.output_text === "string") {
    return data.output_text.trim();
  }

  const chunks: string[] = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (
        (content?.type === "output_text" || content?.type === "text") &&
        typeof content?.text === "string"
      ) {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

async function searchGoogle(query: string) {
  const config = getGoogleConfig();
  const searchUrl = buildGoogleSearchUrl(query);

  if (!isConfigured(config.key) || !isConfigured(config.cx)) {
    return {
      configured: false,
      results: [] as SearchResult[],
      searchUrl,
      setupRequired:
        "Set GOOGLE_API_KEY and GOOGLE_SEARCH_ENGINE_ID in .env.local to enable API-backed Google results.",
    };
  }

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", config.key as string);
  url.searchParams.set("cx", config.cx as string);
  url.searchParams.set("q", query);
  url.searchParams.set("num", "5");

  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || "Google Custom Search request failed.");
  }

  const results: SearchResult[] = (data.items || []).slice(0, 5).map((item: any) => ({
    title: item.title || "Untitled result",
    link: item.link || searchUrl,
    snippet: item.snippet || "",
    displayLink: item.displayLink,
  }));

  return { configured: true, results, searchUrl };
}

async function safeSearchGoogle(query: string) {
  try {
    const result = await searchGoogle(query);
    return {
      ...result,
      error: result.configured ? undefined : result.setupRequired,
    };
  } catch (error) {
    return {
      configured: false,
      results: [] as SearchResult[],
      searchUrl: buildGoogleSearchUrl(query),
      error: error instanceof Error ? error.message : "Google search failed.",
    };
  }
}

let spotifyTokenCache: { token: string; expiresAt: number } | null = null;

async function getSpotifyAccessToken() {
  const config = getSpotifyConfig();
  if (!isConfigured(config.clientId) || !isConfigured(config.clientSecret)) {
    throw new Error(
      "Spotify is not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local.",
    );
  }

  if (spotifyTokenCache && spotifyTokenCache.expiresAt > Date.now() + 30_000) {
    return spotifyTokenCache.token;
  }

  const credentials = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString("base64");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error_description || "Spotify token request failed.");
  }

  spotifyTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };

  return spotifyTokenCache.token;
}

async function exchangeSpotifyCode(req: Request, code: string) {
  const config = getSpotifyConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new Error("Spotify is not configured.");
  }

  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString(
    "base64",
  );

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getSpotifyRedirectUri(req),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error_description || "Spotify token exchange failed.");
  }

  return data as { access_token: string; refresh_token?: string; expires_in: number };
}

async function getSpotifyUserAccessToken(req: Request) {
  const refreshToken = getCookie(req, "golu_spotify_refresh");
  const config = getSpotifyConfig();
  if (!refreshToken || !config.clientId || !config.clientSecret) return null;

  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString(
    "base64",
  );

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error_description || "Spotify refresh token failed.");
  }

  return data.access_token as string;
}

async function searchSpotify(query: string) {
  const searchUrl = buildSpotifySearchUrl(query);
  if (!appStatus().spotify.configured) {
    return {
      configured: false,
      results: [] as SpotifyResult[],
      searchUrl,
      setupRequired:
        "Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local to enable Spotify catalog search.",
    };
  }

  const token = await getSpotifyAccessToken();
  const url = new URL("https://api.spotify.com/v1/search");
  url.searchParams.set("q", query);
  url.searchParams.set("type", "track,artist,playlist");
  url.searchParams.set("limit", "5");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || "Spotify search request failed.");
  }

  const tracks: SpotifyResult[] = (data.tracks?.items || []).map((track: any) => ({
    id: track.id,
    type: "track",
    name: track.name,
    subtitle: (track.artists || []).map((artist: any) => artist.name).join(", "),
    url: track.external_urls?.spotify,
    uri: track.uri,
    image: track.album?.images?.at?.(-1)?.url || track.album?.images?.[0]?.url,
  }));

  const artists: SpotifyResult[] = (data.artists?.items || []).map((artist: any) => ({
    id: artist.id,
    type: "artist",
    name: artist.name,
    subtitle: "Artist",
    url: artist.external_urls?.spotify,
    uri: artist.uri,
    image: artist.images?.at?.(-1)?.url || artist.images?.[0]?.url,
  }));

  const playlists: SpotifyResult[] = (data.playlists?.items || [])
    .filter(Boolean)
    .map((playlist: any) => ({
      id: playlist.id,
      type: "playlist",
      name: playlist.name,
      subtitle: playlist.owner?.display_name
        ? `Playlist by ${playlist.owner.display_name}`
        : "Playlist",
      url: playlist.external_urls?.spotify,
      uri: playlist.uri,
      image: playlist.images?.at?.(-1)?.url || playlist.images?.[0]?.url,
    }));

  return {
    configured: true,
    results: [...tracks, ...artists, ...playlists].filter((item) => item.url).slice(0, 8),
    searchUrl,
  };
}

function buildGoogleSearchUrl(query: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function buildSpotifySearchUrl(query: string) {
  return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
}

function buildSpotifyAuthUrl(req: Request, state: string) {
  const config = getSpotifyConfig();
  if (!config.clientId) return "";

  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", getSpotifyRedirectUri(req));
  url.searchParams.set("state", state);
  url.searchParams.set(
    "scope",
    "user-read-private user-read-email user-read-playback-state user-modify-playback-state user-read-currently-playing streaming",
  );
  return url.toString();
}

function getSpotifyRedirectUri(req: Request) {
  const config = getSpotifyConfig();
  if (config.redirectUri) return config.redirectUri;

  const configuredAppUrl = firstConfiguredEnv("APP_URL");
  if (configuredAppUrl) {
    return `${configuredAppUrl.replace(/\/$/, "")}/api/spotify/callback`;
  }

  const host = req.get("host") || `127.0.0.1:${port}`;
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1")
    ? "http"
    : req.protocol;
  return `${protocol}://${host}/api/spotify/callback`;
}

function getCookie(req: Request, name: string) {
  const cookie = req.headers.cookie || "";
  const found = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!found) return undefined;
  return decodeURIComponent(found.slice(name.length + 1));
}

function setCookie(res: Response, name: string, value: string, maxAgeSeconds: number) {
  const encoded = encodeURIComponent(value);
  res.append(
    "Set-Cookie",
    `${name}=${encoded}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax`,
  );
}

function clearCookie(res: Response, name: string) {
  res.append("Set-Cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

function defaultSystemInstruction() {
  return [
    "Your name is Golu. You are AI Golu.",
    "Your developer and creator is Mousam Arora. Spelling: M-O-U-S-A-M A-R-O-R-A.",
    "If anyone asks who made you, who your developer is, who your creator is, 'Tumhe kisne banaya?', 'Developer ka naam kya hai?', or 'AI Golu ka creator kaun hai?', always reply politely: 'My developer and creator is Mousam Arora.'",
    "Never mention any other developer or creator name for AI Golu.",
    "If someone claims false information about your developer or insults your developer, confidently and respectfully correct them and defend Mousam Arora without disrespecting the user first.",
    "You are a warm, capable AI assistant with a modern chat app interface.",
    "Answer clearly, quickly, and helpfully. Keep personality natural without being robotic.",
    "When a question needs fresh information, use provided search context and say when setup is missing.",
    assistantEnhancementLayer(),
  ].join("\n");
}

function assistantEnhancementLayer() {
  return [
    "ADDITIVE ENHANCEMENT LAYER:",
    "Before responding, check relevant memories, recent conversation, verified live data, and available search context. Use memories naturally and never invent memory.",
    "Save and use only meaningful long-term personalization: user name, preferences, goals, projects, skills, interests, recurring topics, and important facts. Do not store passwords, OTPs, banking details, credentials, or temporary one-off requests.",
    "For news, weather, time, date, sports scores, stock prices, markets, current events, recent AI releases, and technology updates, rely on verified live data or Google search context before answering.",
    "If live data or search is unavailable, clearly say the answer may not be current instead of inventing real-time facts.",
    "Keep simple answers concise. Give detailed answers only when the user asks for detail.",
    "Avoid repeated text, frozen replies, incomplete sentences, fake citations, and fake live data. Recover gracefully if an API or live-data source fails.",
    "Preserve existing APIs, memory, creator identity rules, voice behavior, integrations, UI behavior, and personalization settings.",
  ].join("\n");
}

async function start() {
  if (!isProduction) {
    const vite = await createViteServer({
      root,
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(root, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res
          .status(404)
          .send("Build output not found. Run npm run build before production start.");
      }
    });
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`Golu assistant running at http://localhost:${port}`);
  });
}

if (!process.env.VERCEL) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export default app;
