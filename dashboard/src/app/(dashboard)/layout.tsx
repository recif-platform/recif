"use client";

import { Sidebar } from "@/components/custom/sidebar";
import { CommandPalette } from "@/components/custom/command-palette";
import { Topbar } from "@/components/custom/topbar";
import { NotificationProvider } from "@/lib/notifications";
import { ThemeProvider, useTheme } from "@/lib/theme";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { theme, colors } = useTheme();

  return (
    <div
      className={`flex h-screen overflow-hidden ${theme === "dark" ? "ocean-bg" : ""}`}
      style={{
        background: theme === "light" ? colors.pageBg : undefined,
        color: colors.textPrimary,
      }}
    >
      <Sidebar />
      <div className="flex-1 flex flex-col relative z-[1] min-w-0">
        <Topbar />
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
      <CommandPalette />
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <DashboardShell>{children}</DashboardShell>
      </NotificationProvider>
    </ThemeProvider>
  );
}
