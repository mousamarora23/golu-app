import { GoogleGenAI } from "@google/genai";
import { loadPersonality, loadUserContext, getSystemInstruction } from "./configService";
import { getGeminiApiKey } from "./env";

let chatSession: any = null;

export function resetAditiSession() {
  chatSession = null;
}

export async function getAditiResponse(prompt: string, history: { sender: "user" | "golu", text: string }[] = []): Promise<string> {
  try {
    const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
    
    if (!chatSession) {
      const mode = loadPersonality();
      const userCtx = loadUserContext();
      const systemInstruction = getSystemInstruction(mode, userCtx);

      // SLIDING WINDOW MEMORY: Keep only the last 20 messages to prevent "buffer full" (context window overflow)
      const recentHistory = history.slice(-20);
      
      let formattedHistory: any[] = [];
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

      chatSession = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction,
          tools: [{ googleSearch: {} }],
        },
        history: formattedHistory,
      });
    }

    const response = await chatSession.sendMessage({ message: prompt });
    return response.text || "Ugh, fine. I have nothing to say.";
  } catch (error: any) {
    console.error("Gemini Error:", error);
    
    const errObj = typeof error === 'object' && error !== null ? error : {};
    const errMsg = (errObj.message || String(error)).toLowerCase();
    
    if (errMsg.includes('quota') || errMsg.includes('429')) {
      return "⚠️ **Error:** You exceeded your current Gemini API quota. Please try again later or check your API billing details.";
    }
    
    return "Uff, mera dimaag kharab ho gaya hai. Try again later, Mousam.";
  }
}

export async function getAditiAudio(text: string): Promise<string | null> {
  try {
    const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
}

