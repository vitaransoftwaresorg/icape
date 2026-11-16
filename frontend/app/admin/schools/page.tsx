"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Pencil,
  X,
} from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AdminTableShell, AdminTableSkeletonRows } from "@/components/admin/admin-table-shell";
import { AdminSearchField } from "@/components/admin/admin-search-field";
import { apiRequest } from "@/lib/api";
import {
  adminQueryKeys,
  ADMIN_LIST_REFETCH_MS,
  fetchAdminAccounts,
} from "@/lib/admin-queries";
import { useDebouncedValue } from "@/lib/use-debounced-value";

type AccountRow = {
  id: string;
  email: string;
  password?: string;
  name: string | null;
  createdAt: string;
  registrationCount: number;
  registrationId?: string | null;
  schoolName: string;
  schoolCode: string;
  city: string;
  state: string;
  district: string;
  contactName: string;
  phone: string;
  status: string | null;
  studentCount: number;
  imoCount: number;
  isoCount: number;
  ieoCount: number;
  olympiadTotal: number;
  amountExpected?: number;
  olympiadYear: { label: string; code: string } | null;
};

function formatMoney(amount: number | null | undefined) {
  if (amount == null || Number.isNaN(Number(amount))) return "—";
  return `₹${Number(amount).toLocaleString("en-IN")}`;
}

const PAGE_SIZE = 20;

function statusClass(status: string | null) {
  switch (status) {
    case "APPROVED":
      return "bg-green-100 text-green-800 border-green-200";
    case "UNDER_REVIEW":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "REJECTED":
      return "bg-red-100 text-red-800 border-red-200";
    case "DRAFT":
      return "bg-brand-soft text-brand border-border";
    default:
      return "bg-background text-muted border-border";
  }
}

export default function AdminSchoolsPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const debouncedInput = useDebouncedValue(searchInput, 300);
  const q = debouncedInput.trim();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [passwordId, setPasswordId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [q]);

  const schoolsQuery = useQuery({
    queryKey: adminQueryKeys.schools(page, q),
    queryFn: () =>
      fetchAdminAccounts({
        page,
        limit: PAGE_SIZE,
        q: q || undefined,
        approved: true,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: ADMIN_LIST_REFETCH_MS,
  });

  const rows = (schoolsQuery.data?.accounts || []) as AccountRow[];
  const totalPages = schoolsQuery.data?.pagination.totalPages || 1;
  const total = schoolsQuery.data?.pagination.total || 0;
  const serialOffset = (page - 1) * PAGE_SIZE;
  const totals = schoolsQuery.data?.totals || {
    imo: 0,
    iso: 0,
    ieo: 0,
    total: 0,
    payment: 0,
    schools: total,
  };
  const olympiadEntriesTotal =
    totals.total ?? totals.imo + totals.iso + totals.ieo;
  const showInitialLoading = schoolsQuery.isPending && !schoolsQuery.data;

  async function setSchoolPassword() {
    if (!passwordId) return;
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    const res = await apiRequest(
      `/admin/school-registrations/accounts/${passwordId}/password`,
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
    setPasswordId(null);
  }

  const queryError =
    error ||
    (schoolsQuery.isError
      ? schoolsQuery.error instanceof Error
        ? schoolsQuery.error.message
        : "Failed to load schools"
      : "");

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand">Schools</h1>
          <p className="mt-1 text-sm text-muted">
            Approved school registrations for the active Olympiad Year.
          </p>
        </div>
        <div
          aria-label="Schools and olympiad entry totals"
          className="flex shrink-0 items-stretch overflow-hidden rounded-lg border border-border bg-white"
        >
          {(
            [
              { code: "IMO", count: totals.imo },
              { code: "IEO", count: totals.ieo },
              { code: "ISO", count: totals.iso },
              { code: "Total", count: olympiadEntriesTotal },
            ] as const
          ).map((item, index) => (
            <div
              key={item.code}
              className={
                index > 0
                  ? "border-l border-border px-3.5 py-2 text-center sm:px-4"
                  : "px-3.5 py-2 text-center sm:px-4"
              }
            >
              <p className="text-[11px] font-semibold tracking-wide text-muted">
                {item.code}
              </p>
              <p className="text-base font-bold tabular-nums leading-tight text-brand">
                {showInitialLoading ? "—" : item.count}
              </p>
            </div>
          ))}
          <div className="border-l border-border px-3.5 py-2 text-center sm:px-4">
            <p className="text-[11px] font-semibold tracking-wide text-muted">
              Payment
            </p>
            <p className="text-base font-bold tabular-nums leading-tight text-brand">
              {showInitialLoading ? "—" : formatMoney(totals.payment || 0)}
            </p>
          </div>
          <div className="border-l border-brand/20 bg-brand px-3.5 py-2 text-center sm:px-4">
            <p className="text-[11px] font-semibold tracking-wide text-white/80">
              Schools
            </p>
            <p className="text-base font-bold tabular-nums leading-tight text-white">
              {showInitialLoading ? "—" : totals.schools || total}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-white p-3">
        <AdminSearchField
          value={searchInput}
          onChange={setSearchInput}
          placeholder="School name, code, email, city…"
        />
      </div>

      {queryError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {queryError}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
          {message}
        </div>
      ) : null}

      <AdminTableShell
        loading={showInitialLoading}
        className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_8px_24px_rgba(13,23,59,0.05)]"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-brand-stats text-white">
              <tr>
                <th className="px-3 py-3 font-semibold">S.No.</th>
                <th className="px-4 py-3 font-semibold">School name</th>
                <th className="px-3 py-3 font-semibold">School code</th>
                <th className="px-3 py-3 font-semibold">Contact</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 text-center font-semibold">IMO</th>
                <th className="px-3 py-3 text-center font-semibold">IEO</th>
                <th className="px-3 py-3 text-center font-semibold">ISO</th>
                <th className="px-3 py-3 text-center font-semibold">Total</th>
                <th className="px-3 py-3 text-center font-semibold">Payment</th>
                <th className="px-3 py-3 text-center font-semibold">Students</th>
                <th className="px-3 py-3 text-center font-semibold">Details</th>
                <th className="px-3 py-3 text-center font-semibold">Edit</th>
                <th className="px-3 py-3 text-center font-semibold">Password</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-t border-border",
                    index % 2 === 0 ? "bg-white" : "bg-brand-soft/20",
                  )}
                >
                  <td className="px-3 py-3 tabular-nums text-muted">
                    {serialOffset + index + 1}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-brand">
                      {row.schoolName || "—"}
                    </p>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs font-bold tracking-wide text-brand">
                    {row.schoolCode || "—"}
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-brand">{row.contactName || "—"}</p>
                    <p className="text-xs text-muted">{row.phone || ""}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                        statusClass(row.status),
                      )}
                    >
                      {row.status || "No registration"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center font-semibold text-brand">
                    {row.imoCount}
                  </td>
                  <td className="px-3 py-3 text-center font-semibold text-brand">
                    {row.ieoCount}
                  </td>
                  <td className="px-3 py-3 text-center font-semibold text-brand">
                    {row.isoCount}
                  </td>
                  <td className="px-3 py-3 text-center font-bold text-brand">
                    {row.olympiadTotal}
                  </td>
                  <td className="px-3 py-3 text-center align-middle">
                    {row.registrationId ? (
                      <Link
                        href={`/admin/registrations?status=APPROVED&id=${encodeURIComponent(row.registrationId)}`}
                        className="text-sm font-semibold tabular-nums text-brand underline underline-offset-2 hover:text-brand-hover"
                        title="Open payment review for this school"
                      >
                        {formatMoney(row.amountExpected || 0)}
                      </Link>
                    ) : (
                      <span className="text-sm tabular-nums text-muted">
                        {formatMoney(row.amountExpected || 0)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center align-middle">
                    {row.schoolCode ? (
                      <Link
                        href={`/admin/students?schoolCode=${encodeURIComponent(row.schoolCode)}`}
                        className="text-sm font-semibold text-brand underline underline-offset-2 hover:text-brand-hover"
                      >
                        Students
                      </Link>
                    ) : (
                      <span className="text-sm text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center align-middle">
                    <Link
                      href={`/admin/schools/${row.id}`}
                      className="text-sm font-semibold text-brand underline underline-offset-2 hover:text-brand-hover"
                    >
                      Details
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-center align-middle">
                    <Link
                      href={`/admin/schools/register?accountId=${encodeURIComponent(row.id)}`}
                      title="Edit school"
                      aria-label="Edit school"
                      className="inline-flex size-8 items-center justify-center rounded-md text-brand hover:bg-brand-soft"
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-center align-middle">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setPasswordId(row.id);
                        setPassword("");
                        setMessage("");
                        setError("");
                      }}
                    >
                      <KeyRound className="size-3.5" aria-hidden />
                      Update
                    </Button>
                  </td>
                </tr>
              ))}
              {!showInitialLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-10 text-center text-muted">
                    No schools found.
                  </td>
                </tr>
              ) : null}
              {showInitialLoading ? (
                <AdminTableSkeletonRows columns={14} rows={8} />
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
          <p className="text-sm text-muted">
            Page {page} of {totalPages}
            {total > 0
              ? ` · Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`
              : null}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page <= 1 || schoolsQuery.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-4" aria-hidden />
              Prev
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page >= totalPages || schoolsQuery.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </AdminTableShell>

      {passwordId ? (
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
                onClick={() => setPasswordId(null)}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
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
                onClick={() => setPasswordId(null)}
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
