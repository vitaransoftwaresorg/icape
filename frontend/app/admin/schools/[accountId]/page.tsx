"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, KeyRound, Pencil, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  SchoolAccountDetailsView,
  type SchoolAccountDetail,
} from "@/components/admin/school-account-details";

export default function AdminSchoolDetailPage() {
  const params = useParams();
  const accountId = String(params.accountId || "");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const detailQuery = useQuery({
    queryKey: ["admin", "schools", "detail", accountId],
    enabled: Boolean(accountId),
    queryFn: async () => {
      const res = await apiRequest<SchoolAccountDetail>(
        `/admin/school-registrations/accounts/${accountId}/detail`,
      );
      if (!res.success || !res.data) {
        throw new Error(res.message || "Failed to load school details");
      }
      return res.data;
    },
  });

  async function setSchoolPassword() {
    if (!accountId) return;
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    const res = await apiRequest(
      `/admin/school-registrations/accounts/${accountId}/password`,
      {
        method: "POST",
        body: { password },
      },
    );
    setBusy(false);
    if (!res.success) {
      setError(res.message);
      return;
    }
    setMessage(res.message || "Password updated");
    setPassword("");
    setPasswordOpen(false);
    void detailQuery.refetch();
  }

  if (detailQuery.isPending) {
    return (
      <div className="rounded-2xl border border-border bg-white px-4 py-10 text-center text-sm text-muted">
        Loading school details…
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/schools"
          className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-brand"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to schools
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {detailQuery.error instanceof Error
            ? detailQuery.error.message
            : "School not found"}
        </div>
      </div>
    );
  }

  const account = detailQuery.data;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/admin/schools"
          className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-brand"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to schools
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/schools/register?accountId=${encodeURIComponent(accountId)}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Pencil className="size-4" aria-hidden />
            Edit
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setPasswordOpen(true);
              setPassword("");
              setError("");
              setMessage("");
            }}
          >
            <KeyRound className="size-4" aria-hidden />
            Set password
          </Button>
        </div>
      </div>

      {message ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">
          {message}
        </div>
      ) : null}
      {error && !passwordOpen ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <SchoolAccountDetailsView account={account} />

      {passwordOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-brand">Set password</h2>
                <p className="text-sm text-muted">
                  Update login password for this school account.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setPasswordOpen(false)}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
            {error ? (
              <p className="mb-3 text-sm text-red-600">{error}</p>
            ) : null}
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (min 6)"
              className="mb-3"
            />
            <div className="flex gap-2">
              <Button type="button" disabled={busy} onClick={setSchoolPassword}>
                Save password
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPasswordOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
