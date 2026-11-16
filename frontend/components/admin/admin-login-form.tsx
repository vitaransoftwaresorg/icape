"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  ClipboardCheck,
  School,
  Shield,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { apiRequest } from "@/lib/api";
import { broadcastAuthChanged } from "@/lib/auth-session-sync";
import { OLYMPIAD_YEAR_LABEL } from "@/lib/registration-announcement";
import { cn } from "@/lib/utils";

const ADMIN_HIGHLIGHTS = [
  {
    icon: School,
    title: "Schools & registrations",
    text: "Review incomplete and submitted school registrations.",
  },
  {
    icon: ClipboardCheck,
    title: "Payment verification",
    text: "Approve or reject registration payments with proof.",
  },
  {
    icon: BarChart3,
    title: "Results & reports",
    text: "Upload, update, and publish olympiad results.",
  },
] as const;

export function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setLoading(true);
    const res = await apiRequest("/auth/login", {
      method: "POST",
      body: { email: email.trim(), password },
    });
    setLoading(false);
    if (!res.success) {
      setError(res.message || "Login failed");
      return;
    }
    const adminName =
      res.data &&
      typeof res.data === "object" &&
      "name" in res.data &&
      typeof (res.data as { name?: unknown }).name === "string"
        ? (res.data as { name: string }).name
        : "Admin";
    try {
      sessionStorage.setItem(
        "icape-admin-session",
        JSON.stringify({ name: adminName, at: Date.now() }),
      );
    } catch {
      /* ignore e */
    }
    broadcastAuthChanged();
    window.location.assign("/admin/dashboard");
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-brand">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(212,175,55,0.28),transparent_45%),radial-gradient(ellipse_at_bottom_right,rgba(255,255,255,0.08),transparent_40%)]" />
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.45)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.45)_1px,transparent_1px)] [background-size:48px_48px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-8 sm:px-6 lg:py-12">
        <div className="mb-6 sm:mb-8">
          <Link
            href="/"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "inline-flex border-white/25 bg-white/10 text-white hover:bg-white/15 hover:text-white",
            )}
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to home
          </Link>
        </div>

        <div className="grid flex-1 items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <section className="text-white">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-accent">
              <Shield className="size-3.5" aria-hidden />
              Secure admin access
            </div>
            <h1 className="mt-4 font-[family-name:var(--font-source-serif)] text-3xl font-bold leading-tight sm:text-4xl lg:text-[2.75rem]">
              i-CAPE Olympiad
              <span className="mt-1 block text-accent">
                Administration Portal
              </span>
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-white/75 sm:text-lg">
              Sign in to manage school registrations, verify payments, and
              publish results for Olympiad Year {OLYMPIAD_YEAR_LABEL}.
            </p>

            <ul className="mt-8 space-y-4">
              {ADMIN_HIGHLIGHTS.map((item) => (
                <li key={item.title} className="flex gap-3">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-accent">
                    <item.icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="font-bold text-white">{item.title}</p>
                    <p className="mt-0.5 text-sm text-white/65">{item.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-6 shadow-[0_24px_60px_rgba(0,0,0,0.28)] sm:p-8">
            <div className="flex flex-col items-center text-center">
              <Image
                src="/brand/icape-logo.webp"
                alt="i-CAPE"
                width={80}
                height={80}
                className="h-16 w-auto object-contain sm:h-[4.5rem]"
                priority
              />
              <h2 className="mt-4 font-[family-name:var(--font-source-serif)] text-2xl font-bold text-brand sm:text-3xl">
                Admin Login
              </h2>
              <div className="mx-auto mt-2 h-0.5 w-24 bg-accent" aria-hidden />
              <p className="mt-3 text-sm text-muted sm:text-base">
                Enter your admin email and password to continue
              </p>
            </div>

            <form className="mt-8 space-y-4" onSubmit={onSubmit} noValidate>
              <div>
                <label
                  htmlFor="admin-email"
                  className="mb-1.5 block text-sm font-semibold text-brand"
                >
                  Email
                </label>
                <Input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  autoComplete="username"
                />
              </div>

              <div>
                <label
                  htmlFor="admin-password"
                  className="mb-1.5 block text-sm font-semibold text-brand"
                >
                  Password
                </label>
                <PasswordInput
                  id="admin-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                />
              </div>

              {error ? (
                <p className="text-sm font-medium text-red-600" role="alert">
                  {error}
                </p>
              ) : null}

              <Button
                type="submit"
                variant="accent"
                className="w-full"
                disabled={loading}
              >
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <p className="mt-6 text-center text-xs text-muted">
              Authorised i-CAPE staff only. Unauthorised access is prohibited.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
