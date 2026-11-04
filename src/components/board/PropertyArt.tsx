import type { Landmark } from '@shared';

// Original, simple landmark silhouettes tinted by colour group. No third-party artwork.

export function PropertyArt({ landmark, color, className }: { landmark: Landmark; color: string; className?: string }) {
  const fill = color;
  const base = 'rgb(var(--ink) / 0.12)';
  return (
    <svg viewBox="0 0 120 70" className={className} aria-hidden>
      <rect x="0" y="0" width="120" height="70" rx="8" fill={`${color}22`} />
      <circle cx="96" cy="16" r="8" fill="#e8b84a" opacity="0.8" />
      <rect x="0" y="60" width="120" height="10" fill={base} />
      {landmark === 'fort' && (
        <g fill={fill}>
          <rect x="22" y="30" width="76" height="30" />
          {[22, 36, 50, 64, 78, 92].map((x) => (
            <rect key={x} x={x} y="24" width="6" height="8" />
          ))}
          <rect x="52" y="40" width="16" height="20" fill="#fff8" rx="8" />
        </g>
      )}
      {landmark === 'tower' && (
        <g fill={fill}>
          <rect x="52" y="14" width="16" height="46" />
          <polygon points="50,14 60,4 70,14" />
          <circle cx="60" cy="24" r="5" fill="#fff9" />
          <rect x="36" y="44" width="48" height="16" opacity="0.7" />
        </g>
      )}
      {landmark === 'temple' && (
        <g fill={fill}>
          <polygon points="40,60 60,10 80,60" />
          <polygon points="28,60 40,34 52,60" opacity="0.75" />
          <polygon points="68,60 80,34 92,60" opacity="0.75" />
          <rect x="56" y="46" width="8" height="14" fill="#fff8" />
        </g>
      )}
      {landmark === 'gate' && (
        <g fill={fill}>
          <rect x="30" y="20" width="60" height="40" />
          <path d="M48 60 V40 a12 12 0 0 1 24 0 V60 Z" fill="#fff8" />
          <rect x="26" y="14" width="10" height="46" />
          <rect x="84" y="14" width="10" height="46" />
          <circle cx="31" cy="12" r="5" />
          <circle cx="89" cy="12" r="5" />
        </g>
      )}
      {landmark === 'palace' && (
        <g fill={fill}>
          <rect x="18" y="32" width="84" height="28" />
          {[26, 44, 62, 80].map((x) => (
            <path key={x} d={`M${x} 32 a7 7 0 0 1 14 0 Z`} />
          ))}
          <path d="M52 32 a8 10 0 0 1 16 0 Z" transform="translate(0 -8)" />
          {[28, 46, 64, 82].map((x) => (
            <rect key={x} x={x} y="40" width="8" height="10" fill="#fff8" rx="4" />
          ))}
        </g>
      )}
      {landmark === 'beach' && (
        <g>
          <path d="M0 50 Q30 44 60 50 T120 50 V60 H0 Z" fill={`${fill}aa`} />
          <rect x="30" y="26" width="3" height="28" fill="#7a5b3a" />
          <path d="M31 26 q-14 -2 -18 6 M31 26 q14 -4 18 4 M31 26 q-6 -10 -16 -10 M31 26 q8 -10 18 -8" stroke={fill} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M70 40 h30 l-15 -14 Z" fill={fill} />
        </g>
      )}
      {landmark === 'bridge' && (
        <g stroke={fill} fill="none" strokeWidth="4">
          <path d="M10 46 H110" />
          <path d="M30 46 V16 M90 46 V16" />
          <path d="M30 18 Q60 44 90 18" strokeWidth="2.5" />
          <path d="M10 46 Q20 30 30 18 M90 18 Q100 30 110 46" strokeWidth="2.5" />
          <path d="M0 58 Q30 52 60 58 T120 58" stroke={`${fill}88`} />
        </g>
      )}
      {landmark === 'skyline' && (
        <g fill={fill}>
          <rect x="16" y="34" width="14" height="26" />
          <rect x="34" y="18" width="16" height="42" />
          <rect x="54" y="8" width="12" height="52" />
          <rect x="70" y="26" width="16" height="34" />
          <rect x="90" y="38" width="14" height="22" />
          {[22, 30, 38, 46].map((y) => (
            <rect key={y} x="38" y={y} width="8" height="3" fill="#fff8" />
          ))}
        </g>
      )}
      {landmark === 'ghat' && (
        <g fill={fill}>
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={20 + i * 6} y={36 + i * 6} width={80 - i * 12} height="6" opacity={1 - i * 0.15} />
          ))}
          <polygon points="46,36 54,18 62,36" />
          <polygon points="62,36 70,22 78,36" opacity="0.8" />
          <path d="M0 62 Q30 56 60 62 T120 62" stroke="#4a90c2" strokeWidth="3" fill="none" />
        </g>
      )}
      {landmark === 'tea' && (
        <g fill={fill}>
          <path d="M40 30 h36 v14 a18 14 0 0 1 -36 0 Z" />
          <path d="M76 34 a8 8 0 0 1 0 12" stroke={fill} strokeWidth="4" fill="none" />
        </g>
      )}
    </svg>
  );
}
