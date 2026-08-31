import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  loadLongTermMemory,
  loadUserContext,
  loadPersonality,
  loadAutoSpeak,
  saveAutoSpeak,
  loadVoiceName,
  saveVoiceName,
  loadSpeechLang,
  saveSpeechLang,
  removeLongTermMemory,
  saveUserContext,
  savePersonality,
} from '../services/configService';
import type { LongTermMemory, UserContext, PersonalityMode } from '../services/configService';
import { deleteSyncedMemory, syncMemories } from '../services/assistantService';
import { Settings, X, Plus, Trash2, Volume2, Mic, Sparkles } from 'lucide-react';

export default function PersonalitySettings() {
  const [isOpen, setIsOpen] = useState(false);
  const [userCtx, setUserCtx] = useState<UserContext>(loadUserContext());
  const [personality, setPersonality] = useState<PersonalityMode>(loadPersonality());
  const [autoVoice, setAutoVoice] = useState<boolean>(loadAutoSpeak());
  const [voiceName, setVoiceName] = useState<string>(loadVoiceName());
  const [speechLang, setSpeechLang] = useState<string>(loadSpeechLang());
  const [autoMemories, setAutoMemories] = useState<LongTermMemory[]>(loadLongTermMemory());
  const [newMemory, setNewMemory] = useState('');
  const [savedFeedback, setSavedFeedback] = useState(false);

  const personalities: PersonalityMode[] = ['assistant', 'cute', 'flirty', 'professional', 'sarcastic'];
  const voices = [
    { id: 'Kore', label: 'Kore (Calm Female / Default)' },
    { id: 'Aoede', label: 'Aoede (Expressive Female)' },
    { id: 'Fenrir', label: 'Fenrir (Deep Male)' },
    { id: 'Puck', label: 'Puck (Playful Energetic)' },
    { id: 'Charon', label: 'Charon (Smooth Male)' },
  ];

  const handleOpen = () => {
    setUserCtx(loadUserContext());
    setPersonality(loadPersonality());
    setAutoVoice(loadAutoSpeak());
    setVoiceName(loadVoiceName());
    setSpeechLang(loadSpeechLang());
    setAutoMemories(loadLongTermMemory());
    setSavedFeedback(false);
    setIsOpen(true);
  };

  const handleSave = () => {
    saveUserContext(userCtx);
    savePersonality(personality);
    saveAutoSpeak(autoVoice);
    saveVoiceName(voiceName);
    saveSpeechLang(speechLang);

    void syncMemories([...loadLongTermMemory(), ...manualMemoriesForSync(userCtx.memoryContext)]).catch((error) => {
      console.warn('Synced memory save failed:', error);
    });

    setSavedFeedback(true);
    setTimeout(() => {
      setIsOpen(false);
      setSavedFeedback(false);
    }, 600);
  };

  const addMemory = () => {
    if (!newMemory.trim()) return;
    setUserCtx(prev => ({
      ...prev,
      memoryContext: [...prev.memoryContext, newMemory.trim()]
    }));
    setNewMemory('');
  };

  const removeMemory = (index: number) => {
    setUserCtx(prev => ({
      ...prev,
      memoryContext: prev.memoryContext.filter((_, i) => i !== index)
    }));
  };

  const removeAutoMemory = (id: string) => {
    removeLongTermMemory(id);
    setAutoMemories(loadLongTermMemory());
    void deleteSyncedMemory(id).catch((error) => {
      console.warn('Synced memory delete failed:', error);
    });
  };

  const manualMemoriesForSync = (items: string[]): LongTermMemory[] => (
    items
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({
        id: `manual_${simpleHash(text)}`,
        category: 'personalization',
        text,
        updatedAt: new Date().toISOString(),
        source: 'manual',
      }))
  );

  const simpleHash = (text: string) => {
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    }
    return hash.toString(36);
  };

  return (
    <>
      <button 
        onClick={handleOpen}
        className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
        title="Settings & Persona"
      >
        <Settings size={18} className="opacity-70" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md max-h-[85vh] overflow-y-auto bg-[#0a0a0f]/95 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl"
            >
              <button 
                onClick={() => setIsOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <X size={20} className="opacity-70" />
              </button>

              <h2 className="text-xl font-medium mb-6 bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-2">
                <Sparkles size={20} className="text-cyan-400" />
                Settings & Persona
              </h2>

              <div className="space-y-6 text-sm text-white/80">
                {/* Voice & Speaking Mode */}
                <div className="space-y-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-medium text-cyan-200">
                      <Volume2 size={16} />
                      <span>Auto Voice Response for Chat</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAutoVoice(!autoVoice)}
                      className={`relative h-6 w-11 rounded-full transition-colors ${
                        autoVoice ? 'bg-cyan-500' : 'bg-white/15'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          autoVoice ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-xs text-white/50">
                    When enabled, Golu will speak chat replies out loud automatically.
                  </p>

                  <div className="pt-2 space-y-2">
                    <label className="block text-xs uppercase tracking-wider text-cyan-200/70">AI Voice (Gemini TTS)</label>
                    <select
                      value={voiceName}
                      onChange={(e) => setVoiceName(e.target.value)}
                      className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-cyan-400 text-white"
                    >
                      {voices.map((v) => (
                        <option key={v.id} value={v.id} className="bg-[#0e0e14] text-white">
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs uppercase tracking-wider text-cyan-200/70">Speech Dictation Language</label>
                    <select
                      value={speechLang}
                      onChange={(e) => setSpeechLang(e.target.value)}
                      className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-cyan-400 text-white"
                    >
                      <option value="hi-IN" className="bg-[#0e0e14]">Hindi / Hinglish (hi-IN)</option>
                      <option value="en-IN" className="bg-[#0e0e14]">Indian English (en-IN)</option>
                      <option value="en-US" className="bg-[#0e0e14]">US English (en-US)</option>
                    </select>
                  </div>
                </div>

                {/* Personality */}
                <div className="space-y-2">
                  <label className="block text-xs uppercase tracking-wider text-white/50">Persona Mode</label>
                  <div className="flex flex-wrap gap-2">
                    {personalities.map(p => (
                      <button
                        key={p}
                        onClick={() => setPersonality(p)}
                        className={`px-4 py-2 rounded-full border transition-all ${
                          personality === p 
                          ? 'border-violet-500 bg-violet-500/20 text-violet-200' 
                          : 'border-white/10 bg-white/5 hover:bg-white/10'
                        }`}
                      >
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* User Info */}
                <div className="space-y-2">
                  <label className="block text-xs uppercase tracking-wider text-white/50">Your Name</label>
                  <input 
                    type="text" 
                    value={userCtx.userName}
                    onChange={(e) => setUserCtx(p => ({ ...p, userName: e.target.value }))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-violet-500 transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs uppercase tracking-wider text-white/50">Relationship Stage</label>
                  <select 
                    value={userCtx.relationshipStage}
                    onChange={(e) => setUserCtx(p => ({ ...p, relationshipStage: e.target.value as any }))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-violet-500 transition-colors"
                  >
                    <option value="stranger" className="bg-[#0e0e14]">Stranger (Formal)</option>
                    <option value="acquaintance" className="bg-[#0e0e14]">Acquaintance (Polite)</option>
                    <option value="friend" className="bg-[#0e0e14]">Friend (Casual interactions)</option>
                    <option value="close" className="bg-[#0e0e14]">Close Friend (Playful & direct)</option>
                    <option value="partner" className="bg-[#0e0e14]">Partner (Deeply affectionate)</option>
                  </select>
                </div>

                {/* Memory Base */}
                <div className="space-y-3">
                  <label className="block text-xs uppercase tracking-wider text-white/50">Manual Persistent Memories</label>
                  
                  <div className="space-y-2">
                    {userCtx.memoryContext.map((mem, i) => (
                      <div key={i} className="flex items-center gap-2 bg-white/5 rounded-lg p-2 pl-3">
                        <span className="flex-1 text-xs">{mem}</span>
                        <button onClick={() => removeMemory(i)} className="p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded-md transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {userCtx.memoryContext.length === 0 && (
                      <p className="text-xs text-white/30 italic">No memories saved yet.</p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={newMemory}
                      onChange={(e) => setNewMemory(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addMemory()}
                      placeholder="e.g. I love sci-fi movies"
                      className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-xs outline-none focus:border-cyan-500 transition-colors"
                    />
                    <button onClick={addMemory} className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors border border-cyan-500/30">
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block text-xs uppercase tracking-wider text-white/50">Auto-Learned Memories</label>
                  <div className="space-y-2">
                    {autoMemories.map((mem) => (
                      <div key={mem.id} className="flex items-start gap-2 bg-cyan-500/5 border border-cyan-500/10 rounded-lg p-2 pl-3">
                        <div className="flex-1">
                          <span className="block text-xs text-white/80">{mem.text}</span>
                          <span className="mt-1 block text-[10px] uppercase tracking-wider text-cyan-200/45">{mem.category}</span>
                        </div>
                        <button onClick={() => removeAutoMemory(mem.id)} className="p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded-md transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {autoMemories.length === 0 && (
                      <p className="text-xs text-white/30 italic">No auto-learned memories yet. Golu will learn useful long-term details naturally during chat.</p>
                    )}
                  </div>
                </div>

                <div className="pt-4">
                  <button 
                    onClick={handleSave}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 font-medium hover:opacity-90 transition-opacity shadow-[0_0_20px_rgba(139,92,246,0.3)] flex items-center justify-center gap-2"
                  >
                    {savedFeedback ? "Saved & Applied!" : "Save & Apply Settings"}
                  </button>
                </div>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
