// Vercel auto-detects any file under /api as a serverless function.
// This re-exports the existing Express app from server/index.ts, so all
// routes (/api/chat, /api/search, /api/memory, /api/spotify/*) keep working
// without duplicating any route logic.

export { default } from "../server/index";
