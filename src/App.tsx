import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, Volume2, VolumeX, Keyboard, Send, Trash2 } from "lucide-react";
import { getAditiResponse, getAditiAudio, resetAditiSession } from "./services/geminiService";
import { processCommand } from "./services/commandService";
import { LiveSessionManager } from "./services/liveService";
import PermissionModal from "./components/PermissionModal";
import LiveAvatar from "./components/LiveAvatar";
import PersonalitySettings from "./components/PersonalitySettings";
import { playPCM } from "./utils/audioUtils";
import { motion, AnimatePresence } from "framer-motion";

type AppState = "idle" | "listening" | "processing" | "speaking";

interface ChatMessage {
  id: string;
  sender: "user" | "golu";
  text: string;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [isReady, setIsReady] = useState(false); // Startup animation state

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem("golu_chat_history");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    }
    return [];
  });
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
    localStorage.setItem("golu_chat_history", JSON.stringify(messages));
  }, [messages]);

  // Startup boot sequence
  useEffect(() => {
    setTimeout(() => setIsReady(true), 2500);
  }, []);

  const [isMuted, setIsMuted] = useState(false);
  const handleGetVolume = useCallback(() => liveSessionRef.current ? liveSessionRef.current.getVolume() : 0, []);

  useEffect(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.isMuted = isMuted;
    }
  }, [isMuted]);

  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isRetryingPermission, setIsRetryingPermission] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);

  const liveSessionRef = useRef<LiveSessionManager | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, appState]);

  const handleTextCommand = useCallback(async (finalTranscript: string) => {
    if (!finalTranscript.trim()) {
      setAppState("idle");
      return;
    }

    setMessages((prev) => [...prev, { id: Date.now().toString(), sender: "user", text: finalTranscript }]);
    
    // If live session is active, send text through it
    if (isSessionActive && liveSessionRef.current) {
      liveSessionRef.current.sendText(finalTranscript);
      return;
    }

    setAppState("processing");

    // 1. Check for browser commands
    const commandResult = processCommand(finalTranscript);

    let responseText = "";

    if (commandResult.isBrowserAction) {
      responseText = commandResult.action;
      const linkHtml = commandResult.url ? ` Click here: <a href="${commandResult.url}" target="_blank" rel="noopener noreferrer" class="text-violet-400 underline hover:text-violet-300">Open Link</a>` : '';
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-a", sender: "golu", text: responseText }]);
      
      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getAditiAudio(responseText);
        if (audioBase64) {
          await playPCM(audioBase64);
        }
      }

      setAppState("idle");
    } else {
      // 2. General Chit-Chat via Gemini
      responseText = await getAditiResponse(finalTranscript, messagesRef.current);
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-a", sender: "golu", text: responseText }]);
      
      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getAditiAudio(responseText);
        if (audioBase64) {
          await playPCM(audioBase64);
        }
      }
      setAppState("idle");
    }
  }, [isMuted, isSessionActive]);

  useEffect(() => {
    return () => {
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = async () => {
    if (isSessionActive) {
      setIsSessionActive(false);
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
      setAppState("idle");
      resetAditiSession();
    } else {
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
          setMessages((prev) => [...prev, { id: Date.now().toString() + "-" + sender, sender, text }]);
        };
        
        session.onCommand = (url) => {
          setMessages((prev) => [...prev, { id: Date.now().toString() + "-a", sender: "golu", text: `I found what you needed. Click here: <a href="${url}" target="_blank" rel="noopener noreferrer" class="text-violet-400 underline">Open Link</a>` }]);
        };

        session.onError = (message) => {
          setMessages((prev) => [...prev, { id: Date.now().toString() + "-err", sender: "golu", text: `⚠️ **Error:** ${message}` }]);
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
              ? "Microphone is busy in another app. Please close Zoom/Meet/Discord and try again."
              : errorName === "NotFoundError"
              ? "No microphone device found. Connect a mic and try again."
              : errorName === "OverconstrainedError"
              ? "Microphone settings are unsupported on this device. Try changing your default mic in system settings."
              : `Unable to start microphone session${error?.message ? `: ${error.message}` : "."}`
            : `Unable to start live session${error?.message ? `: ${error.message}` : "."}`;

          const errorLabel = isMicDeviceError ? "Microphone Error" : "Session Error";

          setMessages((prev) => [
            ...prev,
            {
              id: `${Date.now()}-mic-err`,
              sender: "golu",
              text: `⚠️ **${errorLabel}:** ${friendlyMessage}`,
            },
          ]);
        }

        if (liveSessionRef.current) {
          liveSessionRef.current.stop();
          liveSessionRef.current = null;
        }
        setIsSessionActive(false);
        setAppState("idle");
      }
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
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-permission-retry`,
          sender: "golu",
          text: `⚠️ **Microphone Error:** Still blocked. Please allow microphone in browser site permissions, then try again. ${err?.message ? `(${err.message})` : ""}`,
        },
      ]);
    } finally {
      setIsRetryingPermission(false);
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    
    handleTextCommand(textInput);
    setTextInput("");
    setShowTextInput(false);
  };

  return (
    <div className="h-[100dvh] w-screen bg-[#020205] text-white flex flex-col items-center justify-between font-sans relative overflow-hidden m-0 p-0 selection:bg-cyan-500/30">
      
      <AnimatePresence>
        {!isReady && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, filter: "blur(20px)", scale: 1.1 }}
            transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-[#020205]"
          >
             <div className="relative flex flex-col items-center">
                <motion.div 
                  initial={{ rotate: 0, scale: 1 }}
                  animate={{ rotate: 360, scale: [1, 1.2, 1] }} 
                  transition={{ rotate: { repeat: Infinity, duration: 4, ease: "linear" }, scale: { repeat: Infinity, duration: 2, ease: "easeInOut" } }}
                  className="w-32 h-32 rounded-full border-[1px] border-dashed border-cyan-500/30 mb-8 mix-blend-screen" 
                />
                <motion.div 
                   initial={{ opacity: 0.4 }}
                   animate={{ opacity: [0.4, 1, 0.4] }}
                   transition={{ repeat: Infinity, duration: 2 }}
                   className="text-xs uppercase tracking-[0.5em] text-cyan-500/80 font-mono"
                >
                   Booting Sequence
                </motion.div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[80%] w-1.5 h-1.5 bg-purple-500 rounded-full shadow-[0_0_15px_#a855f7]" />
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

      {/* Cinematic Background Gradients - Deep Dark Sci-Fi */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-cyan-900/10 blur-[140px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-purple-900/10 blur-[140px] rounded-full mix-blend-screen" />
        {/* Distant background stars/particles */}
        <div className="absolute top-[30%] left-[20%] w-1.5 h-1.5 bg-cyan-400 rounded-full blur-[1.5px] opacity-30 animate-pulse" />
        <div className="absolute bottom-[30%] right-[25%] w-2 h-2 bg-purple-400 rounded-full blur-[2px] opacity-20 animate-bounce" />
        <div className="absolute top-[60%] left-[80%] w-1 h-1 bg-cyan-300 rounded-full blur-[1px] opacity-40 animate-ping" />
      </div>

      {/* Header */}
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: isReady ? 1 : 0, y: isReady ? 0 : -20 }}
        transition={{ duration: 1, delay: 0.5 }}
        className="absolute top-0 left-0 w-full flex justify-between items-center z-20 shrink-0 px-6 py-4 md:px-12 md:py-6"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-500 to-pink-500 flex items-center justify-center font-bold text-sm">
            G
          </div>
          <h1 className="text-xl font-serif font-medium tracking-wide opacity-90">Golu</h1>
        </div>
        <div className="flex items-center gap-2">
          <PersonalitySettings />
          {messages.length > 0 && (
            <button
              onClick={() => {
                if (confirm("Are you sure you want to clear the chat history?")) {
                  setMessages([]);
                  resetAditiSession();
                }
              }}
              className="p-2 rounded-full bg-white/5 hover:bg-red-500/20 hover:text-red-400 transition-colors border border-white/10"
              title="Clear Chat History"
            >
              <Trash2 size={18} className="opacity-70" />
            </button>
          )}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeX size={18} className="opacity-70" />
            ) : (
              <Volume2 size={18} className="opacity-70" />
            )}
          </button>
        </div>
      </motion.header>

      {/* Main Content - Visualizer & Chat */}
      <motion.main 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: isReady ? 1 : 0, scale: isReady ? 1 : 0.95 }}
        transition={{ duration: 1.5, delay: 0.2, ease: "easeOut" }}
        className="absolute inset-0 w-full h-full z-10 overflow-hidden pointer-events-none"
      >
        
        {/* Live Animated AI Character System */}
        <div className="absolute inset-0 pb-[15vh] pl-[5%] lg:pl-[10%] w-full h-full flex items-center justify-start lg:justify-center pointer-events-none z-10 lg:-translate-x-[10%]">
          <ErrorBoundary>
            <LiveAvatar appState={appState} getVolume={handleGetVolume} />
          </ErrorBoundary>
        </div>

        {/* Floating UI Particles (Foreground) */}
        <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden z-20">
            <motion.div 
              initial={{ y: 0, x: 0, opacity: 0.1 }}
              animate={{ y: [0, -40, 0], x: [0, 20, 0], opacity: [0.1, 0.7, 0.1] }}
              transition={{ repeat: Infinity, duration: 7, ease: "easeInOut" }}
              className="absolute top-[25%] left-[20%] w-1.5 h-1.5 bg-cyan-300 rounded-full blur-[1px]" 
            />
            <motion.div 
              initial={{ y: 0, x: 0, opacity: 0.1 }}
              animate={{ y: [0, 50, 0], x: [0, -30, 0], opacity: [0.1, 0.6, 0.1] }}
              transition={{ repeat: Infinity, duration: 9, ease: "easeInOut", delay: 2 }}
              className="absolute bottom-[35%] right-[25%] w-2 h-2 bg-purple-400 rounded-full blur-[2px]" 
            />
            <motion.div 
              initial={{ y: 0, x: 0, opacity: 0.2 }}
              animate={{ y: [0, -30, 0], x: [0, -15, 0], opacity: [0.2, 0.9, 0.2] }}
              transition={{ repeat: Infinity, duration: 5, ease: "easeInOut", delay: 1 }}
              className="absolute top-[45%] right-[30%] w-1 h-1 bg-cyan-100 rounded-full blur-[0.5px]" 
            />
            <motion.div 
              initial={{ y: 0, x: 0, opacity: 0 }}
              animate={{ y: [0, -60, 0], x: [0, 25, 0], opacity: [0, 0.5, 0] }}
              transition={{ repeat: Infinity, duration: 8, ease: "easeInOut", delay: 3 }}
              className="absolute bottom-[40%] left-[30%] w-2.5 h-2.5 bg-purple-300 rounded-full blur-[3px]" 
            />
        </div>

        {/* Status Indicators Container (Right side) */}
        <div className="absolute right-6 lg:right-16 top-[40%] -translate-y-1/2 flex flex-col items-end gap-4 z-30 pointer-events-none">
            <AnimatePresence>
              {appState === "listening" && (
                 <motion.div
                   initial={{ opacity: 0, x: 20, filter: "blur(10px)" }}
                   animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                   exit={{ opacity: 0, x: 20, filter: "blur(10px)" }}
                   className="flex items-center gap-3 bg-black/40 px-6 py-3.5 rounded-full backdrop-blur-xl border border-violet-500/30 shadow-[0_0_30px_rgba(139,92,246,0.2)]"
                 >
                   <div className="flex gap-1.5 mr-2">
                     <div className="w-2.5 h-2.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                     <div className="w-2.5 h-2.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                     <div className="w-2.5 h-2.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                   </div>
                   <span className="text-violet-200 text-sm font-medium tracking-widest uppercase">Listening</span>
                 </motion.div>
              )}
              {appState === "processing" && (
                 <motion.div
                   initial={{ opacity: 0, x: 20, filter: "blur(10px)" }}
                   animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                   exit={{ opacity: 0, x: 20, filter: "blur(10px)" }}
                   className="flex items-center gap-3 bg-black/40 px-6 py-3.5 rounded-full backdrop-blur-xl border border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.2)]"
                 >
                   <Loader2 size={20} className="animate-spin text-cyan-400" />
                   <span className="text-cyan-200 text-sm font-medium tracking-widest uppercase">Synthesizing</span>
                 </motion.div>
              )}
            </AnimatePresence>
        </div>
      </motion.main>

      {/* Controls */}
      <motion.footer 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: isReady ? 1 : 0, y: isReady ? 0 : 20 }}
        transition={{ duration: 1, delay: 0.8 }}
        className="absolute bottom-0 left-0 w-full flex flex-col items-center justify-center pb-6 md:pb-8 z-20 shrink-0 gap-4"
      >
        <AnimatePresence>
          {showTextInput && (
            <motion.form 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onSubmit={handleTextSubmit}
              className="w-full max-w-md flex items-center gap-2 bg-[#0a0a0f]/80 border border-white/10 rounded-full p-1 pl-4 backdrop-blur-xl shadow-[0_0_30px_rgba(255,255,255,0.05)]"
            >
              <input 
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type a message to Golu..."
                className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/30 text-sm"
                autoFocus
              />
              <button 
                type="submit"
                disabled={!textInput.trim()}
                className="p-2 rounded-full bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:hover:bg-violet-500 transition-colors"
              >
                <Send size={16} />
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-4">
          <button
            onClick={toggleListening}
            className={`
              group relative flex items-center gap-3 px-8 py-4 rounded-full font-medium tracking-wide transition-all duration-300 shadow-[0_0_30px_rgba(255,255,255,0.05)] backdrop-blur-xl
              ${
                isSessionActive
                  ? "bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30"
                  : "bg-white/5 text-white border border-white/20 hover:bg-white/10 hover:shadow-[0_0_40px_rgba(255,255,255,0.1)]"
              }
            `}
          >
            {isSessionActive ? (
              <>
                <MicOff size={20} />
                <span>End Session</span>
              </>
            ) : (
              <>
                <Mic size={20} className="group-hover:animate-bounce" />
                <span>Start Session</span>
              </>
            )}
          </button>
          
          {!isSessionActive && (
            <button
              onClick={() => setShowTextInput(!showTextInput)}
              className="p-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.05)] backdrop-blur-xl"
              title="Type instead"
            >
              <Keyboard size={20} className="opacity-70" />
            </button>
          )}
        </div>
      </motion.footer>
    </div>
  );
}
