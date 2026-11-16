"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, getApiUrl } from "@/lib/api";
import { CURRENT_OLYMPIAD_YEAR, RESULT_GRADES, RESULT_OLYMPIADS } from "@/lib/results";
import { cn } from "@/lib/utils";
import { AdminBackButton } from "@/components/admin/admin-back-button";

type EditableInvalidRow = {
  rowNumber: number;
  sheet?: string | null;
  message: string;
  registrationNumber: string;
  studentName: string;
  schoolName: string;
  place: string;
  state: string;
  grade: number | string;
  marksObtained: number | string;
  totalMarks: number | string;
  percentage: number | string;
  rank: number | string;
};

type PreviewData = {
  fileName: string;
  sheetName?: string;
  headerRow?: number;
  sheetsProcessed?: Array<{
    name: string;
    headerRow: number;
    validRows: number;
    dataRows: number;
  }>;
  sheetTotalMarks?: number | null;
  inferredTotalMarksRule?: string;
  sheetHeadingNote?: string | null;
  columnMapping?: Array<{ field: string; excelHeader: string }>;
  detectedHeaders?: Array<{ excelHeader: string; mappedTo: string | null }>;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  skippedOtherGrades?: number;
  emptyRowsSkipped?: number;
  gradeFilter?: number | null;
  gradeBreakdown?: Record<string, number>;
  sampleRows?: Array<Record<string, string | number | null>>;
  sampleTotal?: number;
  samplePreviewCap?: number;
  sampleErrors: Array<{ rowNumber: number; message: string }>;
  editableInvalidRows?: EditableInvalidRow[];
  correctedApplied?: number;
};

function examTotalForGrade(grade: number) {
  if (grade >= 3 && grade <= 5) return 70;
  if (grade >= 6 && grade <= 10) return 100;
  return null;
}

type ManualRow = {
  key: string;
  registrationNumber: string;
  studentName: string;
  schoolName: string;
  schoolCode: string;
  place: string;
  state: string;
  grade: string;
  marksObtained: string;
  totalMarks: string;
  rank: string;
  schoolRank: string;
  status: string;
};

let manualRowSeq = 0;

function emptyManualRow(stableKey?: string): ManualRow {
  manualRowSeq += 1;
  return {
    // Prefer a stable key for the first SSR/client row to avoid hydration mismatch.
    key: stableKey ?? `manual-${manualRowSeq}`,
    registrationNumber: "",
    studentName: "",
    schoolName: "",
    schoolCode: "",
    place: "",
    state: "",
    grade: "3",
    marksObtained: "",
    totalMarks: "70",
    rank: "",
    schoolRank: "",
    status: "PARTICIPATED",
  };
}

function isReadyCorrection(row: EditableInvalidRow) {
  const grade = Number(row.grade);
  const marks = Number(row.marksObtained);
  const total =
    row.totalMarks === "" || row.totalMarks == null
      ? examTotalForGrade(grade)
      : Number(row.totalMarks);
  return (
    Boolean(String(row.registrationNumber).trim()) &&
    Boolean(String(row.studentName).trim()) &&
    Boolean(String(row.schoolName).trim()) &&
    Number.isFinite(grade) &&
    grade >= 3 &&
    grade <= 10 &&
    Number.isFinite(marks) &&
    total != null &&
    Number.isFinite(total) &&
    marks >= 0 &&
    marks <= total
  );
}

type UploadResponse = {
  preview: PreviewData;
  imported?: boolean;
  async?: boolean;
  uploadId?: string;
  importedRows?: number;
  targetRows?: number;
  status?: string;
};

type UploadStatusData = {
  id: string;
  fileName: string;
  status: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  importedRows: number;
  targetRows: number;
  percent: number;
  errorSummary: string | null;
};

type UploadHistoryItem = {
  id: string;
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  importedRows: number;
  status: string;
  errorSummary?: string | null;
  createdAt: string;
  olympiad: { code: string };
  uploadedBy: { name: string };
};

type JobPhase = "idle" | "previewing" | "starting" | "importing";

const FIELD_LABELS: Record<string, string> = {
  serialNo: "S.No.",
  registrationNumber: "Registration Number",
  studentName: "Student Name",
  schoolCode: "School ID",
  schoolName: "School Name",
  place: "Place",
  state: "State",
  grade: "Grade",
  marksObtained: "Marks (Total Marks column)",
  totalMarks: "Max / Out of",
  percentage: "Percentage",
  rank: "Rank",
  schoolRank: "School Rank",
  status: "Status",
};

export default function AdminUploadResultsPage() {
  const [olympiadCode, setOlympiadCode] = useState("IMO");
  const [grade, setGrade] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [editableInvalid, setEditableInvalid] = useState<EditableInvalidRow[]>(
    [],
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [jobPhase, setJobPhase] = useState<JobPhase>("idle");
  const [importStatus, setImportStatus] = useState<UploadStatusData | null>(
    null,
  );
  const [history, setHistory] = useState<UploadHistoryItem[]>([]);
  const [samplePage, setSamplePage] = useState(1);
  const [samplePageSize, setSamplePageSize] = useState(25);
  const [uploadMode, setUploadMode] = useState<"excel" | "manual">("excel");
  const [manualRows, setManualRows] = useState<ManualRow[]>([
    emptyManualRow("manual-initial"),
  ]);
  const [savingManual, setSavingManual] = useState(false);

  const readyCorrections = editableInvalid.filter(isReadyCorrection);
  const importCount = (preview?.validRows ?? 0) + readyCorrections.length;
  const busy = loading || jobPhase === "importing" || jobPhase === "starting";

  async function loadHistory() {
    const res = await apiRequest<UploadHistoryItem[]>("/results/admin/uploads");
    if (res.success && res.data) setHistory(res.data);
  }

  useEffect(() => {
    void loadHistory();
  }, []);

  async function pollImportStatus(uploadId: string) {
    setJobPhase("importing");
    let ticks = 0;
    for (;;) {
      const res = await apiRequest<UploadStatusData>(
        `/results/admin/uploads/${uploadId}/status`,
      );
      if (!res.success || !res.data) {
        setError(res.message || "Could not read import status");
        setJobPhase("idle");
        setLoading(false);
        return;
      }
      setImportStatus(res.data);
      ticks += 1;
      if (ticks % 3 === 0) await loadHistory();

      const status = res.data.status;
      if (
        status === "COMPLETED" ||
        status === "COMPLETED_WITH_ERRORS" ||
        status === "FAILED"
      ) {
        setLoading(false);
        setJobPhase("idle");
        if (status === "FAILED") {
          setError(res.data.errorSummary || "Import failed");
        } else {
          setMessage(
            `Import ${status}: ${res.data.importedRows} / ${res.data.targetRows} rows imported.`,
          );
          setFile(null);
          setEditableInvalid([]);
        }
        await loadHistory();
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  async function downloadErrorReport(uploadId: string) {
    const res = await fetch(
      `${getApiUrl()}/results/admin/uploads/${uploadId}/errors/download`,
      { credentials: "include" },
    );
    if (!res.ok) {
      setError("Could not download error report");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-errors-${uploadId}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function updateInvalidRow(
    index: number,
    field: keyof EditableInvalidRow,
    value: string,
  ) {
    setEditableInvalid((prev) => {
      const next = [...prev];
      const row = { ...next[index], [field]: value };
      if (field === "grade") {
        const g = Number(value);
        const auto = examTotalForGrade(g);
        if (auto != null) row.totalMarks = auto;
      }
      if (
        field === "marksObtained" ||
        field === "totalMarks" ||
        field === "grade"
      ) {
        const marks = Number(row.marksObtained);
        const total = Number(row.totalMarks);
        if (Number.isFinite(marks) && Number.isFinite(total) && total > 0) {
          row.percentage = Math.round((marks / total) * 10000) / 100;
        }
      }
      next[index] = row;
      return next;
    });
  }

  async function postUpload(confirm: boolean) {
    if (!file) {
      setError("Choose an Excel (.xlsx) file.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    setImportStatus(null);
    setJobPhase(confirm ? "starting" : "previewing");

    const body = new FormData();
    body.append("file", file);
    body.append("olympiadCode", olympiadCode);
    body.append("olympiadYear", CURRENT_OLYMPIAD_YEAR);
    if (grade) body.append("grade", grade);
    if (confirm && readyCorrections.length > 0) {
      body.append(
        "correctedRows",
        JSON.stringify(
          readyCorrections.map((row) => ({
            rowNumber: row.rowNumber,
            registrationNumber: String(row.registrationNumber).trim(),
            studentName: String(row.studentName).trim(),
            schoolName: String(row.schoolName).trim(),
            place: String(row.place || "").trim() || undefined,
            state: String(row.state || "").trim() || undefined,
            grade: Number(row.grade),
            marksObtained: Number(row.marksObtained),
            totalMarks:
              row.totalMarks === "" || row.totalMarks == null
                ? undefined
                : Number(row.totalMarks),
            percentage:
              row.percentage === "" || row.percentage == null
                ? undefined
                : Number(row.percentage),
            rank:
              row.rank === "" || row.rank == null ? null : Number(row.rank),
          })),
        ),
      );
    }

    const res = await fetch(
      `${getApiUrl()}/results/admin/upload/${confirm ? "confirm" : "preview"}`,
      {
        method: "POST",
        body,
        credentials: "include",
      },
    );
    const json = (await res.json()) as {
      success: boolean;
      message: string;
      data?: UploadResponse;
    };

    if (!json.success || !json.data) {
      setLoading(false);
      setJobPhase("idle");
      setError(json.message || "Upload failed");
      return;
    }

    setPreview(json.data.preview);
    setEditableInvalid(json.data.preview.editableInvalidRows ?? []);
    setSamplePage(1);

    if (confirm && json.data.uploadId) {
      setImportStatus({
        id: json.data.uploadId,
        fileName: json.data.preview.fileName,
        status: "PROCESSING",
        totalRows: json.data.preview.totalRows,
        validRows: json.data.preview.validRows,
        invalidRows: json.data.preview.invalidRows,
        duplicateRows: json.data.preview.duplicateRows,
        importedRows: 0,
        targetRows: json.data.targetRows ?? json.data.preview.validRows,
        percent: 0,
        errorSummary: `Starting import of ${json.data.targetRows ?? json.data.preview.validRows} rows…`,
      });
      await pollImportStatus(json.data.uploadId);
      return;
    }

    setLoading(false);
    setJobPhase("idle");
  }

  async function onPreview(e: FormEvent) {
    e.preventDefault();
    await postUpload(false);
  }

  function updateManualRow(
    index: number,
    field: keyof ManualRow,
    value: string,
  ) {
    setManualRows((prev) => {
      const next = [...prev];
      const row = { ...next[index], [field]: value };
      if (field === "grade") {
        const g = Number(value);
        const auto = examTotalForGrade(g);
        if (auto != null) row.totalMarks = String(auto);
      }
      next[index] = row;
      return next;
    });
  }

  async function saveManualResults() {
    setError("");
    setMessage("");
    setSavingManual(true);

    const completeRows = manualRows.filter(
      (r) =>
        r.registrationNumber.trim() &&
        r.studentName.trim() &&
        r.schoolName.trim() &&
        r.marksObtained !== "" &&
        Number.isFinite(Number(r.marksObtained)),
    );

    if (completeRows.length === 0) {
      setSavingManual(false);
      setError(
        "Fill Reg. No., Student, School, and Marks for at least one row.",
      );
      return;
    }

    const payload = completeRows.map((r) => ({
      registrationNumber: r.registrationNumber.trim(),
      studentName: r.studentName.trim(),
      schoolName: r.schoolName.trim(),
      schoolCode: r.schoolCode.trim() || undefined,
      place: r.place.trim() || undefined,
      state: r.state.trim() || undefined,
      grade: Number(r.grade),
      olympiadCode: String(olympiadCode).toUpperCase(),
      olympiadYear: CURRENT_OLYMPIAD_YEAR,
      marksObtained: Number(r.marksObtained),
      totalMarks: r.totalMarks ? Number(r.totalMarks) : undefined,
      rank:
        r.rank.trim() === "" || Number.isNaN(Number(r.rank))
          ? null
          : Number(r.rank),
      schoolRank:
        r.schoolRank.trim() === "" || Number.isNaN(Number(r.schoolRank))
          ? null
          : Number(r.schoolRank),
      status: r.status || "PARTICIPATED",
    }));

    try {
      const res = await apiRequest<{
        saved: number;
        inserted: number;
        updated: number;
        skippedInvalid: number;
        uploadId?: string | null;
        errors: Array<{ index: number; message: string }>;
      }>("/results/admin/manual", {
        method: "POST",
        body: { rows: payload },
      });

      if (!res.success || !res.data) {
        setError(res.message || "Could not save results");
        return;
      }

      if (res.data.saved === 0) {
        setError(
          res.data.errors?.length
            ? res.data.errors
                .map((err) => `Row ${err.index + 1}: ${err.message}`)
                .join(" · ")
            : "No rows were saved. Check required fields.",
        );
        await loadHistory();
        return;
      }

      setMessage(
        `Saved ${res.data.saved} to database (new ${res.data.inserted}, updated ${res.data.updated}). Check Upload history below.`,
      );
      if (res.data.errors?.length) {
        setError(
          res.data.errors
            .map((err) => `Row ${err.index + 1}: ${err.message}`)
            .join(" · "),
        );
      } else {
        setManualRows([emptyManualRow()]);
      }
      await loadHistory();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save results",
      );
    } finally {
      setSavingManual(false);
    }
  }

  async function onSaveManual(e: FormEvent) {
    e.preventDefault();
    await saveManualResults();
  }

  const progressPercent =
    importStatus?.percent ??
    (jobPhase === "previewing" || jobPhase === "starting" ? 8 : 0);
  const progressLabel =
    jobPhase === "previewing"
      ? "Reading & validating Excel…"
      : jobPhase === "starting"
        ? "Preparing import…"
        : importStatus?.errorSummary ||
          (importStatus
            ? `Importing ${importStatus.importedRows}/${importStatus.targetRows}…`
            : "");

  return (
    <div className="space-y-6">
      <div>
        <AdminBackButton href="/admin/results" className="mb-2" />
        <h1 className="text-2xl font-bold text-brand">Upload Results</h1>
        <p className="text-muted">
          Add results by Excel upload or enter them manually (one or many).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setUploadMode("excel")}
          className={cn(
            "rounded-md border px-4 py-2 text-sm font-semibold transition",
            uploadMode === "excel"
              ? "border-brand bg-brand text-white"
              : "border-border bg-white text-brand hover:bg-brand-soft",
          )}
        >
          Excel upload
        </button>
        <button
          type="button"
          onClick={() => setUploadMode("manual")}
          className={cn(
            "rounded-md border px-4 py-2 text-sm font-semibold transition",
            uploadMode === "manual"
              ? "border-brand bg-brand text-white"
              : "border-border bg-white text-brand hover:bg-brand-soft",
          )}
        >
          Manual entry
        </button>
      </div>

      {uploadMode === "manual" ? (
        <form
          onSubmit={onSaveManual}
          className="space-y-4 rounded-2xl border border-border bg-white p-5"
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-brand">
                Olympiad
              </label>
              <select
                value={olympiadCode}
                onChange={(e) => setOlympiadCode(e.target.value)}
                className="h-9 w-full rounded-md border border-border px-3 text-sm"
              >
                {RESULT_OLYMPIADS.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-brand-soft text-brand">
                <tr>
                  <th className="px-2 py-2">S.No.</th>
                  <th className="px-2 py-2">Reg. No.</th>
                  <th className="px-2 py-2">Student</th>
                  <th className="px-2 py-2">School</th>
                  <th className="px-2 py-2">School ID</th>
                  <th className="px-2 py-2">Place</th>
                  <th className="px-2 py-2">State</th>
                  <th className="px-2 py-2">Grade</th>
                  <th className="px-2 py-2">Marks</th>
                  <th className="px-2 py-2">Out of</th>
                  <th className="px-2 py-2">Rank</th>
                  <th className="px-2 py-2">Sch. Rank</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {manualRows.map((row, index) => (
                  <tr key={row.key} className="border-t border-border align-top">
                    <td className="px-2 py-2 tabular-nums text-muted">
                      {index + 1}
                    </td>
                    <td className="px-1 py-1">
                      <input
                        value={row.registrationNumber}
                        onChange={(e) =>
                          updateManualRow(
                            index,
                            "registrationNumber",
                            e.target.value,
                          )
                        }
                        className="h-8 w-28 rounded border border-border px-2"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        value={row.studentName}
                        onChange={(e) =>
                          updateManualRow(index, "studentName", e.target.value)
                        }
                        className="h-8 w-36 rounded border border-border px-2"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        value={row.schoolName}
                        onChange={(e) =>
                          updateManualRow(index, "schoolName", e.target.value)
                        }
                        className="h-8 w-40 rounded border border-border px-2"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        value={row.schoolCode}
                        onChange={(e) =>
                          updateManualRow(index, "schoolCode", e.target.value)
                        }
                        placeholder="auto"
                        className="h-8 w-28 rounded border border-border px-2"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        value={row.place}
                        onChange={(e) =>
                          updateManualRow(index, "place", e.target.value)
                        }
                        className="h-8 w-24 rounded border border-border px-2"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        value={row.state}
                        onChange={(e) =>
                          updateManualRow(index, "state", e.target.value)
                        }
                        className="h-8 w-24 rounded border border-border px-2"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <select
                        value={row.grade}
                        onChange={(e) =>
                          updateManualRow(index, "grade", e.target.value)
                        }
                        className="h-8 w-16 rounded border border-border px-1"
                      >
                        {RESULT_GRADES.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        value={row.marksObtained}
                        onChange={(e) =>
                          updateManualRow(
                            index,
                            "marksObtained",
                            e.target.value,
                          )
                        }
                        className="h-8 w-16 rounded border border-border px-2"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        value={row.totalMarks}
                        onChange={(e) =>
                          updateManualRow(index, "totalMarks", e.target.value)
                        }
                        className="h-8 w-16 rounded border border-border px-2"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        value={row.rank}
                        onChange={(e) =>
                          updateManualRow(index, "rank", e.target.value)
                        }
                        className="h-8 w-16 rounded border border-border px-2"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        value={row.schoolRank}
                        onChange={(e) =>
                          updateManualRow(index, "schoolRank", e.target.value)
                        }
                        className="h-8 w-16 rounded border border-border px-2"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <select
                        value={row.status}
                        onChange={(e) =>
                          updateManualRow(index, "status", e.target.value)
                        }
                        className="h-8 w-32 rounded border border-border px-1"
                      >
                        {[
                          "PARTICIPATED",
                          "PASSED",
                          "QUALIFIED",
                          "ABSENT",
                        ].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={manualRows.length <= 1}
                        onClick={() =>
                          setManualRows((prev) =>
                            prev.filter((_, i) => i !== index),
                          )
                        }
                        aria-label="Remove row"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-green-700">{message}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setManualRows((prev) => [...prev, emptyManualRow()])
              }
            >
              <Plus className="size-4" />
              Add row
            </Button>
            <Button
              type="button"
              variant="accent"
              disabled={savingManual}
              onClick={() => void saveManualResults()}
            >
              {savingManual
                ? "Saving…"
                : `Save ${manualRows.length} result${manualRows.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </form>
      ) : null}

      {uploadMode === "excel" ? (
        <>
        {jobPhase !== "idle" || importStatus ? (
          <div className="rounded-2xl border border-brand/20 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-muted">
                  Upload status
                </p>
                <p className="mt-1 text-lg font-bold text-brand">
                  {jobPhase === "idle" && importStatus
                    ? importStatus.status.replaceAll("_", " ")
                    : jobPhase === "previewing"
                      ? "Validating"
                      : jobPhase === "starting"
                        ? "Starting import"
                        : "Importing"}
                </p>
              </div>
              <p className="text-2xl font-bold text-brand">
                {Math.min(100, progressPercent)}%
              </p>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-brand-soft">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(progressPercent, 4))}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-muted">{progressLabel}</p>
            {importStatus ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <p className="text-xs text-muted">
                  {importStatus.fileName} · {importStatus.importedRows} imported
                  {importStatus.targetRows
                    ? ` of ${importStatus.targetRows}`
                    : ""}
                </p>
                {(importStatus.invalidRows > 0 ||
                  importStatus.status === "COMPLETED_WITH_ERRORS") &&
                importStatus.id ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-brand underline"
                    onClick={() => void downloadErrorReport(importStatus.id)}
                  >
                    Download error report
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <form
          onSubmit={onPreview}
          className="space-y-4 rounded-2xl border border-border bg-white p-5"
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-brand">
                Olympiad
              </label>
              <select
                value={olympiadCode}
                onChange={(e) => setOlympiadCode(e.target.value)}
                className="h-9 w-full rounded-md border border-border px-3 text-sm"
              >
                {RESULT_OLYMPIADS.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-brand">
                Grade
              </label>
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="h-9 w-full rounded-md border border-border px-3 text-sm"
              >
                <option value="">ALL Grades</option>
                {RESULT_GRADES.map((g) => (
                  <option key={g} value={g}>
                    Grade {g}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-brand">
              Excel file
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full cursor-pointer rounded-md border border-border bg-white px-3 py-2.5 text-sm text-brand file:mr-4 file:cursor-pointer file:rounded-md file:border file:border-brand/20 file:bg-brand-soft file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-brand hover:border-brand/40"
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-green-700">{message}</p> : null}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="outline" disabled={busy}>
              {jobPhase === "previewing" ? "Reading Excel…" : "Preview & Validate"}
            </Button>
            <Button
              type="button"
              variant="accent"
              disabled={busy || !preview || importCount === 0}
              onClick={() => void postUpload(true)}
            >
              {jobPhase === "starting" || jobPhase === "importing"
                ? "Importing…"
                : `Confirm Import (${importCount} rows${
                    readyCorrections.length
                      ? ` · ${readyCorrections.length} fixed`
                      : ""
                  })`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setPreview(null);
                setEditableInvalid([]);
                setFile(null);
                setError("");
                setMessage("");
                setImportStatus(null);
                setSamplePage(1);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>

        {preview ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-border bg-white p-5">
              <h2 className="text-lg font-bold text-brand">Preview summary</h2>
              <p className="mt-1 text-sm text-muted">
                {preview.fileName}
                {preview.sheetName ? ` · Sheets: ${preview.sheetName}` : ""}
                {preview.headerRow ? ` · Header row: ${preview.headerRow}` : ""}
              </p>
              {preview.sheetsProcessed && preview.sheetsProcessed.length > 0 ? (
                <p className="mt-1 text-sm text-muted">
                  Processed{" "}
                  {preview.sheetsProcessed
                    .map((s) => `${s.name} (${s.validRows} valid)`)
                    .join(", ")}
                </p>
              ) : null}
              {preview.sheetHeadingNote ? (
                <p className="mt-1 text-sm text-muted">{preview.sheetHeadingNote}</p>
              ) : null}
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Summary label="Data rows" value={preview.totalRows} />
                <Summary label="Valid (will import)" value={preview.validRows} />
                <Summary label="Invalid" value={preview.invalidRows} />
                <Summary label="Duplicates (skipped)" value={preview.duplicateRows} />
              </div>
              <div className="mt-3 space-y-1 text-sm text-muted">
                <p>
                  <span className="font-medium text-brand">Invalid:</span> row
                  failed checks (missing name/school/reg no, bad grade, marks
                  over total, etc.). See error list below.
                </p>
                <p>
                  <span className="font-medium text-brand">Duplicates:</span>{" "}
                  same Registration Number appears more than once in this file
                  for this olympiad. Extra copies are ignored — valid rows are
                  still imported.
                </p>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {preview.skippedOtherGrades != null && preview.skippedOtherGrades > 0 ? (
                  <Summary
                    label={
                      preview.gradeFilter
                        ? `Skipped (not Grade ${preview.gradeFilter})`
                        : "Skipped other grades"
                    }
                    value={preview.skippedOtherGrades}
                  />
                ) : null}
                {preview.emptyRowsSkipped != null && preview.emptyRowsSkipped > 0 ? (
                  <Summary
                    label="Blank Excel rows ignored"
                    value={preview.emptyRowsSkipped}
                  />
                ) : null}
              </div>
              {preview.gradeBreakdown &&
              Object.keys(preview.gradeBreakdown).length > 0 ? (
                <div className="mt-4 rounded-xl border border-border bg-brand-soft/40 px-4 py-3">
                  <p className="text-sm font-semibold text-brand">
                    Valid rows by grade
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(preview.gradeBreakdown)
                      .sort(([a], [b]) => Number(a) - Number(b))
                      .map(([g, count]) => (
                        <span
                          key={g}
                          className="rounded-full bg-white px-3 py-1 text-sm font-medium text-brand"
                        >
                          Grade {g}: {count}
                        </span>
                      ))}
                  </div>
                </div>
              ) : null}
            </div>

            {preview.columnMapping?.length ? (
              <div className="rounded-2xl border border-border bg-white p-5">
                <h2 className="text-lg font-bold text-brand">
                  Detected column mapping
                </h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead className="bg-brand-soft">
                      <tr>
                        <th className="px-3 py-2">Excel heading</th>
                        <th className="px-3 py-2">Mapped to</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.columnMapping.map((col) => (
                        <tr
                          key={`${col.field}-${col.excelHeader}`}
                          className="border-t"
                        >
                          <td className="px-3 py-2 font-medium text-brand">
                            {col.excelHeader}
                          </td>
                          <td className="px-3 py-2 text-muted">
                            {FIELD_LABELS[col.field] ?? col.field}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.detectedHeaders?.some((h) => !h.mappedTo) ? (
                  <p className="mt-3 text-xs text-muted">
                    Unmapped columns (ignored):{" "}
                    {preview.detectedHeaders
                      .filter((h) => !h.mappedTo)
                      .map((h) => h.excelHeader)
                      .join(", ")}
                  </p>
                ) : null}
              </div>
            ) : null}

            {preview.sampleRows && preview.sampleRows.length > 0 ? (
              <SamplePreviewTable
                rows={preview.sampleRows}
                sampleTotal={preview.sampleTotal ?? preview.sampleRows.length}
                samplePreviewCap={preview.samplePreviewCap}
                page={samplePage}
                pageSize={samplePageSize}
                onPageChange={setSamplePage}
                onPageSizeChange={(size) => {
                  setSamplePageSize(size);
                  setSamplePage(1);
                }}
              />
            ) : null}

            {editableInvalid.length > 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-white p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-brand">
                      Fix invalid rows
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      Edit the fields below, then Confirm Import. Ready:{" "}
                      <span className="font-semibold text-brand">
                        {readyCorrections.length}/{editableInvalid.length}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-left text-sm">
                    <thead className="bg-amber-50 text-brand">
                      <tr>
                        <th className="px-2 py-2">S.No.</th>
                        <th className="px-2 py-2">Reg. No.</th>
                        <th className="px-2 py-2">Student</th>
                        <th className="px-2 py-2">Issue</th>
                        <th className="px-2 py-2">School</th>
                        <th className="px-2 py-2">Place</th>
                        <th className="px-2 py-2">State</th>
                        <th className="px-2 py-2">Grade</th>
                        <th className="px-2 py-2">Marks</th>
                        <th className="px-2 py-2">Out of</th>
                        <th className="px-2 py-2">%</th>
                        <th className="px-2 py-2">Rank</th>
                        <th className="px-2 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editableInvalid.map((row, index) => {
                        const ready = isReadyCorrection(row);
                        return (
                          <tr
                            key={`${row.rowNumber}-${row.message}-${index}`}
                            className="border-t border-border align-top"
                          >
                            <td className="px-2 py-2 tabular-nums text-muted">
                              {index + 1}
                              <span className="mt-0.5 block text-[11px]">
                                Row {row.rowNumber}
                                {row.sheet ? ` · ${row.sheet}` : ""}
                              </span>
                            </td>
                            {(
                              [
                                "registrationNumber",
                                "studentName",
                              ] as const
                            ).map((field) => (
                              <td key={field} className="px-1 py-1">
                                <input
                                  value={String(row[field] ?? "")}
                                  onChange={(e) =>
                                    updateInvalidRow(index, field, e.target.value)
                                  }
                                  className="h-8 w-full min-w-[100px] rounded border border-border px-2 text-sm"
                                />
                              </td>
                            ))}
                            <td className="max-w-[180px] px-2 py-2 text-xs text-red-700">
                              {row.message}
                            </td>
                            {(
                              [
                                "schoolName",
                                "place",
                                "state",
                              ] as const
                            ).map((field) => (
                              <td key={field} className="px-1 py-1">
                                <input
                                  value={String(row[field] ?? "")}
                                  onChange={(e) =>
                                    updateInvalidRow(index, field, e.target.value)
                                  }
                                  className="h-8 w-full min-w-[100px] rounded border border-border px-2 text-sm"
                                />
                              </td>
                            ))}
                            <td className="px-1 py-1">
                              <select
                                value={String(row.grade ?? "")}
                                onChange={(e) =>
                                  updateInvalidRow(index, "grade", e.target.value)
                                }
                                className="h-8 w-20 rounded border border-border px-1 text-sm"
                              >
                                <option value="">—</option>
                                {RESULT_GRADES.map((g) => (
                                  <option key={g} value={g}>
                                    {g}
                                  </option>
                                ))}
                              </select>
                            </td>
                            {(
                              [
                                "marksObtained",
                                "totalMarks",
                                "percentage",
                                "rank",
                              ] as const
                            ).map((field) => (
                              <td key={field} className="px-1 py-1">
                                <input
                                  type="number"
                                  value={String(row[field] ?? "")}
                                  onChange={(e) =>
                                    updateInvalidRow(index, field, e.target.value)
                                  }
                                  className="h-8 w-20 rounded border border-border px-2 text-sm"
                                />
                              </td>
                            ))}
                            <td className="px-2 py-2">
                              {ready ? (
                                <span className="text-xs font-semibold text-green-700">
                                  Ready
                                </span>
                              ) : (
                                <span className="text-xs text-amber-700">
                                  Fix needed
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : preview.sampleErrors.length ? (
              <div className="rounded-2xl border border-border bg-white p-5">
                <h2 className="text-lg font-bold text-brand">Row issues</h2>
                <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-brand-soft">
                      <tr>
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">Issue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sampleErrors.map((err) => (
                        <tr
                          key={`${err.rowNumber}-${err.message}`}
                          className="border-t"
                        >
                          <td className="px-3 py-2">{err.rowNumber}</td>
                          <td className="px-3 py-2">{err.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                No validation errors — ready to import.
              </p>
            )}
          </div>
        ) : null}

        </>
      ) : null}

        <div className="rounded-2xl border border-border bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-brand">Upload history</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadHistory()}
            >
              Refresh
            </Button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-brand-stats text-white">
                <tr>
                  <th className="px-3 py-2">File</th>
                  <th className="px-3 py-2">Olympiad</th>
                  <th className="px-3 py-2">Imported</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Progress</th>
                  <th className="px-3 py-2">By</th>
                  <th className="px-3 py-2">Report</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => {
                  const target = item.validRows || item.totalRows || 0;
                  const pct =
                    item.status === "PROCESSING" && target > 0
                      ? Math.min(
                          99,
                          Math.round((item.importedRows / target) * 100),
                        )
                      : item.status === "COMPLETED" ||
                          item.status === "COMPLETED_WITH_ERRORS"
                        ? 100
                        : item.status === "FAILED"
                          ? Math.round(
                              ((item.importedRows || 0) / Math.max(target, 1)) *
                                100,
                            )
                          : 0;
                  return (
                    <tr key={item.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        {item.fileName.startsWith("Manual entry") ? (
                          <span className="font-medium text-brand">
                            {item.fileName}
                            <span className="mt-0.5 block text-[11px] font-normal text-muted">
                              Manual
                            </span>
                          </span>
                        ) : (
                          item.fileName
                        )}
                      </td>
                      <td className="px-3 py-2">{item.olympiad.code}</td>
                      <td className="px-3 py-2">
                        {item.importedRows}/{target || item.totalRows}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            item.status === "PROCESSING"
                              ? "font-semibold text-amber-700"
                              : item.status === "FAILED"
                                ? "font-semibold text-red-700"
                                : "text-brand"
                          }
                        >
                          {item.status.replaceAll("_", " ")}
                        </span>
                        {item.errorSummary && item.status === "PROCESSING" ? (
                          <span className="mt-0.5 block text-[11px] text-muted">
                            {item.errorSummary}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-brand-soft">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="mt-1 block text-[11px] text-muted">
                          {pct}%
                        </span>
                      </td>
                      <td className="px-3 py-2">{item.uploadedBy.name}</td>
                      <td className="px-3 py-2">
                        {item.invalidRows > 0 ||
                        item.status === "COMPLETED_WITH_ERRORS" ||
                        item.status === "FAILED" ? (
                          <button
                            type="button"
                            className="text-xs font-semibold text-brand underline"
                            onClick={() => void downloadErrorReport(item.id)}
                          >
                            Errors
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-brand-soft/60 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="text-xl font-bold text-brand">{value}</p>
    </div>
  );
}

function SamplePreviewTable({
  rows,
  sampleTotal,
  samplePreviewCap,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  rows: Array<Record<string, string | number | null>>;
  sampleTotal: number;
  samplePreviewCap?: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-brand">Sample data preview</h2>
          <p className="mt-1 text-sm text-muted">
            Showing {start + 1}–{Math.min(start + pageSize, rows.length)} of{" "}
            {rows.length} preview rows
            {sampleTotal > rows.length
              ? ` (valid in file: ${sampleTotal}${
                  samplePreviewCap
                    ? `, capped at ${samplePreviewCap} for preview`
                    : ""
                })`
              : ` · ${sampleTotal} valid`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted" htmlFor="sample-page-size">
            Rows / page
          </label>
          <select
            id="sample-page-size"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-9 rounded-md border border-border bg-white px-2 text-sm"
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-brand-stats text-white">
            <tr>
              <th className="px-3 py-2">S.No.</th>
              <th className="px-3 py-2">Reg. No.</th>
              <th className="px-3 py-2">Student</th>
              <th className="px-3 py-2">School</th>
              <th className="px-3 py-2">Place</th>
              <th className="px-3 py-2">State</th>
              <th className="px-3 py-2">Grade</th>
              <th className="px-3 py-2">Marks</th>
              <th className="px-3 py-2">Out of</th>
              <th className="px-3 py-2">%</th>
              <th className="px-3 py-2">Rank</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, index) => (
              <tr
                key={`${row.rowNumber}-${row.registrationNumber}`}
                className="border-t border-border"
              >
                <td className="px-3 py-2 text-muted">{start + index + 1}</td>
                <td className="px-3 py-2">{row.registrationNumber}</td>
                <td className="px-3 py-2">{row.studentName}</td>
                <td className="px-3 py-2">{row.schoolName}</td>
                <td className="px-3 py-2">{row.place ?? "—"}</td>
                <td className="px-3 py-2">{row.state ?? "—"}</td>
                <td className="px-3 py-2">{row.grade}</td>
                <td className="px-3 py-2">{row.marksObtained}</td>
                <td className="px-3 py-2">{row.totalMarks}</td>
                <td className="px-3 py-2">{row.percentage}</td>
                <td className="px-3 py-2">{row.rank ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Page {safePage} of {totalPages}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => onPageChange(1)}
          >
            First
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
          >
            Next
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(totalPages)}
          >
            Last
          </Button>
        </div>
      </div>
    </div>
  );
}
