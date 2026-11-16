"use client";

import Link from "next/link";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminBackButton } from "@/components/admin/admin-back-button";
import { AdminSearchField } from "@/components/admin/admin-search-field";
import {
  AdminTableShell,
  AdminTableSkeletonRows,
} from "@/components/admin/admin-table-shell";
import {
  ADMIN_LIST_REFETCH_MS,
  adminQueryKeys,
  fetchAdminAccounts,
} from "@/lib/admin-queries";
import { useDebouncedValue } from "@/lib/use-debounced-value";

export default function AdminAddStudentsPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const debouncedQ = useDebouncedValue(q, 300);

  const query = useQuery({
    queryKey: adminQueryKeys.schools(page, debouncedQ),
    queryFn: () =>
      fetchAdminAccounts({
        page,
        limit: 20,
        q: debouncedQ,
        approved: true,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: ADMIN_LIST_REFETCH_MS,
  });

  const rows = query.data?.accounts ?? [];
  const totalPages = query.data?.pagination.totalPages ?? 1;
  const total = query.data?.pagination.total ?? 0;
  const showInitialLoading = query.isLoading && !query.data;

  return (
    <div className="space-y-6">
      <div>
        <AdminBackButton href="/admin/schools" className="mb-2" />
        <h1 className="text-2xl font-bold text-brand">Add More Students</h1>
        <p className="mt-1 text-sm text-muted">
          Choose an approved school, then continue from student details and
          payment.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <AdminSearchField
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Search school name, code, or email"
        />
      </div>

      <AdminTableShell
        loading={showInitialLoading}
        className="overflow-hidden rounded-2xl border border-border bg-white"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-brand-stats text-white">
              <tr>
                <th className="px-4 py-3 font-semibold">School</th>
                <th className="px-3 py-3 font-semibold">Code</th>
                <th className="px-3 py-3 font-semibold">Students</th>
                <th className="px-3 py-3 font-semibold">City</th>
                <th className="px-3 py-3 font-semibold">Email</th>
                <th className="px-3 py-3 text-right font-semibold"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.id}
                  className={
                    index % 2 === 1 ? "border-t border-border bg-slate-50/50" : "border-t border-border"
                  }
                >
                  <td className="px-4 py-3 font-semibold text-brand">
                    {row.schoolName || row.name || "—"}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs tracking-wider">
                    {row.schoolCode || "—"}
                  </td>
                  <td className="px-3 py-3">{row.studentCount ?? "—"}</td>
                  <td className="px-3 py-3 text-muted">{row.city || "—"}</td>
                  <td className="px-3 py-3 text-muted">{row.email}</td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/admin/schools/register?accountId=${encodeURIComponent(row.id)}&mode=add-students`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-semibold text-brand hover:bg-accent-hover"
                    >
                      <UserPlus className="size-4" aria-hidden />
                      Add students
                    </Link>
                  </td>
                </tr>
              ))}
              {!showInitialLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">
                    No approved schools found.
                  </td>
                </tr>
              ) : null}
              {showInitialLoading ? (
                <AdminTableSkeletonRows columns={6} rows={8} />
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
          <p className="text-sm text-muted">
            Page {page} of {totalPages}
            {total > 0 ? ` · ${total.toLocaleString("en-IN")} schools` : null}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page <= 1 || query.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-4" aria-hidden />
              Prev
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page >= totalPages || query.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </AdminTableShell>
    </div>
  );
}
