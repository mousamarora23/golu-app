import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

async function main() {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3.1-flash",
            contents: [{ parts: [{ text: "Hello" }] }],
        });
        console.log("gemini-3.1-flash SUCCESS", response.text);
    } catch (e) {
        console.error("gemini-3.1-flash FAILED", e);
    }
}
main();
