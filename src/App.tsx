import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Bot,
  ExternalLink,
  Globe2,
  Keyboard,
  Loader2,
  Mic,
  MicOff,
  Music2,
  Radio,
  Search,
  Send,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getAditiResponse, getAditiAudio, resetAditiSession } from "./services/geminiService";
import { processCommand } from "./services/commandService";
import { LiveSessionManager } from "./services/liveService";
import {
  AssistantStatus,
  LiveContext,
  SearchResult,
  SpotifyResult,
  getAssistantResponse,
  getAssistantStatus,
  getSyncedMemory,
  playSpotifyUri,
  searchGoogle,
  searchSpotify,
  syncMemories,
} from "./services/assistantService";
import PermissionModal from "./components/PermissionModal";
import LiveAvatar from "./components/LiveAvatar";
import PersonalitySettings from "./components/PersonalitySettings";
import ErrorBoundary from "./components/ErrorBoundary";
import { playPCM, stopPCM, isPCMPlaying, getPCMVolume } from "./utils/audioUtils";
import {
  loadAutoSpeak,
  loadLongTermMemory,
  loadSpeechLang,
  loadVoiceName,
  rememberFromUserMessage,
  saveAutoSpeak,
  saveLongTermMemory,
} from "./services/configService";

type AppState = "idle" | "listening" | "processing" | "speaking";
type Provider = "openai" | "gemini" | "browser" | "system" | "live";

interface ChatMessage {
  id: string;
  sender: "user" | "golu";
  text: string;
  provider?: Provider;
  links?: { label: string; url: string }[];
  sources?: SearchResult[];
  spotifyResults?: SpotifyResult[];
  liveContext?: LiveContext;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const chatStorageKey = "golu_chat_history";

function createMessageId(suffix = "") {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}`;
}

function cleanMessageText(text: string) {
  return text
    .replace(/<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "$2: $1")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function getSpeechText(text: string) {
  return cleanMessageText(text)
    .replace(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldUseWebSearch(prompt: string) {
  return /\b(latest|today|current|recent|news|google|search|look up|price|score|weather|temperature|temp|time|date|near me|2026)\b/i.test(
    prompt,
  );
}

function stabilizeAssistantText(text: string) {
  const cleaned = cleanMessageText(text).replace(/\n{3,}/g, "\n\n").trim();
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  const deduped: string[] = [];
  for (const sentence of sentences) {
    if (!sentence || deduped[deduped.length - 1] === sentence) continue;
    deduped.push(sentence);
  }
  return deduped.join(" ").trim() || cleaned;
}

async function speakWithBrowser(text: string): Promise<void> {
  const spokenText = getSpeechText(text);
  if (!spokenText || !("speechSynthesis" in window)) return;

  await new Promise<void>((resolve) => {
    try {
      window.speechSynthesis.cancel();
    } catch {}

    let settled = false;
    let timeout = 0;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve();
    };

    const utterance = new SpeechSynthesisUtterance(spokenText);
    const voices = window.speechSynthesis.getVoices();
    
    // Choose Hindi/Indian English voice first, or good natural English voice
    const preferredVoice =
      voices.find((v) => /hi-IN|hindi|swara|kalpana|madhur|heera|neerja/i.test(v.lang || v.name)) ||
      voices.find((v) => /en-IN|indian|veena|ravi/i.test(v.lang || v.name)) ||
      voices.find((v) => /female|zira|samantha|google us english|google uk english/i.test(v.name)) ||
      voices[0];

    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = finish;
    utterance.onerror = finish;
    timeout = window.setTimeout(finish, Math.max(5000, spokenText.length * 80));
    window.speechSynthesis.speak(utterance);
  });
}

function LinkifiedText({ text }: { text: string }) {
  const cleanText = cleanMessageText(text);
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = cleanText.split(urlRegex);

  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("http://") || part.startsWith("https://") ? (
          <a
            key={`${part}-${index}`}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-200 underline underline-offset-4 hover:text-white break-all"
          >
            {part}
          </a>
        ) : (
          <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

function SetupPill({
  label,
  configured,
}: {
  label: string;
  configured?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
        configured
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
          : "border-white/10 bg-white/5 text-white/55"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          configured ? "bg-emerald-300" : "bg-white/30"
        }`}
      />
      {label}
    </div>
  );
}

function SourceList({ sources }: { sources?: SearchResult[] }) {
  if (!sources?.length) return null;

  return (
    <div className="mt-4 space-y-2">
      {sources.slice(0, 4).map((source) => (
        <a
          key={source.link}
          href={source.link}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-lg border border-cyan-300/15 bg-cyan-300/5 p-3 text-left transition hover:border-cyan-200/40 hover:bg-cyan-300/10"
        >
          <div className="flex items-start gap-2 text-sm font-semibold text-cyan-100">
            <Globe2 size={15} className="mt-0.5 shrink-0" />
            <span>{source.title}</span>
          </div>
          {source.displayLink && (
            <div className="mt-1 text-xs text-cyan-200/60">{source.displayLink}</div>
          )}
          {source.snippet && (
            <p className="mt-2 text-xs leading-relaxed text-white/55">{source.snippet}</p>
          )}
        </a>
      ))}
    </div>
  );
}

function LiveContextBadge({ liveContext }: { liveContext?: LiveContext }) {
  if (!liveContext) return null;

  return (
    <div className="mt-3 rounded-lg border border-sky-300/15 bg-sky-300/5 px-3 py-2 text-xs text-sky-100/80">
      <div className="flex items-center gap-2 font-semibold text-sky-100">
        <Radio size={13} />
        Verified live data
      </div>
      <div className="mt-1 text-white/50">
        {liveContext.source} · {new Date(liveContext.fetchedAt).toLocaleString()}
      </div>
    </div>
  );
}

function SpotifyList({
  results,
  onPlay,
}: {
  results?: SpotifyResult[];
  onPlay?: (result: SpotifyResult) => void;
}) {
  if (!results?.length) return null;

  return (
    <div className="mt-4 grid gap-2">
      {results.slice(0, 5).map((item) => (
        <div
          key={`${item.type}-${item.id}`}
          className="flex items-center gap-3 rounded-lg border border-emerald-300/15 bg-emerald-300/5 p-2 transition hover:border-emerald-200/40 hover:bg-emerald-300/10"
        >
          {item.image ? (
            <img
              src={item.image}
              alt=""
              className="h-11 w-11 shrink-0 rounded-md object-cover"
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-emerald-300/10 text-emerald-200">
              <Music2 size={18} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-emerald-100">{item.name}</div>
            <div className="truncate text-xs text-white/50">{item.subtitle}</div>
          </div>
          {item.uri && onPlay && item.type === "track" && (
            <button
              type="button"
              onClick={() => onPlay(item)}
              className="shrink-0 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-300/20"
            >
              Play
            </button>
          )}
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-full p-1.5 text-white/35 transition hover:bg-white/10 hover:text-white"
            title="Open in Spotify"
          >
            <ExternalLink size={15} />
          </a>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [isReady, setIsReady] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState<boolean>(() => loadAutoSpeak());
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [showTextInput, setShowTextInput] = useState(true);
  const [textInput, setTextInput] = useState("");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isRetryingPermission, setIsRetryingPermission] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const [assistantStatus, setAssistantStatus] = useState<AssistantStatus | null>(null);

  const liveSessionRef = useRef<LiveSessionManager | null>(null);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const latestDictationRef = useRef("");
  const dictationHadErrorRef = useRef(false);
  const autoSpeakRef = useRef(autoSpeak);

  useEffect(() => {
    autoSpeakRef.current = autoSpeak;
  }, [autoSpeak]);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem(chatStorageKey);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (error) {
        console.error("Failed to parse chat history", error);
      }
    }
    return [
      {
        id: createMessageId("-welcome"),
        sender: "golu",
        provider: "system",
        text: "Hi, I am Golu. Ask me anything, search Google, find music on Spotify, or start a live voice session.",
      },
    ];
  });
  const messagesRef = useRef(messages);

  const handleGetVolume = useCallback(() => {
    if (liveSessionRef.current) return liveSessionRef.current.getVolume();
    if (isPCMPlaying()) return getPCMVolume();
    return 0;
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setIsReady(true), 1800);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const refreshStatus = () => {
      getAssistantStatus()
        .then(setAssistantStatus)
        .catch((error) => {
          console.warn("Assistant status unavailable:", error);
          setAssistantStatus(null);
        });
    };

    refreshStatus();
    window.addEventListener("focus", refreshStatus);
    return () => window.removeEventListener("focus", refreshStatus);
  }, []);

  useEffect(() => {
    getSyncedMemory()
      .then((serverMemories) => {
        if (serverMemories.length === 0) return;
        saveLongTermMemory([...loadLongTermMemory(), ...serverMemories]);
      })
      .catch((error) => {
        console.warn("Synced memory unavailable:", error);
      });
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
    localStorage.setItem(chatStorageKey, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, appState]);

  const stopSpeaking = useCallback(() => {
    stopPCM();
    if ("speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    setPlayingMessageId(null);
    setAppState("idle");
  }, []);

  useEffect(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.isMuted = isMuted;
    }
    if (isMuted) {
      stopSpeaking();
    }
  }, [isMuted, stopSpeaking]);

  useEffect(() => {
    return () => {
      liveSessionRef.current?.stop();
      recognitionRef.current?.abort?.();
      stopSpeaking();
    };
  }, [stopSpeaking]);

  const addMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message].slice(-80));
  }, []);

  const speakResponse = useCallback(
    async (text: string, provider: Provider = "gemini", messageId?: string) => {
      if (isMuted || !text.trim()) return;

      stopSpeaking();
      if (messageId) setPlayingMessageId(messageId);
      setAppState("speaking");

      try {
        const voiceName = loadVoiceName() || "Kore";
        const audioBase64 = await getAditiAudio(text, voiceName);
        if (audioBase64) {
          await playPCM(audioBase64);
          setAppState("idle");
          setPlayingMessageId(null);
          return;
        }
      } catch (err) {
        console.warn("TTS audio playback failed, falling back to browser speech:", err);
      }

      try {
        await speakWithBrowser(text);
      } catch (err) {
        console.warn("Browser speech error:", err);
      } finally {
        setAppState("idle");
        setPlayingMessageId(null);
      }
    },
    [isMuted, stopSpeaking],
  );

  const handleSpotifyPlay = useCallback(
    async (item: SpotifyResult) => {
      if (!item.uri) return;
      setAppState("processing");
      try {
        await playSpotifyUri(item.uri);
        const text = `Starting "${item.name}" in Spotify.`;
        const playMsgId = createMessageId("-spotify-play");
        addMessage({
          id: playMsgId,
          sender: "golu",
          provider: "browser",
          text,
        });
        if (autoSpeakRef.current && !isMuted) {
          await speakResponse(text, "browser", playMsgId);
        }
      } catch (error) {
        const text = `${
          error instanceof Error ? error.message : "Spotify playback failed."
        } You can still open it directly in Spotify.`;
        addMessage({
          id: createMessageId("-spotify-play-error"),
          sender: "golu",
          provider: "system",
          text,
          links: [{ label: "Open in Spotify", url: item.url }],
        });
      } finally {
        setAppState("idle");
      }
    },
    [addMessage, isMuted, speakResponse],
  );

  const handleTextCommand = useCallback(
    async (finalTranscript: string) => {
      const prompt = finalTranscript.trim();
      if (!prompt) {
        setAppState("idle");
        return;
      }

      const history = messagesRef.current.slice(-24);
      addMessage({ id: createMessageId("-u"), sender: "user", text: prompt });
      const newMemories = rememberFromUserMessage(prompt);
      if (newMemories.length > 0) {
        void syncMemories(loadLongTermMemory()).catch((error) => {
          console.warn("Memory sync failed:", error);
        });
      }

      if (isSessionActive && liveSessionRef.current) {
        liveSessionRef.current.sendText(prompt);
        return;
      }

      setAppState("processing");

      const commandResult = processCommand(prompt);
      if (commandResult.isBrowserAction) {
        const links = commandResult.url
          ? [{ label: "Open link", url: commandResult.url }]
          : undefined;
        let text = commandResult.action;
        let sources: SearchResult[] | undefined;
        let spotifyResults: SpotifyResult[] | undefined;

        try {
          if (commandResult.kind === "spotify-connect") {
            window.location.href = "/api/spotify/connect";
          }

          if (commandResult.kind === "google" && commandResult.query) {
            const result = await searchGoogle(commandResult.query);
            sources = result.results;
            text = result.configured
              ? `I found these Google results for "${commandResult.query}".`
              : `${text} API-backed Google search needs setup, but the direct search link is ready.`;
          }

          if (commandResult.kind === "spotify" && commandResult.query) {
            const result = await searchSpotify(commandResult.query);
            spotifyResults = result.results;
            text = result.configured
              ? `I found these Spotify matches for "${commandResult.query}".`
              : `${text} Spotify API search needs setup, but the direct Spotify link is ready.`;
          }
        } catch (error) {
          text = `${text} I could not fetch enriched results yet: ${
            error instanceof Error ? error.message : "request failed"
          }`;
        }

        const cmdMsgId = createMessageId("-a");
        addMessage({
          id: cmdMsgId,
          sender: "golu",
          text,
          provider: "browser",
          links,
          sources,
          spotifyResults,
        });
        if (autoSpeakRef.current && !isMuted) {
          await speakResponse(text, "browser", cmdMsgId);
        }
        setAppState("idle");
        return;
      }

      try {
        const response = await getAssistantResponse(prompt, history, {
          useWebSearch: shouldUseWebSearch(prompt),
        });
        const replyText = stabilizeAssistantText(response.text);
        const replyMsgId = createMessageId("-a");
        addMessage({
          id: replyMsgId,
          sender: "golu",
          text: replyText,
          provider: response.provider,
          sources: response.searchResults,
          liveContext: response.liveContext,
        });
        if (autoSpeakRef.current && !isMuted) {
          await speakResponse(replyText, response.provider, replyMsgId);
        }
      } catch (error) {
        console.warn("Assistant response fallback to Gemini:", error);
        const fallbackText = await getAditiResponse(prompt, history);
        const replyMsgId = createMessageId("-a");
        addMessage({
          id: replyMsgId,
          sender: "golu",
          text: fallbackText,
          provider: "gemini",
        });
        if (autoSpeakRef.current && !isMuted) {
          await speakResponse(fallbackText, "gemini", replyMsgId);
        }
      } finally {
        if (!isPCMPlaying()) {
          setAppState("idle");
        }
      }
    },
    [addMessage, isMuted, isSessionActive, speakResponse],
  );

  const startDictation = useCallback(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      addMessage({
        id: createMessageId("-speech-err"),
        sender: "golu",
        provider: "system",
        text: "Voice dictation is not supported in this browser. You can still use the live session or type your message.",
      });
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.abort?.();
      recognitionRef.current = null;
    }

    latestDictationRef.current = "";
    dictationHadErrorRef.current = false;
    const recognition = new Recognition();
    recognition.lang = loadSpeechLang() || "hi-IN";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      setIsDictating(true);
      setAppState("listening");
    };

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      latestDictationRef.current = transcript.trim();
      setTextInput(latestDictationRef.current);
    };

    recognition.onerror = (event: any) => {
      dictationHadErrorRef.current = true;
      addMessage({
        id: createMessageId("-speech-err"),
        sender: "golu",
        provider: "system",
        text: `Voice input error: ${event?.error || "speech recognition failed"}.`,
      });
      setIsDictating(false);
      setAppState("idle");
    };

    recognition.onend = () => {
      const transcript = latestDictationRef.current.trim();
      setIsDictating(false);
      recognitionRef.current = null;
      if (dictationHadErrorRef.current) {
        setAppState("idle");
        return;
      }
      if (transcript) {
        setTextInput("");
        void handleTextCommand(transcript);
      } else {
        setAppState("idle");
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (error) {
      recognitionRef.current = null;
      setIsDictating(false);
      setAppState("idle");
      addMessage({
        id: createMessageId("-speech-start-err"),
        sender: "golu",
        provider: "system",
        text: `Voice input could not start: ${
          error instanceof Error ? error.message : "speech recognition failed"
        }.`,
      });
    }
  }, [addMessage, handleTextCommand]);

  const stopDictation = useCallback(() => {
    recognitionRef.current?.stop?.();
    recognitionRef.current = null;
    setIsDictating(false);
    setAppState("idle");
  }, []);

  const toggleListening = async () => {
    if (isSessionActive) {
      setIsSessionActive(false);
      liveSessionRef.current?.stop();
      liveSessionRef.current = null;
      setAppState("idle");
      resetAditiSession();
      return;
    }

    try {
      setShowPermissionModal(false);
      setIsSessionActive(true);
      resetAditiSession();

      const session = new LiveSessionManager();
      session.isMuted = isMuted;
      liveSessionRef.current = session;

      session.onStateChange = (state) => {
        setAppState(state);
      };

      session.onMessage = (sender, text) => {
        addMessage({
          id: createMessageId(`-${sender}`),
          sender,
          text,
          provider: "gemini",
        });
      };

      session.onCommand = (url) => {
        addMessage({
          id: createMessageId("-cmd"),
          sender: "golu",
          provider: "browser",
          text: "I found what you needed.",
          links: [{ label: "Open link", url }],
        });
      };

      session.onError = (message) => {
        addMessage({
          id: createMessageId("-err"),
          sender: "golu",
          provider: "system",
          text: `Warning: ${message}`,
        });
        setIsSessionActive(false);
        setAppState("idle");
      };

      await session.start();
    } catch (e) {
      console.error("Failed to start session", e);

      const error = e as Error & { name?: string };
      const errorName = error?.name || "";
      const errorMessage = (error?.message || "").toLowerCase();

      const isPermissionDenied =
        errorName === "NotAllowedError" ||
        errorName === "PermissionDeniedError" ||
        errorMessage.includes("permission") ||
        errorMessage.includes("notallowederror");

      if (isPermissionDenied) {
        setShowPermissionModal(true);
      } else {
        const isMicDeviceError =
          errorName === "NotReadableError" ||
          errorName === "NotFoundError" ||
          errorName === "OverconstrainedError" ||
          errorMessage.includes("microphone") ||
          errorMessage.includes("getusermedia");

        const friendlyMessage = isMicDeviceError
          ? errorName === "NotReadableError"
            ? "Microphone is busy in another app. Close apps using your mic and try again."
            : errorName === "NotFoundError"
              ? "No microphone device found. Connect a mic and try again."
              : errorName === "OverconstrainedError"
                ? "Microphone settings are unsupported on this device. Try changing your default mic."
                : `Unable to start microphone session${error?.message ? `: ${error.message}` : "."}`
          : `Unable to start live session${error?.message ? `: ${error.message}` : "."}`;

        addMessage({
          id: createMessageId("-mic-err"),
          sender: "golu",
          provider: "system",
          text: `Warning: ${friendlyMessage}`,
        });
      }

      liveSessionRef.current?.stop();
      liveSessionRef.current = null;
      setIsSessionActive(false);
      setAppState("idle");
    }
  };

  const handleRetryPermission = async () => {
    setIsRetryingPermission(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setShowPermissionModal(false);
      await toggleListening();
    } catch (error) {
      const err = error as Error;
      addMessage({
        id: createMessageId("-permission-retry"),
        sender: "golu",
        provider: "system",
        text: `Warning: Microphone is still blocked. Allow microphone access in browser site permissions, then try again. ${err?.message ? `(${err.message})` : ""}`,
      });
    } finally {
      setIsRetryingPermission(false);
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;

    void handleTextCommand(textInput);
    setTextInput("");
    setShowTextInput(true);
  };

  return (
    <div className="relative m-0 flex h-[100dvh] w-screen flex-col items-center justify-between overflow-hidden bg-[#020205] p-0 font-sans text-white selection:bg-cyan-500/30">
      <AnimatePresence>
        {!isReady && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, filter: "blur(20px)", scale: 1.1 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-[#020205]"
          >
            <div className="relative flex flex-col items-center">
              <motion.div
                initial={{ rotate: 0, scale: 1 }}
                animate={{ rotate: 360, scale: [1, 1.2, 1] }}
                transition={{
                  rotate: { repeat: Infinity, duration: 4, ease: "linear" },
                  scale: { repeat: Infinity, duration: 2, ease: "easeInOut" },
                }}
                className="mb-8 h-32 w-32 rounded-full border border-dashed border-cyan-500/30 mix-blend-screen"
              />
              <motion.div
                initial={{ opacity: 0.4 }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="font-mono text-xs uppercase tracking-[0.5em] text-cyan-500/80"
              >
                Booting Sequence
              </motion.div>
              <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-[80%] rounded-full bg-purple-500 shadow-[0_0_15px_#a855f7]" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showPermissionModal && (
        <PermissionModal
          onClose={() => setShowPermissionModal(false)}
          onRetry={handleRetryPermission}
          isRetrying={isRetryingPermission}
        />
      )}

      <div className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden">
        <div className="absolute left-[-10%] top-[-20%] h-[60%] w-[60%] rounded-full bg-cyan-900/10 blur-[140px] mix-blend-screen" />
        <div className="absolute bottom-[-20%] right-[-10%] h-[60%] w-[60%] rounded-full bg-purple-900/10 blur-[140px] mix-blend-screen" />
        <div className="absolute left-[20%] top-[30%] h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400 opacity-30 blur-[1.5px]" />
        <div className="absolute bottom-[30%] right-[25%] h-2 w-2 animate-bounce rounded-full bg-purple-400 opacity-20 blur-[2px]" />
        <div className="absolute left-[80%] top-[60%] h-1 w-1 animate-ping rounded-full bg-cyan-300 opacity-40 blur-[1px]" />
      </div>

      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: isReady ? 1 : 0, y: isReady ? 0 : -20 }}
        transition={{ duration: 1, delay: 0.3 }}
        className="absolute left-0 top-0 z-30 flex w-full shrink-0 items-center justify-between px-4 py-4 md:px-8 md:py-5"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-violet-500 to-pink-500 text-sm font-bold">
            G
          </div>
          <div>
            <h1 className="text-xl font-medium tracking-wide opacity-95">Golu</h1>
            <div className="flex items-center gap-2 text-xs text-white/45">
              <Radio size={12} />
              {appState === "idle" ? "Ready" : appState}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 lg:flex">
            {assistantStatus?.gemini?.configured && (
              <SetupPill label="Gemini 2.5 Flash" configured={true} />
            )}
            {assistantStatus?.openai?.configured && (
              <SetupPill label={`OpenAI ${assistantStatus?.openai.model || ""}`} configured={true} />
            )}
            <SetupPill label="Google" configured={assistantStatus?.google.configured} />
            <SetupPill
              label={assistantStatus?.spotify.connected ? "Spotify connected" : "Spotify"}
              configured={assistantStatus?.spotify.configured && assistantStatus?.spotify.connected}
            />
            {assistantStatus?.spotify.configured && !assistantStatus.spotify.connected && (
              <a
                href={assistantStatus.spotify.authUrl || "/api/spotify/connect"}
                className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-300/20"
              >
                Connect Spotify
              </a>
            )}
          </div>
          <PersonalitySettings />
          {messages.length > 0 && (
            <button
              onClick={() => {
                if (confirm("Clear chat history?")) {
                  setMessages([]);
                  resetAditiSession();
                  stopSpeaking();
                }
              }}
              className="rounded-full border border-white/10 bg-white/5 p-2 transition-colors hover:bg-red-500/20 hover:text-red-400"
              title="Clear chat history"
            >
              <Trash2 size={18} className="opacity-70" />
            </button>
          )}
          <button
            onClick={() => {
              const next = !isMuted;
              setIsMuted(next);
              if (next) stopSpeaking();
            }}
            className="rounded-full border border-white/10 bg-white/5 p-2 transition-colors hover:bg-white/10"
            title={isMuted ? "Unmute sound" : "Mute sound"}
          >
            {isMuted ? (
              <VolumeX size={18} className="text-red-400 opacity-90" />
            ) : (
              <Volume2 size={18} className="opacity-70" />
            )}
          </button>
        </div>
      </motion.header>

      <motion.main
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: isReady ? 1 : 0, scale: isReady ? 1 : 0.95 }}
        transition={{ duration: 1.2, delay: 0.15, ease: "easeOut" }}
        className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-hidden"
      >
        <div className="pointer-events-none absolute inset-0 z-10 flex h-full w-full items-center justify-start pb-[15vh] pl-[5%] lg:justify-center lg:pl-[10%] lg:-translate-x-[18%]">
          <ErrorBoundary>
            <LiveAvatar appState={appState} getVolume={handleGetVolume} />
          </ErrorBoundary>
        </div>

        <div className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-hidden mix-blend-screen">
          <motion.div
            initial={{ y: 0, x: 0, opacity: 0.1 }}
            animate={{ y: [0, -40, 0], x: [0, 20, 0], opacity: [0.1, 0.7, 0.1] }}
            transition={{ repeat: Infinity, duration: 7, ease: "easeInOut" }}
            className="absolute left-[20%] top-[25%] h-1.5 w-1.5 rounded-full bg-cyan-300 blur-[1px]"
          />
          <motion.div
            initial={{ y: 0, x: 0, opacity: 0.1 }}
            animate={{ y: [0, 50, 0], x: [0, -30, 0], opacity: [0.1, 0.6, 0.1] }}
            transition={{ repeat: Infinity, duration: 9, ease: "easeInOut", delay: 2 }}
            className="absolute bottom-[35%] right-[25%] h-2 w-2 rounded-full bg-purple-400 blur-[2px]"
          />
        </div>
      </motion.main>

      <motion.section
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: isReady ? 1 : 0, x: isReady ? 0 : 30 }}
        transition={{ duration: 0.8, delay: 0.55 }}
        className="absolute inset-x-3 bottom-24 top-[4.75rem] z-20 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/60 shadow-2xl shadow-black/40 backdrop-blur-2xl sm:left-auto sm:right-4 sm:w-[460px] sm:max-w-[calc(100vw-2rem)] md:bottom-28 md:right-6 md:top-20"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-black/30 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
            <Bot size={18} className="text-cyan-200" />
            Assistant Chat
          </div>
          <div className="flex items-center gap-2 text-xs">
            {appState === "processing" && <Loader2 size={14} className="animate-spin text-cyan-300" />}
            {appState === "speaking" && (
              <span className="flex items-center gap-1 font-medium text-cyan-300">
                <Volume2 size={13} className="animate-bounce" />
                Speaking...
              </span>
            )}
            {/* Auto Voice Response Toggle */}
            <button
              type="button"
              onClick={() => {
                const next = !autoSpeak;
                setAutoSpeak(next);
                saveAutoSpeak(next);
                if (!next) stopSpeaking();
              }}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-all ${
                autoSpeak
                  ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.25)]"
                  : "border-white/10 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70"
              }`}
              title={autoSpeak ? "Auto Voice Response: ON (Golu bol kar jawab dega)" : "Auto Voice Response: OFF (Silent text)"}
            >
              <Volume2 size={12} className={autoSpeak ? "text-cyan-300" : "opacity-40"} />
              <span>{autoSpeak ? "Voice ON" : "Voice OFF"}</span>
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3.5 overscroll-contain">
          {messages.map((message) => {
            const isUser = message.sender === "user";
            const isThisPlaying = playingMessageId === message.id;

            return (
              <div
                key={message.id}
                className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl border px-4 py-3 text-sm leading-relaxed shadow-lg break-words [overflow-wrap:anywhere] ${
                    isUser
                      ? "border-violet-300/20 bg-violet-500/20 text-white rounded-br-sm"
                      : "border-white/10 bg-white/8 text-white/85 rounded-bl-sm"
                  }`}
                >
                  {!isUser && (
                    <div className="mb-2 flex items-center justify-between gap-2 border-b border-white/5 pb-1.5">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-cyan-200/70">
                        <span>
                          {message.provider === "openai"
                            ? "OpenAI"
                            : message.provider === "live"
                              ? "Live data"
                              : message.provider === "gemini"
                                ? "Gemini"
                                : "Golu"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (isThisPlaying) {
                              stopSpeaking();
                            } else {
                              void speakResponse(message.text, message.provider, message.id);
                            }
                          }}
                          className={`rounded-full p-1 text-xs transition-all ${
                            isThisPlaying
                              ? "bg-cyan-400/25 text-cyan-200 ring-1 ring-cyan-400/60"
                              : "text-white/40 hover:bg-white/10 hover:text-cyan-200"
                          }`}
                          title={isThisPlaying ? "Stop voice" : "Listen to response"}
                        >
                          {isThisPlaying ? (
                            <Square size={12} className="fill-current text-cyan-300 animate-pulse" />
                          ) : (
                            <Volume2 size={13} />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                    <LinkifiedText text={message.text} />
                  </div>
                  {message.links?.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {message.links.map((link) => (
                        <a
                          key={link.url}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/15"
                        >
                          <ExternalLink size={14} />
                          {link.label}
                        </a>
                      ))}
                    </div>
                  ) : null}
                  <LiveContextBadge liveContext={message.liveContext} />
                  <SourceList sources={message.sources} />
                  <SpotifyList results={message.spotifyResults} onPlay={handleSpotifyPlay} />
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </motion.section>

      <motion.footer
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: isReady ? 1 : 0, y: isReady ? 0 : 20 }}
        transition={{ duration: 0.9, delay: 0.65 }}
        className="absolute bottom-0 left-0 z-30 flex w-full shrink-0 flex-col items-center justify-center gap-3 px-3 pb-5 md:pb-7"
      >
        <AnimatePresence>
          {showTextInput && (
            <motion.form
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onSubmit={handleTextSubmit}
              className="flex w-full max-w-3xl items-center gap-2 rounded-full border border-white/10 bg-[#0a0a0f]/85 p-1.5 pl-3 shadow-[0_0_30px_rgba(255,255,255,0.06)] backdrop-blur-xl"
            >
              <button
                type="button"
                onClick={isDictating ? stopDictation : startDictation}
                className={`rounded-full p-2.5 transition-colors ${
                  isDictating
                    ? "bg-red-500/20 text-red-300"
                    : "bg-white/5 text-white/70 hover:bg-white/10"
                }`}
                title={isDictating ? "Stop voice input" : "Voice input"}
              >
                {isDictating ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Ask anything..."
                className="min-w-0 flex-1 border-none bg-transparent text-sm text-white outline-none placeholder:text-white/35 md:text-base"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setTextInput((value) => value || "Search latest AI news on Google")}
                className="hidden rounded-full bg-white/5 p-2.5 text-white/60 transition-colors hover:bg-white/10 md:block"
                title="Add a Google search prompt"
              >
                <Search size={18} />
              </button>
              <button
                type="submit"
                disabled={!textInput.trim() || appState === "processing"}
                className="rounded-full bg-violet-500 p-2.5 text-white transition-colors hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-45"
                title="Send"
              >
                {appState === "processing" ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Send size={18} />
                )}
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleListening}
            className={`group relative flex items-center gap-3 rounded-full px-7 py-3.5 font-medium tracking-wide shadow-[0_0_30px_rgba(255,255,255,0.05)] backdrop-blur-xl transition-all duration-300 ${
              isSessionActive
                ? "border border-red-500/50 bg-red-500/20 text-red-300 hover:bg-red-500/30"
                : "border border-white/20 bg-white/5 text-white hover:bg-white/10 hover:shadow-[0_0_40px_rgba(255,255,255,0.1)]"
            }`}
          >
            {isSessionActive ? (
              <>
                <MicOff size={20} />
                <span>End Session</span>
              </>
            ) : (
              <>
                <Mic size={20} className="group-hover:animate-bounce" />
                <span>Live Voice</span>
              </>
            )}
          </button>

          {!isSessionActive && (
            <button
              onClick={() => setShowTextInput(!showTextInput)}
              className="rounded-full border border-white/10 bg-white/5 p-3.5 shadow-[0_0_20px_rgba(255,255,255,0.05)] backdrop-blur-xl transition-colors hover:bg-white/10"
              title="Toggle keyboard"
            >
              <Keyboard size={20} className="opacity-70" />
            </button>
          )}
        </div>
      </motion.footer>
    </div>
  );
}
