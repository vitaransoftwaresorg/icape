"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Pencil,
  X,
} from "lucide-react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  adminQueryKeys,
  ADMIN_LIST_REFETCH_MS,
  fetchAdminStudents,
  updateAdminStudent,
} from "@/lib/admin-queries";
import { AdminTableShell, AdminTableSkeletonRows } from "@/components/admin/admin-table-shell";
import { AdminSearchField } from "@/components/admin/admin-search-field";
import { RESULT_GRADES, RESULT_OLYMPIADS } from "@/lib/results";
import { useAdminStudentExport } from "@/providers/admin-export-provider";
import { useDebouncedValue } from "@/lib/use-debounced-value";

type StudentRow = {
  id: string;
  registrationNumber: string;
  name: string;
  grade: number;
  section: string;
  mobile: string;
  imo: boolean;
  iso: boolean;
  ieo: boolean;
  schoolCode: string;
  schoolName: string;
  city: string;
  state: string;
  status: string;
  registrationId: string;
};

type EditDraft = {
  name: string;
  grade: string;
  section: string;
  mobile: string;
  imo: boolean;
  iso: boolean;
  ieo: boolean;
};

const PAGE_SIZE = 50;

function OlympiadFlags({ row }: { row: StudentRow }) {
  const flags = [
    row.imo ? "IMO" : null,
    row.iso ? "ISO" : null,
    row.ieo ? "IEO" : null,
  ].filter(Boolean);
  if (flags.length === 0) {
    return <span className="text-muted">—</span>;
  }
  return (
    <span className="inline-flex flex-wrap gap-1">
      {flags.map((code) => (
        <span
          key={code}
          className="rounded border border-border bg-brand-soft/50 px-1.5 py-0.5 text-[11px] font-semibold text-brand"
        >
          {code}
        </span>
      ))}
    </span>
  );
}

type AppliedFilters = {
  q: string;
  schoolCode: string;
  schoolName: string;
  olympiad: string;
  grade: string;
};

function buildStudentsHeading(applied: AppliedFilters) {
  const parts: string[] = [];

  if (applied.schoolName) {
    parts.push(applied.schoolName);
  } else if (applied.schoolCode) {
    parts.push(applied.schoolCode);
  }

  if (applied.olympiad) parts.push(applied.olympiad);
  if (applied.grade) parts.push(`Grade ${applied.grade}`);

  if (parts.length === 0) {
    return {
      title: "All Students",
      subtitle: applied.q
        ? `Showing matches for “${applied.q}”`
        : "Approved students for Olympiad Year 2026-2027",
    };
  }

  return {
    title: `${parts.join(" · ")} Students`,
    subtitle: applied.q
      ? `Showing matches for “${applied.q}”`
      : "Filtered approved students",
  };
}

function toEditDraft(row: StudentRow): EditDraft {
  return {
    name: row.name,
    grade: String(row.grade),
    section: row.section || "",
    mobile: row.mobile || "",
    imo: row.imo,
    iso: row.iso,
    ieo: row.ieo,
  };
}

export default function AdminStudentsPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-border bg-white px-4 py-10 text-center text-sm text-muted">
          Loading students…
        </div>
      }
    >
      <AdminStudentsPageInner />
    </Suspense>
  );
}

function AdminStudentsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const schoolCodeFromUrl = searchParams.get("schoolCode")?.trim() || "";
  const {
    job: exportJob,
    starting: startingExport,
    error: exportError,
    isBusy: exportBusy,
    startExport: queueExport,
    clearError: clearExportError,
  } = useAdminStudentExport();
  const [q, setQ] = useState("");
  const [schoolCode, setSchoolCode] = useState(schoolCodeFromUrl);
  const [olympiad, setOlympiad] = useState("");
  const [grade, setGrade] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);
  const appliedQ = debouncedQ.trim();

  useEffect(() => {
    setSchoolCode(schoolCodeFromUrl);
    setPage(1);
  }, [schoolCodeFromUrl]);

  useEffect(() => {
    setPage(1);
  }, [appliedQ, schoolCode, olympiad, grade]);

  function setSchoolFilter(next: string) {
    setSchoolCode(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("schoolCode", next);
    else params.delete("schoolCode");
    const qs = params.toString();
    router.replace(qs ? `/admin/students?${qs}` : "/admin/students");
  }

  const filters = {
    page,
    q: appliedQ,
    schoolCode,
    olympiad,
    grade,
  };

  const studentsQuery = useQuery({
    queryKey: adminQueryKeys.students(filters),
    queryFn: () =>
      fetchAdminStudents({
        page: filters.page,
        limit: PAGE_SIZE,
        q: filters.q,
        schoolCode: filters.schoolCode,
        olympiad: filters.olympiad,
        grade: filters.grade,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: ADMIN_LIST_REFETCH_MS,
  });

  const rows = (studentsQuery.data?.students || []) as StudentRow[];
  const schools = studentsQuery.data?.filters.schools || [];
  const totalPages = studentsQuery.data?.pagination.totalPages || 1;
  const serialOffset = (page - 1) * PAGE_SIZE;
  const showInitialLoading = studentsQuery.isPending && !studentsQuery.data;
  const error =
    exportError ||
    (studentsQuery.isError
      ? studentsQuery.error instanceof Error
        ? studentsQuery.error.message
        : "Failed to load students"
      : "");

  const applied = useMemo<AppliedFilters>(() => {
    const matchedSchool = schools.find((s) => s.schoolCode === schoolCode);
    return {
      q: appliedQ,
      schoolCode,
      schoolName: matchedSchool?.schoolName || "",
      olympiad,
      grade,
    };
  }, [appliedQ, schoolCode, olympiad, grade, schools]);

  async function startExport(format: "pdf" | "xlsx") {
    clearExportError();
    await queueExport({
      q: applied.q || undefined,
      schoolCode: applied.schoolCode || undefined,
      olympiad: applied.olympiad || undefined,
      grade: applied.grade ? Number(applied.grade) : undefined,
      format,
    });
  }

  function openEdit(row: StudentRow) {
    setEditing(row);
    setDraft(toEditDraft(row));
    setSaveError("");
    setSaveMessage("");
  }

  function closeEdit() {
    if (saveBusy) return;
    setEditing(null);
    setDraft(null);
    setSaveError("");
  }

  async function saveEdit() {
    if (!editing || !draft) return;
    const name = draft.name.trim();
    const gradeNum = Number(draft.grade);
    if (name.length < 2) {
      setSaveError("Enter student name");
      return;
    }
    if (!RESULT_GRADES.includes(gradeNum as (typeof RESULT_GRADES)[number])) {
      setSaveError("Select a valid grade");
      return;
    }
    if (!draft.imo && !draft.iso && !draft.ieo) {
      setSaveError("Select at least one olympiad");
      return;
    }

    setSaveBusy(true);
    setSaveError("");
    try {
      await updateAdminStudent(editing.id, {
        name,
        grade: gradeNum,
        section: draft.section.trim(),
        mobile: draft.mobile.trim(),
        imo: draft.imo,
        iso: draft.iso,
        ieo: draft.ieo,
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "students"] });
      setSaveMessage("Student updated");
      setEditing(null);
      setDraft(null);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to update student",
      );
    } finally {
      setSaveBusy(false);
    }
  }

  const heading = useMemo(() => buildStudentsHeading(applied), [applied]);
  const loading = studentsQuery.isFetching;
  const totals = studentsQuery.data?.totals || {
    schools: 0,
    imo: 0,
    ieo: 0,
    iso: 0,
    total: 0,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand">{heading.title}</h1>
          <p className="text-muted">{heading.subtitle}</p>
        </div>
        <div
          aria-label="Schools and olympiad entry totals"
          className="flex shrink-0 items-stretch overflow-hidden rounded-lg border border-border bg-white"
        >
          {(
            [
              { code: "Schools", count: totals.schools },
              { code: "IMO", count: totals.imo },
              { code: "IEO", count: totals.ieo },
              { code: "ISO", count: totals.iso },
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
          <div className="border-l border-brand/20 bg-brand px-3.5 py-2 text-center sm:px-4">
            <p className="text-[11px] font-semibold tracking-wide text-white/80">
              Total
            </p>
            <p className="text-base font-bold tabular-nums leading-tight text-white">
              {showInitialLoading ? "—" : totals.total}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-border bg-white p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <AdminSearchField
          value={q}
          onChange={setQ}
          placeholder="Reg no / student / school"
          className="sm:col-span-2"
        />
        <select
          value={schoolCode}
          onChange={(e) => setSchoolFilter(e.target.value)}
          className="h-9 rounded-md border border-border px-3 text-sm"
        >
          <option value="">All schools</option>
          {schoolCode &&
          !schools.some((s) => s.schoolCode === schoolCode) ? (
            <option value={schoolCode}>{schoolCode}</option>
          ) : null}
          {schools.map((s) => (
            <option key={s.schoolCode} value={s.schoolCode}>
              {s.schoolName} ({s.schoolCode})
            </option>
          ))}
        </select>
        <select
          value={olympiad}
          onChange={(e) => setOlympiad(e.target.value)}
          className="h-9 rounded-md border border-border px-3 text-sm"
        >
          <option value="">All olympiads</option>
          {RESULT_OLYMPIADS.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        <select
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          className="h-9 rounded-md border border-border px-3 text-sm"
        >
          <option value="">All grades</option>
          {RESULT_GRADES.map((g) => (
            <option key={g} value={g}>
              Grade {g}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="accent"
          size="sm"
          disabled={exportBusy}
          onClick={() => void startExport("pdf")}
        >
          <Download className="size-4" aria-hidden />
          {startingExport === "pdf" ||
          ((exportJob?.status === "PENDING" ||
            exportJob?.status === "PROCESSING") &&
            exportJob.format !== "xlsx")
            ? "Preparing PDF…"
            : "Download PDF"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={exportBusy}
          onClick={() => void startExport("xlsx")}
        >
          <FileSpreadsheet className="size-4" aria-hidden />
          {startingExport === "xlsx" ||
          ((exportJob?.status === "PENDING" ||
            exportJob?.status === "PROCESSING") &&
            exportJob.format === "xlsx")
            ? "Preparing Excel…"
            : "Download Excel"}
        </Button>
      </div>

      {exportJob?.status === "FAILED" ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {exportJob.errorMessage || "Export failed"}
        </div>
      ) : null}

      {error && exportJob?.status !== "FAILED" ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : null}

      {saveMessage ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
          {saveMessage}
        </div>
      ) : null}

      <AdminTableShell
        loading={showInitialLoading}
        className="overflow-x-auto rounded-xl border border-border bg-white"
      >
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-brand-stats text-white">
            <tr>
              <th className="px-3 py-3">S.No.</th>
              <th className="px-3 py-3">Reg. No.</th>
              <th className="px-3 py-3">Student</th>
              <th className="px-3 py-3">School code</th>
              <th className="px-3 py-3">School name</th>
              <th className="px-3 py-3">Grade</th>
              <th className="px-3 py-3">Section</th>
              <th className="px-3 py-3">Olympiads</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3 text-center">Edit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-3 py-3 tabular-nums text-muted">
                  {serialOffset + index + 1}
                </td>
                <td className="px-3 py-3 font-mono text-xs font-medium">
                  {row.registrationNumber}
                </td>
                <td className="px-3 py-3">{row.name}</td>
                <td className="px-3 py-3 font-mono text-xs font-medium">
                  {row.schoolCode || "—"}
                </td>
                <td className="px-3 py-3 font-semibold text-brand">
                  {row.schoolName || "—"}
                </td>
                <td className="px-3 py-3">{row.grade}</td>
                <td className="px-3 py-3">{row.section || "—"}</td>
                <td className="px-3 py-3">
                  <OlympiadFlags row={row} />
                </td>
                <td className="px-3 py-3">
                  <span className="inline-flex rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">
                    Approved
                  </span>
                </td>
                <td className="px-3 py-3 text-center">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => openEdit(row)}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
            {!showInitialLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-muted">
                  No students found
                </td>
              </tr>
            ) : null}
            {showInitialLoading ? (
              <AdminTableSkeletonRows columns={10} rows={10} />
            ) : null}
          </tbody>
        </table>
      </AdminTableShell>

      <div className="flex items-center justify-end gap-2 text-sm text-muted">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading || page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          <ChevronLeft className="size-4" aria-hidden />
          Prev
        </Button>
        <span>
          Page {page} / {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading || page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>

      {editing && draft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-brand">Edit student</h2>
                <p className="text-sm text-muted">
                  Registration number cannot be changed.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={closeEdit}
                disabled={saveBusy}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">
                  Reg. No.
                </label>
                <Input
                  value={editing.registrationNumber}
                  disabled
                  className="font-mono"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">
                  Student name
                </label>
                <Input
                  value={draft.name}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, name: e.target.value } : d))
                  }
                  disabled={saveBusy}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">
                    Grade
                  </label>
                  <select
                    value={draft.grade}
                    onChange={(e) =>
                      setDraft((d) =>
                        d ? { ...d, grade: e.target.value } : d,
                      )
                    }
                    disabled={saveBusy}
                    className="h-9 w-full rounded-md border border-border px-3 text-sm"
                  >
                    {RESULT_GRADES.map((g) => (
                      <option key={g} value={g}>
                        Grade {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">
                    Section
                  </label>
                  <Input
                    value={draft.section}
                    onChange={(e) =>
                      setDraft((d) =>
                        d ? { ...d, section: e.target.value } : d,
                      )
                    }
                    disabled={saveBusy}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">
                  Mobile
                </label>
                <Input
                  value={draft.mobile}
                  onChange={(e) =>
                    setDraft((d) =>
                      d ? { ...d, mobile: e.target.value } : d,
                    )
                  }
                  disabled={saveBusy}
                  inputMode="numeric"
                  maxLength={12}
                />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-muted">
                  Olympiads
                </p>
                <div className="flex flex-wrap gap-4">
                  {(
                    [
                      ["imo", "IMO"],
                      ["ieo", "IEO"],
                      ["iso", "ISO"],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="inline-flex items-center gap-2 text-sm text-brand"
                    >
                      <input
                        type="checkbox"
                        checked={draft[key]}
                        disabled={saveBusy}
                        onChange={(e) =>
                          setDraft((d) =>
                            d ? { ...d, [key]: e.target.checked } : d,
                          )
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              {saveError ? (
                <p className="text-sm text-red-600">{saveError}</p>
              ) : null}
            </div>

            <div className="mt-5 flex gap-2">
              <Button type="button" disabled={saveBusy} onClick={() => void saveEdit()}>
                {saveBusy ? "Saving…" : "Save changes"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saveBusy}
                onClick={closeEdit}
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
