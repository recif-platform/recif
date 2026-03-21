"use client";

import { useTheme } from "@/lib/theme";

export function ReefLogo({ size = 140 }: { size?: number }) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  return (
    <svg width={size} height={size} viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* Gradients — slightly more saturated in light mode for contrast */}
        <linearGradient id="gCoral" x1="0%" y1="100%" x2="40%" y2="0%">
          <stop offset="0%" stopColor={isLight ? "#be185d" : "#db2777"} />
          <stop offset="100%" stopColor={isLight ? "#ec4899" : "#f472b6"} />
        </linearGradient>
        <linearGradient id="gCyan" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={isLight ? "#0891b2" : "#06b6d4"} />
          <stop offset="100%" stopColor={isLight ? "#22d3ee" : "#67e8f9"} />
        </linearGradient>
        <linearGradient id="gPurple" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={isLight ? "#6d28d9" : "#7c3aed"} />
          <stop offset="100%" stopColor={isLight ? "#8b5cf6" : "#a78bfa"} />
        </linearGradient>
        <linearGradient id="gGreen" x1="0%" y1="100%" x2="50%" y2="0%">
          <stop offset="0%" stopColor={isLight ? "#047857" : "#059669"} />
          <stop offset="100%" stopColor={isLight ? "#10b981" : "#34d399"} />
        </linearGradient>
        {/* Glow filter — subtle in both modes */}
        <filter id="coralGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
        </filter>
      </defs>

      {/* No background bubble in either mode */}

      {/* ═══ Main coral formation ═══ */}
      <g transform="translate(70, 112)" filter="url(#coralGlow)">

        {/* Left magenta coral — main branch */}
        <path d="M-4 0 Q-6 -16 -12 -30 Q-15 -38 -10 -48 Q-7 -56 -12 -66 Q-14 -72 -10 -78" stroke="url(#gCoral)" strokeWidth="5" fill="none" strokeLinecap="round">
          <animate attributeName="d" values="M-4 0 Q-6 -16 -12 -30 Q-15 -38 -10 -48 Q-7 -56 -12 -66 Q-14 -72 -10 -78;M-4 0 Q-5 -16 -11 -30 Q-14 -39 -9 -49 Q-6 -57 -11 -67 Q-13 -73 -9 -79;M-4 0 Q-6 -16 -12 -30 Q-15 -38 -10 -48 Q-7 -56 -12 -66 Q-14 -72 -10 -78" dur="6s" repeatCount="indefinite" />
        </path>
        {/* Left sub-branches */}
        <path d="M-12 -30 Q-22 -38 -28 -46" stroke="url(#gCoral)" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <path d="M-28 -46 Q-34 -52 -32 -58" stroke="url(#gCoral)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M-10 -48 Q-2 -56 2 -64" stroke="url(#gCoral)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M-12 -66 Q-20 -72 -24 -68" stroke="url(#gCoral)" strokeWidth="2" fill="none" strokeLinecap="round" />
        {/* Coral tips — glowing dots */}
        <circle cx="-10" cy="-78" r="3.5" fill="#ec4899" opacity="0.7" />
        <circle cx="-32" cy="-58" r="3" fill="#f472b6" opacity="0.6" />
        <circle cx="2" cy="-64" r="2.5" fill="#ec4899" opacity="0.5" />
        <circle cx="-24" cy="-68" r="2" fill="#f472b6" opacity="0.5" />

        {/* Right cyan coral — main branch */}
        <path d="M8 0 Q12 -14 16 -28 Q18 -36 14 -46 Q11 -54 16 -64 Q18 -70 14 -76" stroke="url(#gCyan)" strokeWidth="5" fill="none" strokeLinecap="round">
          <animate attributeName="d" values="M8 0 Q12 -14 16 -28 Q18 -36 14 -46 Q11 -54 16 -64 Q18 -70 14 -76;M8 0 Q13 -14 17 -28 Q19 -35 15 -45 Q12 -53 17 -63 Q19 -69 15 -75;M8 0 Q12 -14 16 -28 Q18 -36 14 -46 Q11 -54 16 -64 Q18 -70 14 -76" dur="5s" repeatCount="indefinite" />
        </path>
        {/* Right sub-branches */}
        <path d="M16 -28 Q26 -34 30 -42" stroke="url(#gCyan)" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <path d="M30 -42 Q34 -48 32 -54" stroke="url(#gCyan)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M14 -46 Q6 -54 4 -60" stroke="url(#gCyan)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M16 -64 Q24 -68 26 -62" stroke="url(#gCyan)" strokeWidth="2" fill="none" strokeLinecap="round" />
        {/* Tips */}
        <circle cx="14" cy="-76" r="3.5" fill="#06b6d4" opacity="0.7" />
        <circle cx="32" cy="-54" r="3" fill="#22d3ee" opacity="0.6" />
        <circle cx="4" cy="-60" r="2.5" fill="#06b6d4" opacity="0.5" />
        <circle cx="26" cy="-62" r="2" fill="#22d3ee" opacity="0.5" />

        {/* Center purple accent coral */}
        <path d="M0 -2 Q-1 -18 2 -32 Q3 -40 -1 -48 Q-2 -54 1 -60" stroke="url(#gPurple)" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.6">
          <animate attributeName="d" values="M0 -2 Q-1 -18 2 -32 Q3 -40 -1 -48 Q-2 -54 1 -60;M0 -2 Q0 -18 3 -32 Q4 -39 0 -47 Q-1 -53 2 -59;M0 -2 Q-1 -18 2 -32 Q3 -40 -1 -48 Q-2 -54 1 -60" dur="7s" repeatCount="indefinite" />
        </path>
        <circle cx="1" cy="-60" r="2.5" fill="#8b5cf6" opacity="0.5" />

        {/* Far left small coral */}
        <path d="M-20 0 Q-22 -10 -20 -20 Q-19 -26 -22 -32" stroke="url(#gCoral)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.5" />
        <circle cx="-22" cy="-32" r="2" fill="#ec4899" opacity="0.4" />

        {/* Far right seaweed */}
        <path d="M26 0 Q28 -12 24 -22 Q22 -28 25 -36 Q26 -42 23 -48" stroke="url(#gGreen)" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.5">
          <animate attributeName="d" values="M26 0 Q28 -12 24 -22 Q22 -28 25 -36 Q26 -42 23 -48;M26 0 Q27 -12 23 -22 Q21 -29 24 -37 Q25 -43 22 -49;M26 0 Q28 -12 24 -22 Q22 -28 25 -36 Q26 -42 23 -48" dur="4s" repeatCount="indefinite" />
        </path>

        {/* Left seaweed */}
        <path d="M-30 0 Q-32 -8 -29 -16 Q-28 -22 -31 -28" stroke="url(#gGreen)" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.35">
          <animate attributeName="d" values="M-30 0 Q-32 -8 -29 -16 Q-28 -22 -31 -28;M-30 0 Q-31 -8 -28 -16 Q-27 -23 -30 -29;M-30 0 Q-32 -8 -29 -16 Q-28 -22 -31 -28" dur="3.5s" repeatCount="indefinite" />
        </path>
      </g>

      {/* ═══ Fish ═══ */}

      {/* Golden fish — larger, more detailed */}
      <g>
        <ellipse cx="28" cy="42" rx="7" ry="4" fill="#fbbf24" opacity="0.9">
          <animate attributeName="cx" values="28;38;28;18;28" dur="8s" repeatCount="indefinite" />
          <animate attributeName="cy" values="42;38;42;46;42" dur="6s" repeatCount="indefinite" />
        </ellipse>
        <polygon points="35,42 42,37 42,47" fill="#f59e0b" opacity="0.85">
          <animate attributeName="points" values="35,42 42,37 42,47;45,38 52,33 52,43;35,42 42,37 42,47;25,46 32,41 32,51;35,42 42,37 42,47" dur="8s" repeatCount="indefinite" />
        </polygon>
        <circle cx="25" cy="41" r="1.2" fill="#78350f" opacity="0.8">
          <animate attributeName="cx" values="25;35;25;15;25" dur="8s" repeatCount="indefinite" />
          <animate attributeName="cy" values="41;37;41;45;41" dur="6s" repeatCount="indefinite" />
        </circle>
      </g>

      {/* Cyan fish */}
      <g>
        <ellipse cx="105" cy="34" rx="5" ry="3" fill="#22d3ee" opacity="0.8">
          <animate attributeName="cx" values="105;98;105;112;105" dur="7s" repeatCount="indefinite" />
          <animate attributeName="cy" values="34;30;34;38;34" dur="5s" repeatCount="indefinite" />
        </ellipse>
        <polygon points="110,34 114,31 114,37" fill="#06b6d4" opacity="0.7">
          <animate attributeName="points" values="110,34 114,31 114,37;103,30 107,27 107,33;110,34 114,31 114,37;117,38 121,35 121,41;110,34 114,31 114,37" dur="7s" repeatCount="indefinite" />
        </polygon>
      </g>

      {/* Pink small fish */}
      <g>
        <ellipse cx="48" cy="22" rx="4" ry="2.2" fill="#f472b6" opacity="0.6">
          <animate attributeName="cx" values="48;54;48;42;48" dur="9s" repeatCount="indefinite" />
          <animate attributeName="cy" values="22;19;22;25;22" dur="7s" repeatCount="indefinite" />
        </ellipse>
        <polygon points="52,22 55,20 55,24" fill="#ec4899" opacity="0.5">
          <animate attributeName="points" values="52,22 55,20 55,24;58,19 61,17 61,21;52,22 55,20 55,24;46,25 49,23 49,27;52,22 55,20 55,24" dur="9s" repeatCount="indefinite" />
        </polygon>
      </g>

      {/* ═══ Bubbles ═══ */}
      <circle cx="55" cy="55" r="2.5" fill="none" stroke={isLight ? "#0891b2" : "#22d3ee"} strokeWidth="0.5" opacity={isLight ? 0.2 : 0.3}>
        <animate attributeName="cy" values="55;40;25;10;55" dur="5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values={isLight ? "0.2;0.35;0.2;0;0.2" : "0.3;0.5;0.3;0;0.3"} dur="5s" repeatCount="indefinite" />
        <animate attributeName="r" values="2.5;3;2.5;2;2.5" dur="5s" repeatCount="indefinite" />
      </circle>
      <circle cx="78" cy="62" r="2" fill="none" stroke={isLight ? "#0891b2" : "#22d3ee"} strokeWidth="0.4" opacity={isLight ? 0.15 : 0.25}>
        <animate attributeName="cy" values="62;45;28;12;62" dur="6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values={isLight ? "0.15;0.3;0.1;0;0.15" : "0.25;0.4;0.2;0;0.25"} dur="6s" repeatCount="indefinite" />
      </circle>
      <circle cx="42" cy="68" r="1.5" fill="none" stroke={isLight ? "#0e7490" : "#67e8f9"} strokeWidth="0.4" opacity={isLight ? 0.12 : 0.2}>
        <animate attributeName="cy" values="68;50;32;15;68" dur="4.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values={isLight ? "0.12;0.25;0.08;0;0.12" : "0.2;0.35;0.15;0;0.2"} dur="4.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="90" cy="58" r="1.8" fill="none" stroke={isLight ? "#0891b2" : "#22d3ee"} strokeWidth="0.3" opacity={isLight ? 0.12 : 0.2}>
        <animate attributeName="cy" values="58;42;26;10;58" dur="7s" repeatCount="indefinite" />
        <animate attributeName="opacity" values={isLight ? "0.12;0.2;0.08;0;0.12" : "0.2;0.3;0.15;0;0.2"} dur="7s" repeatCount="indefinite" />
      </circle>

      {/* Glow layer behind coral (blurred duplicate) — hidden in light mode */}
      <g filter="url(#softGlow)" opacity={isLight ? 0.1 : 0.3}>
        <path d="M58 112 Q54 82 60 46" stroke={isLight ? "#be185d" : "#ec4899"} strokeWidth="3" fill="none" />
        <path d="M78 112 Q82 82 76 46" stroke={isLight ? "#0891b2" : "#06b6d4"} strokeWidth="3" fill="none" />
      </g>
    </svg>
  );
}

// Keep backward compat
export const ReefLogoWave = ReefLogo;
