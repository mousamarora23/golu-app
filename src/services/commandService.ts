// Known popular web destinations with direct URLs
const KNOWN_SITES: Record<string, { name: string; url: string }> = {
  youtube: { name: "YouTube", url: "https://www.youtube.com" },
  yt: { name: "YouTube", url: "https://www.youtube.com" },
  spotify: { name: "Spotify", url: "https://open.spotify.com" },
  google: { name: "Google", url: "https://www.google.com" },
  instagram: { name: "Instagram", url: "https://www.instagram.com" },
  insta: { name: "Instagram", url: "https://www.instagram.com" },
  whatsapp: { name: "WhatsApp Web", url: "https://web.whatsapp.com" },
  "web whatsapp": { name: "WhatsApp Web", url: "https://web.whatsapp.com" },
  facebook: { name: "Facebook", url: "https://www.facebook.com" },
  fb: { name: "Facebook", url: "https://www.facebook.com" },
  twitter: { name: "X (Twitter)", url: "https://www.x.com" },
  x: { name: "X (Twitter)", url: "https://www.x.com" },
  github: { name: "GitHub", url: "https://www.github.com" },
  gmail: { name: "Gmail", url: "https://mail.google.com" },
  mail: { name: "Gmail", url: "https://mail.google.com" },
  email: { name: "Gmail", url: "https://mail.google.com" },
  linkedin: { name: "LinkedIn", url: "https://www.linkedin.com" },
  reddit: { name: "Reddit", url: "https://www.reddit.com" },
  netflix: { name: "Netflix", url: "https://www.netflix.com" },
  amazon: { name: "Amazon", url: "https://www.amazon.in" },
  flipkart: { name: "Flipkart", url: "https://www.flipkart.com" },
  chatgpt: { name: "ChatGPT", url: "https://chatgpt.com" },
  "chat gpt": { name: "ChatGPT", url: "https://chatgpt.com" },
  gemini: { name: "Google Gemini", url: "https://gemini.google.com" },
  wikipedia: { name: "Wikipedia", url: "https://www.wikipedia.org" },
  pinterest: { name: "Pinterest", url: "https://www.pinterest.com" },
  quora: { name: "Quora", url: "https://www.quora.com" },
  hotstar: { name: "Disney+ Hotstar", url: "https://www.hotstar.com" },
  "disney hotstar": { name: "Disney+ Hotstar", url: "https://www.hotstar.com" },
  "prime video": { name: "Prime Video", url: "https://www.primevideo.com" },
  primevideo: { name: "Prime Video", url: "https://www.primevideo.com" },
};

function resolveWebsiteUrl(target: string): { name: string; url: string } {
  const normalized = target.toLowerCase().trim().replace(/^(the|a)\s+/i, "");
  if (KNOWN_SITES[normalized]) {
    return KNOWN_SITES[normalized];
  }
  let domain = normalized.replace(/\s+/g, "");
  if (!domain.includes(".")) {
    domain += ".com";
  }
  const cleanUrl = domain.startsWith("http") ? domain : `https://www.${domain}`;
  return { name: target, url: cleanUrl };
}

export function processCommand(command: string): {
  action: string;
  url?: string;
  isBrowserAction: boolean;
  kind?: "open" | "youtube" | "spotify" | "spotify-connect" | "whatsapp" | "google" | "create-pdf";
  query?: string;
  target?: string;
} {
  // Clean trailing punctuation from speech recognition (periods, questions, commas)
  const lowerCmd = command.toLowerCase().trim().replace(/[.,?!]+$/, "").trim();

  // 1. PDF Generation Commands: "Create a PDF about [topic]", "PDF bana do [topic] par"
  const pdfMatch =
    lowerCmd.match(/^(?:create|generate|make|build)\s+(?:a\s+)?pdf\s+(?:about|on|for|of)\s+(.+)$/i) ||
    lowerCmd.match(/^pdf\s+(?:bana\s+do|banao|create\s+karo)\s+(.+?)(?:\s+ka|\s+par|\s+pe)?$/i) ||
    lowerCmd.match(/^(?:is\s+answer|is\s+conversation|is\s+chat|is\s+topic)\s+ka\s+pdf\s+bana\s+do$/i);
  if (pdfMatch) {
    const rawTopic = pdfMatch[1]?.trim() || "Conversation Notes";
    return {
      action: `Generating a PDF document about "${rawTopic}".`,
      isBrowserAction: false,
      kind: "create-pdf",
      query: rawTopic,
    };
  }

  // 2. Spotify Connect
  if (
    /^(?:connect|login|log in)\s+(?:to\s+)?spotify$/i.test(lowerCmd) ||
    /spotify\s+(?:connect|login)\s+karo/i.test(lowerCmd)
  ) {
    return {
      action: "Opening Spotify connection flow.",
      url: "/api/spotify/connect",
      isBrowserAction: true,
      kind: "spotify-connect",
    };
  }

  // 3. YouTube Commands
  // Direct open: "open youtube", "youtube kholo", "youtube open karo", "youtube"
  if (
    /^(?:open|khol|kholo|khol\s+do)\s+youtube$/i.test(lowerCmd) ||
    /^youtube(?:\s+(?:kholo|khol\s+do|khol|open\s+karo|open\s+kar|open))?$/i.test(lowerCmd)
  ) {
    return {
      action: "Opening YouTube.",
      url: "https://www.youtube.com",
      isBrowserAction: true,
      kind: "youtube",
      query: "",
    };
  }

  // Play/Search on YouTube (English & Hindi)
  // E.g.: "play arijit singh on youtube", "youtube par arijit singh ke gaane chala do", "youtube pe kesariya bajao"
  const ytPlayMatch =
    lowerCmd.match(/^(?:play|search)\s+(.+?)\s+on\s+(?:youtube|yt)$/i) ||
    lowerCmd.match(/^(?:youtube|yt)\s+(?:par|pe|me|mein)\s+(.+?)(?:\s+(?:chala\s+do|chalao|bajao|sunao|play\s+karo|play\s+kar|search\s+karo|search\s+kar|dhoondho))?$/i) ||
    lowerCmd.match(/^(.+?)\s+(?:chala\s+do|chalao|bajao|sunao|play\s+karo)\s+(?:youtube|yt)\s+(?:par|pe)$/i);
  if (ytPlayMatch) {
    const rawQuery = ytPlayMatch[1].trim();
    if (rawQuery && rawQuery !== "youtube" && rawQuery !== "yt") {
      const query = encodeURIComponent(rawQuery);
      return {
        action: `Playing ${rawQuery} on YouTube.`,
        url: `https://www.youtube.com/results?search_query=${query}`,
        isBrowserAction: true,
        kind: "youtube",
        query: rawQuery,
      };
    }
  }

  // 4. Spotify Commands
  // Direct open: "open spotify", "spotify kholo", "spotify open karo"
  if (
    /^(?:open|khol|kholo|khol\s+do)\s+spotify$/i.test(lowerCmd) ||
    /^spotify(?:\s+(?:kholo|khol\s+do|khol|open\s+karo|open\s+kar|open))?$/i.test(lowerCmd)
  ) {
    return {
      action: "Opening Spotify.",
      url: "https://open.spotify.com",
      isBrowserAction: true,
      kind: "open",
      query: "spotify",
    };
  }

  // Search/Play on Spotify (English & Hindi)
  // E.g.: "search coldplay on spotify", "spotify par coldplay sunao", "play arijit on spotify"
  const spotifyMatch =
    lowerCmd.match(/^(?:search|find|play)\s+(.+?)\s+on\s+spotify$/i) ||
    lowerCmd.match(/^search\s+spotify\s+for\s+(.+)$/i) ||
    lowerCmd.match(/^spotify\s+(?:par|pe|me|mein)\s+(.+?)(?:\s+(?:chala\s+do|chalao|bajao|sunao|play\s+karo|play\s+kar|search\s+karo))?$/i) ||
    lowerCmd.match(/^(.+?)\s+(?:chala\s+do|chalao|bajao|sunao)\s+spotify\s+(?:par|pe)$/i) ||
    lowerCmd.match(/^spotify\s+(.+)$/i);
  if (spotifyMatch) {
    const rawQuery = spotifyMatch[1].trim();
    if (rawQuery && rawQuery !== "spotify") {
      const query = encodeURIComponent(rawQuery);
      return {
        action: `Searching Spotify for ${rawQuery}.`,
        url: `https://open.spotify.com/search/${query}`,
        isBrowserAction: true,
        kind: "spotify",
        query: rawQuery,
      };
    }
  }

  // 5. Google Search & Open Commands
  // Direct open: "open google", "google kholo", "google open karo"
  if (
    /^(?:open|khol|kholo|khol\s+do)\s+google$/i.test(lowerCmd) ||
    /^google(?:\s+(?:kholo|khol\s+do|khol|open\s+karo|open\s+kar|open))?$/i.test(lowerCmd)
  ) {
    return {
      action: "Opening Google.",
      url: "https://www.google.com",
      isBrowserAction: true,
      kind: "google",
      query: "",
    };
  }

  // Search on Google (English & Hindi)
  // E.g.: "search weather on google", "google par search karo cricket score", "google pe dhoondho..."
  const googleMatch =
    lowerCmd.match(/^(?:search|look\s+up|find)\s+(.+?)\s+on\s+google$/i) ||
    lowerCmd.match(/^search\s+google\s+for\s+(.+)$/i) ||
    lowerCmd.match(/^google\s+search\s+(.+)$/i) ||
    lowerCmd.match(/^google\s+(?:par|pe|me|mein)\s+(?:search\s+karo|dhoondho|khojo)\s+(.+)$/i) ||
    lowerCmd.match(/^google\s+(?:par|pe|me|mein)\s+(.+?)(?:\s+(?:search\s+karo|search\s+kar|dhoondho|khojo))?$/i) ||
    lowerCmd.match(/^(.+?)\s+(?:search\s+karo|dhoondho)\s+google\s+(?:par|pe)$/i) ||
    lowerCmd.match(/^google\s+(.+)$/i) ||
    lowerCmd.match(/^look\s+up\s+(.+)$/i);
  if (googleMatch) {
    const rawQuery = googleMatch[1].trim();
    if (rawQuery && rawQuery !== "google") {
      return {
        action: `Searching Google for ${rawQuery}.`,
        url: `https://www.google.com/search?q=${encodeURIComponent(rawQuery)}`,
        isBrowserAction: true,
        kind: "google",
        query: rawQuery,
      };
    }
  }

  // 6. WhatsApp Web: "Send a WhatsApp message to [number] saying [message]"
  const waMatch =
    lowerCmd.match(/^send\s+a\s+whatsapp\s+message\s+to\s+([\d\+\s]+)\s+saying\s+(.+)$/i) ||
    lowerCmd.match(/^whatsapp\s+(?:par|pe)\s+([\d\+\s]+)\s+(?:ko\s+)?message\s+(?:bhejo|karo)\s+(.+)$/i);
  if (waMatch) {
    const number = waMatch[1].replace(/\s+/g, "");
    const message = encodeURIComponent(waMatch[2].trim());
    return {
      action: "Opening WhatsApp Web with your message.",
      url: `https://web.whatsapp.com/send?phone=${number}&text=${message}`,
      isBrowserAction: true,
      kind: "whatsapp",
      query: waMatch[2].trim(),
      target: number,
    };
  }

  // 7. General Website/App Opening (English & Hindi)
  // "open instagram", "instagram kholo", "open github", "facebook open karo"
  const openMatch =
    lowerCmd.match(/^(?:open|khol|kholo|khol\s+do)\s+(.+)$/i) ||
    lowerCmd.match(/^(.+?)\s+(?:kholo|khol\s+do|khol|open\s+karo|open\s+kar|open\s+kar\s+do)$/i);
  if (openMatch) {
    const target = openMatch[1].trim();
    if (target && !["mind", "darwaza", "door", "eyes", "aankhen"].includes(target)) {
      const resolved = resolveWebsiteUrl(target);
      return {
        action: `Opening ${resolved.name} for you.`,
        url: resolved.url,
        isBrowserAction: true,
        kind: "open",
        query: target,
      };
    }
  }

  // 8. General "Play [song]" command (default to YouTube for universal music & video playback)
  // E.g.: "play despacito", "arijit singh ke gaane chala do", "gaana chalao kesariya"
  const generalPlayMatch =
    lowerCmd.match(/^play\s+(.+)$/i) ||
    lowerCmd.match(/^(?:chala\s+do|chalao|bajao|sunao)\s+(.+)$/i) ||
    lowerCmd.match(/^(.+?)\s+(?:chala\s+do|chalao|bajao|sunao)$/i);
  if (generalPlayMatch) {
    const rawSong = generalPlayMatch[1].trim();
    if (rawSong && !["kaam", "game", "chakar", "dimag"].includes(rawSong) && rawSong.length > 2) {
      const query = encodeURIComponent(rawSong);
      return {
        action: `Playing ${rawSong} on YouTube.`,
        url: `https://www.youtube.com/results?search_query=${query}`,
        isBrowserAction: true,
        kind: "youtube",
        query: rawSong,
      };
    }
  }

  return { action: "", isBrowserAction: false };
}
