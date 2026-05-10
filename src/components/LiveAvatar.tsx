import React, { useEffect, useState, useRef, useMemo } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { loadPersonality } from '../services/configService';

interface Props {
  appState: 'idle' | 'listening' | 'processing' | 'speaking';
  getVolume?: () => number;
}

type Emotion = 'neutral' | 'happy' | 'shy' | 'excited' | 'sleepy' | 'curious' | 'thinking';

export default React.memo(function LiveAvatar({ appState, getVolume }: Props) {
  const isSpeaking = appState === 'speaking';
  const isListening = appState === 'listening';
  const isProcessing = appState === 'processing';

  const mouthOpen = useMotionValue(0);
  const blink = useMotionValue(1);
  const voiceVolume = useMotionValue(0); // Simulated volume

  const [emotion, setEmotion] = useState<Emotion>('neutral');
  const personalityMode = useRef(loadPersonality());

  // Eye tracking & Parallax setup
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springX = useSpring(mouseX, { stiffness: 40, damping: 25 });
  const springY = useSpring(mouseY, { stiffness: 40, damping: 25 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      mouseX.set((e.clientX - centerX) / centerX); // -1 to 1
      mouseY.set((e.clientY - centerY) / centerY); // -1 to 1
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  // Layer Depths for Parallax
  const bgOffsetX = useTransform(springX, [-1, 1], [-20, 20]);
  const bgOffsetY = useTransform(springY, [-1, 1], [-10, 10]);
  
  const midOffsetX = useTransform(springX, [-1, 1], [-10, 10]);
  const midOffsetY = useTransform(springY, [-1, 1], [-5, 5]);

  const fgOffsetX = useTransform(springX, [-1, 1], [30, -30]);
  const fgOffsetY = useTransform(springY, [-1, 1], [15, -15]);

  const eyeOffsetX = useTransform(springX, [-1, 1], [-10, 10]);
  const eyeOffsetY = useTransform(springY, [-1, 1], [-6, 6]);
  const headOffsetX = useTransform(springX, [-1, 1], [-15, 15]);
  const headOffsetY = useTransform(springY, [-1, 1], [-8, 8]);
  const headRotateZ = useTransform(springX, [-1, 1], [-3, 3]);

  // Emotion Logic
  useEffect(() => {
    if (isProcessing) {
      setEmotion('thinking');
      return;
    }
    if (isListening) {
      setEmotion('curious');
      return;
    }
    
    let emotions: Emotion[] = [];
    
    switch (personalityMode.current) {
      case 'cute':
        emotions = isSpeaking ? ['excited', 'happy', 'shy'] : ['shy', 'happy', 'neutral', 'sleepy'];
        break;
      case 'flirty':
        emotions = isSpeaking ? ['happy', 'excited', 'shy'] : ['curious', 'happy', 'neutral', 'shy'];
        break;
      case 'professional':
        emotions = isSpeaking ? ['neutral', 'happy'] : ['neutral', 'thinking', 'curious'];
        break;
      case 'sarcastic':
        emotions = isSpeaking ? ['neutral', 'sleepy'] : ['sleepy', 'neutral', 'thinking'];
        break;
      default:
        emotions = isSpeaking ? ['excited', 'happy', 'neutral'] : ['neutral', 'sleepy', 'shy', 'happy'];
        break;
    }
      
    setEmotion(emotions[0]);
    const interval = setInterval(() => {
       const next = emotions[Math.floor(Math.random() * emotions.length)];
       setEmotion(next);
    }, 4500 + Math.random() * 3000);
    return () => clearInterval(interval);
  }, [isSpeaking, isListening, isProcessing]);

  // Lip-sync / Volume simulation
  useEffect(() => {
    let interval: any;
    let animationFrame: number;

    if (isSpeaking) {
      if (getVolume) {
        let lastMouth = 0;
        const loop = () => {
          const rawVol = getVolume();
          const targetVol = Math.max(0, Math.min(1, rawVol * 2.5)); // Boost slightly
          
          // Smooth the mouth opening slightly
          lastMouth += (targetVol - lastMouth) * 0.4;
          
          voiceVolume.set(lastMouth);
          const excitementBooster = emotion === 'excited' ? 1.5 : 1;
          mouthOpen.set((lastMouth * 16 + 0.5) * excitementBooster);
          
          animationFrame = requestAnimationFrame(loop);
        };
        loop();
      } else {
        interval = setInterval(() => {
          const vol = Math.random();
          voiceVolume.set(vol);
          const excitementBooster = emotion === 'excited' ? 1.5 : 1;
          mouthOpen.set((vol * 14 + 1) * excitementBooster);
        }, 70); 
      }
    } else if (isProcessing) {
      mouthOpen.set(0.5); 
      voiceVolume.set(0);
    } else {
      mouthOpen.set(emotion === 'happy' || emotion === 'shy' ? 0.2 : 0); 
      voiceVolume.set(0);
    }
    
    return () => {
      if (interval) clearInterval(interval);
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [isSpeaking, isProcessing, emotion, getVolume]);

  // Natural Blink & Idle states
  useEffect(() => {
    let timeouts: any[] = [];
    const clearAll = () => timeouts.forEach(clearTimeout);

    const blinkLoop = () => {
      blink.set(0.05);
      const isSlowBlink = emotion === 'sleepy' || emotion === 'thinking';
      
      timeouts.push(setTimeout(() => blink.set(1), isSlowBlink ? 250 : 100));
      
      if (!isSlowBlink && Math.random() > 0.7) {
         timeouts.push(setTimeout(() => {
           blink.set(0.05);
           timeouts.push(setTimeout(() => blink.set(1), 100));
         }, 250 + Math.random() * 100));
      }
      const nextDelay = isSlowBlink ? 5000 + Math.random() * 3000 : 2500 + Math.random() * 3000;
      timeouts.push(setTimeout(blinkLoop, nextDelay));
    };
    timeouts.push(setTimeout(blinkLoop, 2000));
    
    return clearAll;
  }, [emotion]);

  // Auto-audio context removed to avoid console warnings

  // Dynamic Expressions
  let mouthCurveYBase = 330;
  if (emotion === 'happy' || emotion === 'excited') mouthCurveYBase = 335;
  if (emotion === 'shy') mouthCurveYBase = 331;
  if (emotion === 'curious') mouthCurveYBase = 328;
  
  const mouthWidthBase = emotion === 'sleepy' ? 6 : emotion === 'excited' ? 14 : 12;

  const mouthCurveY = useMotionValue(mouthCurveYBase);
  const mouthWidth = useMotionValue(mouthWidthBase);
  useEffect(() => {
    mouthCurveY.set(mouthCurveYBase);
    mouthWidth.set(mouthWidthBase);
  }, [mouthCurveYBase, mouthWidthBase]);
  
  const mouthPath = useTransform([mouthOpen, mouthCurveY, mouthWidth], ([m, cY, w]) => {
    const mo = m as number;
    const curveY = cY as number;
    const width = w as number;
    return mo > 1
      ? `M ${250 - width} 330 Q 250 ${330 - mo * 0.4} ${250 + width} 330 Q 250 ${330 + mo} ${250 - width} 330`
      : `M ${250 - width} 330 Q 250 ${curveY} ${250 + width} 330`;
  }) as any;
  
  const mouthFill = useTransform(mouthOpen, m => m > 1 ? "#881337" : "transparent");
  const showInnerMouth = useTransform(mouthOpen, m => m > 4 ? 0.9 : 0);
  const showThroat = useTransform(mouthOpen, m => m > 8 ? 1 : 0);
  
  const innerMouthPath = useTransform(mouthWidth, w => {
    const width = w as number;
    return `M ${250 - width + 3} 330 Q 250 332 ${250 + width - 3} 330 Q 250 ${330 + 3} ${250 - width + 3} 330`;
  });
  
  const throatPath = useTransform(mouthOpen, m => `M 243 ${330 + m * 0.4} Q 250 ${325 + m * 0.4} 257 ${330 + m * 0.4} Z`) as any;

  const getBrowShape = (side: 'left' | 'right') => {
    const isL = side === 'left';
    let y = 245;
    let angle = isL ? -5 : 5;
    
    if (emotion === 'shy') {
       y = 240;
       angle = isL ? -15 : 15;
    } else if (emotion === 'excited') {
       y = 238;
       angle = isL ? 10 : -10;
    } else if (emotion === 'thinking') {
       y = 248;
       angle = isL ? 5 : -5;
    } else if (emotion === 'sleepy') {
       y = 250;
       angle = 0;
    } else if (emotion === 'happy') {
       y = 240;
       angle = isL ? -5 : 5;
    } else if (emotion === 'curious') {
       y = isL ? 238 : 248;
       angle = isL ? -10 : 5;
    }
    return { y, rotate: angle };
  };
  
  const browL = getBrowShape('left');
  const browR = getBrowShape('right');

  const eyeGlowOpacity = isSpeaking ? 0.9 : (emotion === 'thinking' ? 1 : 0.6);
  const targetEyeScaleYBase = emotion === 'sleepy' ? 0.6 : emotion === 'shy' ? 0.9 : emotion === 'excited' ? 1.05 : 1;
  const targetEyeScaleY = useMotionValue(targetEyeScaleYBase);
  useEffect(() => {
    targetEyeScaleY.set(targetEyeScaleYBase);
  }, [targetEyeScaleYBase]);
  
  const eyeScaleY = useTransform([blink, targetEyeScaleY], ([b, target]) => (b as number) * (target as number));
  
  const blushOpacity = emotion === 'shy' ? 0.8 : emotion === 'happy' ? 0.6 : 0.3;
  const eyeLashOffset = emotion === 'sleepy' ? 5 : 0;
  
  // Particles
  const particles = useMemo(() => Array.from({ length: 15 }).map((_, i) => ({
    id: i,
    x: Math.random() * 200 - 100,
    delay: Math.random() * 5,
    duration: Math.random() * 4 + 4,
    size: Math.random() * 4 + 2
  })), []);

  // Scanning lines UI text
  const bgScale = useTransform(voiceVolume, v => isSpeaking ? 1.1 + v * 0.1 : 1);
  const bgOpacity = useTransform(voiceVolume, v => isSpeaking ? 0.4 + v * 0.2 : isProcessing ? 0.3 : 0.15);

  return (
    <div className="relative w-full h-[75vh] min-h-[500px] flex justify-center items-end pointer-events-none z-10 lg:-translate-x-[5%]">
      
      {/* Background Holographic Aura */}
      <motion.div
        initial={{ opacity: 0.15, scale: 1 }}
        style={{ x: bgOffsetX, y: bgOffsetY, scale: bgScale, opacity: bgOpacity }}
        animate={{
          backgroundColor: isSpeaking ? '#22d3ee' : isProcessing ? '#f472b6' : '#a855f7'
        }}
        transition={{ repeat: Infinity, duration: isSpeaking ? 1.5 : 3, ease: "easeInOut" }}
        className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[70%] max-w-[500px] aspect-square blur-[130px] rounded-full mix-blend-screen"
      />
      <motion.div
        initial={{ opacity: 0.1, scale: 1 }}
        style={{ x: midOffsetX, y: midOffsetY }}
        animate={{
          scale: isListening ? [1, 1.15, 1] : 1,
          opacity: isListening ? 0.4 : 0.1,
          backgroundColor: isListening ? '#a855f7' : '#22d3ee'
        }}
        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[50%] max-w-[400px] aspect-square blur-[100px] rounded-full mix-blend-screen"
      />

      {/* Holographic UI Rings */}
      <motion.div 
         initial={{ rotate: 0, scale: 1 }}
         style={{ x: fgOffsetX, y: fgOffsetY }}
         className="absolute bottom-[20%] left-1/2 -translate-x-1/2 w-[120%] max-w-[800px] aspect-square border-[1px] border-cyan-400/20 rounded-full mix-blend-screen border-dashed"
         animate={{ rotate: 360, scale: [1, 1.02, 1] }}
         transition={{ rotate: { repeat: Infinity, duration: 40, ease: "linear" }, scale: { repeat: Infinity, duration: 5, ease: "easeInOut" } }}
      />
      <motion.div 
         initial={{ rotate: 0, scale: 1 }}
         style={{ x: fgOffsetX, y: fgOffsetY }}
         className="absolute bottom-[22%] left-1/2 -translate-x-1/2 w-[100%] max-w-[650px] aspect-square border-[2px] border-purple-500/10 rounded-full mix-blend-screen"
         animate={{ rotate: -360 }}
         transition={{ repeat: Infinity, duration: 60, ease: "linear" }}
      />

      {/* Holographic Particles & Data Lines */}
      <div className="absolute inset-0 overflow-hidden mix-blend-screen pointer-events-none flex justify-center items-end pb-20">
        {particles.map(p => (
           <motion.div
             key={p.id}
             initial={{ opacity: 0, scale: 1 }}
             animate={{
               y: [0, -400],
               opacity: [0, 0.8, 0],
               x: [p.x, p.x + (Math.random() * 40 - 20)],
               rotate: isProcessing ? 180 : 0
             }}
             transition={{
               y: { repeat: Infinity, duration: p.duration, delay: p.delay, ease: "easeOut" },
               opacity: { repeat: Infinity, duration: p.duration, delay: p.delay, ease: "easeOut" },
               x: { repeat: Infinity, duration: p.duration, delay: p.delay, ease: "easeInOut" },
               rotate: { repeat: Infinity, duration: p.duration * 2, ease: "linear" }
             }}
             className="absolute rounded-full blur-[1px]"
             style={{ 
               width: p.size, height: p.size, 
               backgroundColor: p.id % 2 === 0 ? '#22d3ee' : '#a855f7',
               boxShadow: `0 0 10px ${p.id % 2 === 0 ? '#22d3ee' : '#a855f7'}`
             }}
           />
        ))}


      </div>
      
      {/* Main Avatar SVG Canvas */}
      <motion.div
        animate={{
          y: [0, -12, 0], // Smooth natural human breathing
        }}
        transition={{
          repeat: Infinity, 
          duration: 4.5, 
          ease: "easeInOut"
        }}
        className="relative w-[90%] max-w-[650px] h-[95%]"
      >
        <svg viewBox="0 0 500 600" className="w-full h-full drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)] mix-blend-screen origin-bottom scale-[1.08]">
          <defs>
            {/* Skin Gradients - Softer and more natural */}
            <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fff1f2" />
              <stop offset="80%" stopColor="#ffe4e6" />
              <stop offset="100%" stopColor="#fecdd3" />
            </linearGradient>
            <linearGradient id="skinShadow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fda4af" />
              <stop offset="100%" stopColor="#fb7185" />
            </linearGradient>
            
            {/* Hair Gradients - Cyberpunk Anime flow */}
            <linearGradient id="hairDark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1e1b4b" />
              <stop offset="100%" stopColor="#3b0764" />
            </linearGradient>
            <linearGradient id="hairLight" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6d28d9" />
              <stop offset="100%" stopColor="#c084fc" />
            </linearGradient>
            <linearGradient id="hairHighlight" x1="0" y1="0" x2="0" y2="1">
               <stop offset="0%" stopColor="#d946ef" />
               <stop offset="100%" stopColor="#2dd4bf" />
            </linearGradient>
            <linearGradient id="hairCyan" x1="0" y1="0" x2="0" y2="1">
               <stop offset="0%" stopColor="#0ea5e9" />
               <stop offset="100%" stopColor="#2dd4bf" />
            </linearGradient>

            {/* Eyes & Accents */}
            <radialGradient id="irisL">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="50%" stopColor="#6366f1" />
              <stop offset="85%" stopColor="#312e81" />
              <stop offset="100%" stopColor="#0f172a" />
            </radialGradient>
            
            <radialGradient id="blush">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="suit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f172a" />
              <stop offset="70%" stopColor="#020617" />
              <stop offset="100%" stopColor="#000000" />
            </linearGradient>
            <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.5"/>
              <stop offset="100%" stopColor="#c084fc" stopOpacity="0.2"/>
            </linearGradient>
          </defs>

          {/* BACKGROUND HAIR LAYER */}
          <motion.g 
             initial={{ rotate: 0 }}
             animate={{ rotate: isSpeaking ? [0, 1.5, -1.5, 0] : [0, 0.5, -0.5, 0] }} 
             transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }} 
             className="origin-[250px_200px]"
          >
             {/* Large flowing back hair */}
             <path d="M 180 150 C 40 320, 70 520, 20 620 L 480 620 C 430 520, 460 320, 320 150 Z" fill="url(#hairDark)" />
             <path d="M 150 180 C 80 370, 100 520, 60 620 L 140 620 C 170 520, 130 420, 200 300 Z" fill="url(#hairLight)" />
             <path d="M 350 180 C 420 370, 400 520, 440 620 L 360 620 C 330 520, 370 420, 300 300 Z" fill="url(#hairLight)" />
             {/* Neon inner hair accents */}
             <path d="M 170 200 C 130 350, 140 480, 110 580" stroke="url(#hairHighlight)" strokeWidth="4" fill="none" opacity="0.4" style={{ filter: 'drop-shadow(0 0 5px #d946ef)' }} />
             <path d="M 330 200 C 370 350, 360 480, 390 580" stroke="url(#hairCyan)" strokeWidth="4" fill="none" opacity="0.4" style={{ filter: 'drop-shadow(0 0 5px #2dd4bf)' }} />
          </motion.g>

          {/* SHOULDER AND UPPER BODY MOTION */}
          <motion.g
            initial={{ y: 0, rotate: 0 }}
            animate={{
              y: isSpeaking ? [0, -1, 0, 1, 0] : 0,
              rotate: isListening ? 0.5 : 0
            }}
            transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
            className="origin-[250px_600px]"
          >
            {/* NECK */}
            <path d="M 233 340 L 233 410 C 180 420, 130 440, 80 500 L 80 600 L 420 600 L 420 500 C 370 440, 320 420, 267 410 L 267 340 Z" fill="url(#skinShadow)" />
            <path d="M 233 380 Q 250 395 267 380" stroke="#fda4af" strokeWidth="1.5" fill="none" opacity="0.7"/>
            {/* Collarbones */}
            <path d="M 230 405 C 200 410, 170 420, 140 440 M 270 405 C 300 410, 330 420, 360 440" stroke="#fb7185" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.5" />
            
            {/* CYBERPUNK CLOTHING / SUIT */}
            <path d="M 233 420 L 80 500 L 80 600 L 420 600 L 420 500 L 267 420 L 250 480 Z" fill="url(#suit)" stroke="#3b82f6" strokeWidth="3" />
            {/* High collar inner trim */}
            <path d="M 233 420 L 250 480 L 267 420" fill="none" stroke="#22d3ee" strokeWidth="2" />
            
            {/* Holographic Glowing Lapels/Armor lines */}
            <path d="M 230 420 L 130 540 M 270 420 L 370 540" stroke="#2dd4bf" strokeWidth="5" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 8px rgba(45,212,191,0.9))' }} />
            <path d="M 210 455 L 250 485 L 290 455 M 250 485 L 250 600" stroke="#e879f9" strokeWidth="3" fill="none" style={{ filter: 'drop-shadow(0 0 10px rgba(232,121,249,0.9))' }} />
            
            {/* Tech details on suit */}
            <circle cx="180" cy="500" r="15" fill="#0f172a" stroke="#2dd4bf" strokeWidth="2" />
            <circle cx="180" cy="500" r="6" fill="#2dd4bf" style={{ filter: 'drop-shadow(0 0 5px #2dd4bf)' }} />
            <circle cx="320" cy="500" r="15" fill="#0f172a" stroke="#e879f9" strokeWidth="2" />
            <circle cx="320" cy="500" r="6" fill="#e879f9" style={{ filter: 'drop-shadow(0 0 5px #e879f9)' }} />

            {/* Translucent Tech Shoulders / Cloak */}
            <path d="M 80 500 C 110 460, 160 440, 200 440 L 160 520 Z M 420 500 C 390 460, 340 440, 300 440 L 340 520 Z" fill="url(#glass)" stroke="#22d3ee" strokeWidth="1.5" />
          </motion.g>

          {/* HEAD GROUP & EYE TRACKING */}
          <motion.g 
            initial={{ rotate: 0, y: 0 }}
            style={{ x: headOffsetX, y: headOffsetY, rotateZ: headRotateZ }}
            animate={{
              rotate: isListening ? 3 : isProcessing ? -1 : 0,
              y: isSpeaking ? [0, -2, 0] : 0,
            }}
            transition={{ y: { repeat: Infinity, duration: 1.2, ease: "easeInOut" }, rotate: { type: "spring", stiffness: 60 } }}
            className="origin-[250px_350px]"
          >
            {/* FACE SHAPE */}
            <path d="M 160 190 C 160 300, 215 370, 250 375 C 285 370, 340 300, 340 190 Z" fill="url(#skin)" />
            {/* Soft cheek shadows */}
            <path d="M 160 250 C 180 320, 215 350, 250 375 C 210 340, 165 300, 160 250 Z" fill="#fda4af" opacity="0.4" />
            <path d="M 340 250 C 320 320, 285 350, 250 375 C 290 340, 335 300, 340 250 Z" fill="#fda4af" opacity="0.4" />

            {/* NOSE */}
            <path d="M 250 302 Q 253 308, 247 311" stroke="#f43f5e" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.7" />
            {/* Nose highlight */}
            <circle cx="250" cy="295" r="1.5" fill="#ffffff" opacity="0.6" />

            {/* BLUSH */}
            <motion.ellipse initial={{ opacity: 0 }} animate={{ opacity: blushOpacity }} cx="195" cy="305" rx="25" ry="14" fill="url(#blush)" />
            <motion.ellipse initial={{ opacity: 0 }} animate={{ opacity: blushOpacity }} cx="305" cy="305" rx="25" ry="14" fill="url(#blush)" />

            {/* MOUTH */}
            <motion.path 
              d={mouthPath} 
              style={{ fill: mouthFill }}
              stroke="#e11d48"
              strokeWidth="2"
              strokeLinecap="round" 
            />
            {/* Inner Tongue & Teeth */}
            <motion.path 
              d={innerMouthPath as any} 
              fill="#ffffff" 
              style={{ opacity: showInnerMouth }} 
            />
            <motion.path 
              d={throatPath} 
              fill="#fb7185" 
              style={{ opacity: showThroat }} 
            />

            {/* ---------- EYES & TRACKING ---------- */}
            <motion.g style={{ x: eyeOffsetX, y: eyeOffsetY }}>
              {/* LEFT EYE */}
              <motion.g style={{ scaleY: eyeScaleY }} className="origin-[205px_275px]">
                {/* Sclera */}
                <path d="M 175 275 C 190 255, 220 255, 232 275 C 220 288, 190 288, 175 275 Z" fill="#ffffff" />
                {/* Iris Base */}
                <motion.ellipse initial={{ opacity: 0.6 }} animate={{ opacity: eyeGlowOpacity }} cx="205" cy="275" rx="16" ry="20" fill="url(#irisL)" />
                {/* Dark rim & depth */}
                <ellipse cx="205" cy="275" rx="16" ry="20" fill="none" stroke="#312e81" strokeWidth="2.5" />
                <ellipse cx="205" cy="270" rx="12" ry="15" fill="none" stroke="#4f46e5" strokeWidth="1" opacity="0.6"/>
                {/* Pupil */}
                <ellipse cx="205" cy="275" rx="5" ry="10" fill="#020617" />
                {/* Glow ring in pupil */}
                <ellipse cx="205" cy="285" rx="9" ry="4" fill="#67e8f9" opacity="0.8" style={{ filter: 'drop-shadow(0 0 3px #67e8f9)' }} />
                {/* Highlights */}
                <circle cx="196" cy="264" r="5" fill="#ffffff" />
                <ellipse cx="215" cy="282" rx="3.5" ry="2" fill="#cffafe" opacity="0.9" />
                {/* Processing Spin Ring */}
                {isProcessing && <motion.circle cx="205" cy="275" r="12" stroke="#f0abfc" strokeWidth="2" fill="none" strokeDasharray="5 5" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }} style={{ transformOrigin: '205px 275px' }} />}
              </motion.g>

              {/* RIGHT EYE */}
              <motion.g style={{ scaleY: eyeScaleY }} className="origin-[295px_275px]">
                {/* Sclera */}
                <path d="M 325 275 C 310 255, 280 255, 268 275 C 280 288, 310 288, 325 275 Z" fill="#ffffff" />
                {/* Iris Base */}
                <motion.ellipse initial={{ opacity: 0.6 }} animate={{ opacity: eyeGlowOpacity }} cx="295" cy="275" rx="16" ry="20" fill="url(#irisL)" />
                {/* Dark rim & depth */}
                <ellipse cx="295" cy="275" rx="16" ry="20" fill="none" stroke="#312e81" strokeWidth="2.5" />
                <ellipse cx="295" cy="270" rx="12" ry="15" fill="none" stroke="#4f46e5" strokeWidth="1" opacity="0.6"/>
                {/* Pupil */}
                <ellipse cx="295" cy="275" rx="5" ry="10" fill="#020617" />
                {/* Glow ring in pupil */}
                <ellipse cx="295" cy="285" rx="9" ry="4" fill="#67e8f9" opacity="0.8" style={{ filter: 'drop-shadow(0 0 3px #67e8f9)' }} />
                {/* Highlights */}
                <circle cx="286" cy="264" r="5" fill="#ffffff" />
                <ellipse cx="305" cy="282" rx="3.5" ry="2" fill="#cffafe" opacity="0.9" />
                {/* Processing Spin Ring */}
                {isProcessing && <motion.circle cx="295" cy="275" r="12" stroke="#f0abfc" strokeWidth="2" fill="none" strokeDasharray="5 5" animate={{ rotate: -360 }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }} style={{ transformOrigin: '295px 275px' }} />}
              </motion.g>
            </motion.g>

            {/* LASHES AND BROWS (Fixed on Face, above eye tracking) */}
            <motion.g style={{ scaleY: eyeScaleY, y: eyeLashOffset }} className="origin-[250px_275px]">
               {/* Left Eyelash */}
               <path d="M 165 275 C 185 245, 225 245, 240 275 C 225 260, 195 260, 165 275 Z" fill="#0f172a" />
               <path d="M 165 275 L 153 285 M 240 275 L 246 282" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" />
               <path d="M 160 270 L 150 272" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
               {/* Under eye crease/line */}
               <path d="M 185 288 Q 205 292 225 288" stroke="#fb7185" strokeWidth="1" fill="none" opacity="0.6" strokeLinecap="round"/>

               {/* Right Eyelash */}
               <path d="M 335 275 C 315 245, 275 245, 260 275 C 275 260, 305 260, 335 275 Z" fill="#0f172a" />
               <path d="M 335 275 L 347 285 M 260 275 L 254 282" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" />
               <path d="M 340 270 L 350 272" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
               {/* Under eye crease/line */}
               <path d="M 315 288 Q 295 292 275 288" stroke="#fb7185" strokeWidth="1" fill="none" opacity="0.6" strokeLinecap="round"/>
            </motion.g>
            
            {/* Left Eyebrow */}
            <motion.path initial={{ y: 0, rotate: 0 }} animate={{ y: browL.y, rotate: browL.rotate }} transition={{ type: "spring", stiffness: 100 }} className="origin-[205px_245px]" d="M 175 245 Q 205 230, 235 245" stroke="#4c1d95" strokeWidth="3.5" fill="none" strokeLinecap="round" opacity="0.85" />
            
            {/* Right Eyebrow */}
            <motion.path initial={{ y: 0, rotate: 0 }} animate={{ y: browR.y, rotate: browR.rotate }} transition={{ type: "spring", stiffness: 100 }} className="origin-[295px_245px]" d="M 325 245 Q 295 230, 265 245" stroke="#4c1d95" strokeWidth="3.5" fill="none" strokeLinecap="round" opacity="0.85" />

            {/* ---------- FRONT HAIR AND BANGS ---------- */}
            <motion.g 
              initial={{ rotate: 0, skewX: 0 }}
              animate={{ rotate: isListening ? 1.5 : 0, skewX: isSpeaking ? [0, 0.5, -0.5, 0] : 0 }} 
              transition={{ skewX: { repeat: Infinity, duration: 2.5, ease: "easeInOut" } }}
              className="origin-[250px_130px]"
            >
              {/* Base Forehead Hair Coverage */}
              <path d="M 140 220 C 130 110, 200 90, 250 90 C 300 90, 370 110, 360 220 C 310 140, 190 140, 140 220 Z" fill="url(#hairLight)" />
              
              {/* Long Face Framing Side Locks */}
              <path d="M 145 220 C 120 320, 140 460, 110 540 C 160 450, 175 320, 160 220 Z" fill="url(#hairLight)" />
              <path d="M 355 220 C 380 320, 360 460, 390 540 C 340 450, 325 320, 340 220 Z" fill="url(#hairLight)" />

              {/* Detailed Pointy Bangs */}
              <path d="M 230 110 C 210 180, 230 250, 205 270 C 255 240, 260 170, 260 110 Z" fill="url(#hairHighlight)" />
              <path d="M 270 110 C 290 180, 270 250, 295 270 C 245 240, 240 170, 240 110 Z" fill="url(#hairHighlight)" />
              <path d="M 180 120 C 160 200, 180 260, 160 285 C 205 240, 215 170, 205 120 Z" fill="url(#hairLight)" />
              <path d="M 320 120 C 340 200, 320 260, 340 285 C 295 240, 285 170, 295 120 Z" fill="url(#hairLight)" />
              
              {/* Center small bang detail */}
              <path d="M 250 140 C 240 170, 250 200, 250 220 C 255 200, 260 170, 250 140 Z" fill="#d946ef" opacity="0.8" />

              {/* Ahoge (Top floating hair strand) - More expressive */}
              <motion.path 
                initial={{ rotate: 0 }}
                animate={{ rotate: isProcessing ? [-8, 8, -8] : isListening ? 15 : [0, 4, 0] }}
                transition={{ repeat: Infinity, duration: isProcessing ? 0.4 : 4, ease: "easeInOut" }}
                d="M 250 90 C 210 20, 290 10, 300 60 C 270 30, 250 40, 250 90 Z" 
                fill="url(#hairHighlight)" 
                className="origin-[250px_90px]"
              />
            </motion.g>

            {/* CYBERNETIC HEADSET EARPIECES */}
            <motion.g initial={{ scale: 1 }} animate={{ scale: isListening ? [1, 1.05, 1] : 1 }} transition={{ repeat: Infinity, duration: 2 }} className="origin-[250px_270px]">
              {/* Left Earpiece */}
              <path d="M 135 240 L 115 220 L 110 280 L 125 295 L 150 270 L 135 240 Z" fill="#0f172a" stroke="#2dd4bf" strokeWidth="2.5" />
              <circle cx="125" cy="265" r="8" fill="#e879f9" style={{ filter: 'drop-shadow(0 0 8px #e879f9)' }} />
              <path d="M 110 250 L 130 255" stroke="#22d3ee" strokeWidth="2" />
              {/* Antenna */}
              <path d="M 115 220 L 100 170" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round" />
              <circle cx="100" cy="170" r="3" fill="#e879f9" style={{ filter: 'drop-shadow(0 0 5px #e879f9)' }} />
              
              {/* Right Earpiece */}
              <path d="M 365 240 L 385 220 L 390 280 L 375 295 L 350 270 L 365 240 Z" fill="#0f172a" stroke="#2dd4bf" strokeWidth="2.5" />
              <circle cx="375" cy="265" r="8" fill="#e879f9" style={{ filter: 'drop-shadow(0 0 8px #e879f9)' }} />
              <path d="M 390 250 L 370 255" stroke="#22d3ee" strokeWidth="2" />
              {/* Antenna */}
              <path d="M 385 220 L 400 170" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round" />
              <circle cx="400" cy="170" r="3" fill="#e879f9" style={{ filter: 'drop-shadow(0 0 5px #e879f9)' }} />
            </motion.g>

          </motion.g>
        </svg>
      </motion.div>
    </div>
  );
});

