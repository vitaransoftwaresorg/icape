"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, getApiUrl, type ApiResponse } from "@/lib/api";
import { reportFromHttpStatus, reportServerUnreachable } from "@/lib/server-status";
import { saveStudentsChunked, type RegistrationStudent, MAX_STUDENTS_PER_REGISTRATION } from "@/lib/school-api";
import { computeRegistrationFee, FEE_PER_STUDENT_PER_OLYMPIAD, type PaymentMethod } from "@/lib/payment-details";
import { toTitleCaseInput } from "@/lib/title-case";
import { cn } from "@/lib/utils";
import { PaymentFeeSummary } from "@/components/school/payment-fee-summary";
import { GradeTableFrame } from "@/components/school/grade-table-frame";
import {
  ensureStudentsForGrade,
  firstFilledGrade,
  gradeStudentIndices,
  GradeSwitchButtons,
  isStudentGrade,
  namedCountByGrade,
  type StudentGrade,
} from "@/components/school/grade-switch-buttons";
import { MOBILE_DIGITS_REGEX, MOBILE_ERROR, sanitizeMobileDigits } from "@/lib/mobile";

const INITIAL_STUDENT_ROWS = 30;

const STEPS = [
  { id: 1, label: "Account" },
  { id: 2, label: "School details" },
  { id: 3, label: "Students" },
  { id: 4, label: "Confirm" },
] as const;

const accountSchema = z.object({
  name: z.string().trim().min(2, "School name is required"),
  email: z.string().trim().email("Enter a valid email"),
  mobile: z.string().trim().regex(MOBILE_DIGITS_REGEX, MOBILE_ERROR),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const schoolSchema = z
  .object({
    schoolName: z.string().trim().min(2, "School name is required"),
    address: z.string().trim().min(5, "School address is required"),
    city: z.string().trim().min(2, "City is required"),
    district: z.string().trim().min(2, "District is required"),
    state: z.string().trim().min(2, "State is required"),
    pincode: z.string().trim().min(4, "Pin code is required").max(12),
    country: z.enum(["India", "Other"]),
    countryOther: z.string().trim().max(80),
    website: z.string().trim().max(200),
    affiliation: z
      .string()
      .refine(
        (v) =>
          v === "CBSE" ||
          v === "ICSE" ||
          v === "STATE_BOARD" ||
          v === "OTHER",
        { message: "Select affiliation" },
      ),
    affiliationOther: z.string().trim().max(80),
    trustName: z.string().trim().min(2, "Trust / Society name is required"),
    schoolMobile: z.string().trim().regex(MOBILE_DIGITS_REGEX, MOBILE_ERROR),
    landline: z.string().trim().max(20),
    stdCode: z.string().trim().max(10),
    email: z.string().trim().email("Enter a valid school email"),
    principalName: z.string().trim().min(2, "Principal name is required"),
    principalMobile: z.string().trim().regex(MOBILE_DIGITS_REGEX, MOBILE_ERROR),
    principalEmail: z.string().trim().email("Enter a valid principal email"),
    contactName: z.string().trim().min(2, "Incharge name is required"),
    phone: z.string().trim().regex(MOBILE_DIGITS_REGEX, MOBILE_ERROR),
    inchargeEmail: z.string().trim().email("Enter a valid incharge email"),
  })
  .superRefine((data, ctx) => {
    if (data.country === "Other" && !data.countryOther.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Country name is required",
        path: ["countryOther"],
      });
    }
    if (data.affiliation === "OTHER" && !data.affiliationOther.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please mention affiliation",
        path: ["affiliationOther"],
      });
    }
  });

type AccountFormValues = z.infer<typeof accountSchema>;
type SchoolFormValues = z.input<typeof schoolSchema>;
type SchoolFormOutput = z.output<typeof schoolSchema>;

type StudentRow = {
  id?: string;
  clientKey?: string;
  registrationNumber?: string;
  name: string;
  grade: number;
  section: string;
  mobile: string;
  imo: boolean;
  iso: boolean;
  ieo: boolean;
};

type RegistrationPayload = {
  id: string;
  schoolCode: string;
  schoolName: string;
  address?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  country?: string;
  countryOther?: string;
  website?: string;
  affiliation?: string;
  affiliationOther?: string;
  trustName?: string;
  schoolMobile?: string;
  landline?: string;
  stdCode?: string;
  email?: string;
  principalName?: string;
  principalMobile?: string;
  principalEmail?: string;
  contactName?: string;
  phone?: string;
  inchargeEmail?: string;
  gradeCounts?: Record<string, number>;
  feeExpected: number;
  concessionFeePerStudent?: number | null;
  status: string;
  currentStep?: number;
  students: StudentRow[];
  olympiadYear: { label: string; code: string };
  payment?: {
    utr: string;
    paymentMethod?: PaymentMethod;
    status?: string;
    adminNote: string | null;
  } | null;
  locked?: boolean;
};

const RESUME_KEY = "icape-admin-register-account";

function rememberAccount(accountId: string) {
  try {
    sessionStorage.setItem(RESUME_KEY, accountId);
  } catch {
    /* ignore */
  }
}

function clearRememberedAccount() {
  try {
    sessionStorage.removeItem(RESUME_KEY);
  } catch {
    /* ignore */
  }
}

function adminStepStorageKey(accountId: string) {
  return `icape:admin-register-step:${accountId}`;
}

function readStoredAdminStep(accountId: string): number | null {
  try {
    const raw = sessionStorage.getItem(adminStepStorageKey(accountId));
    const n = Number(raw);
    if (n >= 1 && n <= 4) return n;
  } catch {
    /* ignore */
  }
  return null;
}

function writeStoredAdminStep(accountId: string, step: number) {
  try {
    sessionStorage.setItem(adminStepStorageKey(accountId), String(step));
  } catch {
    /* ignore */
  }
}

function studentsReadyForPayment(rows: StudentRow[]) {
  const named = rows.filter((s) => s.name.trim());
  if (named.length === 0) return false;
  return named.every(
    (s) => isStudentGrade(s.grade) && (s.imo || s.iso || s.ieo),
  );
}

function studentsFingerprint(rows: StudentRow[]) {
  // Content only — draft saves recreate DB ids, so ids must not affect dirty.
  return JSON.stringify(
    rows
      .filter((s) => s.name.trim())
      .map((s) => ({
        name: s.name.trim().toUpperCase(),
        grade: s.grade,
        section: (s.section || "").trim().toUpperCase(),
        mobile: sanitizeMobileDigits(s.mobile || ""),
        imo: Boolean(s.imo),
        iso: Boolean(s.iso),
        ieo: Boolean(s.ieo),
      }))
      .sort((a, b) =>
        a.grade !== b.grade
          ? a.grade - b.grade
          : a.name !== b.name
            ? a.name.localeCompare(b.name)
            : a.section !== b.section
              ? a.section.localeCompare(b.section)
              : a.mobile.localeCompare(b.mobile),
      ),
  );
}

function concessionFingerprint(input: string) {
  return input.trim().replace(/^0+(?=\d)/, "");
}

const EMPTY_SCHOOL_VALUES: SchoolFormValues = {
  schoolName: "",
  address: "",
  city: "",
  district: "",
  state: "",
  pincode: "",
  country: "India",
  countryOther: "",
  website: "",
  affiliation: "",
  affiliationOther: "",
  trustName: "",
  schoolMobile: "",
  landline: "",
  stdCode: "",
  email: "",
  principalName: "",
  principalMobile: "",
  principalEmail: "",
  contactName: "",
  phone: "",
  inchargeEmail: "",
};

function schoolFingerprint(values: SchoolFormValues) {
  return JSON.stringify({
    schoolName: (values.schoolName || "").trim(),
    address: (values.address || "").trim(),
    city: (values.city || "").trim(),
    district: (values.district || "").trim(),
    state: (values.state || "").trim(),
    pincode: (values.pincode || "").trim(),
    country: values.country === "Other" ? "Other" : "India",
    countryOther: (values.countryOther || "").trim(),
    website: (values.website || "").trim(),
    affiliation: values.affiliation || "",
    affiliationOther: (values.affiliationOther || "").trim(),
    trustName: (values.trustName || "").trim(),
    schoolMobile: (values.schoolMobile || "").trim(),
    landline: (values.landline || "").trim(),
    stdCode: (values.stdCode || "").trim(),
    email: (values.email || "").trim().toLowerCase(),
    principalName: (values.principalName || "").trim(),
    principalMobile: (values.principalMobile || "").trim(),
    principalEmail: (values.principalEmail || "").trim().toLowerCase(),
    contactName: (values.contactName || "").trim(),
    phone: (values.phone || "").trim(),
    inchargeEmail: (values.inchargeEmail || "").trim().toLowerCase(),
  });
}

function resolveResumeStep(
  reg: RegistrationPayload,
  accountId?: string,
) {
  // Approved schools open on school details for admin edit.
  if (reg.status === "APPROVED") {
    return 2;
  }
  if (reg.status === "UNDER_REVIEW" || reg.status === "REJECTED") {
    return 4;
  }
  if (!isSchoolDetailsSaved(reg)) {
    const storedEarly = accountId ? readStoredAdminStep(accountId) : null;
    if (storedEarly === 1 || storedEarly === 2) return storedEarly;
    return 2;
  }
  const namedStudents = (reg.students || []).filter((s) => s.name?.trim());
  const studentsOk = studentsReadyForPayment(reg.students || []);
  const stored = accountId ? readStoredAdminStep(accountId) : null;
  if (namedStudents.length === 0) {
    if (stored === 2 || stored === 3) return stored;
    return 3;
  }
  // Honor the step the admin was on (Students vs Confirm).
  if (stored === 2 || stored === 3 || stored === 4) {
    if (stored === 4 && !studentsOk) return 3;
    if (stored === 4 && (reg.currentStep ?? 0) >= 3) {
      return 4;
    }
    if (stored === 3 || stored === 2) return stored;
  }
  // Draft with students: stay on Students — don't auto-open Confirm.
  if (!reg.payment?.status) return 3;
  if (
    studentsOk &&
    ((reg.currentStep ?? 0) >= 3 || reg.payment?.status)
  ) {
    return 4;
  }
  return 3;
}

/** School details count as saved only when required fields are filled — not just a draft name. */
function isSchoolDetailsSaved(
  reg: Partial<
    Pick<
      RegistrationPayload,
      | "schoolName"
      | "address"
      | "city"
      | "district"
      | "state"
      | "pincode"
      | "trustName"
      | "schoolMobile"
      | "email"
      | "principalName"
      | "principalMobile"
      | "principalEmail"
      | "contactName"
      | "phone"
      | "inchargeEmail"
      | "affiliation"
      | "country"
    >
  >,
) {
  return Boolean(
    reg.schoolName?.trim() &&
      reg.address?.trim() &&
      reg.city?.trim() &&
      reg.district?.trim() &&
      reg.state?.trim() &&
      reg.pincode?.trim() &&
      reg.trustName?.trim() &&
      reg.schoolMobile?.trim() &&
      reg.email?.trim() &&
      reg.principalName?.trim() &&
      reg.principalMobile?.trim() &&
      reg.principalEmail?.trim() &&
      reg.contactName?.trim() &&
      reg.phone?.trim() &&
      reg.inchargeEmail?.trim() &&
      reg.affiliation?.trim() &&
      reg.country?.trim(),
  );
}

/** Highest step that was actually saved — not just visited. */
function resolveCompletedThrough(
  reg: RegistrationPayload | null | undefined,
  hasAccount: boolean,
) {
  if (!hasAccount) return 0;
  if (!reg) return 1;
  if (reg.status === "APPROVED" || reg.status === "UNDER_REVIEW") return 4;
  // Students never unlock progress unless school details were saved first.
  if (!isSchoolDetailsSaved(reg)) return 1;
  const named = (reg.students || []).filter((s) => s.name?.trim()).length;
  if (named > 0) return 3;
  return 2;
}

function Field({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label
        className={cn(
          "mb-1.5 block text-sm font-semibold",
          error ? "text-red-600" : "text-brand",
        )}
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs font-medium text-red-600">{error}</p>
      ) : null}
    </div>
  );
}

let studentKeySeq = 0;
function nextStudentKey() {
  studentKeySeq += 1;
  return `s-${studentKeySeq}`;
}

function emptyStudent(grade = 0): StudentRow {
  return {
    clientKey: nextStudentKey(),
    name: "",
    grade,
    section: "",
    mobile: "",
    imo: false,
    iso: false,
    ieo: false,
  };
}

function createEmptyStudents(count: number, grade = 0): StudentRow[] {
  return Array.from({ length: count }, () => emptyStudent(grade));
}

function withTrailingEmptyRow(
  rows: StudentRow[],
  defaultGrade = 0,
): StudentRow[] {
  if (rows.length === 0) return createEmptyStudents(INITIAL_STUDENT_ROWS, defaultGrade);
  const last = rows[rows.length - 1];
  if (last.name.trim()) return [...rows, emptyStudent(defaultGrade)];
  return rows;
}

function normalizeStudent(s: {
  id?: string;
  registrationNumber?: string;
  name: string;
  grade: number;
  section?: string;
  mobile?: string;
  imo?: boolean;
  iso?: boolean;
  ieo?: boolean;
}): StudentRow {
  return {
    id: s.id,
    clientKey: s.id ? undefined : nextStudentKey(),
    registrationNumber: s.registrationNumber,
    name: s.name || "",
    grade: s.grade,
    section: s.section || "",
    mobile: s.mobile || "",
    imo: Boolean(s.imo),
    iso: Boolean(s.iso),
    ieo: Boolean(s.ieo),
  };
}

function mergeStudentCodes(
  local: StudentRow[],
  saved: Array<{
    id?: string;
    registrationNumber?: string;
    name: string;
    grade: number;
    section?: string;
    mobile?: string;
    imo?: boolean;
    iso?: boolean;
    ieo?: boolean;
  }>,
): StudentRow[] {
  const queue = saved.map((s) => ({
    id: s.id,
    registrationNumber: s.registrationNumber,
    name: (s.name || "").trim().toUpperCase(),
    grade: s.grade,
    section: (s.section || "").trim().toUpperCase(),
  }));
  return local.map((row) => {
    let idx = -1;
    if (row.id) {
      idx = queue.findIndex((s) => s.id === row.id);
    }
    if (idx < 0 && row.name.trim()) {
      const name = row.name.trim().toUpperCase();
      const section = (row.section || "").trim().toUpperCase();
      idx = queue.findIndex(
        (s) =>
          s.name === name &&
          s.grade === row.grade &&
          (s.section || "") === section,
      );
    }
    if (idx < 0) return row;
    const [matched] = queue.splice(idx, 1);
    if (
      row.id === matched.id &&
      row.registrationNumber === matched.registrationNumber
    ) {
      return row;
    }
    return {
      ...row,
      id: matched.id,
      registrationNumber: matched.registrationNumber,
    };
  });
}

function adminStudentTemplateUrl() {
  return `${getApiUrl()}/admin/school-registrations/step/2/template`;
}

async function importAdminStudentsExcel(
  file: File,
): Promise<
  ApiResponse<{
    students: Array<{
      name: string;
      grade: number;
      section: string;
      mobile: string;
      imo: boolean;
      iso: boolean;
      ieo: boolean;
      importWarning?: string;
    }>;
    errors: string[];
  }>
> {
  const apiUrl = getApiUrl();
  if (!apiUrl) {
    reportServerUnreachable();
    return {
      success: false,
      message: "Server unreachable. The API address is not configured.",
      networkError: true,
    };
  }
  const form = new FormData();
  form.append("file", file);
  try {
    const response = await fetch(
      `${apiUrl}/admin/school-registrations/step/2/import`,
      {
        method: "POST",
        body: form,
        credentials: "include",
      },
    );
    const data = (await response.json()) as ApiResponse<{
      students: Array<{
        name: string;
        grade: number;
        section: string;
        mobile: string;
        imo: boolean;
        iso: boolean;
        ieo: boolean;
        importWarning?: string;
      }>;
      errors: string[];
    }>;
    reportFromHttpStatus(response.status);
    if (!response.ok) {
      return {
        success: false,
        message: data.message || "Import failed",
        status: response.status,
        networkError:
          response.status === 502 ||
          response.status === 503 ||
          response.status === 504,
      };
    }
    return data;
  } catch {
    reportServerUnreachable();
    return {
      success: false,
      message: "Server unreachable. Check your connection and try again.",
      networkError: true,
    };
  }
}

function AdminRegisterSchoolPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountIdFromUrl = searchParams.get("accountId")?.trim() || "";

  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingResume, setLoadingResume] = useState(Boolean(accountIdFromUrl));
  const [accountId, setAccountId] = useState(accountIdFromUrl);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountName, setAccountName] = useState("");
  const [schoolCode, setSchoolCode] = useState("");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [activeGrade, setActiveGrade] = useState<StudentGrade>(3);
  const [studentRowErrors, setStudentRowErrors] = useState<Record<number, string>>(
    {},
  );
  const [done, setDone] = useState<RegistrationPayload | null>(null);
  const [concessionFeeInput, setConcessionFeeInput] = useState("");
  const [concessionFeeError, setConcessionFeeError] = useState("");
  const [completedThrough, setCompletedThrough] = useState(0);
  const [draftStatus, setDraftStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [importStatus, setImportStatus] = useState<
    "idle" | "importing" | "done" | "error"
  >("idle");
  const [importFileName, setImportFileName] = useState("");
  const [registrationStatus, setRegistrationStatus] = useState<string | null>(
    null,
  );
  const [studentsBaseline, setStudentsBaseline] = useState(() =>
    studentsFingerprint([]),
  );
  const [schoolBaseline, setSchoolBaseline] = useState(() =>
    schoolFingerprint(EMPTY_SCHOOL_VALUES),
  );
  const [concessionBaseline, setConcessionBaseline] = useState("");
  const [leaveDialog, setLeaveDialog] = useState<{
    href?: string;
    action?: "home";
  } | null>(null);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const importFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const stepReadyRef = useRef(false);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDraftPayloadRef = useRef("");
  const skipNextDraftRef = useRef(false);
  const isApprovedEdit = registrationStatus === "APPROVED";

  useEffect(() => {
    if (!accountId || !stepReadyRef.current) return;
    writeStoredAdminStep(accountId, step);
  }, [accountId, step]);

  function goToStep(next: number, forAccountId = accountId) {
    // Must have saved school details (not just filled the form).
    if (next >= 3 && completedThrough < 2) {
      setError("Save school details before adding students.");
      stepReadyRef.current = true;
      setStep(2);
      if (forAccountId) writeStoredAdminStep(forAccountId, 2);
      return;
    }
    if (next === 4 && !studentsReadyForPayment(students)) {
      setError(
        "Add at least one student with at least one olympiad before payment.",
      );
      stepReadyRef.current = true;
      setStep(3);
      if (forAccountId) writeStoredAdminStep(forAccountId, 3);
      return;
    }
    setError("");
    stepReadyRef.current = true;
    setStep(next);
    if (forAccountId) writeStoredAdminStep(forAccountId, next);
  }

  const accountForm = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    mode: "onSubmit",
    reValidateMode: "onBlur",
    defaultValues: { name: "", email: "", mobile: "", password: "" },
  });

  const schoolForm = useForm<SchoolFormValues, unknown, SchoolFormOutput>({
    resolver: zodResolver(schoolSchema),
    mode: "onSubmit",
    reValidateMode: "onBlur",
    defaultValues: {
      schoolName: "",
      address: "",
      city: "",
      district: "",
      state: "",
      pincode: "",
      country: "India",
      countryOther: "",
      website: "",
      affiliation: "",
      affiliationOther: "",
      trustName: "",
      schoolMobile: "",
      landline: "",
      stdCode: "",
      email: "",
      principalName: "",
      principalMobile: "",
      principalEmail: "",
      contactName: "",
      phone: "",
      inchargeEmail: "",
    },
  });

  const watchedSchoolValues = schoolForm.watch();
  const schoolDirty = useMemo(
    () => schoolFingerprint(watchedSchoolValues) !== schoolBaseline,
    [watchedSchoolValues, schoolBaseline],
  );
  const studentsDirty = useMemo(
    () => studentsFingerprint(students) !== studentsBaseline,
    [students, studentsBaseline],
  );
  const concessionDirty =
    concessionFingerprint(concessionFeeInput) !==
    concessionFingerprint(concessionBaseline);
  const hasUnsavedChanges =
    schoolDirty || studentsDirty || concessionDirty;

  const concessionFeePerStudent = useMemo(() => {
    const raw = concessionFeeInput.trim();
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > FEE_PER_STUDENT_PER_OLYMPIAD) {
      return null;
    }
    return n;
  }, [concessionFeeInput]);

  const feePerSlot =
    concessionFeePerStudent ?? FEE_PER_STUDENT_PER_OLYMPIAD;

  const feeExpected = useMemo(
    () =>
      computeRegistrationFee(
        students.filter((s) => s.name.trim()),
        feePerSlot,
      ),
    [students, feePerSlot],
  );

  useEffect(() => {
    if (step < 3) return;
    if (completedThrough >= 2) return;
    setError("Save school details before adding students.");
    setStep(2);
    if (accountId) writeStoredAdminStep(accountId, 2);
  }, [step, completedThrough, accountId]);

  useEffect(() => {
    if (step !== 4) return;
    if (!studentsReadyForPayment(students)) {
      setError(
        "Add at least one student with at least one olympiad before payment.",
      );
      setStep(3);
      if (accountId) writeStoredAdminStep(accountId, 3);
    }
  }, [step, students, accountId]);

  const watchedSchoolName = schoolForm.watch("schoolName");
  const displaySchoolName =
    (watchedSchoolName || accountName || "").trim() || "—";
  const displayEmail = (accountEmail || "").trim() || "—";
  const displaySchoolCode = (schoolCode || "").trim() || "—";

  function applyAccountUrl(id: string) {
    rememberAccount(id);
    router.replace(`/admin/schools/register?accountId=${encodeURIComponent(id)}`);
  }

  function performExitToRegisterHome() {
    const returnToSchools = registrationStatus === "APPROVED";
    clearRememberedAccount();
    setAccountId("");
    setAccountEmail("");
    setAccountName("");
    setSchoolCode("");
    setError("");
    setDone(null);
    setStep(1);
    setCompletedThrough(0);
    setStudents([]);
    setStudentsBaseline(studentsFingerprint([]));
    setConcessionFeeInput("");
    setConcessionBaseline("");
    setRegistrationStatus(null);
    setLeaveDialog(null);
    accountForm.reset();
    schoolForm.reset({ ...EMPTY_SCHOOL_VALUES });
    setSchoolBaseline(schoolFingerprint(EMPTY_SCHOOL_VALUES));
    router.replace(
      returnToSchools ? "/admin/schools" : "/admin/incomplete-registrations",
    );
  }

  function exitToRegisterHome() {
    if (hasUnsavedChanges) {
      setLeaveDialog({ action: "home" });
      return;
    }
    performExitToRegisterHome();
  }

  function hydrateFromRegistration(
    account: { id: string; email: string; name: string },
    reg: RegistrationPayload,
  ) {
    if (reg.status === "UNDER_REVIEW") {
      setError(
        "This registration is under review. Use Payment verification to approve or reject it.",
      );
      setAccountId(account.id);
      setAccountEmail(account.email);
      setAccountName(account.name);
      setSchoolCode(reg.schoolCode || "");
      setRegistrationStatus(reg.status);
      setCompletedThrough(resolveCompletedThrough(reg, true));
      setLoadingResume(false);
      return;
    }

    setAccountId(account.id);
    setAccountEmail(account.email);
    setAccountName(account.name);
    setSchoolCode(reg.schoolCode || "");
    setRegistrationStatus(reg.status);
    setCompletedThrough(resolveCompletedThrough(reg, true));
    rememberAccount(account.id);

    const affiliation =
      reg.affiliation === "CBSE" ||
      reg.affiliation === "ICSE" ||
      reg.affiliation === "STATE_BOARD" ||
      reg.affiliation === "OTHER"
        ? reg.affiliation
        : "";

    const schoolValues: SchoolFormValues = {
      schoolName: reg.schoolName || "",
      address: reg.address || "",
      city: reg.city || "",
      district: reg.district || "",
      state: reg.state || "",
      pincode: reg.pincode || "",
      country: reg.country === "Other" ? "Other" : "India",
      countryOther: reg.countryOther || "",
      website: reg.website || "",
      affiliation,
      affiliationOther: reg.affiliationOther || "",
      trustName: reg.trustName || "",
      schoolMobile: reg.schoolMobile || "",
      landline: reg.landline || "",
      stdCode: reg.stdCode || "",
      email: reg.email || account.email,
      principalName: reg.principalName || "",
      principalMobile: reg.principalMobile || "",
      principalEmail: reg.principalEmail || "",
      contactName: reg.contactName || "",
      phone: reg.phone || "",
      inchargeEmail: reg.inchargeEmail || "",
    };
    schoolForm.reset(schoolValues);
    setSchoolBaseline(schoolFingerprint(schoolValues));

    const named = (reg.students || [])
      .filter((s) => s.name?.trim())
      .map((s) => ({
        id: s.id,
        registrationNumber: s.registrationNumber,
        name: s.name,
        grade: s.grade,
        section: s.section || "",
        mobile: s.mobile || "",
        imo: Boolean(s.imo),
        iso: Boolean(s.iso),
        ieo: Boolean(s.ieo),
      }));
    const openGrade = firstFilledGrade(named);
    setActiveGrade(openGrade);
    const nextStudentRows = named.length
      ? ensureStudentsForGrade(
          named.map((s) => ({
            ...s,
            clientKey: s.id ? undefined : nextStudentKey(),
          })),
          openGrade,
          emptyStudent,
          INITIAL_STUDENT_ROWS,
        )
      : [];
    setStudents(nextStudentRows);
    setStudentsBaseline(studentsFingerprint(nextStudentRows));
    const concessionValue =
      reg.concessionFeePerStudent != null && reg.concessionFeePerStudent > 0
        ? String(reg.concessionFeePerStudent)
        : "";
    setConcessionFeeInput(concessionValue);
    setConcessionBaseline(concessionValue);
    setConcessionFeeError("");
    skipNextDraftRef.current = true;
    lastDraftPayloadRef.current = JSON.stringify(
      named.map((s) => ({
        id: s.id,
        registrationNumber: s.registrationNumber,
        name: s.name.trim().toUpperCase(),
        grade: s.grade,
        section: (s.section || "").trim().toUpperCase(),
        mobile: (s.mobile || "").trim(),
        imo: Boolean(s.imo),
        iso: Boolean(s.iso),
        ieo: Boolean(s.ieo),
      })),
    );

    stepReadyRef.current = true;
    const resumeStep = resolveResumeStep(reg, account.id);
    setStep(resumeStep);
    if (account.id) writeStoredAdminStep(account.id, resumeStep);
    setDone(null);
    setError("");
    setLoadingResume(false);
  }

  async function loadAccount(id: string) {
    setLoadingResume(true);
    setError("");
    const res = await apiRequest<{
      account: { id: string; email: string; name: string };
      registration: RegistrationPayload | null;
    }>(`/admin/school-registrations/accounts/${id}`);
    if (!res.success || !res.data) {
      setError(res.message || "Could not resume this registration");
      setLoadingResume(false);
      return;
    }
    if (!res.data.registration) {
      // Deleted or never started — do not auto-create; first Step 1 save will.
      setAccountId(res.data.account.id);
      setAccountEmail(res.data.account.email);
      setAccountName(res.data.account.name);
      setSchoolCode("");
      setRegistrationStatus(null);
      setCompletedThrough(0);
      setStudents([]);
      setStudentsBaseline(studentsFingerprint([]));
      setStep(1);
      setDone(null);
      setError("");
      setLoadingResume(false);
      rememberAccount(res.data.account.id);
      return;
    }
    hydrateFromRegistration(res.data.account, res.data.registration);
  }

  useEffect(() => {
    if (accountIdFromUrl) {
      void loadAccount(accountIdFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountIdFromUrl]);

  useEffect(() => {
    if (step !== 3) return;
    setStudents((prev) =>
      ensureStudentsForGrade(
        prev,
        activeGrade,
        emptyStudent,
        INITIAL_STUDENT_ROWS,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when entering the step
  }, [step]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = (event.target as HTMLElement | null)?.closest(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname.startsWith("/admin/schools/register")) return;
      event.preventDefault();
      event.stopPropagation();
      setLeaveDialog({ href: `${url.pathname}${url.search}${url.hash}` });
    };
    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, [hasUnsavedChanges]);

  const gradeIndices = useMemo(
    () => gradeStudentIndices(students, activeGrade),
    [students, activeGrade],
  );
  const gradeCounts = useMemo(() => namedCountByGrade(students), [students]);

  const draftStudents = useMemo(() => {
    return students
      .filter((s) => s.name.trim().length >= 2 && s.grade >= 3 && s.grade <= 10)
      .map((s) => ({
        id: s.id,
        registrationNumber: s.registrationNumber,
        name: s.name.trim().toUpperCase(),
        grade: s.grade,
        section: (s.section || "").trim().toUpperCase(),
        mobile: sanitizeMobileDigits(s.mobile),
        imo: Boolean(s.imo),
        iso: Boolean(s.iso),
        ieo: Boolean(s.ieo),
      }));
  }, [students]);

  async function persistDraftStudents(
    rows: StudentRow[],
    options?: { immediate?: boolean },
  ) {
    if (!accountId || completedThrough < 2) return;
    const payloadStudents = rows
      .filter((s) => s.name.trim().length >= 2 && s.grade >= 3 && s.grade <= 10)
      .map((s) => ({
        id: s.id,
        registrationNumber: s.registrationNumber,
        name: s.name.trim().toUpperCase(),
        grade: s.grade,
        section: (s.section || "").trim().toUpperCase(),
        mobile: sanitizeMobileDigits(s.mobile),
        imo: Boolean(s.imo),
        iso: Boolean(s.iso),
        ieo: Boolean(s.ieo),
      }));
    const payload = JSON.stringify(payloadStudents);
    if (payload === lastDraftPayloadRef.current) return;
    if (payloadStudents.length > MAX_STUDENTS_PER_REGISTRATION) {
      setDraftStatus("error");
      return;
    }

    const run = async () => {
      setDraftStatus("saving");
      const res = await saveStudentsChunked(
        `/admin/school-registrations/accounts/${accountId}/step/2`,
        payloadStudents as RegistrationStudent[],
        { draft: true },
      );
      if (!res.success) {
        setDraftStatus("error");
        return;
      }
      lastDraftPayloadRef.current = payload;
      setDraftStatus("saved");
      const saved = res.data;
      if (!saved) return;
      setCompletedThrough((prev) => Math.max(prev, 3));
      setSchoolCode(saved.schoolCode || schoolCode);
      skipNextDraftRef.current = true;
      setStudents((prev) => {
        const merged = mergeStudentCodes(prev, saved.students);
        return ensureStudentsForGrade(
          merged,
          activeGrade,
          emptyStudent,
          INITIAL_STUDENT_ROWS,
        );
      });
      lastDraftPayloadRef.current = JSON.stringify(
        saved.students.map((s) => ({
          id: s.id,
          registrationNumber: s.registrationNumber,
          name: (s.name || "").trim().toUpperCase(),
          grade: s.grade,
          section: (s.section || "").trim().toUpperCase(),
          mobile: sanitizeMobileDigits(s.mobile),
          imo: Boolean(s.imo),
          iso: Boolean(s.iso),
          ieo: Boolean(s.ieo),
        })),
      );
    };

    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    if (options?.immediate) {
      await run();
      return;
    }
    const debounceMs = payloadStudents.length > 400 ? 1200 : 700;
    draftTimerRef.current = setTimeout(() => {
      void run();
    }, debounceMs);
  }

  useEffect(() => {
    if (step !== 3 || !accountId || completedThrough < 2) return;

    const payload = JSON.stringify(draftStudents);
    if (skipNextDraftRef.current) {
      skipNextDraftRef.current = false;
      lastDraftPayloadRef.current = payload;
      return;
    }
    if (payload === lastDraftPayloadRef.current) return;

    void persistDraftStudents(students);

    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStudents, step, accountId, completedThrough]);

  function removeStudentAt(absoluteIndex: number) {
    const next = ensureStudentsForGrade(
      students.filter((_, i) => i !== absoluteIndex),
      activeGrade,
      emptyStudent,
      INITIAL_STUDENT_ROWS,
    );
    setStudents(next);
    setStudentRowErrors((prev) => {
      if (!prev[absoluteIndex] && Object.keys(prev).length === 0) return prev;
      const remapped: Record<number, string> = {};
      for (const [key, message] of Object.entries(prev)) {
        const idx = Number(key);
        if (idx === absoluteIndex) continue;
        remapped[idx > absoluteIndex ? idx - 1 : idx] = message;
      }
      return remapped;
    });
    void persistDraftStudents(next, { immediate: true });
  }

  function switchGrade(grade: StudentGrade) {
    if (grade === activeGrade) return;
    setStudentRowErrors({});
    setStudents((prev) =>
      ensureStudentsForGrade(
        prev,
        grade,
        emptyStudent,
        INITIAL_STUDENT_ROWS,
      ),
    );
    setActiveGrade(grade);
  }

  function titleCaseField(name: keyof SchoolFormValues | keyof AccountFormValues) {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const next = toTitleCaseInput(e.target.value);
      e.target.value = next;
      // Avoid validating on each keystroke (red borders while typing).
      if (name in accountForm.getValues()) {
        accountForm.setValue(name as keyof AccountFormValues, next as never, {
          shouldDirty: true,
          shouldValidate: false,
        });
        if (accountForm.formState.errors[name as keyof AccountFormValues]) {
          accountForm.clearErrors(name as keyof AccountFormValues);
        }
      }
      if (name in schoolForm.getValues()) {
        schoolForm.setValue(name as keyof SchoolFormValues, next as never, {
          shouldDirty: true,
          shouldValidate: false,
        });
        if (schoolForm.formState.errors[name as keyof SchoolFormValues]) {
          schoolForm.clearErrors(name as keyof SchoolFormValues);
        }
      }
    };
  }

  function clearSchoolFieldError(key: keyof SchoolFormValues) {
    return () => {
      if (schoolForm.formState.errors[key]) {
        schoolForm.clearErrors(key);
      }
    };
  }

  function clearAccountFieldError(key: keyof AccountFormValues) {
    return () => {
      if (accountForm.formState.errors[key]) {
        accountForm.clearErrors(key);
      }
    };
  }

  async function onCreateAccount(values: AccountFormValues) {
    setError("");
    setSaving(true);
    const res = await apiRequest<{
      account: { id: string; email: string; name: string };
      registration: RegistrationPayload;
    }>("/admin/school-registrations/accounts", {
      method: "POST",
      body: values,
    });
    setSaving(false);
    if (!res.success || !res.data) {
      setError(res.message);
      return;
    }
    setAccountId(res.data.account.id);
    setAccountEmail(res.data.account.email);
    setAccountName(res.data.account.name);
    setSchoolCode(res.data.registration.schoolCode || "");
    setCompletedThrough(1);
    schoolForm.setValue("email", values.email);
    schoolForm.setValue("schoolName", values.name);
    schoolForm.setValue("schoolMobile", values.mobile);
    goToStep(2, res.data.account.id);
    applyAccountUrl(res.data.account.id);
  }

  async function onSaveSchool(
    values: SchoolFormOutput,
    options?: { stay?: boolean },
  ) {
    setError("");
    setSaving(true);
    const res = await apiRequest<RegistrationPayload>(
      `/admin/school-registrations/accounts/${accountId}/step/1`,
      {
        method: "PUT",
        body: values,
      },
    );
    setSaving(false);
    if (!res.success || !res.data) {
      setError(res.message);
      return false;
    }
    setSchoolCode(res.data.schoolCode || schoolCode);
    setRegistrationStatus(res.data.status || registrationStatus);
    setCompletedThrough((prev) => Math.max(prev, 2));
    schoolForm.reset(values);
    setSchoolBaseline(schoolFingerprint(values));
    setError("");
    stepReadyRef.current = true;
    if (options?.stay) {
      return true;
    }
    if (isApprovedEdit) {
      clearRememberedAccount();
      router.push("/admin/schools");
      return true;
    }
    setStep(3);
    if (accountId) writeStoredAdminStep(accountId, 3);
    return true;
  }

  async function onSaveStudents(options?: { stay?: boolean }) {
    setError("");
    const rowErrors: Record<number, string> = {};
    const cleaned = students.filter((s) => s.name.trim());
    if (cleaned.length === 0) {
      students.forEach((s, i) => {
        if (!s.name.trim()) rowErrors[i] = "Student name is required";
      });
      setStudentRowErrors(rowErrors);
      setError("Enter at least one student name");
      return false;
    }
    if (cleaned.length > MAX_STUDENTS_PER_REGISTRATION) {
      setError("Too many students for one registration");
      return false;
    }
    for (const [i, s] of students.entries()) {
      if (!s.name.trim()) continue;
      if (!isStudentGrade(s.grade) || (!s.imo && !s.iso && !s.ieo)) {
        rowErrors[i] = "Select at least one olympiad";
      }
    }
    if (Object.keys(rowErrors).length > 0) {
      setStudentRowErrors(rowErrors);
      const firstIndex = Object.keys(rowErrors)
        .map(Number)
        .sort((a, b) => a - b)[0];
      const errorGrade = students[firstIndex]?.grade;
      if (isStudentGrade(errorGrade) && errorGrade !== activeGrade) {
        setActiveGrade(errorGrade);
      }
      return false;
    }
    setStudentRowErrors({});
    setSaving(true);
    const studentPayload = cleaned.map((s) => ({
      id: s.id,
      registrationNumber: s.registrationNumber,
      name: s.name.trim().toUpperCase(),
      grade: s.grade,
      section: (s.section || "").trim().toUpperCase(),
      mobile: (s.mobile || "").trim(),
      imo: Boolean(s.imo),
      iso: Boolean(s.iso),
      ieo: Boolean(s.ieo),
    }));
    const res = await saveStudentsChunked(
      `/admin/school-registrations/accounts/${accountId}/step/2`,
      studentPayload as RegistrationStudent[],
      { draft: false },
    );
    setSaving(false);
    if (!res.success || !res.data) {
      setError(res.message);
      return false;
    }
    lastDraftPayloadRef.current = JSON.stringify(studentPayload);
    const nextStudents: StudentRow[] = res.data.students.map((s) => ({
      id: s.id,
      registrationNumber: s.registrationNumber,
      name: s.name,
      grade: s.grade,
      section: s.section || "",
      mobile: s.mobile || "",
      imo: Boolean(s.imo),
      iso: Boolean(s.iso),
      ieo: Boolean(s.ieo),
    }));
    const openGrade = firstFilledGrade(nextStudents);
    setActiveGrade(openGrade);
    setStudents(
      ensureStudentsForGrade(
        nextStudents,
        openGrade,
        emptyStudent,
        INITIAL_STUDENT_ROWS,
      ),
    );
    setStudentsBaseline(studentsFingerprint(nextStudents));
    setRegistrationStatus(res.data.status || registrationStatus);
    setCompletedThrough((prev) => Math.max(prev, 3));
    if (options?.stay) {
      return true;
    }
    if (isApprovedEdit) {
      clearRememberedAccount();
      router.push("/admin/schools");
      return true;
    }
    goToStep(4);
    return true;
  }

  async function onSaveConcession(options?: { stay?: boolean }) {
    setError("");
    const concessionRaw = concessionFeeInput.trim();
    if (concessionRaw) {
      const n = Number(concessionRaw);
      if (
        !Number.isInteger(n) ||
        n < 1 ||
        n > FEE_PER_STUDENT_PER_OLYMPIAD
      ) {
        setConcessionFeeError(
          `Enter a whole amount from ₹1 to ₹${FEE_PER_STUDENT_PER_OLYMPIAD}`,
        );
        setError("Fix the concession fee before saving.");
        return false;
      }
    }
    setConcessionFeeError("");
    setSaving(true);
    const res = await apiRequest<RegistrationPayload>(
      `/admin/school-registrations/accounts/${accountId}/concession`,
      {
        method: "PUT",
        body: {
          concessionFeePerStudent: concessionRaw ? Number(concessionRaw) : null,
        },
      },
    );
    setSaving(false);
    if (!res.success || !res.data) {
      setError(res.message);
      return false;
    }
    const nextConcession =
      res.data.concessionFeePerStudent != null &&
      res.data.concessionFeePerStudent > 0
        ? String(res.data.concessionFeePerStudent)
        : "";
    setConcessionFeeInput(nextConcession);
    setConcessionBaseline(nextConcession);
    setRegistrationStatus(res.data.status || registrationStatus);
    if (options?.stay) {
      return true;
    }
    if (isApprovedEdit) {
      clearRememberedAccount();
      router.push("/admin/schools");
      return true;
    }
    return true;
  }

  async function saveCurrentStepForLeave() {
    if (schoolDirty) {
      let saved = false;
      await schoolForm.handleSubmit(async (values) => {
        saved = await onSaveSchool(values, { stay: true });
      })();
      if (!saved) return false;
    }
    if (studentsDirty) {
      const ok = await onSaveStudents({ stay: true });
      if (!ok) return false;
    }
    if (concessionDirty) {
      return onSaveConcession({ stay: true });
    }
    return true;
  }

  async function confirmLeaveSave() {
    if (!leaveDialog) return;
    setLeaveSaving(true);
    const ok = await saveCurrentStepForLeave();
    setLeaveSaving(false);
    if (!ok) {
      setLeaveDialog(null);
      return;
    }
    const pending = leaveDialog;
    setLeaveDialog(null);
    if (pending.action === "home") {
      performExitToRegisterHome();
      return;
    }
    if (pending.href) {
      router.push(pending.href);
    }
  }

  function confirmLeaveDiscard() {
    if (!leaveDialog) return;
    const pending = leaveDialog;
    setLeaveDialog(null);
    if (pending.action === "home") {
      performExitToRegisterHome();
      return;
    }
    if (pending.href) {
      router.push(pending.href);
    }
  }

  async function onImportExcel(file: File | null) {
    if (importFeedbackTimerRef.current) {
      clearTimeout(importFeedbackTimerRef.current);
      importFeedbackTimerRef.current = null;
    }
    if (!file) {
      setImportStatus("idle");
      setImportFileName("");
      return;
    }
    setError("");
    setImportFileName(file.name);
    setImportStatus("importing");
    const res = await importAdminStudentsExcel(file);
    if (importInputRef.current) importInputRef.current.value = "";
    if (!res.success || !res.data) {
      setImportStatus("error");
      setError(
        `File selected: ${file.name}. ${res.message || "Import failed."}`,
      );
      importFeedbackTimerRef.current = setTimeout(() => {
        setImportStatus("idle");
        setImportFileName("");
      }, 6000);
      return;
    }
    if (res.data.students.length > MAX_STUDENTS_PER_REGISTRATION) {
      setImportStatus("error");
      setError(
        `File selected: ${file.name}. Too many students to import at once.`,
      );
      importFeedbackTimerRef.current = setTimeout(() => {
        setImportStatus("idle");
        setImportFileName("");
      }, 6000);
      return;
    }
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    skipNextDraftRef.current = true;
    const imported = res.data.students.map((s) =>
      normalizeStudent({
        ...s,
        name: (s.name || "").toUpperCase(),
        section: (s.section || "").toUpperCase(),
        mobile: sanitizeMobileDigits(s.mobile),
      }),
    );
    const openGrade = firstFilledGrade(imported);
    setActiveGrade(openGrade);
    const nextRows = ensureStudentsForGrade(
      withTrailingEmptyRow(imported, openGrade),
      openGrade,
      emptyStudent,
      INITIAL_STUDENT_ROWS,
    );
    setStudents(nextRows);

    const rowErrors: Record<number, string> = {};
    res.data.students.forEach((s, i) => {
      if (s.importWarning) {
        if (!String(s.name || "").trim() || !isStudentGrade(s.grade)) {
          rowErrors[i] = "Enter a valid name and grade (3–10)";
        } else if (!s.imo && !s.iso && !s.ieo) {
          rowErrors[i] = "Select at least one olympiad";
        } else {
          rowErrors[i] = "Fix this row and save";
        }
      }
    });
    setStudentRowErrors(rowErrors);
    setImportStatus("done");

    if (res.data.errors.length) {
      setError(
        `File imported: ${file.name}. Some rows need fixing — edit them in the table, then save. ${res.data.errors.slice(0, 3).join(" · ")}`,
      );
    } else {
      setError("");
    }

    lastDraftPayloadRef.current = "";
    void persistDraftStudents(nextRows, { immediate: true });

    importFeedbackTimerRef.current = setTimeout(() => {
      setImportStatus("idle");
      setImportFileName("");
      setError((prev) =>
        prev.startsWith("File imported:") || prev.startsWith("File selected:")
          ? ""
          : prev,
      );
    }, 5000);
  }

  async function onSubmitPayment() {
    setError("");
    const incomplete: string[] = [];
    if (
      completedThrough < 2 ||
      !isSchoolDetailsSaved({
        schoolName: schoolForm.getValues("schoolName"),
        address: schoolForm.getValues("address"),
        city: schoolForm.getValues("city"),
        district: schoolForm.getValues("district"),
        state: schoolForm.getValues("state"),
        pincode: schoolForm.getValues("pincode"),
        trustName: schoolForm.getValues("trustName"),
        schoolMobile: schoolForm.getValues("schoolMobile"),
        email: schoolForm.getValues("email"),
        principalName: schoolForm.getValues("principalName"),
        principalMobile: schoolForm.getValues("principalMobile"),
        principalEmail: schoolForm.getValues("principalEmail"),
        contactName: schoolForm.getValues("contactName"),
        phone: schoolForm.getValues("phone"),
        inchargeEmail: schoolForm.getValues("inchargeEmail"),
        affiliation: schoolForm.getValues("affiliation"),
        country: schoolForm.getValues("country"),
      })
    ) {
      incomplete.push("School details");
    }
    const named = students.filter((s) => s.name.trim());
    const studentsIncomplete =
      named.length === 0 ||
      named.some(
        (s) => !isStudentGrade(s.grade) || (!s.imo && !s.iso && !s.ieo),
      );
    if (studentsIncomplete) {
      incomplete.push("Students");
    }
    if (incomplete.length > 0) {
      const label =
        incomplete.length === 1
          ? incomplete[0]
          : incomplete.join(" and ");
      setError(
        `${label} ${incomplete.length === 1 ? "is" : "are"} incomplete. Complete ${incomplete.length === 1 ? "this step" : "these steps"} before registering.`,
      );
      goToStep(incomplete[0] === "School details" ? 2 : 3);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const concessionRaw = concessionFeeInput.trim();
    if (concessionRaw) {
      const n = Number(concessionRaw);
      if (
        !Number.isInteger(n) ||
        n < 1 ||
        n > FEE_PER_STUDENT_PER_OLYMPIAD
      ) {
        setConcessionFeeError(
          `Enter a whole amount from ₹1 to ₹${FEE_PER_STUDENT_PER_OLYMPIAD}`,
        );
        setError("Fix the concession fee before registering.");
        return;
      }
    }
    setConcessionFeeError("");

    setSaving(true);
    const res = await apiRequest<RegistrationPayload>(
      `/admin/school-registrations/accounts/${accountId}/step/3`,
      {
        method: "PUT",
        body: {
          approve: true,
          concessionFeePerStudent: concessionRaw
            ? Number(concessionRaw)
            : null,
        },
      },
    );
    setSaving(false);
    if (!res.success || !res.data) {
      setError(res.message);
      return;
    }
    setDone(res.data);
    setCompletedThrough(4);
    clearRememberedAccount();
  }

  if (loadingResume) {
    return (
      <div className="rounded-2xl border border-border bg-white px-4 py-10 text-center text-sm text-muted">
        Loading registration…
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="rounded-2xl border border-green-200 bg-green-50 p-6">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-full bg-green-600 text-white">
              <Check className="size-5" aria-hidden />
            </span>
            <div>
              <h1 className="text-xl font-bold text-brand">
                School registered successfully
              </h1>
              <p className="mt-1 text-sm text-muted">
                {done.schoolName} · Code {done.schoolCode} · Status{" "}
                {done.status.replaceAll("_", " ")}
              </p>
              <p className="mt-2 text-sm text-brand">
                {done.students.length} student
                {done.students.length === 1 ? "" : "s"} · Fee ₹
                {Number(done.feeExpected || feeExpected).toLocaleString("en-IN")}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/schools"
            className={buttonVariants({ variant: "accent" })}
          >
            Back to schools
          </Link>
          <Link
            href="/admin/students"
            className={buttonVariants({ variant: "outline" })}
          >
            View students
          </Link>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              clearRememberedAccount();
              setDone(null);
              exitToRegisterHome();
            }}
          >
            Register another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {accountId ? (
            <button
              type="button"
              className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-brand"
              onClick={() => exitToRegisterHome()}
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back
            </button>
          ) : null}
          <h1 className="text-2xl font-bold text-brand">
            {isApprovedEdit
              ? "Edit school"
              : accountId
                ? "Continue school registration"
                : "Register school"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {isApprovedEdit
              ? "Update school details or students. Save Changes appears after you edit something."
              : "Admin direct registration — account, school details, students, then confirm and approve. Incomplete work appears under Incomplete registrations."}
          </p>
          {accountId ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-[1.05rem] leading-snug text-muted">
              <p>
                School Name:{" "}
                <span className="font-semibold text-brand">
                  {displaySchoolName}
                </span>
              </p>
              <p>
                Email:{" "}
                <span className="font-semibold text-brand">{displayEmail}</span>
              </p>
              <p>
                School Code:{" "}
                <span className="font-mono text-[1.05rem] font-bold tracking-wider text-brand">
                  {displaySchoolCode}
                </span>
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <nav
        aria-label="Registration steps"
        className="w-full overflow-x-auto rounded-2xl border border-border bg-white px-3 py-4 sm:px-6"
      >
        <ol className="flex min-w-[720px] items-center justify-between gap-1 sm:min-w-0">
          {STEPS.map((item, index) => {
            const state =
              item.id === step
                ? "current"
                : item.id <= completedThrough
                  ? "completed"
                  : item.id < step
                    ? "incomplete"
                    : "pending";
            const canJumpBase = Boolean(accountId) || item.id === 1;
            const schoolOk = completedThrough >= 2;
            const canJump =
              item.id <= 2
                ? canJumpBase
                : item.id === 3
                  ? canJumpBase && schoolOk
                  : canJumpBase &&
                    schoolOk &&
                    studentsReadyForPayment(students);
            return (
              <li key={item.id} className="flex min-w-0 flex-1 items-center">
                <button
                  type="button"
                  disabled={!canJump}
                  title={
                    !canJump && item.id === 3
                      ? "Save school details first"
                      : !canJump && item.id === 4
                        ? "Add students with olympiads first"
                        : undefined
                  }
                  onClick={() => {
                    if (!canJump) return;
                    setError("");
                    goToStep(item.id);
                  }}
                  className={cn(
                    "flex w-full min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:gap-3 sm:text-left",
                    canJump
                      ? "cursor-pointer"
                      : "cursor-not-allowed opacity-55",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold",
                      state === "completed" &&
                        "border-green-600 bg-green-600 text-white",
                      state === "current" && "border-brand bg-brand text-white",
                      state === "incomplete" &&
                        "border-amber-500 bg-amber-50 text-amber-800",
                      state === "pending" &&
                        "border-border bg-white text-muted",
                    )}
                    aria-hidden
                  >
                    {state === "completed" ? (
                      <Check className="size-5" strokeWidth={3} />
                    ) : (
                      item.id
                    )}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-sm font-bold sm:text-base",
                        state === "current" && "text-brand",
                        state === "completed" && "text-green-700",
                        state === "incomplete" && "text-amber-800",
                        state === "pending" && "text-muted",
                      )}
                    >
                      {item.label}
                    </span>
                    <span
                      className={cn(
                        "block text-xs font-semibold uppercase tracking-wide",
                        state === "completed" && "text-green-600",
                        state === "current" && "text-accent",
                        state === "incomplete" && "text-amber-600",
                        state === "pending" && "text-muted",
                      )}
                    >
                      {state === "completed"
                        ? "Completed"
                        : state === "current"
                          ? "In progress"
                          : state === "incomplete"
                            ? "Incomplete"
                            : "Not started"}
                    </span>
                  </span>
                </button>
                {index < STEPS.length - 1 ? (
                  <ChevronRight
                    className={cn(
                      "mx-1 size-6 shrink-0 sm:mx-2",
                      state === "completed"
                        ? "text-green-600"
                        : state === "incomplete"
                          ? "text-amber-500"
                          : "text-border",
                    )}
                    aria-hidden
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>

      {error ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="min-w-0 flex-1">{error}</p>
          <button
            type="button"
            className="shrink-0 rounded p-0.5 text-red-600 hover:bg-red-100"
            aria-label="Dismiss"
            onClick={() => setError("")}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}

      {step === 1 ? (
        accountId ? (
          <div className="space-y-4 rounded-2xl border border-border bg-white p-5">
            <h2 className="text-lg font-bold text-brand">Portal account</h2>
            <p className="text-sm text-muted">
              Account already created. Continue with school details.
            </p>
            <div className="rounded-xl border border-border bg-brand-soft/40 p-4 text-[1.05rem] leading-snug">
              <p className="text-muted">
                School Name:{" "}
                <span className="font-semibold text-brand">
                  {displaySchoolName}
                </span>
              </p>
              <p className="mt-1 text-muted">
                Email:{" "}
                <span className="font-semibold text-brand">{displayEmail}</span>
              </p>
              <p className="mt-1 text-muted">
                School Code:{" "}
                <span className="font-mono text-[1.05rem] font-bold tracking-wider text-brand">
                  {displaySchoolCode}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="accent"
                onClick={() => goToStep(2)}
                disabled={Boolean(error)}
              >
                Continue to school details
              </Button>
            </div>
          </div>
        ) : (
          <>
            <form
              onSubmit={accountForm.handleSubmit(onCreateAccount)}
              className="space-y-4 rounded-2xl border border-border bg-white p-5"
              noValidate
            >
              <h2 className="text-lg font-bold text-brand">Portal account</h2>
              <p className="text-sm text-muted">
                Create login credentials the school can use later.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="School name *"
                  error={accountForm.formState.errors.name?.message}
                >
                  <Input
                    {...accountForm.register("name", {
                      onChange: titleCaseField("name"),
                    })}
                  />
                </Field>
                <Field
                  label="Email *"
                  error={accountForm.formState.errors.email?.message}
                >
                  <Input
                    type="email"
                    {...accountForm.register("email", {
                      onChange: clearAccountFieldError("email"),
                    })}
                  />
                </Field>
                <Field
                  label="Mobile number *"
                  error={accountForm.formState.errors.mobile?.message}
                >
                  <Input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={10}
                    placeholder="10-digit mobile number"
                    {...accountForm.register("mobile", {
                      onChange: clearAccountFieldError("mobile"),
                    })}
                  />
                </Field>
                <Field
                  label="Password *"
                  error={accountForm.formState.errors.password?.message}
                >
                  <Input
                    type="text"
                    {...accountForm.register("password", {
                      onChange: clearAccountFieldError("password"),
                    })}
                  />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="accent" disabled={saving}>
                  {saving ? "Creating…" : "Create account & continue"}
                </Button>
              </div>
            </form>
          </>
        )
      ) : null}

      {step === 2 ? (
        <form
          onSubmit={schoolForm.handleSubmit((values) =>
            void onSaveSchool(values),
          )}
          className="space-y-5 rounded-2xl border border-border bg-white p-5"
          noValidate
        >
          <h2 className="text-lg font-bold text-brand">School details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="School name *"
              error={schoolForm.formState.errors.schoolName?.message}
            >
              <Input
                {...schoolForm.register("schoolName", {
                  onChange: titleCaseField("schoolName"),
                })}
              />
            </Field>
            <Field
              label="Trust / Society *"
              error={schoolForm.formState.errors.trustName?.message}
            >
              <Input
                {...schoolForm.register("trustName", {
                  onChange: titleCaseField("trustName"),
                })}
              />
            </Field>
            <Field
              label="Address *"
              error={schoolForm.formState.errors.address?.message}
              className="sm:col-span-2"
            >
              <Input
                {...schoolForm.register("address", {
                  onChange: clearSchoolFieldError("address"),
                })}
              />
            </Field>
            <Field label="City *" error={schoolForm.formState.errors.city?.message}>
              <Input
                {...schoolForm.register("city", {
                  onChange: titleCaseField("city"),
                })}
              />
            </Field>
            <Field
              label="District *"
              error={schoolForm.formState.errors.district?.message}
            >
              <Input
                {...schoolForm.register("district", {
                  onChange: titleCaseField("district"),
                })}
              />
            </Field>
            <Field
              label="State *"
              error={schoolForm.formState.errors.state?.message}
            >
              <Input
                {...schoolForm.register("state", {
                  onChange: titleCaseField("state"),
                })}
              />
            </Field>
            <Field
              label="Pin code *"
              error={schoolForm.formState.errors.pincode?.message}
            >
              <Input
                {...schoolForm.register("pincode", {
                  onChange: clearSchoolFieldError("pincode"),
                })}
              />
            </Field>
            <Field label="Country *">
              <select
                className="h-9 w-full rounded-md border border-border px-3 text-sm"
                {...schoolForm.register("country")}
              >
                <option value="India">India</option>
                <option value="Other">Other</option>
              </select>
            </Field>
            {schoolForm.watch("country") === "Other" ? (
              <Field
                label="Country name *"
                error={schoolForm.formState.errors.countryOther?.message}
              >
                <Input
                  {...schoolForm.register("countryOther", {
                    onChange: titleCaseField("countryOther"),
                  })}
                />
              </Field>
            ) : null}
            <Field label="Website">
              <Input {...schoolForm.register("website")} />
            </Field>
            <Field
              label="Affiliation *"
              error={schoolForm.formState.errors.affiliation?.message}
            >
              <select
                className="h-9 w-full rounded-md border border-border px-3 text-sm"
                {...schoolForm.register("affiliation")}
              >
                <option value="" disabled>
                  Select affiliation
                </option>
                <option value="CBSE">CBSE</option>
                <option value="ICSE">ICSE</option>
                <option value="STATE_BOARD">State Board</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
            {schoolForm.watch("affiliation") === "OTHER" ? (
              <Field
                label="Affiliation other *"
                error={schoolForm.formState.errors.affiliationOther?.message}
              >
                <Input
                  {...schoolForm.register("affiliationOther", {
                    onChange: titleCaseField("affiliationOther"),
                  })}
                />
              </Field>
            ) : null}
            <Field
              label="School mobile *"
              error={schoolForm.formState.errors.schoolMobile?.message}
            >
              <Input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="10-digit mobile"
                {...schoolForm.register("schoolMobile", {
                  onChange: clearSchoolFieldError("schoolMobile"),
                })}
              />
            </Field>
            <Field label="STD code">
              <Input {...schoolForm.register("stdCode")} />
            </Field>
            <Field label="Landline">
              <Input {...schoolForm.register("landline")} />
            </Field>
            <Field
              label="School email *"
              error={schoolForm.formState.errors.email?.message}
            >
              <Input
                type="email"
                {...schoolForm.register("email", {
                  onChange: clearSchoolFieldError("email"),
                })}
              />
            </Field>
          </div>

          <div className="space-y-4 border-t border-border pt-5">
            <h3 className="text-base font-bold text-brand">Principal</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Name *"
                error={schoolForm.formState.errors.principalName?.message}
              >
                <Input
                  {...schoolForm.register("principalName", {
                    onChange: titleCaseField("principalName"),
                  })}
                />
              </Field>
              <Field
                label="Mobile no. *"
                error={schoolForm.formState.errors.principalMobile?.message}
              >
                <Input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10-digit mobile"
                  {...schoolForm.register("principalMobile", {
                    onChange: clearSchoolFieldError("principalMobile"),
                  })}
                />
              </Field>
              <Field
                label="E-mail *"
                error={schoolForm.formState.errors.principalEmail?.message}
              >
                <Input
                  type="email"
                  {...schoolForm.register("principalEmail", {
                    onChange: clearSchoolFieldError("principalEmail"),
                  })}
                />
              </Field>
            </div>
          </div>

          <div className="space-y-4 border-t border-border pt-5">
            <h3 className="text-base font-bold text-brand">
              School Olympiad Incharge
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Name *"
                error={schoolForm.formState.errors.contactName?.message}
              >
                <Input
                  {...schoolForm.register("contactName", {
                    onChange: titleCaseField("contactName"),
                  })}
                />
              </Field>
              <Field
                label="Mobile no. *"
                error={schoolForm.formState.errors.phone?.message}
              >
                <Input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10-digit mobile"
                  {...schoolForm.register("phone", {
                    onChange: clearSchoolFieldError("phone"),
                  })}
                />
              </Field>
              <Field
                label="E-mail *"
                error={schoolForm.formState.errors.inchargeEmail?.message}
              >
                <Input
                  type="email"
                  {...schoolForm.register("inchargeEmail", {
                    onChange: clearSchoolFieldError("inchargeEmail"),
                  })}
                />
              </Field>
            </div>
          </div>

          {schoolDirty ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="submit" variant="accent" disabled={saving}>
                {saving
                  ? "Saving…"
                  : isApprovedEdit || completedThrough >= 2
                    ? "Save Changes"
                    : "Save & continue to students"}
              </Button>
            </div>
          ) : null}
        </form>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4 rounded-2xl border border-border bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-brand">Student details</h2>
              <p className="mt-1 text-sm text-muted">
                Enter each student — draft saves automatically.
              </p>
            </div>
            <p
              className={cn(
                "min-h-5 text-sm font-semibold",
                draftStatus === "saving" && "text-muted",
                draftStatus === "saved" && "text-green-700",
                draftStatus === "error" && "text-red-600",
              )}
              aria-live="polite"
            >
              {draftStatus === "saving"
                ? "Saving draft…"
                : draftStatus === "saved"
                  ? `Draft saved · ${draftStudents.length} student${draftStudents.length === 1 ? "" : "s"}`
                  : draftStatus === "error"
                    ? "Draft save failed"
                    : null}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={adminStudentTemplateUrl()}
                className="inline-flex rounded-md border border-border px-3 py-2 text-sm font-semibold text-brand hover:bg-brand-soft"
              >
                Download Excel template
              </a>
              <label
                className={cn(
                  "inline-flex cursor-pointer rounded-md border border-border px-3 py-2 text-sm font-semibold text-brand hover:bg-brand-soft",
                  importStatus === "importing" && "pointer-events-none opacity-60",
                )}
              >
                {importStatus === "importing" ? "Importing…" : "Import Excel"}
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  disabled={importStatus === "importing"}
                  onChange={(e) => onImportExcel(e.target.files?.[0] ?? null)}
                />
              </label>
              {importFileName ? (
                <p
                  className={cn(
                    "text-sm font-medium",
                    importStatus === "importing" && "text-muted",
                    importStatus === "done" && "text-green-700",
                    importStatus === "error" && "text-red-600",
                  )}
                  aria-live="polite"
                >
                  {importStatus === "importing"
                    ? `Reading ${importFileName}…`
                    : importStatus === "done"
                      ? `Imported: ${importFileName}`
                      : importStatus === "error"
                        ? `Selected: ${importFileName} — not imported`
                        : importFileName}
                </p>
              ) : null}
            </div>
            <GradeSwitchButtons
              activeGrade={activeGrade}
              onChange={switchGrade}
              counts={gradeCounts}
            />
          </div>

          <GradeTableFrame grade={activeGrade}>
            <table className="w-full min-w-[920px] border-collapse text-sm">
              <thead className="bg-brand-stats text-white">
                <tr>
                  <th className="px-2 py-3 text-center font-semibold">S.No.</th>
                  <th className="px-2 py-3 text-center font-semibold">
                    Reg. No.
                  </th>
                  <th className="min-w-[16rem] px-3 py-3 text-left font-semibold sm:min-w-[20rem]">
                    Name of the student
                  </th>
                  <th className="px-2 py-3 text-center font-semibold">Grade</th>
                  <th className="w-14 px-1 py-3 text-center font-semibold">
                    Sec
                  </th>
                  <th className="w-[7.5rem] px-1 py-3 text-center font-semibold">
                    Mobile
                  </th>
                  <th className="px-2 py-3 text-center font-semibold">IMO</th>
                  <th className="px-2 py-3 text-center font-semibold">IEO</th>
                  <th className="px-2 py-3 text-center font-semibold">ISO</th>
                  <th className="w-14 px-2 py-3 text-center font-semibold">
                    Delete
                  </th>
                </tr>
              </thead>
              <tbody>
                {gradeIndices.map((absoluteIndex, displayIndex) => {
                  const student = students[absoluteIndex];
                  if (!student) return null;
                  const rowError = studentRowErrors[absoluteIndex];
                  const showOlympiadError =
                    rowError === "Select at least one olympiad";
                  return (
                    <tr
                      key={student.id || student.clientKey || `row-${absoluteIndex}`}
                      className={cn(
                        "border-t bg-white",
                        rowError
                          ? "border-red-300 bg-red-50/40"
                          : "border-border",
                      )}
                    >
                      <td className="px-2 py-2 text-center align-middle text-muted">
                        {String(displayIndex + 1).padStart(2, "0")}
                      </td>
                      <td className="px-2 py-2 text-center align-middle">
                        <span className="font-mono text-xs font-bold tracking-wide text-brand">
                          {student.registrationNumber || "—"}
                        </span>
                      </td>
                      <td className="min-w-[16rem] px-3 py-2 align-middle sm:min-w-[20rem]">
                        <Input
                          value={student.name}
                          placeholder="IN BLOCK LETTERS"
                          aria-invalid={Boolean(rowError)}
                          className="h-9 w-full uppercase"
                          onChange={(e) => {
                            const nextName = e.target.value.toUpperCase();
                            setError("");
                            setImportStatus("idle");
                            setImportFileName("");
                            setStudentRowErrors((prev) => {
                              if (!prev[absoluteIndex]) return prev;
                              const copy = { ...prev };
                              delete copy[absoluteIndex];
                              return copy;
                            });
                            setStudents((prev) => {
                              const next = prev.map((row, i) =>
                                i === absoluteIndex
                                  ? {
                                      ...row,
                                      name: nextName,
                                      grade: activeGrade,
                                    }
                                  : row,
                              );
                              const ofGrade = next.filter(
                                (s) => s.grade === activeGrade,
                              );
                              const needsEnsure =
                                ofGrade.length < INITIAL_STUDENT_ROWS ||
                                Boolean(ofGrade[ofGrade.length - 1]?.name.trim());
                              if (!needsEnsure) return next;
                              return ensureStudentsForGrade(
                                next,
                                activeGrade,
                                emptyStudent,
                                INITIAL_STUDENT_ROWS,
                              );
                            });
                          }}
                        />
                        {rowError ? (
                          <p className="mt-1 text-[11px] font-medium text-red-600">
                            {rowError}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-center align-middle">
                        <span className="inline-flex h-9 min-w-[3.25rem] items-center justify-center rounded-md border border-border bg-slate-50 px-2 text-sm font-semibold text-brand">
                          {activeGrade}
                        </span>
                      </td>
                      <td className="w-14 px-1 py-2 align-middle">
                        <Input
                          value={student.section}
                          placeholder=""
                          maxLength={3}
                          className="h-9 w-12 px-1 text-center uppercase"
                          onChange={(e) =>
                            setStudents((prev) =>
                              prev.map((row, i) =>
                                i === absoluteIndex
                                  ? {
                                      ...row,
                                      section: e.target.value.toUpperCase(),
                                      grade: activeGrade,
                                    }
                                  : row,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="w-[7.5rem] px-1 py-2 align-middle">
                        <Input
                          type="tel"
                          inputMode="numeric"
                          maxLength={10}
                          value={student.mobile}
                          placeholder="Mobile"
                          className="h-9 w-[7.5rem] max-w-[7.5rem] px-2 text-center tabular-nums"
                          onChange={(e) =>
                            setStudents((prev) =>
                              prev.map((row, i) =>
                                i === absoluteIndex
                                  ? {
                                      ...row,
                                      mobile: e.target.value
                                        .replace(/\D/g, "")
                                        .slice(0, 10),
                                      grade: activeGrade,
                                    }
                                  : row,
                              ),
                            )
                          }
                        />
                      </td>
                      {(
                        [
                          ["imo", "IMO"],
                          ["ieo", "IEO"],
                          ["iso", "ISO"],
                        ] as const
                      ).map(([key]) => (
                        <td
                          key={key}
                          className={cn(
                            "px-2 py-2 text-center align-middle",
                            showOlympiadError && "bg-red-100/80",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={student[key]}
                            aria-invalid={showOlympiadError}
                            title={
                              showOlympiadError
                                ? "Select at least one olympiad"
                                : undefined
                            }
                            className={cn(
                              "size-4 accent-brand",
                              showOlympiadError &&
                                "rounded outline outline-2 outline-offset-2 outline-red-500",
                            )}
                            onChange={(e) =>
                              setStudents((prev) =>
                                prev.map((row, i) =>
                                  i === absoluteIndex
                                    ? {
                                        ...row,
                                        [key]: e.target.checked,
                                        grade: activeGrade,
                                      }
                                    : row,
                                ),
                              )
                            }
                          />
                        </td>
                      ))}
                      <td className="px-2 py-2 text-center align-middle">
                        <button
                          type="button"
                          className="inline-flex text-red-600 hover:underline disabled:opacity-40"
                          aria-label="Remove student"
                          onClick={() => removeStudentAt(absoluteIndex)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </GradeTableFrame>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setStudents((prev) =>
                  ensureStudentsForGrade(
                    [...prev, emptyStudent(activeGrade)],
                    activeGrade,
                    emptyStudent,
                    INITIAL_STUDENT_ROWS,
                  ),
                )
              }
            >
              <Plus className="size-4" aria-hidden />
              Add row
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setStudents((prev) =>
                  ensureStudentsForGrade(
                    [...prev, ...createEmptyStudents(10, activeGrade)],
                    activeGrade,
                    emptyStudent,
                    INITIAL_STUDENT_ROWS,
                  ),
                )
              }
            >
              Add 10 rows
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setStudents((prev) =>
                  ensureStudentsForGrade(
                    [...prev, ...createEmptyStudents(30, activeGrade)],
                    activeGrade,
                    emptyStudent,
                    INITIAL_STUDENT_ROWS,
                  ),
                )
              }
            >
              Add 30 rows
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setStudents((prev) =>
                  ensureStudentsForGrade(
                    [...prev, ...createEmptyStudents(50, activeGrade)],
                    activeGrade,
                    emptyStudent,
                    INITIAL_STUDENT_ROWS,
                  ),
                )
              }
            >
              Add 50 rows
            </Button>
          </div>

          {studentsDirty ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="accent"
                disabled={saving}
                onClick={() => void onSaveStudents()}
              >
                {saving
                  ? "Saving…"
                  : isApprovedEdit || completedThrough >= 3
                    ? "Save Changes"
                    : "Save & continue"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-4 rounded-2xl border border-border bg-white p-5">
          <h2 className="text-lg font-bold text-brand">
            {isApprovedEdit ? "Registration summary" : "Confirm & approve"}
          </h2>
          <p className="text-sm text-muted">
            {isApprovedEdit
              ? "This school is already approved. Change the concession fee and save if needed."
              : "Review the fee, then register and approve this school."}
          </p>
          <PaymentFeeSummary
            variant="admin"
            students={students.filter((s) => s.name.trim())}
            feePerSlot={feePerSlot}
          />
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label
                htmlFor="admin-concession-fee"
                className={cn(
                  "shrink-0 text-sm font-semibold",
                  concessionFeeError ? "text-red-600" : "text-brand",
                )}
              >
                Concession fee per Olympiad (₹)
              </label>
              <Input
                id="admin-concession-fee"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={3}
                value={concessionFeeInput}
                aria-invalid={Boolean(concessionFeeError)}
                className={cn(
                  "w-24",
                  concessionFeeError &&
                    "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/25",
                )}
                onChange={(e) => {
                  setConcessionFeeInput(e.target.value.replace(/[^\d]/g, ""));
                  setConcessionFeeError("");
                }}
              />
              <p className="text-xs text-muted">
                Enter the approved discounted fee. Leave blank for ₹
                {FEE_PER_STUDENT_PER_OLYMPIAD}.
              </p>
            </div>
            {concessionFeeError ? (
              <p className="mt-1 text-xs font-medium text-red-600">
                {concessionFeeError}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {concessionDirty ? (
              <Button
                type="button"
                variant="accent"
                disabled={saving}
                onClick={() => void onSaveConcession()}
              >
                {saving ? "Saving…" : "Save Changes"}
              </Button>
            ) : null}
            {isApprovedEdit ? null : (
              <Button
                type="button"
                variant="accent"
                disabled={saving}
                onClick={() => void onSubmitPayment()}
              >
                {saving ? "Registering…" : "Register & approve"}
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {leaveDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-brand">Unsaved changes</h2>
                <p className="mt-1 text-sm text-muted">
                  You have edits that are not saved yet. Save them, discard them,
                  or stay on this page.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setLeaveDialog(null)}
                disabled={leaveSaving}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={leaveSaving}
                onClick={() => setLeaveDialog(null)}
              >
                Keep editing
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={leaveSaving}
                onClick={confirmLeaveDiscard}
              >
                Discard
              </Button>
              <Button
                type="button"
                variant="accent"
                disabled={leaveSaving}
                onClick={() => void confirmLeaveSave()}
              >
                {leaveSaving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AdminRegisterSchoolPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-border bg-white px-4 py-10 text-center text-sm text-muted">
          Loading…
        </div>
      }
    >
      <AdminRegisterSchoolPageInner />
    </Suspense>
  );
}
