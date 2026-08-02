# Golu AI Assistant

Golu is a Vite + React AI assistant app with:

- ChatGPT/OpenAI responses through a local Express API
- Google Programmable Search support
- Spotify catalog search and Spotify web links
- Existing Gemini fallback chat and Gemini live voice session
- Modern chat UI with persistent history, source cards, Spotify result cards, voice input, and voice response
- Persona and memory settings from the original app

## Prerequisites

- Node.js 20 or newer
- OpenAI API key for ChatGPT responses
- Optional Gemini API key for the existing live voice session and fallback
- Optional Google Programmable Search API key and Search Engine ID
- Optional Spotify Developer app credentials

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the example environment file:

   ```bash
   cp .env.example .env.local
   ```

   On Windows PowerShell:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. Edit `.env.local` and add the credentials you want to enable:

   ```env
   OPENAI_API_KEY="YOUR_OPENAI_API_KEY"
   OPENAI_MODEL="gpt-5-mini"
   OPENAI_FALLBACK_MODELS="gpt-4.1-mini,gpt-4o-mini"
   OPENAI_REASONING_EFFORT="minimal"

   GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
   VITE_GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

   GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"
   GOOGLE_SEARCH_ENGINE_ID="YOUR_PROGRAMMABLE_SEARCH_ENGINE_ID"

   SPOTIFY_CLIENT_ID="YOUR_SPOTIFY_CLIENT_ID"
   SPOTIFY_CLIENT_SECRET="YOUR_SPOTIFY_CLIENT_SECRET"
   SPOTIFY_REDIRECT_URI="http://127.0.0.1:3000/api/spotify/callback"

   PORT="3000"
   APP_URL="http://localhost:3000"
   ```

4. Run the full app:

   ```bash
   npm run dev
   ```

5. Open:

   ```text
   http://loncalhost:3000
   ```

If port 3000 is already busy, set another port before starting:

```powershell
$env:PORT="3001"; npm run dev
```

## Available Scripts

- `npm run dev` starts the Express API and Vite frontend together.
- `npm run dev:client` starts only the legacy client-only Vite app.
- `npm run lint` runs TypeScript checks.
- `npm run build` builds the React frontend.
- `npm run start` serves the built frontend through the Express API.

## Notes

- OpenAI, Google, and Spotify secrets stay server-side in `.env.local`.
- Google search cards require `GOOGLE_API_KEY` and `GOOGLE_SEARCH_ENGINE_ID`; without them, Golu still provides a direct Google search link.
- Spotify catalog cards require `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`; without them, Golu still provides a direct Spotify web search link.
- The original Gemini live voice session remains available through the `Live Voice` button.
- Browser speech synthesis is used for voice responses, with Gemini audio used for Gemini fallback responses when available.
