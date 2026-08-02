export function processCommand(command: string): {
  action: string;
  url?: string;
  isBrowserAction: boolean;
  kind?: "open" | "youtube" | "spotify" | "spotify-connect" | "whatsapp" | "google";
  query?: string;
  target?: string;
} {
  const lowerCmd = command.toLowerCase().trim();

  if (/^(connect|login|log in)\s+(to\s+)?spotify$/.test(lowerCmd)) {
    return {
      action: "Opening Spotify connection flow.",
      url: "/api/spotify/connect",
      isBrowserAction: true,
      kind: "spotify-connect",
    };
  }

  if (/^open\s+spotify$/.test(lowerCmd)) {
    return {
      action: "Opening Spotify.",
      url: "https://open.spotify.com",
      isBrowserAction: true,
      kind: "open",
      query: "spotify",
    };
  }

  // Media Search: "Play [song/video] on YouTube"
  const ytMatch = lowerCmd.match(/^play\s+(.+?)\s+on\s+youtube$/);
  if (ytMatch) {
    const rawQuery = ytMatch[1].trim();
    const query = encodeURIComponent(rawQuery);
    return {
      action: `Playing ${rawQuery} on YouTube.`,
      url: `https://www.youtube.com/results?search_query=${query}`,
      isBrowserAction: true,
      kind: "youtube",
      query: rawQuery,
    };
  }

  // Media Search: "Search [query] on Spotify" or "Play [song] on Spotify"
  const spotifyMatch =
    lowerCmd.match(/^search\s+(.+?)\s+on\s+spotify$/) ||
    lowerCmd.match(/^search\s+spotify\s+for\s+(.+)$/) ||
    lowerCmd.match(/^find\s+(.+?)\s+on\s+spotify$/) ||
    lowerCmd.match(/^play\s+(.+?)\s+on\s+spotify$/) ||
    lowerCmd.match(/^spotify\s+(.+)$/);
  if (spotifyMatch) {
    const rawQuery = spotifyMatch[1].trim();
    const query = encodeURIComponent(rawQuery);
    return {
      action: `Searching Spotify for ${rawQuery}.`,
      url: `https://open.spotify.com/search/${query}`,
      isBrowserAction: true,
      kind: "spotify",
      query: rawQuery,
    };
  }

  // Google Search: "Search [query] on Google", "Google [query]", "Look up [query]"
  const googleMatch =
    lowerCmd.match(/^search\s+(.+?)\s+on\s+google$/) ||
    lowerCmd.match(/^search\s+google\s+for\s+(.+)$/) ||
    lowerCmd.match(/^google\s+search\s+(.+)$/) ||
    lowerCmd.match(/^google\s+(.+)$/) ||
    lowerCmd.match(/^look\s+up\s+(.+)$/);
  if (googleMatch) {
    const rawQuery = googleMatch[1].trim();
    return {
      action: `Searching Google for ${rawQuery}.`,
      url: `https://www.google.com/search?q=${encodeURIComponent(rawQuery)}`,
      isBrowserAction: true,
      kind: "google",
      query: rawQuery,
    };
  }

  // General Browsing: "Open [website name]"
  const openMatch = lowerCmd.match(/^open\s+(.+)$/);
  if (
    openMatch &&
    !lowerCmd.includes("youtube") &&
    !lowerCmd.includes("spotify") &&
    !lowerCmd.includes("google")
  ) {
    let website = openMatch[1].trim().replace(/\s+/g, "");
    if (!website.includes(".")) {
      website += ".com";
    }
    return {
      action: `Opening ${openMatch[1]} for you.`,
      url: `https://www.${website}`,
      isBrowserAction: true,
      kind: "open",
      query: openMatch[1].trim(),
    };
  }

  // WhatsApp Web: "Send a WhatsApp message to [number] saying [message]"
  const waMatch = lowerCmd.match(
    /^send\s+a\s+whatsapp\s+message\s+to\s+([\d\+\s]+)\s+saying\s+(.+)$/,
  );
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

  return { action: "", isBrowserAction: false };
}
