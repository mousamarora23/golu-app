import { getSystemInstruction, loadPersonality, loadUserContext } from "./configService";
import type { LongTermMemory } from "./configService";

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  displayLink?: string;
}

export interface SpotifyResult {
  id: string;
  type: "track" | "artist" | "playlist";
  name: string;
  subtitle: string;
  url: string;
  uri?: string;
  image?: string;
}

export interface LiveContext {
  kind: "time" | "date" | "weather" | "live";
  answer?: string;
  source: string;
  fetchedAt: string;
  data?: Record<string, unknown>;
  error?: string;
}

export interface AssistantStatus {
  gemini?: {
    configured: boolean;
    model: string;
    missing?: string[];
  };
  openai: {
    configured: boolean;
    model: string;
    missing?: string[];
  };
  google: {
    configured: boolean;
    missing?: string[];
  };
  spotify: {
    configured: boolean;
    connected?: boolean;
    authUrl?: string | null;
    missing?: string[];
  };
}

export interface ChatHistoryItem {
  sender: "user" | "golu";
  text: string;
}

export interface AssistantResponse {
  text: string;
  provider: "openai" | "gemini" | "live";
  model: string;
  searchResults: SearchResult[];
  searchConfigured: boolean;
  searchError?: string;
  liveContext?: LiveContext;
}

export async function getAssistantStatus(): Promise<AssistantStatus> {
  const response = await fetch("/api/status");
  if (!response.ok) {
    throw new Error("Unable to load assistant status.");
  }
  return response.json();
}

export async function getAssistantResponse(
  message: string,
  history: ChatHistoryItem[],
  options: {
    useWebSearch?: boolean;
  } = {},
): Promise<AssistantResponse> {
  const userContext = loadUserContext();
  const personality = loadPersonality();

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      history,
      useWebSearch: options.useWebSearch,
      clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      systemInstruction: getSystemInstruction(personality, userContext),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Assistant request failed.");
  }

  return data;
}

export async function getLiveContext(query: string): Promise<LiveContext> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const params = new URLSearchParams({ q: query, timezone });
  const response = await fetch(`/api/live?${params.toString()}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Live data lookup failed.");
  }
  return data;
}

export async function searchGoogle(query: string): Promise<{
  configured: boolean;
  results: SearchResult[];
  searchUrl: string;
  setupRequired?: string;
}> {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Google search failed.");
  }
  return data;
}

export async function searchSpotify(query: string): Promise<{
  configured: boolean;
  results: SpotifyResult[];
  searchUrl: string;
  setupRequired?: string;
}> {
  const response = await fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Spotify search failed.");
  }
  return data;
}

export async function playSpotifyUri(uri: string): Promise<{ ok: boolean }> {
  const response = await fetch("/api/spotify/play", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uri }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Spotify playback failed.");
  }
  return data;
}

export async function getSyncedMemory(): Promise<LongTermMemory[]> {
  const response = await fetch("/api/memory");
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Unable to load synced memory.");
  }
  return Array.isArray(data.memories) ? data.memories : [];
}

export async function syncMemories(memories: LongTermMemory[]): Promise<LongTermMemory[]> {
  const response = await fetch("/api/memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memories }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Unable to sync memory.");
  }
  return Array.isArray(data.memories) ? data.memories : [];
}

export async function deleteSyncedMemory(id: string): Promise<LongTermMemory[]> {
  const response = await fetch(`/api/memory/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Unable to delete synced memory.");
  }
  return Array.isArray(data.memories) ? data.memories : [];
}
