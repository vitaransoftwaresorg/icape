"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Printer,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getApiUrl } from "@/lib/api";
import {
  fetchMyStudents,
  type RegistrationStudent,
} from "@/lib/school-api";
import { RESULT_GRADES, RESULT_OLYMPIADS } from "@/lib/results";
import { LIVE_DATA_REFETCH_MS } from "@/lib/live-refresh";

const PAGE_SIZE = 25;

function olympiadLabel(row: RegistrationStudent) {
  return [
    row.imo ? "IMO" : null,
    row.iso ? "ISO" : null,
    row.ieo ? "IEO" : null,
  ]
    .filter(Boolean)
    .join(", ");
}

export function SchoolApprovedStudents() {
  const [olympiad, setOlympiad] = useState("");
  const [grade, setGrade] = useState("");
  const [applied, setApplied] = useState({ olympiad: "", grade: "" });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<RegistrationStudent[]>([]);
  const [totals, setTotals] = useState({
    studentCount: 0,
    imo: 0,
    iso: 0,
    ieo: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState<"excel" | "pdf" | "print" | null>(
    null,
  );

  async function load(
    nextPage = page,
    nextFilters = applied,
    options?: { silent?: boolean },
  ) {
    if (!options?.silent) setLoading(true);
    setError("");
    const res = await fetchMyStudents({
      olympiad: nextFilters.olympiad || undefined,
      grade: nextFilters.grade || undefined,
      page: nextPage,
      limit: PAGE_SIZE,
    });
    if (!res.success) {
      if (!options?.silent) {
        setError(res.message || "Could not load students");
        setRows([]);
        setTotals({ studentCount: 0, imo: 0, iso: 0, ieo: 0 });
        setTotal(0);
        setTotalPages(1);
        setLoading(false);
      }
      return;
    }
    setRows(res.data?.students || []);
    setTotals(
      res.data?.totals || { studentCount: 0, imo: 0, iso: 0, ieo: 0 },
    );
    setPage(res.data?.pagination.page || nextPage);
    setTotalPages(res.data?.pagination.totalPages || 1);
    setTotal(res.data?.pagination.total || 0);
    setLoading(false);
  }

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      void load(page, applied, { silent: true });
    }, LIVE_DATA_REFETCH_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, applied]);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    const next = { olympiad, grade };
    setApplied(next);
    setPage(1);
    await load(1, next);
  }

  async function downloadExport(format: "excel" | "pdf" | "print") {
    setExporting(format);
    setError("");
    const params = new URLSearchParams();
    if (applied.olympiad) params.set("olympiad", applied.olympiad);
    if (applied.grade) params.set("grade", applied.grade);
    const path =
      format === "excel"
        ? `/school-registration/students/export.xlsx?${params}`
        : format === "print"
          ? `/school-registration/students/export.print?${params}`
          : `/school-registration/students/export.pdf?${params}`;
    try {
      const res = await fetch(`${getApiUrl()}${path}`, {
        credentials: "include",
      });
      if (!res.ok) {
        setError(
          format === "print"
            ? "Could not open print view"
            : `Could not download ${format.toUpperCase()} file`,
        );
        return;
      }
      if (format === "print") {
        const html = await res.text();
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
          setError("Allow pop-ups to print the student list");
          return;
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename =
        match?.[1] ||
        (format === "excel" ? "i-cape-students.xlsx" : "i-cape-students.pdf");
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(
        format === "print"
          ? "Could not open print view"
          : `Could not download ${format.toUpperCase()} file`,
      );
    } finally {
      setExporting(null);
    }
  }

  const serialOffset = (page - 1) * PAGE_SIZE;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-brand">Registered students</h2>
          <p className="mt-1 text-sm text-muted">
            Filter by olympiad and class, then download or print the list.
          </p>
        </div>
        <div
          aria-label="Olympiad entry totals"
          className="flex shrink-0 items-stretch overflow-hidden rounded-lg border border-border bg-white"
        >
          {(
            [
              { code: "Students", count: totals.studentCount },
              { code: "IMO", count: totals.imo },
              { code: "ISO", count: totals.iso },
              { code: "IEO", count: totals.ieo },
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
                {loading ? "—" : item.count}
              </p>
            </div>
          ))}
          <div className="border-l border-brand/20 bg-brand px-3.5 py-2 text-center sm:px-4">
            <p className="text-[11px] font-semibold tracking-wide text-white/80">
              Entries
            </p>
            <p className="text-base font-bold tabular-nums leading-tight text-white">
              {loading ? "—" : totals.imo + totals.iso + totals.ieo}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-white p-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <form
          onSubmit={onSearch}
          className="flex min-w-0 flex-1 flex-wrap items-end gap-3"
        >
          <label className="min-w-[140px] flex-1 text-sm sm:max-w-[200px]">
            <span className="mb-1 block font-semibold text-brand">Olympiad</span>
            <select
              className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
              value={olympiad}
              onChange={(e) => setOlympiad(e.target.value)}
            >
              <option value="">All olympiads</option>
              {RESULT_OLYMPIADS.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[120px] flex-1 text-sm sm:max-w-[160px]">
            <span className="mb-1 block font-semibold text-brand">Class</span>
            <select
              className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
            >
              <option value="">All classes</option>
              {RESULT_GRADES.map((g) => (
                <option key={g} value={String(g)}>
                  Class {g}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={loading}>
            <Search className="size-4" aria-hidden />
            Apply
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || exporting !== null}
            onClick={() => void downloadExport("excel")}
          >
            <FileSpreadsheet className="size-4" aria-hidden />
            {exporting === "excel" ? "Downloading…" : "Excel"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || exporting !== null}
            onClick={() => void downloadExport("pdf")}
          >
            <Download className="size-4" aria-hidden />
            {exporting === "pdf" ? "Downloading…" : "PDF"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || exporting !== null}
            onClick={() => void downloadExport("print")}
          >
            <Printer className="size-4" aria-hidden />
            {exporting === "print" ? "Preparing…" : "Print"}
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <div className="rounded-xl border border-border bg-white px-3 py-8 text-center text-sm text-muted">
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-white px-3 py-8 text-center text-sm text-muted">
          No students for the selected filters
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-brand-stats text-white">
              <tr>
                <th className="px-3 py-3">S.No.</th>
                <th className="px-3 py-3">Reg. No.</th>
                <th className="px-3 py-3">Student</th>
                <th className="px-3 py-3">Grade</th>
                <th className="px-3 py-3">Section</th>
                <th className="px-3 py-3">Olympiads</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.id || row.registrationNumber}
                  className="border-t border-border"
                >
                  <td className="px-3 py-3">{serialOffset + index + 1}</td>
                  <td className="px-3 py-3 font-mono text-xs font-medium">
                    {row.registrationNumber}
                  </td>
                  <td className="px-3 py-3 font-semibold text-brand">
                    {row.name}
                  </td>
                  <td className="px-3 py-3">{row.grade}</td>
                  <td className="px-3 py-3">{row.section || "—"}</td>
                  <td className="px-3 py-3">{olympiadLabel(row) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <p>
          {loading
            ? "Loading…"
            : total === 0
              ? "No students"
              : `Showing ${serialOffset + 1}–${serialOffset + rows.length} of ${total}`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || page <= 1}
            onClick={() => void load(page - 1)}
          >
            <ChevronLeft className="size-4" aria-hidden />
            Prev
          </Button>
          <span className="tabular-nums text-brand">
            Page {page} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || page >= totalPages}
            onClick={() => void load(page + 1)}
          >
            Next
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </section>
  );
}
