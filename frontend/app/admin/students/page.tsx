"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Pencil,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  adminQueryKeys,
  ADMIN_LIST_REFETCH_MS,
  adminStudentTemplateUrl,
  createAdminStudent,
  fetchAdminStudents,
  importAdminStudentsExcel,
  updateAdminStudent,
} from "@/lib/admin-queries";
import { AdminTableShell, AdminTableSkeletonRows } from "@/components/admin/admin-table-shell";
import { AdminSearchField } from "@/components/admin/admin-search-field";
import { RESULT_GRADES, RESULT_OLYMPIADS } from "@/lib/results";
import { useAdminStudentExport } from "@/providers/admin-export-provider";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { cn } from "@/lib/utils";

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

type AddDraft = EditDraft & { schoolCode: string };

const PAGE_SIZE = 50;

const EMPTY_ADD_DRAFT: AddDraft = {
  schoolCode: "",
  name: "",
  grade: "3",
  section: "",
  mobile: "",
  imo: false,
  iso: false,
  ieo: false,
};

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
  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState<AddDraft>(EMPTY_ADD_DRAFT);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadSchoolCode, setUploadSchoolCode] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDragging, setUploadDragging] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
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
    setAddOpen(false);
    setUploadOpen(false);
    setSaveError("");
    setSaveMessage("");
  }

  function closeEdit() {
    if (saveBusy) return;
    setEditing(null);
    setDraft(null);
    setSaveError("");
  }

  function openAdd() {
    setEditing(null);
    setDraft(null);
    setUploadOpen(false);
    setAddDraft({ ...EMPTY_ADD_DRAFT, schoolCode });
    setAddOpen(true);
    setSaveError("");
    setSaveMessage("");
  }

  function closeAdd() {
    if (saveBusy) return;
    setAddOpen(false);
    setSaveError("");
  }

  function openUpload() {
    setEditing(null);
    setDraft(null);
    setAddOpen(false);
    setUploadSchoolCode(schoolCode);
    setUploadFile(null);
    setUploadDragging(false);
    setUploadOpen(true);
    setSaveError("");
    setSaveMessage("");
  }

  function closeUpload() {
    if (saveBusy) return;
    setUploadOpen(false);
    setUploadFile(null);
    setUploadDragging(false);
    setSaveError("");
  }

  function pickUploadFile(file: File | null | undefined) {
    if (!file) {
      setUploadFile(null);
      return;
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      setSaveError("Please choose an Excel file (.xlsx or .xls)");
      setUploadFile(null);
      return;
    }
    setSaveError("");
    setUploadFile(file);
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

  async function saveAdd() {
    const name = addDraft.name.trim();
    const gradeNum = Number(addDraft.grade);
    if (!addDraft.schoolCode) {
      setSaveError("Select a school");
      return;
    }
    if (name.length < 2) {
      setSaveError("Enter student name");
      return;
    }
    if (!RESULT_GRADES.includes(gradeNum as (typeof RESULT_GRADES)[number])) {
      setSaveError("Select a valid grade");
      return;
    }
    if (!addDraft.imo && !addDraft.iso && !addDraft.ieo) {
      setSaveError("Select at least one olympiad");
      return;
    }

    setSaveBusy(true);
    setSaveError("");
    try {
      await createAdminStudent({
        schoolCode: addDraft.schoolCode,
        name,
        grade: gradeNum,
        section: addDraft.section.trim(),
        mobile: addDraft.mobile.trim(),
        imo: addDraft.imo,
        iso: addDraft.iso,
        ieo: addDraft.ieo,
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "students"] });
      setSchoolFilter(addDraft.schoolCode);
      setSaveMessage("Student added");
      setAddOpen(false);
      setAddDraft(EMPTY_ADD_DRAFT);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to add student",
      );
    } finally {
      setSaveBusy(false);
    }
  }

  async function saveUpload() {
    if (!uploadSchoolCode) {
      setSaveError("Select a school");
      return;
    }
    if (!uploadFile) {
      setSaveError("Choose an Excel file");
      return;
    }

    setSaveBusy(true);
    setSaveError("");
    try {
      const result = await importAdminStudentsExcel(
        uploadSchoolCode,
        uploadFile,
      );
      await queryClient.invalidateQueries({ queryKey: ["admin", "students"] });
      setSchoolFilter(uploadSchoolCode);
      const parts = [`Added ${result.added} student(s)`];
      if (result.skipped > 0) {
        parts.push(`skipped ${result.skipped} existing`);
      }
      setSaveMessage(parts.join(", "));
      setUploadOpen(false);
      setUploadFile(null);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to import students",
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
        <Button type="button" size="sm" onClick={openAdd}>
          <Plus className="size-4" aria-hidden />
          Add student
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={openUpload}>
          <Upload className="size-4" aria-hidden />
          Upload Excel
        </Button>
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
              <StudentFormFields
                draft={draft}
                disabled={saveBusy}
                onChange={(patch) =>
                  setDraft((d) => (d ? { ...d, ...patch } : d))
                }
              />
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

      {addOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-brand">Add student</h2>
                <p className="text-sm text-muted">
                  Adds one student to an approved school. Existing students stay
                  as they are.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={closeAdd}
                disabled={saveBusy}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">
                  School
                </label>
                <select
                  value={addDraft.schoolCode}
                  onChange={(e) =>
                    setAddDraft((d) => ({ ...d, schoolCode: e.target.value }))
                  }
                  disabled={saveBusy}
                  className="h-9 w-full rounded-md border border-border px-3 text-sm"
                >
                  <option value="">Select school</option>
                  {schools.map((s) => (
                    <option key={s.schoolCode} value={s.schoolCode}>
                      {s.schoolName} ({s.schoolCode})
                    </option>
                  ))}
                </select>
              </div>
              <StudentFormFields
                draft={addDraft}
                disabled={saveBusy}
                onChange={(patch) => setAddDraft((d) => ({ ...d, ...patch }))}
              />
              {saveError ? (
                <p className="text-sm text-red-600">{saveError}</p>
              ) : null}
            </div>

            <div className="mt-5 flex gap-2">
              <Button type="button" disabled={saveBusy} onClick={() => void saveAdd()}>
                {saveBusy ? "Saving…" : "Save student"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saveBusy}
                onClick={closeAdd}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {uploadOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-brand">Upload Excel</h2>
                <p className="text-sm text-muted">
                  Use the official template. Matching name + grade + section rows
                  are skipped so existing students are not overwritten.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={closeUpload}
                disabled={saveBusy}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">
                  School
                </label>
                <select
                  value={uploadSchoolCode}
                  onChange={(e) => setUploadSchoolCode(e.target.value)}
                  disabled={saveBusy}
                  className="h-9 w-full rounded-md border border-border px-3 text-sm"
                >
                  <option value="">Select school</option>
                  {schools.map((s) => (
                    <option key={s.schoolCode} value={s.schoolCode}>
                      {s.schoolName} ({s.schoolCode})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-brand-soft/30 px-3 py-2">
                <p className="text-sm text-muted">
                  Fill Name, Grade, Section, Mobile, IMO/ISO/IEO
                </p>
                <a
                  href={adminStudentTemplateUrl()}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand underline underline-offset-2 hover:text-brand-hover"
                >
                  <Download className="size-3.5" aria-hidden />
                  Download template
                </a>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold text-muted">
                  Excel file
                </p>
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="sr-only"
                  disabled={saveBusy}
                  onChange={(e) => {
                    pickUploadFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Upload Excel file"
                  onKeyDown={(e) => {
                    if (saveBusy) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      uploadInputRef.current?.click();
                    }
                  }}
                  onClick={() => {
                    if (!saveBusy) uploadInputRef.current?.click();
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!saveBusy) setUploadDragging(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!saveBusy) setUploadDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setUploadDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setUploadDragging(false);
                    if (saveBusy) return;
                    pickUploadFile(e.dataTransfer.files?.[0]);
                  }}
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-5 text-center transition",
                    uploadDragging
                      ? "border-brand bg-brand-soft/60"
                      : "border-border bg-brand-soft/20 hover:border-brand/50 hover:bg-brand-soft/40",
                    saveBusy && "pointer-events-none opacity-60",
                  )}
                >
                  <span className="inline-flex size-10 items-center justify-center rounded-full bg-brand text-white">
                    {uploadFile ? (
                      <FileSpreadsheet className="size-4" aria-hidden />
                    ) : (
                      <Upload className="size-4" aria-hidden />
                    )}
                  </span>
                  {uploadFile ? (
                    <>
                      <p className="mt-2 max-w-full truncate px-2 text-sm font-semibold text-brand">
                        {uploadFile.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {(uploadFile.size / 1024).toFixed(1)} KB · click to
                        replace
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mt-2 text-sm font-semibold text-brand">
                        Drag & drop Excel here
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        or click Browse · .xlsx / .xls
                      </p>
                    </>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    disabled={saveBusy}
                    onClick={(e) => {
                      e.stopPropagation();
                      uploadInputRef.current?.click();
                    }}
                  >
                    <Upload className="size-3.5" aria-hidden />
                    {uploadFile ? "Change file" : "Browse files"}
                  </Button>
                </div>
              </div>

              {saveError ? (
                <p className="text-sm text-red-600">{saveError}</p>
              ) : null}
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                disabled={saveBusy}
                onClick={() => void saveUpload()}
              >
                {saveBusy ? "Importing…" : "Import & save"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saveBusy}
                onClick={closeUpload}
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

function StudentFormFields({
  draft,
  disabled,
  onChange,
}: {
  draft: EditDraft;
  disabled?: boolean;
  onChange: (patch: Partial<EditDraft>) => void;
}) {
  return (
    <>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">
          Student name
        </label>
        <Input
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          disabled={disabled}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">
            Grade
          </label>
          <select
            value={draft.grade}
            onChange={(e) => onChange({ grade: e.target.value })}
            disabled={disabled}
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
            onChange={(e) => onChange({ section: e.target.value })}
            disabled={disabled}
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">
          Mobile
        </label>
        <Input
          value={draft.mobile}
          onChange={(e) => onChange({ mobile: e.target.value })}
          disabled={disabled}
          inputMode="numeric"
          maxLength={12}
        />
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold text-muted">Olympiads</p>
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
                disabled={disabled}
                onChange={(e) => onChange({ [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
      </div>
    </>
  );
}
