import React from "react";
import { motion } from "framer-motion";
import { MicOff } from "lucide-react";

interface Props {
  onClose: () => void;
  onRetry?: () => void | Promise<void>;
  isRetrying?: boolean;
}

export default function PermissionModal({ onClose, onRetry, isRetrying = false }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative flex w-full max-w-md flex-col items-center overflow-hidden rounded-3xl border border-white/10 bg-[#111] p-8 text-center shadow-2xl"
      >
        <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-red-500 to-orange-500" />

        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
          <MicOff size={32} className="text-red-400" />
        </div>

        <h2 className="mb-3 text-2xl font-medium text-white">Microphone Blocked</h2>
        <p className="mb-6 text-sm leading-relaxed text-white/60">
          Your browser has blocked microphone access for this site. Golu cannot hear you until
          you allow it.
        </p>

        <div className="mb-8 w-full rounded-xl border border-white/10 bg-white/5 p-4 text-left">
          <p className="mb-2 text-sm font-medium text-white/80">How to fix this:</p>
          <ol className="list-decimal space-y-2 pl-4 text-xs text-white/60">
            <li>
              Click the <strong>lock icon</strong> or <strong>site settings icon</strong> next
              to the URL bar.
            </li>
            <li>
              Find <strong>Microphone</strong> and change it to <strong>Allow</strong>.
            </li>
            <li>Refresh this page.</li>
          </ol>
        </div>

        <div className="flex w-full flex-col gap-3">
          {onRetry && (
            <button
              onClick={onRetry}
              disabled={isRetrying}
              className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-medium text-black transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRetrying ? "Checking Microphone..." : "Retry Microphone Access"}
            </button>
          )}
          <button
            onClick={() => window.location.reload()}
            className="w-full rounded-xl bg-white px-4 py-3 font-medium text-black transition-colors hover:bg-gray-200"
          >
            Refresh Page
          </button>
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-white/5 px-4 py-3 font-medium text-white/70 transition-colors hover:bg-white/10"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}
