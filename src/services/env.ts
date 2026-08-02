export function getGeminiApiKey(): string {
  const processEnvKey = (globalThis as any)?.process?.env?.GEMINI_API_KEY as string | undefined;
  const metaEnv = ((import.meta as any)?.env ?? {}) as Record<string, string | undefined>;
  const importMetaKey = metaEnv.GEMINI_API_KEY || metaEnv.VITE_GEMINI_API_KEY;

  const apiKey = processEnvKey || importMetaKey;
  if (!apiKey || isPlaceholderKey(apiKey)) {
    throw new Error(
      "Missing Gemini API key. Set GEMINI_API_KEY (AI Studio) or VITE_GEMINI_API_KEY in .env.local."
    );
  }

  return apiKey;
}

function isPlaceholderKey(value: string) {
  const trimmed = value.trim();
  return (
    !trimmed ||
    /^MY_/i.test(trimmed) ||
    /^YOUR_/i.test(trimmed) ||
    /placeholder/i.test(trimmed) ||
    /YOUR_/i.test(trimmed) ||
    /MY_/i.test(trimmed)
  );
}
