import { apiRequest, getApiUrl, type ApiResponse } from "@/lib/api";
import { reportFromHttpStatus, reportServerUnreachable } from "@/lib/server-status";
import type { PaymentMethod } from "@/lib/payment-details";

export type SchoolAccount = {
  id: string;
  email: string;
  name: string;
  mobile?: string;
};

export type RegistrationStudent = {
  id?: string;
  registrationNumber?: string;
  name: string;
  grade: number;
  section: string;
  mobile: string;
  imo: boolean;
  iso: boolean;
  ieo: boolean;
  importWarning?: string;
};

/** Max named students per school registration (admin + school portal). */
export const MAX_STUDENTS_PER_REGISTRATION = 5000;

export type SchoolRegistration = {
  id: string;
  status: "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
  currentStep: number;
  schoolCode: string;
  schoolName: string;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  country: string;
  countryOther: string;
  website: string;
  affiliation: string;
  affiliationOther: string;
  trustName: string;
  schoolMobile: string;
  landline: string;
  stdCode: string;
  email: string;
  principalName: string;
  principalMobile: string;
  principalEmail: string;
  contactName: string;
  phone: string;
  inchargeEmail: string;
  gradeCounts: Record<string, number>;
  concessionFeePerStudent?: number | null;
  rejectionNote: string | null;
  submittedAt: string | null;
  olympiadYear: { label: string; code: string };
  students: RegistrationStudent[];
  feeExpected: number;
  feePerSlot?: number;
  payment: {
    id: string;
    amountExpected: number;
    paymentMethod: PaymentMethod;
    utr: string;
    proofUrl: string;
    status: "PENDING" | "VERIFIED" | "REJECTED";
    adminNote: string | null;
    reviewedAt: string | null;
  } | null;
  locked: boolean;
};

export async function schoolAuthMe() {
  return apiRequest<SchoolAccount>("/school-auth/me");
}

export async function schoolLogin(email: string, password: string) {
  return apiRequest<SchoolAccount>("/school-auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export async function schoolRegister(input: {
  email: string;
  password: string;
  name: string;
  mobile: string;
}) {
  return apiRequest<SchoolAccount>("/school-auth/register", {
    method: "POST",
    body: input,
  });
}

export async function schoolLogout() {
  return apiRequest("/school-auth/logout", { method: "POST" });
}

export async function schoolForgotPassword(email: string) {
  return apiRequest("/school-auth/forgot-password", {
    method: "POST",
    body: { email },
  });
}

export async function schoolResetPassword(input: {
  email: string;
  otp: string;
  password: string;
}) {
  return apiRequest("/school-auth/reset-password", {
    method: "POST",
    body: input,
  });
}

export async function fetchMyRegistration() {
  return apiRequest<SchoolRegistration>("/school-registration");
}

/** Explicitly create a draft — portal GET never auto-creates. */
export async function startMyRegistration() {
  return apiRequest<SchoolRegistration>("/school-registration/start", {
    method: "POST",
  });
}

export async function fetchMyStudents(input?: {
  olympiad?: string;
  grade?: string;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (input?.olympiad) params.set("olympiad", input.olympiad);
  if (input?.grade) params.set("grade", input.grade);
  if (input?.page) params.set("page", String(input.page));
  if (input?.limit) params.set("limit", String(input.limit));
  const qs = params.toString();
  return apiRequest<{
    schoolCode: string;
    schoolName: string;
    city: string;
    state: string;
    status: string;
    students: RegistrationStudent[];
    totals: {
      studentCount: number;
      imo: number;
      iso: number;
      ieo: number;
    };
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }>(`/school-registration/students${qs ? `?${qs}` : ""}`);
}

export async function saveSchoolStep1(body: Record<string, unknown>) {
  return apiRequest<SchoolRegistration>("/school-registration/step/1", {
    method: "PUT",
    body,
  });
}

export async function saveSchoolStep2(
  students: RegistrationStudent[],
  options?: { draft?: boolean },
) {
  return saveStudentsChunked("/school-registration/step/2", students, options);
}

/** Serialize chunked saves per endpoint so overlapping drafts cannot interleave. */
const studentSaveChains = new Map<string, Promise<unknown>>();

/** Save students in small HTTP chunks to avoid proxy/DB timeouts on large lists. */
export async function saveStudentsChunked(
  path: string,
  students: RegistrationStudent[],
  options?: { draft?: boolean },
): Promise<ApiResponse<SchoolRegistration>> {
  const prev = studentSaveChains.get(path) ?? Promise.resolve();
  const job = prev
    .catch(() => undefined)
    .then(() => saveStudentsChunkedUnlocked(path, students, options));
  studentSaveChains.set(
    path,
    job.then(
      () => undefined,
      () => undefined,
    ),
  );
  return job;
}

async function saveStudentsChunkedUnlocked(
  path: string,
  students: RegistrationStudent[],
  options?: { draft?: boolean },
): Promise<ApiResponse<SchoolRegistration>> {
  const draft = Boolean(options?.draft);
  const CHUNK_SIZE = 300;
  const named = students.filter((s) => String(s.name ?? "").trim().length >= 2);

  if (named.length > MAX_STUDENTS_PER_REGISTRATION) {
    return {
      success: false,
      message: "Too many students for one registration",
    };
  }

  if (named.length === 0) {
    return apiRequest<SchoolRegistration>(path, {
      method: "PUT",
      body: {
        students: [],
        draft,
        replaceAll: true,
        finalize: true,
      },
    });
  }

  const chunks: RegistrationStudent[][] = [];
  for (let i = 0; i < named.length; i += CHUNK_SIZE) {
    chunks.push(named.slice(i, i + CHUNK_SIZE));
  }

  let last: ApiResponse<SchoolRegistration> = {
    success: false,
    message: "Save failed",
  };

  // Carry registration numbers forward so later chunks keep stable codes
  const numberByKey = new Map<string, string>();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i].map((s) => {
      const key = `${String(s.name).trim().toUpperCase()}|${s.grade}|${String(s.section || "").trim().toUpperCase()}`;
      const known =
        (s.registrationNumber && /^\d{8}$/.test(s.registrationNumber)
          ? s.registrationNumber
          : null) || numberByKey.get(key);
      return known ? { ...s, registrationNumber: known } : s;
    });

    last = await apiRequest<SchoolRegistration>(path, {
      method: "PUT",
      body: {
        students: chunk,
        draft,
        replaceAll: i === 0,
        finalize: i === chunks.length - 1,
      },
    });

    if (!last.success || !last.data) return last;

    for (const s of last.data.students) {
      const key = `${s.name}|${s.grade}|${(s.section || "").toUpperCase()}`;
      if (s.registrationNumber) numberByKey.set(key, s.registrationNumber);
    }
  }

  return last;
}

export async function saveSchoolStep3(body: {
  paymentMethod: PaymentMethod;
  utr: string;
  proofUrl: string;
  proofPublicId?: string;
  concessionFeePerStudent?: number | null;
}) {
  return apiRequest<SchoolRegistration>("/school-registration/step/3", {
    method: "PUT",
    body,
  });
}

export async function checkPaymentReference(utr: string) {
  const params = new URLSearchParams({ utr: utr.trim() });
  return apiRequest<{ available: boolean; message?: string }>(
    `/school-registration/step/3/reference-check?${params.toString()}`,
  );
}

export function studentTemplateUrl() {
  return `${getApiUrl()}/school-registration/step/2/template`;
}

export async function importStudentsExcel(
  file: File,
): Promise<
  ApiResponse<{ students: RegistrationStudent[]; errors: string[] }>
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
      `${apiUrl}/school-registration/step/2/import`,
      {
        method: "POST",
        body: form,
        credentials: "include",
      },
    );
    const data = (await response.json()) as ApiResponse<{
      students: RegistrationStudent[];
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

export async function uploadPaymentProofFile(file: File): Promise<
  ApiResponse<{ url: string; publicId: string }>
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

  const allowed = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/pdf",
  ];
  if (file.type && !allowed.includes(file.type)) {
    return {
      success: false,
      message: "Proof must be JPG, PNG, WEBP, or PDF",
    };
  }
  if (file.size > 8 * 1024 * 1024) {
    return {
      success: false,
      message: "Proof file must be under 8 MB",
    };
  }

  const form = new FormData();
  form.append("file", file);
  try {
    const response = await fetch(`${apiUrl}/school-registration/step/3/proof`, {
      method: "POST",
      body: form,
      credentials: "include",
    });

    let data: ApiResponse<{ url: string; publicId: string }> = {
      success: false,
      message: "Upload failed",
    };
    try {
      data = (await response.json()) as ApiResponse<{
        url: string;
        publicId: string;
      }>;
    } catch {
      /* non-JSON body */
    }

    reportFromHttpStatus(response.status);
    if (!response.ok) {
      const gatewayDown =
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504;
      return {
        success: false,
        message: gatewayDown
          ? "Server unreachable. Check your connection and try again."
          : ("message" in data && typeof data.message === "string"
              ? data.message
              : null) ||
            (response.status === 401
              ? "Please log in again to upload payment proof"
              : response.status === 413
                ? "Proof file is too large (max 8 MB)"
                : "Upload failed"),
        status: response.status,
        networkError: gatewayDown,
      };
    }

    if (!data.success || !data.data?.url) {
      return {
        success: false,
        message: data.message || "Upload failed",
        status: response.status,
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
