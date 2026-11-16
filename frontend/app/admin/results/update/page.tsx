"use client";

import { FormEvent, useState } from "react";
import { Pencil, School, UserRound, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api";
import { CURRENT_OLYMPIAD_YEAR, RESULT_OLYMPIADS } from "@/lib/results";
import { cn } from "@/lib/utils";
import { AdminBackButton } from "@/components/admin/admin-back-button";

type AdminResultRow = {
  id: string;
  registrationNumber: string;
  studentName: string;
  schoolCode: string;
  schoolName: string;
  olympiad: string;
  grade: number;
  marksObtained: number | null;
  totalMarks: number | null;
  percentage: number | null;
  rank: number | null;
  schoolRank: number | null;
  status: string;
};

type Draft = {
  marksObtained: string;
  totalMarks: string;
  rank: string;
  schoolRank: string;
  status: string;
};

const STATUSES = ["PARTICIPATED", "PASSED", "QUALIFIED", "ABSENT"] as const;

function toDraft(row: AdminResultRow): Draft {
  return {
    marksObtained:
      row.marksObtained == null ? "" : String(row.marksObtained),
    totalMarks: row.totalMarks == null ? "" : String(row.totalMarks),
    rank: row.rank == null ? "" : String(row.rank),
    schoolRank: row.schoolRank == null ? "" : String(row.schoolRank),
    status: row.status || "PARTICIPATED",
  };
}

export default function AdminUpdateResultsPage() {
  const [mode, setMode] = useState<"student" | "school">("student");
  const [query, setQuery] = useState("");
  const [olympiad, setOlympiad] = useState("");

  const [rows, setRows] = useState<AdminResultRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function search(e?: FormEvent) {
    e?.preventDefault();
    setError("");
    setMessage("");
    setEditingId(null);

    const q = query.trim();
    if (!q) {
      setError(
        mode === "student"
          ? "Enter a student registration number (Student ID)."
          : "Enter a school ID or school name.",
      );
      setRows([]);
      return;
    }

    setLoading(true);
    const params = new URLSearchParams({
      page: "1",
      limit: "100",
      q,
      olympiadYear: CURRENT_OLYMPIAD_YEAR,
    });
    if (olympiad) params.set("olympiad", olympiad);

    const res = await apiRequest<{
      results: AdminResultRow[];
      pagination: { total: number };
    }>(`/results/admin/list?${params.toString()}`);
    setLoading(false);

    if (!res.success || !res.data) {
      setError(res.message || "Search failed");
      setRows([]);
      setDrafts({});
      return;
    }

    let next = res.data.results;
    if (mode === "student") {
      const upper = q.toUpperCase();
      const exact = next.filter(
        (r) => r.registrationNumber.toUpperCase() === upper,
      );
      next = exact.length ? exact : next;
    } else {
      const lower = q.toLowerCase();
      const exactCode = next.filter(
        (r) => r.schoolCode.toLowerCase() === lower,
      );
      const exactName = next.filter(
        (r) => r.schoolName.toLowerCase() === lower,
      );
      if (exactCode.length) next = exactCode;
      else if (exactName.length) next = exactName;
    }

    setRows(next);
    const nextDrafts: Record<string, Draft> = {};
    for (const row of next) nextDrafts[row.id] = toDraft(row);
    setDrafts(nextDrafts);

    if (next.length === 0) {
      setError(
        mode === "student"
          ? "No results found for this student ID."
          : "No results found for this school.",
      );
    } else {
      setMessage(
        `Found ${next.length} result${next.length === 1 ? "" : "s"}. Click Edit to update.`,
      );
    }
  }

  function updateDraft(id: string, field: keyof Draft, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  }

  async function saveRow(row: AdminResultRow) {
    const draft = drafts[row.id];
    if (!draft) return;

    const marksObtained = Number(draft.marksObtained);
    const totalMarks = Number(draft.totalMarks);
    if (!Number.isFinite(marksObtained) || !Number.isFinite(totalMarks)) {
      setError("Marks and total marks must be numbers.");
      return;
    }
    if (marksObtained < 0 || totalMarks <= 0 || marksObtained > totalMarks) {
      setError("Marks must be between 0 and total marks.");
      return;
    }

    setSavingId(row.id);
    setError("");
    setMessage("");

    const payload = {
      marksObtained,
      totalMarks,
      rank:
        draft.rank.trim() === "" || Number.isNaN(Number(draft.rank))
          ? null
          : Number(draft.rank),
      schoolRank:
        draft.schoolRank.trim() === "" ||
        Number.isNaN(Number(draft.schoolRank))
          ? null
          : Number(draft.schoolRank),
      status: draft.status,
    };

    const res = await apiRequest(`/results/admin/${row.id}`, {
      method: "PATCH",
      body: payload,
    });
    setSavingId(null);

    if (!res.success) {
      setError(res.message || "Could not update result");
      return;
    }

    const percentage =
      totalMarks > 0
        ? Math.round((marksObtained / totalMarks) * 10000) / 100
        : null;

    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? {
              ...r,
              marksObtained,
              totalMarks,
              percentage,
              rank: payload.rank,
              schoolRank: payload.schoolRank,
              status: payload.status,
            }
          : r,
      ),
    );
    setDrafts((prev) => ({
      ...prev,
      [row.id]: {
        marksObtained: String(marksObtained),
        totalMarks: String(totalMarks),
        rank: payload.rank == null ? "" : String(payload.rank),
        schoolRank:
          payload.schoolRank == null ? "" : String(payload.schoolRank),
        status: payload.status,
      },
    }));
    setEditingId(null);
    setMessage(`Updated ${row.registrationNumber} · ${row.olympiad}.`);
  }

  function cancelEdit(row: AdminResultRow) {
    setDrafts((prev) => ({ ...prev, [row.id]: toDraft(row) }));
    setEditingId(null);
  }

  return (
    <div className="space-y-5">
      <div>
        <AdminBackButton href="/admin/results" className="mb-2" />
        <h1 className="text-2xl font-bold text-brand">Update Results</h1>
        <p className="text-muted">
          Find a student or school, then edit marks, ranks, and status.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("student");
            setRows([]);
            setError("");
            setMessage("");
            setEditingId(null);
          }}
          className={cn(
            "inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition",
            mode === "student"
              ? "border-brand bg-brand text-white"
              : "border-border bg-white text-brand hover:bg-brand-soft",
          )}
        >
          <UserRound className="size-4" />
          Student wise
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("school");
            setRows([]);
            setError("");
            setMessage("");
            setEditingId(null);
          }}
          className={cn(
            "inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition",
            mode === "school"
              ? "border-brand bg-brand text-white"
              : "border-border bg-white text-brand hover:bg-brand-soft",
          )}
        >
          <School className="size-4" />
          School wise
        </button>
      </div>

      <form
        onSubmit={(e) => void search(e)}
        className="rounded-2xl border border-border bg-white p-5"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-semibold text-brand">
              {mode === "student" ? "Student ID (Reg. No.)" : "School ID / Name"}
            </label>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                mode === "student"
                  ? "e.g. BROWSERSAVE01"
                  : "School code or school name"
              }
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-brand">
              Olympiad
            </label>
            <select
              value={olympiad}
              onChange={(e) => setOlympiad(e.target.value)}
              className="h-9 w-full rounded-md border border-border px-3 text-sm"
            >
              <option value="">All</option>
              {RESULT_OLYMPIADS.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4">
          <Button type="submit" variant="accent" disabled={loading}>
            {loading ? "Searching…" : "Find results"}
          </Button>
        </div>
      </form>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-green-700">{message}</p> : null}

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-border bg-white">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-brand-stats text-white">
              <tr>
                <th className="px-3 py-3">Student</th>
                <th className="px-3 py-3">School</th>
                <th className="px-3 py-3">Olympiad</th>
                <th className="px-3 py-3">Grade</th>
                <th className="px-3 py-3">Marks</th>
                <th className="px-3 py-3">Out of</th>
                <th className="px-3 py-3">Rank</th>
                <th className="px-3 py-3">Sch. Rank</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const editing = editingId === row.id;
                const draft = drafts[row.id] ?? toDraft(row);
                return (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="px-3 py-3">
                      <span className="font-medium">{row.registrationNumber}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {row.studentName}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-medium">{row.schoolCode}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {row.schoolName}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-semibold text-brand">
                      {row.olympiad}
                    </td>
                    <td className="px-3 py-3">{row.grade}</td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <input
                          type="number"
                          value={draft.marksObtained}
                          onChange={(e) =>
                            updateDraft(row.id, "marksObtained", e.target.value)
                          }
                          className="h-8 w-20 rounded border border-border px-2"
                        />
                      ) : (
                        row.marksObtained ?? "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <input
                          type="number"
                          value={draft.totalMarks}
                          onChange={(e) =>
                            updateDraft(row.id, "totalMarks", e.target.value)
                          }
                          className="h-8 w-20 rounded border border-border px-2"
                        />
                      ) : (
                        row.totalMarks ?? "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <input
                          type="number"
                          value={draft.rank}
                          onChange={(e) =>
                            updateDraft(row.id, "rank", e.target.value)
                          }
                          className="h-8 w-16 rounded border border-border px-2"
                        />
                      ) : (
                        row.rank ?? "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <input
                          type="number"
                          value={draft.schoolRank}
                          onChange={(e) =>
                            updateDraft(row.id, "schoolRank", e.target.value)
                          }
                          className="h-8 w-16 rounded border border-border px-2"
                        />
                      ) : (
                        row.schoolRank ?? "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <select
                          value={draft.status}
                          onChange={(e) =>
                            updateDraft(row.id, "status", e.target.value)
                          }
                          className="h-8 rounded border border-border px-1"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        row.status
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="accent"
                            disabled={savingId === row.id}
                            onClick={() => void saveRow(row)}
                          >
                            <Save className="size-3.5" />
                            {savingId === row.id ? "Saving…" : "Save"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={savingId === row.id}
                            onClick={() => cancelEdit(row)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingId(row.id)}
                        >
                          <Pencil className="size-3.5" />
                          Edit
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
