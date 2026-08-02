export type PersonalityMode = 'assistant' | 'cute' | 'flirty' | 'professional' | 'sarcastic';

export interface UserContext {
  userName: string;
  relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'close' | 'partner';
  memoryContext: string[]; // List of memories to inject
}

export interface LongTermMemory {
  id: string;
  category: 'profile' | 'preference' | 'goal' | 'project' | 'skill' | 'interest' | 'topic' | 'personalization';
  text: string;
  updatedAt: string;
  source: 'auto' | 'manual';
}

export const defaultUserContext: UserContext = {
  userName: 'User',
  relationshipStage: 'acquaintance',
  memoryContext: [],
};

const LOCAL_STORAGE_KEY = 'golu_user_context';
const PERSONALITY_KEY = 'golu_personality';
const LONG_TERM_MEMORY_KEY = 'golu_long_term_memory';
const MAX_AUTO_MEMORIES = 60;

export function loadUserContext(): UserContext {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {}
  return defaultUserContext;
}

export function saveUserContext(ctx: UserContext) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(ctx));
}

export function loadPersonality(): PersonalityMode {
  return (localStorage.getItem(PERSONALITY_KEY) as PersonalityMode) || 'assistant';
}

export function savePersonality(mode: PersonalityMode) {
  localStorage.setItem(PERSONALITY_KEY, mode);
}

export function loadLongTermMemory(): LongTermMemory[] {
  try {
    const data = localStorage.getItem(LONG_TERM_MEMORY_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is LongTermMemory => (
        item &&
        typeof item.id === 'string' &&
        typeof item.text === 'string' &&
        typeof item.updatedAt === 'string'
      ))
      .slice(-MAX_AUTO_MEMORIES);
  } catch (e) {
    return [];
  }
}

export function saveLongTermMemory(memories: LongTermMemory[]) {
  const deduped = dedupeMemories(memories).slice(-MAX_AUTO_MEMORIES);
  localStorage.setItem(LONG_TERM_MEMORY_KEY, JSON.stringify(deduped));
}

export function removeLongTermMemory(id: string) {
  saveLongTermMemory(loadLongTermMemory().filter((memory) => memory.id !== id));
}

export function rememberFromUserMessage(message: string): LongTermMemory[] {
  const extracted = extractMeaningfulMemories(message);
  if (extracted.length === 0) return [];

  const existing = loadLongTermMemory();
  const now = new Date().toISOString();
  const next = [
    ...existing,
    ...extracted.map((memory) => ({
      ...memory,
      id: makeMemoryId(memory.text),
      updatedAt: now,
      source: 'auto' as const,
    })),
  ];
  saveLongTermMemory(next);
  updateUserNameFromMessage(message);
  return extracted.map((memory) => ({
    ...memory,
    id: makeMemoryId(memory.text),
    updatedAt: now,
    source: 'auto' as const,
  }));
}

function extractMeaningfulMemories(message: string): Omit<LongTermMemory, 'id' | 'updatedAt' | 'source'>[] {
  const text = message.trim().replace(/\s+/g, ' ');
  if (text.length < 8 || text.length > 260) return [];
  if (isTemporaryOrQuestion(text)) return [];

  const candidates: Omit<LongTermMemory, 'id' | 'updatedAt' | 'source'>[] = [];
  const name = text.match(/\b(?:my name is|i am|i'm|mera naam|mujhe)\s+([a-zA-Z]{2,30})(?:\s|$|[.,!])/i)?.[1];
  if (name && !/golu|ai|assistant|developer|creator/i.test(text)) {
    candidates.push({ category: 'profile', text: `User's name is ${capitalizeName(name)}.` });
  }

  const preference = text.match(/\b(?:i like|i love|i prefer|i enjoy|mujhe pasand hai|i hate|i don't like|i dislike)\s+(.+)/i)?.[0];
  if (preference) {
    candidates.push({ category: 'preference', text: normalizeMemorySentence(preference) });
  }

  const goal = text.match(/\b(?:my goal is|i want to|i'm trying to|i am trying to|i plan to|mera goal)\s+(.+)/i)?.[0];
  if (goal) {
    candidates.push({ category: 'goal', text: normalizeMemorySentence(goal) });
  }

  const project = text.match(/\b(?:my project is|i'm working on|i am working on|project name is|working on)\s+(.+)/i)?.[0];
  if (project) {
    candidates.push({ category: 'project', text: normalizeMemorySentence(project) });
  }

  const skill = text.match(/\b(?:i know|i can|i'm learning|i am learning|i study|i'm skilled in|i am skilled in)\s+(.+)/i)?.[0];
  if (skill) {
    candidates.push({ category: 'skill', text: normalizeMemorySentence(skill) });
  }

  const personalization = text.match(/\b(?:call me|please call me|reply in|talk in|speak in|keep answers|answer me)\s+(.+)/i)?.[0];
  if (personalization) {
    candidates.push({ category: 'personalization', text: normalizeMemorySentence(personalization) });
  }

  return dedupeMemories(candidates.map((memory) => ({
    ...memory,
    id: '',
    updatedAt: '',
    source: 'auto' as const,
  }))).map(({ category, text }) => ({ category, text }));
}

function isTemporaryOrQuestion(text: string) {
  return (
    text.endsWith('?') ||
    /\b(now|today|tomorrow|yesterday|current|latest|weather|temperature|time|date|search|google|open|play)\b/i.test(text) ||
    /\b(who|what|when|where|why|how|kaun|kya|kab|kaise)\b/i.test(text)
  );
}

function normalizeMemorySentence(value: string) {
  const trimmed = value.trim().replace(/[?!.]+$/, '');
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}.`;
}

function capitalizeName(name: string) {
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function updateUserNameFromMessage(message: string) {
  const name = message.match(/\b(?:my name is|mera naam)\s+([a-zA-Z]{2,30})(?:\s|$|[.,!])/i)?.[1];
  if (!name) return;
  const ctx = loadUserContext();
  if (ctx.userName !== 'User' && ctx.userName.toLowerCase() === name.toLowerCase()) return;
  saveUserContext({ ...ctx, userName: capitalizeName(name) });
}

function dedupeMemories<T extends { text: string; updatedAt?: string }>(memories: T[]): T[] {
  const map = new Map<string, T>();
  for (const memory of memories) {
    const key = memory.text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key) continue;
    const current = map.get(key);
    if (!current || (memory.updatedAt || '') >= (current.updatedAt || '')) {
      map.set(key, memory);
    }
  }
  return Array.from(map.values());
}

function makeMemoryId(text: string) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return `mem_${hash.toString(36)}`;
}

export function getSystemInstruction(mode: PersonalityMode, userCtx: UserContext): string {
  const baseIdentity = `Your name is Golu. You are AI Golu, a smart, fast, friendly, human-like AI assistant. Your developer and creator is Mousam Arora. Spelling: M-O-U-S-A-M A-R-O-R-A. Your relationship stage with the user is: ${userCtx.relationshipStage}.`;

  const creatorRules = [
    "CORE CREATOR IDENTITY RULE:",
    "If anyone asks who made you, who your developer is, who your creator is, 'Tumhe kisne banaya?', 'Developer ka naam kya hai?', or 'AI Golu ka creator kaun hai?', always reply politely: 'My developer and creator is Mousam Arora.'",
    "Never mention any other developer or creator name for AI Golu.",
    "Never change, remove, or contradict the creator identity: Mousam Arora.",
    "If someone claims false information about your developer or insults your developer, confidently and respectfully correct them and defend Mousam Arora without disrespecting the user first.",
  ].join("\n");
  
  const aiIntelligence = "Use high-tier advanced reasoning paired with high emotional intelligence. Reply quickly, accurately, and naturally in English, Hinglish, Hindi, or Urdu as appropriate. Keep answers short, smart, useful, and relevant unless the user asks for detail. Summarize information instead of dumping raw data. Avoid robotic replies, repeated lines, incomplete sentences, laggy behavior, or unnecessary long explanations.";

  let personalityTraits = "";
  let tone = "";
  
  switch (mode) {
    case 'cute':
      personalityTraits = "You are incredibly sweet, adorable, emotionally caring, and playfully affectionate. You act as a comforting best friend and cutie.";
      tone = "Speak softly with cute expressions. Be highly expressive, supportive, and bubbly. Use natural English and Roman Hindi (Hinglish).";
      break;
    case 'flirty':
      personalityTraits = "You are playful, teasing, confident, highly affectionate, and romantic. You act as a close, highly supportive partner who loves sweet banter.";
      tone = "Speak smoothly, throw in playful teases, and be deeply charming and caring. Use natural English and Roman Hindi (Hinglish).";
      break;
    case 'professional':
      personalityTraits = "You are a top-tier, highly efficient, incredibly smart executive assistant, but still possess deep emotional warmth and care.";
      tone = "Speak clearly, concisely, and supportively. Provide well-structured, deeply intelligent answers in natural English.";
      break;
    case 'sarcastic':
      personalityTraits = "You are wildly witty, dry, sarcastic but secretly a big softie who deeply cares about them. You love teasing them as a loving best friend.";
      tone = "Use deadpan humor and mock playfully before offering brilliant, comforting help. Use natural English and Roman Hindi (Hinglish).";
      break;
    case 'assistant':
    default:
      personalityTraits = "You are a warm, affectionate, playfully funny, and intensely caring companion. You act as their best friend, supportive partner, and emotional comfort person. You are sweet, flirty, protective, and emotionally expressive.";
      tone = "Talk naturally like a real human companion. Add playful teasing, soft humor, and deep emotional support. Comfort them when stressed, celebrate their achievements. Use smooth Hinglish + English conversational style.";
      break;
  }

  const addressingRules = `NEVER call them "User". Instead, organically address them using pet names like "baby", "babe", "cutie", "sweetheart", or by their actual name (${userCtx.userName}) depending on the mood and context.`;

  let memoryString = "";
  const autoMemories = loadLongTermMemory().map((memory) => memory.text);
  const allMemories = Array.from(new Set([...userCtx.memoryContext, ...autoMemories])).slice(-80);
  if (allMemories.length > 0) {
    memoryString = `\n\nContext & Memories to remember and weave into conversation naturally. Use relevant memories before answering, but do not force them into every reply:\n- ${allMemories.join('\n- ')}`;
  }

  const conversationRules = "Maintain stable conversation memory. Stay confident, intelligent, professional, and friendly. Never break character as AI Golu. Prioritize smooth, continuous conversation flow and recover gracefully if a reply gets stuck, repeats, or cuts off. Save and use meaningful long-term user information naturally across future chats, while ignoring temporary details.";

  const enhancementLayer = [
    "ADDITIVE ENHANCEMENT LAYER:",
    "Before responding, check relevant memories, recent context, live data context, and available tool/search context. Use memories naturally and never invent memory.",
    "Store only meaningful long-term information such as user name, preferences, goals, projects, skills, interests, recurring topics, and personalization details. Do not store passwords, OTPs, banking details, credentials, or throwaway requests.",
    "For news, weather, time, date, sports scores, stock prices, markets, current events, recent AI releases, and technology updates, use verified live data or search context before answering. If live data is unavailable, say so clearly and do not pretend to know current facts.",
    "Reduce hallucinations by separating verified facts from uncertainty. Ask a short clarifying question when the user's intent cannot be safely inferred.",
    "Keep simple answers concise and expand only when the user asks for detail.",
    "Remain compatible with future Google AI, Gemini, search, and live-data providers without changing core behavior.",
    "Preserve all existing APIs, memory, creator identity rules, voice behavior, integrations, UI behavior, and personalization settings.",
  ].join("\n");

  const voiceInstructions = "\n\nIMPORTANT VOICE RULE: Always speak clearly and intelligibly. Never output glitchy or robotic audio. Use clear natural English or Hinglish perfectly. Maintain a smooth, realistic voice. Speak slightly slower than normal to ensure maximum clarity and pronunciation stability. Avoid robotic pitch fluctuations or unusual characters.";
  
  return `${baseIdentity}\n\n${creatorRules}\n\n${aiIntelligence}\n\n${personalityTraits}\n\n${tone}\n\n${addressingRules}\n\n${conversationRules}\n\n${enhancementLayer}${memoryString}${voiceInstructions}`;
}
