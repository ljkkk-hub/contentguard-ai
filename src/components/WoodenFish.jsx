import { useState, useRef, useCallback, useEffect } from 'react';

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playMuyuSound() {
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.35);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(900, t);
    osc2.frequency.exponentialRampToValueAtTime(200, t + 0.06);
    gain2.gain.setValueAtTime(0.08, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t);
    osc2.stop(t + 0.2);
  } catch {}
}

export default function WoodenFish() {
  const [merit, setMerit] = useState(() => {
    const saved = localStorage.getItem('tichacha_merit');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [tapping, setTapping] = useState(false);
  const [ripples, setRipples] = useState([]);
  const containerRef = useRef(null);
  const idRef = useRef(0);

  useEffect(() => {
    localStorage.setItem('tichacha_merit', String(merit));
  }, [merit]);

  const handleTap = useCallback(() => {
    playMuyuSound();
    setTapping(true);
    setTimeout(() => setTapping(false), 150);
    setMerit(m => m + 1);

    const id = ++idRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    const x = rect ? rect.width / 2 : 100;
    const y = rect ? rect.height / 2 - 30 : 100;

    setRipples(prev => [...prev, { id, x, y, text: '功德 +1' }]);
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id));
    }, 1200);
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex flex-col items-center justify-center h-full select-none"
      onClick={handleTap}
      style={{ cursor: 'pointer' }}
    >
      {/* 功德飘字 */}
      {ripples.map(r => (
        <div
          key={r.id}
          className="absolute pointer-events-none text-sm font-medium text-th-accent z-20"
          style={{
            left: r.x,
            top: r.y,
            transform: 'translate(-50%, -50%)',
            animation: 'meritFloat 1.2s ease-out forwards',
            textShadow: '0 0 12px color-mix(in srgb, var(--color-th-accent) 40%, transparent)',
          }}
        >
          {r.text}
        </div>
      ))}

      <p className="text-xs text-th-subtle mb-6 relative z-10 tracking-wide">
        等待审核 · 敲击法器积攒功德
      </p>

      {/* 木鱼 SVG */}
      <div className={`relative z-10 transition-transform duration-150 ${tapping ? 'scale-95' : 'scale-100'}`}>
        <svg width="160" height="140" viewBox="0 0 160 140" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="woodGrain" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M0 5 Q10 3 20 5" stroke="#b07d3e" strokeWidth="0.3" fill="none" opacity="0.4"/>
              <path d="M0 12 Q10 10 20 12" stroke="#b07d3e" strokeWidth="0.3" fill="none" opacity="0.3"/>
              <path d="M0 18 Q10 16 20 18" stroke="#b07d3e" strokeWidth="0.2" fill="none" opacity="0.2"/>
            </pattern>
            <radialGradient id="bodyGrad" cx="45%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#e8c896"/>
              <stop offset="30%" stopColor="#d4a85c"/>
              <stop offset="60%" stopColor="#b8823a"/>
              <stop offset="85%" stopColor="#8b5e24"/>
              <stop offset="100%" stopColor="#5a3a14"/>
            </radialGradient>
            <radialGradient id="highlight" cx="35%" cy="30%" r="40%">
              <stop offset="0%" stopColor="#f5deb3" stopOpacity="0.6"/>
              <stop offset="50%" stopColor="#e8c896" stopOpacity="0.2"/>
              <stop offset="100%" stopColor="#b8823a" stopOpacity="0"/>
            </radialGradient>
            <linearGradient id="crackShadow" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#2a1a08" stopOpacity="0.9"/>
              <stop offset="100%" stopColor="#1a0f04" stopOpacity="1"/>
            </linearGradient>
            <radialGradient id="dropShadow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#000" stopOpacity="0.4"/>
              <stop offset="100%" stopColor="#000" stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="tapGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f5deb3" stopOpacity="0.5"/>
              <stop offset="100%" stopColor="#d4a85c" stopOpacity="0"/>
            </radialGradient>
          </defs>

          <ellipse cx="85" cy="122" rx="55" ry="8" fill="url(#dropShadow)"/>

          <g>
            <path
              d="M30 85
                 C30 55, 55 25, 95 25
                 C130 25, 145 50, 145 75
                 C145 100, 125 118, 95 118
                 C65 118, 55 108, 45 100
                 C35 92, 30 85, 30 85Z"
              fill="url(#bodyGrad)"
            />
            <path
              d="M30 85
                 C30 55, 55 25, 95 25
                 C130 25, 145 50, 145 75
                 C145 100, 125 118, 95 118
                 C65 118, 55 108, 45 100
                 C35 92, 30 85, 30 85Z"
              fill="url(#woodGrain)"
            />
            <path
              d="M40 80
                 C40 58, 60 35, 90 32
                 C115 30, 130 48, 130 68
                 C130 85, 115 95, 90 95
                 C70 95, 55 88, 50 82
                 C45 78, 42 76, 40 80Z"
              fill="url(#highlight)"
            />

            <path
              d="M55 65
                 Q75 58, 105 62
                 Q115 64, 120 68
                 Q115 72, 105 70
                 Q75 66, 55 72
                 Q50 69, 55 65Z"
              fill="url(#crackShadow)"
            />
            <path
              d="M55 65 Q75 58, 105 62 Q115 64, 120 68"
              stroke="#e8c896"
              strokeWidth="0.8"
              fill="none"
              opacity="0.6"
            />
            <path
              d="M55 72 Q75 66, 105 70 Q115 72, 120 68"
              stroke="#5a3a14"
              strokeWidth="0.8"
              fill="none"
              opacity="0.5"
            />

            <path
              d="M30 85
                 C25 82, 20 78, 22 72
                 C24 68, 28 70, 32 75
                 C34 78, 33 82, 30 85Z"
              fill="#8b5e24"
              opacity="0.8"
            />
            <path
              d="M22 72 Q26 70, 30 74"
              stroke="#e8c896"
              strokeWidth="0.5"
              fill="none"
              opacity="0.4"
            />

            {tapping && (
              <circle cx="90" cy="65" r="50" fill="url(#tapGlow)" opacity="0.6">
                <animate attributeName="r" from="30" to="70" dur="0.3s" fill="freeze"/>
                <animate attributeName="opacity" from="0.6" to="0" dur="0.3s" fill="freeze"/>
              </circle>
            )}
          </g>
        </svg>
      </div>

      {/* 功德计数 */}
      <div className="mt-4 text-center relative z-10">
        <div className="text-[10px] text-th-dim mb-1 tracking-widest uppercase">Merit</div>
        <div
          className="text-2xl font-light tabular-nums tracking-tight"
          style={{
            color: '#e8c896',
            textShadow: '0 0 20px rgba(232,200,150,0.2)',
          }}
        >
          {merit.toLocaleString()}
        </div>
        <p className="text-[10px] text-th-dim tracking-wider mt-1">心诚则灵</p>
      </div>

      {/* 脉冲环动画 */}
      {tapping && (
        <div
          className="absolute pointer-events-none rounded-full border border-amber-400/20"
          style={{
            width: 120,
            height: 120,
            animation: 'pulseRing 0.6s ease-out forwards',
          }}
        />
      )}
    </div>
  );
}
