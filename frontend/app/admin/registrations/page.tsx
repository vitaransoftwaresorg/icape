"use client";

import {
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
} from "lucide-react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api";
import {
  adminQueryKeys,
  ADMIN_LIST_REFETCH_MS,
  fetchAdminRegistrationDetail,
  fetchAdminRegistrations,
  type AdminRegistrationDetail,
  type AdminRegistrationRow,
} from "@/lib/admin-queries";
import {
  AdminTableShell,
  AdminTableSkeletonRows,
} from "@/components/admin/admin-table-shell";
import { paymentReferenceField } from "@/lib/payment-details";
import { cn } from "@/lib/utils";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const PAGE_SIZE = 20;

const STATUS_FILTERS = [
  ["UNDER_REVIEW", "Under review"],
  ["APPROVED", "Approved"],
  ["REJECTED", "Rejected"],
  ["", "All submitted"],
] as const;

const STATUS_VALUES = new Set(
  STATUS_FILTERS.map(([value]) => value),
);

function resolveStatusParam(raw: string | null) {
  if (raw == null) return "UNDER_REVIEW";
  const value = raw.trim().toUpperCase();
  if (value === "ALL" || value === "") return "";
  if (STATUS_VALUES.has(value as (typeof STATUS_FILTERS)[number][0])) {
    return value;
  }
  // Allow lowercase rejected etc.
  const match = STATUS_FILTERS.find(
    ([v]) => v && v.toLowerCase() === raw.trim().toLowerCase(),
  );
  return match ? match[0] : "UNDER_REVIEW";
}

function statusClass(status: string) {
  switch (status) {
    case "APPROVED":
      return "bg-green-100 text-green-800 border-green-200";
    case "UNDER_REVIEW":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "REJECTED":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-brand-soft text-brand border-border";
  }
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ");
}

function formatMoney(amount: string | number | null | undefined) {
  if (amount === null || amount === undefined || amount === "") return "—";
  return `₹${Number(amount).toLocaleString("en-IN")}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function isPdfProof(url: string) {
  const lower = url.toLowerCase();
  return (
    lower.includes(".pdf") ||
    lower.includes("/raw/upload/") ||
    lower.includes("application/pdf")
  );
}

export default function AdminRegistrationsPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-border bg-white px-4 py-10 text-center text-sm text-muted">
          Loading payment verification…
        </div>
      }
    >
      <AdminRegistrationsPageInner />
    </Suspense>
  );
}

function AdminRegistrationsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const statusFromUrl = resolveStatusParam(searchParams.get("status"));
  const idFromUrl = searchParams.get("id")?.trim() || "";
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(statusFromUrl);
  const [selectedId, setSelectedId] = useState<string | null>(
    idFromUrl || null,
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    setStatus(statusFromUrl);
    setPage(1);
  }, [statusFromUrl]);

  useEffect(() => {
    if (!idFromUrl) return;
    setSelectedId(idFromUrl);
    setNote("");
    setActionError("");
  }, [idFromUrl]);

  const listQuery = useQuery({
    queryKey: adminQueryKeys.registrations(page, status),
    queryFn: () =>
      fetchAdminRegistrations({
        page,
        limit: PAGE_SIZE,
        status: status || undefined,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: ADMIN_LIST_REFETCH_MS,
  });

  const detailQuery = useQuery({
    queryKey: adminQueryKeys.registrationDetail(selectedId || ""),
    queryFn: () => fetchAdminRegistrationDetail(selectedId!),
    enabled: Boolean(selectedId),
    refetchInterval: selectedId ? ADMIN_LIST_REFETCH_MS : false,
  });

  const rows = listQuery.data?.registrations || [];
  const totalPages = listQuery.data?.pagination.totalPages || 1;
  const total = listQuery.data?.pagination.total || 0;
  const selected = detailQuery.data || null;
  const showInitialLoading = listQuery.isPending && !listQuery.data;

  const listError = listQuery.isError
    ? listQuery.error instanceof Error
      ? listQuery.error.message
      : "Failed to load registrations"
    : "";
  const detailError =
    selectedId && detailQuery.isError
      ? detailQuery.error instanceof Error
        ? detailQuery.error.message
        : "Failed to load registration details"
      : "";

  function openDetail(id: string) {
    setActionError("");
    setNote("");
    setSelectedId(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("id", id);
    const qs = params.toString();
    router.replace(qs ? `/admin/registrations?${qs}` : "/admin/registrations");
  }

  function closeDetail() {
    setSelectedId(null);
    setNote("");
    setActionError("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("id");
    const qs = params.toString();
    router.replace(qs ? `/admin/registrations?${qs}` : "/admin/registrations");
  }

  async function verify(action: "approve" | "reject") {
    if (!selectedId) return;
    if (action === "reject" && note.trim().length < 3) {
      setActionError("Rejection reason is required");
      return;
    }
    setBusy(true);
    setActionError("");
    const res = await apiRequest(
      `/admin/school-registrations/${selectedId}/verify`,
      {
        method: "POST",
        body: { action, adminNote: note.trim() || undefined },
      },
    );
    setBusy(false);
    if (!res.success) {
      setActionError(res.message);
      return;
    }
    closeDetail();
    await queryClient.invalidateQueries({ queryKey: ["admin", "registrations"] });
  }

  function onStatusChange(next: string) {
    setPage(1);
    setStatus(next);
    const params = new URLSearchParams(searchParams.toString());
    if (!next) {
      params.delete("status");
    } else {
      params.set("status", next);
    }
    const qs = params.toString();
    router.replace(qs ? `/admin/registrations?${qs}` : "/admin/registrations");
  }

  const showingFrom = total > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const showingTo = total > 0 ? Math.min(page * PAGE_SIZE, total) : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand">Payment Review</h1>
        <p className="mt-1 text-sm text-muted">
          Verify school registration payments.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(([value, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => onStatusChange(value)}
            className={
              status === value
                ? "rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-white"
                : "rounded-full border border-border bg-white px-4 py-1.5 text-sm font-semibold text-brand"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {listError ? <p className="text-sm text-red-600">{listError}</p> : null}

      <AdminTableShell
        loading={showInitialLoading}
        className="overflow-hidden rounded-2xl border border-border bg-white"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-brand-stats text-white">
              <tr>
                <th className="px-4 py-3 font-semibold">School</th>
                <th className="px-3 py-3 font-semibold">School code</th>
                <th className="px-3 py-3 font-semibold">Submitted</th>
                <th className="px-3 py-3 text-center font-semibold">Entries</th>
                <th className="px-3 py-3 font-semibold">Total paid</th>
                <th className="px-3 py-3 font-semibold">Method</th>
                <th className="px-3 py-3 font-semibold">Reference</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 text-right font-semibold"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <RegistrationRow
                  key={row.id}
                  row={row}
                  zebra={index % 2 === 1}
                  onOpen={() => openDetail(row.id)}
                />
              ))}
              {!showInitialLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted">
                    No payments in this filter.
                  </td>
                </tr>
              ) : null}
              {showInitialLoading ? (
                <AdminTableSkeletonRows columns={9} rows={8} />
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
          <p className="text-sm text-muted">
            Page {page} of {totalPages}
            {total > 0
              ? ` · ${showingFrom.toLocaleString("en-IN")}–${showingTo.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")}`
              : null}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page <= 1 || listQuery.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-4" aria-hidden />
              Prev
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page >= totalPages || listQuery.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </AdminTableShell>

      {selectedId ? (
        <VerificationDialog
          selected={selected}
          loading={detailQuery.isPending && !detailQuery.data}
          error={detailError || actionError}
          note={note}
          busy={busy}
          onNoteChange={setNote}
          onClose={closeDetail}
          onVerify={verify}
        />
      ) : null}
    </div>
  );
}

function RegistrationRow({
  row,
  zebra,
  onOpen,
}: {
  row: AdminRegistrationRow;
  zebra?: boolean;
  onOpen: () => void;
}) {
  const paymentMethod = row.payment?.paymentMethod || "UPI";

  return (
    <tr
      className={cn(
        "border-t border-border",
        zebra ? "bg-brand-soft/25" : "bg-white",
      )}
    >
      <td className="px-4 py-3">
        <p className="font-semibold text-brand">
          {row.schoolName || row.schoolAccount.email}
        </p>
      </td>
      <td className="px-3 py-3">
        <p className="font-mono text-sm font-semibold text-brand">
          {row.schoolCode || "—"}
        </p>
      </td>
      <td className="px-3 py-3 text-sm text-brand">
        {formatDate(row.submittedAt)}
      </td>
      <td className="px-3 py-3 text-center font-bold tabular-nums text-brand">
        {row.olympiadTotal}
      </td>
      <td className="px-3 py-3 font-semibold tabular-nums text-brand">
        {formatMoney(row.payment?.amountExpected)}
      </td>
      <td className="px-3 py-3 font-medium text-brand">{paymentMethod}</td>
      <td className="px-3 py-3">
        <p className="font-mono text-sm font-semibold text-brand">
          {row.payment?.utr || "—"}
        </p>
      </td>
      <td className="px-3 py-3">
        <span
          className={cn(
            "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
            statusClass(row.status),
          )}
        >
          {formatStatus(row.status)}
        </span>
      </td>
      <td className="px-3 py-3 text-right">
        <Button
          type="button"
          size="sm"
          variant={row.status === "UNDER_REVIEW" ? "default" : "outline"}
          onClick={onOpen}
        >
          {row.status === "UNDER_REVIEW" ? "Verify" : "View"}
        </Button>
      </td>
    </tr>
  );
}

function VerificationDialog({
  selected,
  loading,
  error,
  note,
  busy,
  onNoteChange,
  onClose,
  onVerify,
}: {
  selected: AdminRegistrationDetail | null;
  loading: boolean;
  error: string;
  note: string;
  busy: boolean;
  onNoteChange: (value: string) => void;
  onClose: () => void;
  onVerify: (action: "approve" | "reject") => void;
}) {
  const [proofOpen, setProofOpen] = useState(false);
  const paymentMethod = selected?.payment?.paymentMethod || "UPI";
  const reference = paymentReferenceField(paymentMethod);
  const status = selected?.status || "";
  const isPending = status === "UNDER_REVIEW";
  const isApproved = status === "APPROVED";
  const isRejected = status === "REJECTED";
  const proofUrl = selected?.payment?.proofUrl || "";

  const title = isPending
    ? "Verify payment"
    : isApproved
      ? "Payment approved"
      : isRejected
        ? "Payment rejected"
        : "Payment details";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {title}
            </p>
            <h2 className="mt-0.5 truncate text-lg font-bold text-brand">
              {selected?.schoolName || "School"}
            </h2>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
              {selected?.schoolCode ? (
                <span className="font-mono font-semibold text-brand">
                  {selected.schoolCode}
                </span>
              ) : null}
              {status ? (
                <span
                  className={cn(
                    "inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold",
                    statusClass(status),
                  )}
                >
                  {formatStatus(status)}
                </span>
              ) : null}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={onClose}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted">
              Loading payment details…
            </p>
          ) : selected ? (
            <>
              {isApproved ? (
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
                  This payment was approved
                  {selected.payment?.reviewedAt
                    ? ` on ${formatDate(selected.payment.reviewedAt)}`
                    : ""}
                  .
                </div>
              ) : null}
              {isRejected ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                  This payment was rejected
                  {selected.payment?.reviewedAt
                    ? ` on ${formatDate(selected.payment.reviewedAt)}`
                    : ""}
                  .
                </div>
              ) : null}
              {isPending ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  Waiting for admin verification. Check amount, fee per Olympiad
                  (concession if any), reference, and proof before approving.
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-brand-soft/30 p-4">
                <PaymentFact
                  label="Olympiad entries"
                  value={String(selected.olympiadTotal)}
                />
                <PaymentFact
                  label="Fee per Olympiad"
                  value={
                    selected.concessionFeePerStudent != null &&
                    selected.concessionFeePerStudent > 0
                      ? `₹${selected.concessionFeePerStudent} (concession)`
                      : "₹150 (standard)"
                  }
                  emphasize={
                    selected.concessionFeePerStudent != null &&
                    selected.concessionFeePerStudent > 0
                  }
                />
                <PaymentFact
                  label="Fee calculation"
                  value={`${selected.olympiadTotal} × ₹${
                    selected.concessionFeePerStudent != null &&
                    selected.concessionFeePerStudent > 0
                      ? selected.concessionFeePerStudent
                      : 150
                  }`}
                />
                <PaymentFact
                  label="Total paid"
                  value={formatMoney(
                    selected.payment?.amountExpected ??
                      selected.feeExpected ??
                      selected.olympiadTotal *
                        (selected.concessionFeePerStudent != null &&
                        selected.concessionFeePerStudent > 0
                          ? selected.concessionFeePerStudent
                          : 150),
                  )}
                  emphasize
                />
                <PaymentFact label="Method" value={paymentMethod} />
                <PaymentFact
                  label={reference.label.replace(" *", "")}
                  value={selected.payment?.utr || "—"}
                  mono
                />
                <PaymentFact
                  label="Students"
                  value={String(selected.studentCount)}
                  className="col-span-2"
                />
                <PaymentFact
                  label="Submitted"
                  value={formatDate(selected.submittedAt)}
                />
              </div>

              {proofUrl ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Payment proof
                  </p>
                  <button
                    type="button"
                    onClick={() => setProofOpen(true)}
                    className="group block w-full overflow-hidden rounded-xl border border-border bg-white text-left transition hover:border-brand/40"
                  >
                    {isPdfProof(proofUrl) ? (
                      <div className="flex h-40 flex-col items-center justify-center gap-2 bg-brand-soft/40 px-4 text-center">
                        <Eye className="size-6 text-brand" aria-hidden />
                        <p className="text-sm font-semibold text-brand">
                          PDF payment proof
                        </p>
                        <p className="text-xs text-muted">
                          Click to view in dialog
                        </p>
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={proofUrl}
                        alt="Payment proof preview"
                        className="h-44 w-full object-contain bg-slate-50 transition group-hover:opacity-95"
                      />
                    )}
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setProofOpen(true)}
                  >
                    <Eye className="size-4" aria-hidden />
                    View payment proof
                  </Button>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border px-4 py-3 text-center text-sm text-muted">
                  No payment proof uploaded
                </p>
              )}

              {isRejected && selected.rejectionNote ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
                    Rejection note
                  </p>
                  <p className="mt-1 text-sm text-red-900">
                    {selected.rejectionNote}
                  </p>
                </div>
              ) : null}

              {!isPending && selected.payment?.adminNote ? (
                <div className="rounded-xl border border-border bg-brand-soft/20 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Admin note
                  </p>
                  <p className="mt-1 text-sm text-brand">
                    {selected.payment.adminNote}
                  </p>
                </div>
              ) : null}
            </>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>

        {isPending ? (
          <div className="shrink-0 space-y-3 border-t border-border px-5 py-4">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                Rejection reason / admin note
              </label>
              <Input
                placeholder="Required when rejecting · optional for approve"
                value={note}
                onChange={(e) => onNoteChange(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted">
                A reason is required to reject. Schools will see it on their
                portal.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                disabled={busy || loading}
                onClick={() => onVerify("approve")}
              >
                Approve payment
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={busy || loading || note.trim().length < 3}
                onClick={() => onVerify("reject")}
              >
                Reject
              </Button>
            </div>
          </div>
        ) : (
          <div className="shrink-0 border-t border-border px-5 py-4">
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </div>

      {proofOpen && proofUrl ? (
        <PaymentProofViewer
          url={proofUrl}
          schoolName={selected?.schoolName || "School"}
          onClose={() => setProofOpen(false)}
        />
      ) : null}
    </div>
  );
}

function PaymentProofViewer({
  url,
  schoolName,
  onClose,
}: {
  url: string;
  schoolName: string;
  onClose: () => void;
}) {
  const pdf = isPdfProof(url);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-brand/70 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Payment proof"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Payment proof
            </p>
            <p className="truncate text-sm font-bold text-brand">{schoolName}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onClose}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-3 sm:p-4">
          {pdf ? (
            <iframe
              title="Payment proof PDF"
              src={url}
              className="h-[70vh] w-full rounded-lg border border-border bg-white"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={`Payment proof for ${schoolName}`}
              className="mx-auto max-h-[75vh] w-auto max-w-full rounded-lg object-contain"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PaymentFact({
  label,
  value,
  emphasize,
  mono,
  className,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-sm text-brand",
          emphasize && "text-base font-bold tabular-nums",
          !emphasize && "font-semibold",
          mono && "font-mono",
        )}
      >
        {value}
      </p>
    </div>
  );
}
