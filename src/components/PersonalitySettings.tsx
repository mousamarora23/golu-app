import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserContext, PersonalityMode, loadUserContext, loadPersonality, saveUserContext, savePersonality } from '../services/configService';
import { Settings, X, Plus, Trash2 } from 'lucide-react';

export default function PersonalitySettings() {
  const [isOpen, setIsOpen] = useState(false);
  const [userCtx, setUserCtx] = useState<UserContext>(loadUserContext());
  const [personality, setPersonality] = useState<PersonalityMode>(loadPersonality());
  const [newMemory, setNewMemory] = useState('');

  const personalities: PersonalityMode[] = ['assistant', 'cute', 'flirty', 'professional', 'sarcastic'];

  const handleSave = () => {
    saveUserContext(userCtx);
    savePersonality(personality);
    setIsOpen(false);
    // Realistically you might need a page reload or context update here
    window.location.reload(); 
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

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
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
              className="relative w-full max-w-md max-h-[85vh] overflow-y-auto bg-[#0a0a0f]/90 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl"
            >
              <button 
                onClick={() => setIsOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <X size={20} className="opacity-70" />
              </button>

              <h2 className="text-xl font-medium mb-6 bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                Data & Persona
              </h2>

              <div className="space-y-6 text-sm text-white/80">
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
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-violet-500 transition-colors appearance-none"
                  >
                    <option value="stranger">Stranger (Formal)</option>
                    <option value="acquaintance">Acquaintance (Polite)</option>
                    <option value="friend">Friend (Casual interactions)</option>
                    <option value="close">Close Friend (Playful & direct)</option>
                    <option value="partner">Partner (Deeply affectionate)</option>
                  </select>
                </div>

                {/* Memory Base */}
                <div className="space-y-3">
                  <label className="block text-xs uppercase tracking-wider text-white/50">Persistent Memories</label>
                  
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

                <div className="pt-4">
                  <button 
                    onClick={handleSave}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 font-medium hover:opacity-90 transition-opacity shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                  >
                    Save & Apply Settings
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
