"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

type Theme = "dark" | "light";

export interface ThemeColors {
  // Page
  pageBg: string;
  // Cards / Panels
  cardBg: string;
  cardBorder: string;
  cardShadow: string;
  cardHoverBorder: string;
  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  // Accent
  accent: string;
  accentBg: string;
  accentBorder: string;
  accentGlow: string;
  // Inputs
  inputBg: string;
  inputBorder: string;
  // Nav
  navBg: string;
  navText: string;
  navActiveText: string;
  navActiveBg: string;
  navActiveBorder: string;
  navBubbleGradient: string;
  navDivider: string;
  // Topbar
  topbarBg: string;
  topbarBorder: string;
  topbarShadow: string;
  // Chat bubbles
  userBubbleBg: string;
  userBubbleText: string;
  userBubbleShadow: string;
  agentBubbleBg: string;
  agentBubbleBorder: string;
  agentBubbleText: string;
  agentBubbleShadow: string;
  agentLabel: string;
  // Code
  codeBg: string;
  codeBorder: string;
  // Misc
  divider: string;
  overlayBg: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  // Status
  statusGreen: string;
  statusYellow: string;
  statusRed: string;
  // Glass overrides
  glassBackground: string;
  glassBorder: string;
  glassShadow: string;
}

const darkColors: ThemeColors = {
  pageBg: "#030a14",
  cardBg: "rgba(10, 24, 45, 0.7)",
  cardBorder: "rgba(56, 189, 248, 0.12)",
  cardShadow: "0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(34,211,238,0.06)",
  cardHoverBorder: "rgba(34,211,238,0.25)",
  textPrimary: "#f1f5f9",
  textSecondary: "#e2e8f0",
  textMuted: "#64748b",
  textInverse: "#0f172a",
  accent: "#22d3ee",
  accentBg: "rgba(34,211,238,0.1)",
  accentBorder: "rgba(34,211,238,0.25)",
  accentGlow: "rgba(34,211,238,0.5)",
  inputBg: "rgba(255,255,255,0.04)",
  inputBorder: "rgba(255,255,255,0.08)",
  navBg: "linear-gradient(to top, #030a14 0%, #051828 30%, #0a2540 60%, #115068 85%, #17708a 100%)",
  navText: "rgba(148, 163, 184, 0.9)",
  navActiveText: "#22d3ee",
  navActiveBg: "rgba(34, 211, 238, 0.1)",
  navActiveBorder: "rgba(34, 211, 238, 0.15)",
  navBubbleGradient: "radial-gradient(circle at 30% 30%, rgba(34,211,238,0.3), rgba(34,211,238,0.05))",
  navDivider: "rgba(34, 211, 238, 0.08)",
  topbarBg: "linear-gradient(90deg, #17708a, #115e75 30%, rgba(10, 35, 58, 0.92))",
  topbarBorder: "rgba(34, 211, 238, 0.1)",
  topbarShadow: "0 2px 12px rgba(0,0,0,0.3)",
  userBubbleBg: "linear-gradient(165deg, #0ea5e9, #0891b2)",
  userBubbleText: "white",
  userBubbleShadow: "inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 2px rgba(0,0,0,0.1), 0 4px 16px rgba(6,182,212,0.3), 0 8px 24px rgba(0,0,0,0.15)",
  agentBubbleBg: "linear-gradient(165deg, rgba(30,50,75,0.9), rgba(20,38,62,0.92))",
  agentBubbleBorder: "rgba(34,211,238,0.08)",
  agentBubbleText: "#e2e8f0",
  agentBubbleShadow: "inset 0 1px 0 rgba(34,211,238,0.08), inset 0 -1px 0 rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.2)",
  agentLabel: "#f472b6",
  codeBg: "rgba(4, 14, 26, 0.8)",
  codeBorder: "rgba(34, 211, 238, 0.1)",
  divider: "rgba(255,255,255,0.05)",
  overlayBg: "rgba(0,0,0,0.6)",
  badgeBg: "rgba(255,255,255,0.04)",
  badgeBorder: "rgba(255,255,255,0.06)",
  badgeText: "#94a3b8",
  statusGreen: "#22c55e",
  statusYellow: "#eab308",
  statusRed: "#ef4444",
  glassBackground: "linear-gradient(165deg, rgba(22, 45, 72, 0.8) 0%, rgba(14, 32, 56, 0.85) 40%, rgba(11, 26, 48, 0.88) 100%)",
  glassBorder: "rgba(56, 189, 248, 0.12)",
  glassShadow: "inset 0 1px 0 rgba(56, 189, 248, 0.15), inset 0 2px 6px rgba(34, 211, 238, 0.05), inset 1px 0 0 rgba(56, 189, 248, 0.08), inset 0 -1px 0 rgba(0, 0, 0, 0.25), inset 0 -2px 4px rgba(0, 0, 0, 0.08), 0 4px 8px rgba(0, 0, 0, 0.15), 0 12px 28px rgba(0, 0, 0, 0.2), 0 4px 24px rgba(6, 182, 212, 0.06)",
};

const lightColors: ThemeColors = {
  pageBg: "#f0f7fa",
  cardBg: "#ffffff",
  cardBorder: "rgba(14, 116, 144, 0.1)",
  cardShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(14,116,144,0.04)",
  cardHoverBorder: "rgba(8, 145, 178, 0.3)",
  textPrimary: "#0f172a",
  textSecondary: "#334155",
  textMuted: "#64748b",
  textInverse: "#ffffff",
  accent: "#0891b2",
  accentBg: "rgba(8, 145, 178, 0.08)",
  accentBorder: "rgba(8, 145, 178, 0.2)",
  accentGlow: "rgba(8, 145, 178, 0.3)",
  inputBg: "#f8fafc",
  inputBorder: "rgba(14, 116, 144, 0.15)",
  navBg: "linear-gradient(to top, #e0f2fe 0%, #f0f9ff 40%, #ffffff 100%)",
  navText: "#475569",
  navActiveText: "#0891b2",
  navActiveBg: "rgba(8, 145, 178, 0.08)",
  navActiveBorder: "rgba(8, 145, 178, 0.15)",
  navBubbleGradient: "radial-gradient(circle at 30% 30%, rgba(8,145,178,0.15), rgba(8,145,178,0.03))",
  navDivider: "rgba(14, 116, 144, 0.08)",
  topbarBg: "linear-gradient(90deg, #e0f2fe 0%, #f0f9ff 30%, #ffffff 100%)",
  topbarBorder: "rgba(14, 116, 144, 0.1)",
  topbarShadow: "0 1px 4px rgba(0,0,0,0.06)",
  userBubbleBg: "linear-gradient(165deg, #0891b2, #0e7490)",
  userBubbleText: "white",
  userBubbleShadow: "0 2px 8px rgba(8,145,178,0.2), 0 4px 16px rgba(0,0,0,0.06)",
  agentBubbleBg: "#ffffff",
  agentBubbleBorder: "rgba(14, 116, 144, 0.12)",
  agentBubbleText: "#1e293b",
  agentBubbleShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(14,116,144,0.04)",
  agentLabel: "#be185d",
  codeBg: "#f1f5f9",
  codeBorder: "rgba(14, 116, 144, 0.1)",
  divider: "rgba(0,0,0,0.06)",
  overlayBg: "rgba(0,0,0,0.3)",
  badgeBg: "rgba(0,0,0,0.03)",
  badgeBorder: "rgba(0,0,0,0.06)",
  badgeText: "#475569",
  statusGreen: "#16a34a",
  statusYellow: "#ca8a04",
  statusRed: "#dc2626",
  glassBackground: "#ffffff",
  glassBorder: "rgba(14, 116, 144, 0.1)",
  glassShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(14,116,144,0.04)",
};

const themeMap: Record<Theme, ThemeColors> = {
  dark: darkColors,
  light: lightColors,
};

interface ThemeContextValue {
  theme: Theme;
  colors: ThemeColors;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  colors: darkColors,
  toggleTheme: () => {},
  setTheme: () => {},
});

const CSS_VARS: Record<string, keyof ThemeColors> = {
  "--reef-glass-bg": "glassBackground",
  "--reef-glass-border": "glassBorder",
  "--reef-glass-shadow": "glassShadow",
  "--reef-accent": "accent",
  "--reef-text-inverse": "textInverse",
  "--reef-page-bg": "pageBg",
  "--reef-divider": "divider",
  "--reef-input-bg": "inputBg",
  "--reef-input-border": "inputBorder",
  "--reef-text-primary": "textPrimary",
  "--reef-text-secondary": "textSecondary",
  "--reef-text-muted": "textMuted",
  "--reef-badge-bg": "badgeBg",
  "--reef-badge-border": "badgeBorder",
};

function applyCssVars(colors: ThemeColors, theme: Theme) {
  const root = document.documentElement;
  for (const [varName, colorKey] of Object.entries(CSS_VARS)) {
    root.style.setProperty(varName, colors[colorKey]);
  }
  // Glass sheen: visible on dark, invisible on light
  root.style.setProperty(
    "--reef-glass-sheen",
    theme === "dark"
      ? "linear-gradient(180deg, rgba(56, 189, 248, 0.08) 0%, rgba(34, 211, 238, 0.03) 40%, transparent)"
      : "none"
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const stored = localStorage.getItem("recif-theme") as Theme | null;
    if (stored === "light" || stored === "dark") {
      setThemeState(stored);
      applyCssVars(themeMap[stored], stored);
    } else {
      applyCssVars(themeMap["dark"], "dark");
    }
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem("recif-theme", t);
    applyCssVars(themeMap[t], t);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const colors = themeMap[theme];

  return (
    <ThemeContext.Provider value={{ theme, colors, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export { darkColors, lightColors };
