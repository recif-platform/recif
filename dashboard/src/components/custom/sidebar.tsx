"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReefLogo } from "./logo";
import { useTheme } from "@/lib/theme";

const navItems = [
  { href: "/chat", label: "Chat", icon: "💬" },
  { href: "/agents", label: "Agents", icon: "🤖" },
  { href: "/tools", label: "Tools", icon: "🔧" },
  { href: "/skills", label: "Skills", icon: "✨" },
  { href: "/knowledge", label: "Knowledge", icon: "📚" },
  { href: "/memory", label: "Memory", icon: "🧠" },
  { href: "/integrations", label: "Integrations", icon: "🔌" },
  { href: "/governance", label: "Governance", icon: "🛡️" },
  { href: "/radar", label: "AI Radar", icon: "📡" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

function SidebarBubbles() {
  const { colors } = useTheme();
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[
        { left: "20%", delay: "0s", duration: "12s", size: 5 },
        { left: "55%", delay: "3s", duration: "15s", size: 3 },
        { left: "75%", delay: "6s", duration: "18s", size: 4 },
        { left: "35%", delay: "9s", duration: "14s", size: 3 },
        { left: "85%", delay: "2s", duration: "16s", size: 4 },
        { left: "15%", delay: "7s", duration: "13s", size: 3 },
      ].map((b, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: b.size, height: b.size,
            left: b.left,
            background: colors.navBubbleGradient,
            animation: `sidebarBubble ${b.duration} linear ${b.delay} infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes sidebarBubble {
          0% { bottom: -10px; opacity: 0; transform: scale(0.5); }
          10% { opacity: 0.7; }
          90% { opacity: 0.2; }
          100% { bottom: 100%; opacity: 0; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { theme, colors } = useTheme();

  const logoGradient = theme === "dark"
    ? "linear-gradient(135deg, #22d3ee, #67e8f9)"
    : "linear-gradient(135deg, #0891b2, #0e7490)";

  const subtitleColor = theme === "dark"
    ? "rgba(34, 211, 238, 0.4)"
    : "rgba(8, 145, 178, 0.5)";

  return (
    <aside
      className="w-[260px] min-h-screen flex flex-col relative z-[2] overflow-hidden"
      style={{
        background: colors.navBg,
        borderRight: `1px solid ${colors.navDivider}`,
        padding: "16px 12px",
      }}
    >
      <SidebarBubbles />

      {/* Logo area */}
      <div className="relative z-10 mb-10 flex flex-col items-center pt-4">
        <ReefLogo size={140} />
        <h1
          className="mt-3"
          style={{
            fontSize: "26px",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: theme === "dark" ? "#22d3ee" : "#0891b2",
          }}
        >
          Récif
        </h1>
        <p style={{ fontSize: "10px", letterSpacing: "3px", textTransform: "uppercase", marginTop: "4px", color: subtitleColor, fontWeight: 500 }}>
          Agentic Platform
        </p>
      </div>

      <nav className="space-y-1 relative z-10">
        {navItems.map((item) => {
          const isActive = item.href === "/agents"
            ? pathname === "/agents" || (pathname?.startsWith("/agents/") && !pathname?.includes("/new"))
            : pathname?.startsWith(item.href) ?? false;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
              style={{
                fontSize: "14px",
                color: isActive ? colors.navActiveText : colors.navText,
                fontWeight: isActive ? 600 : 450,
                letterSpacing: "-0.01em",
                background: isActive ? colors.navActiveBg : "transparent",
                border: isActive ? `1px solid ${colors.navActiveBorder}` : "1px solid transparent",
                boxShadow: isActive
                  ? theme === "dark"
                    ? "inset 0 1px 0 rgba(34,211,238,0.08), 0 2px 8px rgba(0,0,0,0.2)"
                    : "0 1px 3px rgba(0,0,0,0.04)"
                  : "none",
              }}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
