import { apiRequest } from "@/lib/api";
import type { PaymentMethod } from "@/lib/payment-details";
import { LIVE_DATA_REFETCH_MS } from "@/lib/live-refresh";

/** @deprecated Prefer LIVE_DATA_REFETCH_MS — kept for existing imports */
export const ADMIN_LIST_REFETCH_MS = LIVE_DATA_REFETCH_MS;

export type AdminAccountsResponse = {
  accounts: Array<{
    id: string;
    email: string;
    password?: string;
    name: string | null;
    createdAt: string;
    updatedAt?: string;
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
    currentStep?: number;
    studentCount: number;
    imoCount: number;
    isoCount: number;
    ieoCount: number;
    olympiadTotal: number;
    amountExpected?: number;
    olympiadYear: { label: string; code: string } | null;
    registration: unknown;
  }>;
  totals?: {
    imo: number;
    iso: number;
    ieo: number;
    total?: number;
    payment?: number;
    schools: number;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export async function fetchAdminAccounts(params: {
  page?: number;
  limit?: number;
  q?: string;
  approved?: boolean;
  incomplete?: boolean;
}): Promise<AdminAccountsResponse> {
  const search = new URLSearchParams({
    page: String(params.page || 1),
    limit: String(params.limit || 20),
  });
  if (params.q?.trim()) search.set("q", params.q.trim());
  if (params.approved) search.set("approved", "1");
  if (params.incomplete) search.set("incomplete", "1");

  const res = await apiRequest<AdminAccountsResponse>(
    `/admin/school-registrations/accounts?${search.toString()}`,
  );
  if (!res.success || !res.data) {
    throw new Error(res.message || "Failed to load schools");
  }
  return res.data;
}

export type AdminRegistrationRow = {
  id: string;
  schoolCode: string;
  schoolName: string;
  city: string;
  state: string;
  status: string;
  submittedAt: string | null;
  updatedAt: string;
  studentCount: number;
  imoCount: number;
  isoCount: number;
  ieoCount: number;
  olympiadTotal: number;
  schoolAccount: {
    id: string;
    email: string;
    password?: string;
    name: string | null;
  };
  olympiadYear: { label: string; code: string };
  payment: {
    id: string;
    status: string;
    paymentMethod: PaymentMethod;
    utr: string;
    amountExpected: string | number;
    proofUrl: string;
    adminNote: string | null;
    reviewedAt: string | null;
  } | null;
};

export type AdminRegistrationsResponse = {
  registrations: AdminRegistrationRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type AdminRegistrationDetail = {
  id: string;
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
  status: string;
  rejectionNote: string | null;
  submittedAt: string | null;
  feeExpected: number;
  concessionFeePerStudent?: number | null;
  studentCount: number;
  imoCount: number;
  isoCount: number;
  ieoCount: number;
  olympiadTotal: number;
  olympiadYear: { label: string; code: string };
  payment: {
    amountExpected: number;
    paymentMethod: PaymentMethod;
    utr: string;
    proofUrl: string;
    status: string;
    adminNote: string | null;
    reviewedAt: string | null;
  } | null;
  schoolAccount: {
    id: string;
    email: string;
    password?: string;
    name: string | null;
  };
};

export async function fetchAdminRegistrations(params: {
  page?: number;
  limit?: number;
  status?: string;
}): Promise<AdminRegistrationsResponse> {
  const search = new URLSearchParams({
    page: String(params.page || 1),
    limit: String(params.limit || 20),
  });
  if (params.status) search.set("status", params.status);

  const res = await apiRequest<AdminRegistrationsResponse>(
    `/admin/school-registrations?${search.toString()}`,
  );
  if (!res.success || !res.data) {
    throw new Error(res.message || "Failed to load registrations");
  }
  return res.data;
}

export async function fetchAdminRegistrationDetail(
  id: string,
): Promise<AdminRegistrationDetail> {
  const res = await apiRequest<AdminRegistrationDetail>(
    `/admin/school-registrations/${id}`,
  );
  if (!res.success || !res.data) {
    throw new Error(res.message || "Failed to load registration");
  }
  return res.data;
}

export type AdminStudentsResponse = {
  students: Array<{
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
  }>;
  filters: {
    schools: Array<{ schoolCode: string; schoolName: string }>;
  };
  totals?: {
    schools: number;
    imo: number;
    ieo: number;
    iso: number;
    total: number;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export async function fetchAdminStudents(params: {
  page?: number;
  limit?: number;
  q?: string;
  schoolCode?: string;
  olympiad?: string;
  grade?: string;
}): Promise<AdminStudentsResponse> {
  const search = new URLSearchParams({
    page: String(params.page || 1),
    limit: String(params.limit || 50),
    status: "APPROVED",
  });
  if (params.q?.trim()) search.set("q", params.q.trim());
  if (params.schoolCode) search.set("schoolCode", params.schoolCode);
  if (params.olympiad) search.set("olympiad", params.olympiad);
  if (params.grade) search.set("grade", params.grade);

  const res = await apiRequest<AdminStudentsResponse>(
    `/admin/school-registrations/students?${search.toString()}`,
  );
  if (!res.success || !res.data) {
    throw new Error(res.message || "Failed to load students");
  }
  return res.data;
}

export type AdminStudentUpdateInput = {
  name: string;
  grade: number;
  section?: string;
  mobile?: string;
  imo: boolean;
  iso: boolean;
  ieo: boolean;
};

export type AdminStudentRow = AdminStudentsResponse["students"][number];

export async function updateAdminStudent(
  id: string,
  body: AdminStudentUpdateInput,
): Promise<AdminStudentRow> {
  const res = await apiRequest<AdminStudentRow>(
    `/admin/school-registrations/students/${id}`,
    { method: "PUT", body },
  );
  if (!res.success || !res.data) {
    throw new Error(res.message || "Failed to update student");
  }
  return res.data;
}

export const adminQueryKeys = {
  dashboard: () => ["admin", "dashboard"] as const,
  schools: (page: number, q: string) =>
    ["admin", "schools", "approved", page, q] as const,
  incomplete: (page: number, q: string) =>
    ["admin", "schools", "incomplete", page, q] as const,
  registrations: (page: number, status: string) =>
    ["admin", "registrations", page, status] as const,
  registrationDetail: (id: string) =>
    ["admin", "registrations", "detail", id] as const,
  students: (filters: {
    page: number;
    q: string;
    schoolCode: string;
    olympiad: string;
    grade: string;
  }) => ["admin", "students", filters] as const,
};

export type AdminDashboardData = {
  olympiadYear: { label: string; code: string } | null;
  schools: {
    totalAccounts: number;
    withRegistration: number;
    draft: number;
    underReview: number;
    approved: number;
    rejected: number;
    incomplete: number;
  };
  students: {
    approved: number;
    underReview: number;
    totalNamed: number;
    imo: number;
    iso: number;
    ieo: number;
    imoApproved: number;
    isoApproved: number;
    ieoApproved: number;
  };
  byGrade?: Array<{
    grade: number;
    students: number;
    imo: number;
    iso: number;
    ieo: number;
    approvedStudents: number;
    approvedImo: number;
    approvedIso: number;
    approvedIeo: number;
  }>;
  payments: {
    pending: number;
    verified: number;
    rejected: number;
    pendingAmount: number;
    verifiedAmount: number;
    awaitingReview: number;
  };
  attention: Array<{
    id: string;
    schoolName: string;
    schoolCode: string;
    status: string;
    studentCount: number;
    amountExpected: number;
    submittedAt: string | null;
    paymentStatus: string | null;
  }>;
  recentApproved: Array<{
    id: string;
    schoolName: string;
    schoolCode: string;
    studentCount: number;
    updatedAt: string;
  }>;
};

export async function fetchAdminDashboard(): Promise<AdminDashboardData> {
  const res = await apiRequest<AdminDashboardData>(
    "/admin/school-registrations/dashboard",
  );
  if (!res.success || !res.data) {
    throw new Error(res.message || "Failed to load dashboard");
  }
  return res.data;
}
