"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useLayoutEffect, useState } from "react";
import {
  Award,
  BarChart3,
  ClipboardList,
  ClipboardPlus,
  Database,
  FilePenLine,
  FileUp,
  LayoutDashboard,
  LogOut,
  Menu,
  School,
  Settings,
  Trophy,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { broadcastAuthChanged } from "@/lib/auth-session-sync";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AdminBackButton } from "@/components/admin/admin-back-button";

const nav = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/schools", label: "Schools", icon: School },
  {
    href: "/admin/schools/register",
    label: "Register school",
    icon: ClipboardPlus,
  },
  {
    href: "/admin/incomplete-registrations",
    label: "Incomplete Regs",
    icon: ClipboardList,
  },
  {
    href: "/admin/registrations",
    label: "Payment Review",
    icon: WalletCards,
  },
  { href: "/admin/students", label: "Students", icon: Users },
  { href: "/admin/results", label: "Results", icon: BarChart3 },
  { href: "/admin/results/upload", label: "Upload Results", icon: FileUp },
  { href: "/admin/results/update", label: "Update Results", icon: FilePenLine },
  { href: "/admin/rankings", label: "Rankings", icon: Trophy },
  { href: "/admin/certificates", label: "Certificates", icon: Award },
  { href: "/admin/reports", label: "Student Reports", icon: BarChart3 },
  { href: "/admin/database", label: "Database", icon: Database },
  { href: "/admin/settings", label: "Settings", icon: Settings },
] as const;

const ADMIN_CACHE_KEY = "icape-admin-session";

/** Survives AdminShell remounts within the same tab session (no full-page flash). */
let warmAdminSession: { name: string } | null = null;

function readAdminCache(): { name: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ADMIN_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { name?: string; at?: number };
    if (!parsed?.name || !parsed.at) return null;
    if (Date.now() - parsed.at > 60 * 60 * 1000) return null;
    return { name: parsed.name };
  } catch {
    return null;
  }
}

function writeAdminCache(name: string) {
  warmAdminSession = { name };
  try {
    sessionStorage.setItem(
      ADMIN_CACHE_KEY,
      JSON.stringify({ name, at: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

function clearAdminCache() {
  warmAdminSession = null;
  try {
    sessionStorage.removeItem(ADMIN_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

function isNavActive(href: string, pathname: string) {
  if (href === "/admin/results") {
    return pathname === "/admin/results";
  }
  if (href === "/admin/schools") {
    return (
      pathname === "/admin/schools" ||
      (pathname.startsWith("/admin/schools/") &&
        !pathname.startsWith("/admin/schools/register") &&
        !pathname.startsWith("/admin/schools/add-students"))
    );
  }
  if (
    href === "/admin/results/upload" ||
    href === "/admin/results/update" ||
    href === "/admin/schools/register" ||
    href === "/admin/incomplete-registrations"
  ) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(() => warmAdminSession !== null);
  const [adminName, setAdminName] = useState(
    () => warmAdminSession?.name ?? "Admin",
  );
  const [adminEmail, setAdminEmail] = useState("");
  const [verifying, setVerifying] = useState(false);

  useLayoutEffect(() => {
    if (warmAdminSession) {
      setAdminName(warmAdminSession.name);
      setReady(true);
      return;
    }
    const cached = readAdminCache();
    if (cached) {
      warmAdminSession = cached;
      setAdminName(cached.name);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!warmAdminSession && !readAdminCache()) {
        setVerifying(true);
      }
      const res = await apiRequest<{ name: string; email?: string }>("/auth/me");
      if (cancelled) return;
      setVerifying(false);
      if (!res.success) {
        if (res.networkError) {
          setReady(true);
          return;
        }
        if (res.status === 401 || res.message === "Unauthorized") {
          clearAdminCache();
          setReady(false);
          router.replace("/admin/login");
          return;
        }
        setReady(true);
        return;
      }
      const name = res.data?.name ?? "Admin";
      writeAdminCache(name);
      setAdminName(name);
      setAdminEmail(res.data?.email || "");
      setReady(true);
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function logout() {
    clearAdminCache();
    await apiRequest("/auth/logout", { method: "POST" });
    broadcastAuthChanged();
    router.replace("/admin/login");
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b1228] text-white">
        <div className="text-center">
          <div className="mx-auto mb-3 size-8 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
          <p className="text-sm text-white/80">Opening admin…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#eef2f8]">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[11.7rem] flex-col border-r border-white/10 bg-[#0d173b] text-white transition-transform md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-4">
          <div className="min-w-0">
            <p className="truncate text-base font-bold">i-CAPE Admin</p>
            <p className="truncate text-xs text-white/60">
              {adminName}
              {verifying ? " · syncing" : ""}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-2 hover:bg-white/10 md:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3 pb-4">
          {nav.map((item) => {
            const active = isNavActive(item.href, pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition",
                  active
                    ? "bg-accent text-brand"
                    : "text-white/80 hover:bg-white/10 hover:text-white",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="shrink-0 space-y-2 border-t border-white/10 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-brand">
              {(adminEmail || adminName).trim().charAt(0).toUpperCase() || "A"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white">
                {adminName}
              </p>
              <p
                className="truncate text-[11px] text-white/65"
                title={adminEmail || undefined}
              >
                {adminEmail || "Admin login"}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start bg-white/10 text-white hover:bg-white/20 hover:text-white"
            onClick={() => void logout()}
          >
            <LogOut className="size-4" />
            Log out
          </Button>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col md:pl-[11.7rem]">
        <button
          type="button"
          className="fixed left-3 top-3 z-20 rounded-md border border-border bg-white p-2 text-brand shadow-sm hover:bg-brand-soft md:hidden"
          onClick={() => setOpen(true)}
          aria-label="Open sidebar"
        >
          <Menu className="size-5" />
        </button>
        <main className="flex-1 p-4 pt-14 md:p-6 md:pt-6">
          {pathname !== "/admin/dashboard" &&
          nav.some((item) => item.href === pathname) ? (
            <AdminBackButton
              className="mb-4"
              onClick={() => {
                if (window.history.length > 1) {
                  router.back();
                } else {
                  router.push("/admin/dashboard");
                }
              }}
            />
          ) : null}
          {children}
        </main>
      </div>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          aria-label="Close menu overlay"
          onClick={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
