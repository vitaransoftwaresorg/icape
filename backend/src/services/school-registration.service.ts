import ExcelJS from "exceljs";
import {
  Prisma,
  RegistrationStatus,
  PaymentReviewStatus,
  PaymentMethod,
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error.middleware";
import {
  computeRegistrationFee,
  PAYMENT_DETAILS,
} from "../lib/payment-details";
import { uploadPaymentProof } from "../lib/cloudinary";
import {
  allocateSchoolCode,
  allocateStudentRegistrationNumbers,
} from "../lib/registration-codes";
import { MAX_STUDENTS_PER_REGISTRATION } from "../lib/registration-limits";
import {
  CURRENT_OLYMPIAD_YEAR,
  OLYMPIAD_YEAR_META,
  listOlympiadYears,
} from "../lib/olympiad-year";
import {
  sendRegistrationApprovedEmail,
  sendRegistrationRejectedEmail,
  sendRegistrationSubmittedEmail,
} from "../lib/mail";

/** Required school fields must be saved before students / payment. */
function isSchoolDetailsComplete(reg: {
  schoolName: string;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  trustName: string;
  schoolMobile: string;
  email: string;
  principalName: string;
  principalMobile: string;
  principalEmail: string;
  contactName: string;
  phone: string;
  inchargeEmail: string;
  affiliation?: string;
  country?: string;
}) {
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

function assertSchoolDetailsComplete(reg: Parameters<typeof isSchoolDetailsComplete>[0]) {
  if (!isSchoolDetailsComplete(reg)) {
    throw new AppError("Complete and save school details first", 400);
  }
}

function parseGradeCounts(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(value);
    if (Number.isInteger(n) && n >= 0) out[key] = n;
  }
  return out;
}

function gradeCountsFromStudents(
  students: Array<{ grade: number }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of students) {
    const key = String(s.grade);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function olympiadCountsFromStudents(
  students: Array<{ imo: boolean; iso: boolean; ieo: boolean }>,
) {
  let studentCount = 0;
  let imoCount = 0;
  let isoCount = 0;
  let ieoCount = 0;
  for (const s of students) {
    studentCount += 1;
    if (s.imo) imoCount += 1;
    if (s.iso) isoCount += 1;
    if (s.ieo) ieoCount += 1;
  }
  return { studentCount, imoCount, isoCount, ieoCount };
}

function serializeRegistration(
  reg: Awaited<ReturnType<typeof loadRegistration>>,
) {
  if (!reg) return null;
  const students = (reg.students || []).map((s) => ({
    id: s.id,
    registrationNumber: s.registrationNumber,
    name: s.name,
    grade: s.grade,
    section: s.section,
    mobile: s.mobile,
    imo: s.imo,
    iso: s.iso,
    ieo: s.ieo,
  }));
  const imoCount =
    reg.imoCount ?? students.filter((s) => s.imo).length;
  const isoCount =
    reg.isoCount ?? students.filter((s) => s.iso).length;
  const ieoCount =
    reg.ieoCount ?? students.filter((s) => s.ieo).length;
  const feePerSlot =
    typeof reg.concessionFeePerStudent === "number" &&
    reg.concessionFeePerStudent > 0
      ? reg.concessionFeePerStudent
      : PAYMENT_DETAILS.feeAmount;
  const fee =
    students.length > 0
      ? computeRegistrationFee(students, feePerSlot)
      : (imoCount + isoCount + ieoCount) * feePerSlot;
  return {
    id: reg.id,
    status: reg.status,
    currentStep: reg.currentStep,
    schoolCode: reg.schoolCode,
    schoolName: reg.schoolName,
    address: reg.address,
    city: reg.city,
    district: reg.district,
    state: reg.state,
    pincode: reg.pincode,
    country: reg.country,
    countryOther: reg.countryOther,
    website: reg.website,
    affiliation: reg.affiliation,
    affiliationOther: reg.affiliationOther,
    trustName: reg.trustName,
    schoolMobile: reg.schoolMobile,
    landline: reg.landline,
    stdCode: reg.stdCode,
    email: reg.email,
    principalName: reg.principalName,
    principalMobile: reg.principalMobile,
    principalEmail: reg.principalEmail,
    contactName: reg.contactName,
    phone: reg.phone,
    inchargeEmail: reg.inchargeEmail,
    gradeCounts: parseGradeCounts(reg.gradeCounts),
    concessionFeePerStudent: reg.concessionFeePerStudent ?? null,
    rejectionNote: reg.rejectionNote,
    submittedAt: reg.submittedAt,
    olympiadYear: OLYMPIAD_YEAR_META,
    students,
    studentCount: reg.studentCount ?? students.length,
    imoCount,
    isoCount,
    ieoCount,
    olympiadTotal: imoCount + isoCount + ieoCount,
    feeExpected: fee,
    feePerSlot,
    // Rejected schools must re-enter payment — never send old UTR/proof to the school portal
    payment:
      reg.status === RegistrationStatus.REJECTED || !reg.payment
        ? null
        : {
            id: reg.payment.id,
            // Live total = olympiad program slots × fee per slot
            amountExpected: fee,
            paymentMethod: reg.payment.paymentMethod,
            utr: reg.payment.utr,
            proofUrl: reg.payment.proofUrl,
            status: reg.payment.status,
            adminNote: reg.payment.adminNote,
            reviewedAt: reg.payment.reviewedAt,
          },
    locked:
      reg.status !== RegistrationStatus.DRAFT &&
      reg.status !== RegistrationStatus.REJECTED,
  };
}

function serializePayment(payment: {
  id: string;
  amountExpected: unknown;
  paymentMethod: PaymentMethod;
  utr: string;
  proofUrl: string;
  status: PaymentReviewStatus;
  adminNote: string | null;
  reviewedAt: Date | null;
} | null) {
  if (!payment) return null;
  return {
    id: payment.id,
    amountExpected: Number(payment.amountExpected),
    paymentMethod: payment.paymentMethod,
    utr: payment.utr,
    proofUrl: payment.proofUrl,
    status: payment.status,
    adminNote: payment.adminNote,
    reviewedAt: payment.reviewedAt,
  };
}

async function loadRegistration(accountId: string, olympiadYear: string) {
  return prisma.schoolRegistration.findUnique({
    where: {
      schoolAccountId_olympiadYear: {
        schoolAccountId: accountId,
        olympiadYear,
      },
    },
    include: {
      students: { orderBy: [{ grade: "asc" }, { name: "asc" }] },
      payment: true,
    },
  });
}

function normalizePaymentReference(utr: string) {
  return utr.trim().toUpperCase().replace(/\s+/g, "");
}

async function assertPaymentReferenceAvailable(
  utr: string,
  excludeSchoolRegistrationId?: string,
) {
  const normalized = normalizePaymentReference(utr);
  if (normalized.length < 6) return;
  // Skip placeholder used for admin direct approval without a real UTR
  if (normalized === "ADMIN-DIRECT-APPROVAL") return;

  // Only PENDING/VERIFIED block reuse. REJECTED references stay on record for
  // admin history but are free to submit again (same school or another).
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM "RegistrationPayment"
    WHERE status IN (
        'PENDING'::"PaymentReviewStatus",
        'VERIFIED'::"PaymentReviewStatus"
      )
      AND REPLACE(UPPER(TRIM(utr)), ' ', '') = ${normalized}
      ${
        excludeSchoolRegistrationId
          ? Prisma.sql`AND "schoolRegistrationId" <> ${excludeSchoolRegistrationId}`
          : Prisma.empty
      }
    LIMIT 1
  `;

  if (rows.length > 0) {
    throw new AppError("This reference number is already used", 400);
  }
}

function assertEditable(
  status: RegistrationStatus,
  options?: { allowApproved?: boolean },
) {
  if (status === RegistrationStatus.UNDER_REVIEW) {
    throw new AppError("Registration is under review and cannot be edited", 400);
  }
  if (status === RegistrationStatus.APPROVED && !options?.allowApproved) {
    throw new AppError("Registration is approved and cannot be edited", 400);
  }
}

function statusAfterAdminEdit(current: RegistrationStatus) {
  if (current === RegistrationStatus.REJECTED) {
    return RegistrationStatus.REJECTED;
  }
  if (current === RegistrationStatus.APPROVED) {
    return RegistrationStatus.APPROVED;
  }
  return RegistrationStatus.DRAFT;
}

export const schoolRegistrationService = {
  getPaymentInfo() {
    return PAYMENT_DETAILS;
  },

  async getOrCreateDraft(accountId: string) {
    let reg = await loadRegistration(accountId, CURRENT_OLYMPIAD_YEAR);
    if (!reg) {
      const account = await prisma.schoolAccount.findUnique({
        where: { id: accountId },
      });
      const schoolCode = await allocateSchoolCode(
        OLYMPIAD_YEAR_META.code,
        CURRENT_OLYMPIAD_YEAR,
      );
      reg = await prisma.schoolRegistration.create({
        data: {
          schoolAccountId: accountId,
          olympiadYear: CURRENT_OLYMPIAD_YEAR,
          schoolCode,
          email: account?.email || "",
          schoolName: account?.name || "",
          schoolMobile: account?.mobile || "",
        },
        include: {
          students: true,
          payment: true,
        },
      });
    } else if (!reg.schoolCode?.trim()) {
      const schoolCode = await allocateSchoolCode(
        OLYMPIAD_YEAR_META.code,
        CURRENT_OLYMPIAD_YEAR,
      );
      reg = await prisma.schoolRegistration.update({
        where: { id: reg.id },
        data: { schoolCode },
        include: {
          students: { orderBy: [{ grade: "asc" }, { name: "asc" }] },
          payment: true,
        },
      });
    }

    // Keep rejected payment on record for admin; school portal hides it via serializeRegistration
    return serializeRegistration(reg);
  },

  /** Read-only: never creates a draft (portal poll / load). */
  async getMine(accountId: string) {
    const reg = await loadRegistration(accountId, CURRENT_OLYMPIAD_YEAR);
    if (!reg) {
      throw new AppError("No registration for this Olympiad Year", 404);
    }
    if (!reg.schoolCode?.trim()) {
      const schoolCode = await allocateSchoolCode(
        OLYMPIAD_YEAR_META.code,
        CURRENT_OLYMPIAD_YEAR,
      );
      const updated = await prisma.schoolRegistration.update({
        where: { id: reg.id },
        data: { schoolCode },
        include: {
          students: { orderBy: [{ grade: "asc" }, { name: "asc" }] },
          payment: true,
        },
      });
      return serializeRegistration(updated);
    }
    return serializeRegistration(reg);
  },

  async saveStep1(
    accountId: string,
    data: {
      schoolCode?: string;
      schoolName: string;
      address: string;
      city: string;
      district: string;
      state: string;
      pincode: string;
      country: string;
      countryOther?: string;
      website?: string;
      affiliation: string;
      affiliationOther?: string;
      trustName: string;
      schoolMobile: string;
      landline?: string;
      stdCode?: string;
      email: string;
      principalName: string;
      principalMobile: string;
      principalEmail: string;
      contactName: string;
      phone: string;
      inchargeEmail: string;
    },
    options?: { allowApproved?: boolean },
  ) {
    const year = CURRENT_OLYMPIAD_YEAR;
    let reg = await loadRegistration(accountId, year);
    if (!reg) {
      await this.getOrCreateDraft(accountId);
      reg = await loadRegistration(accountId, year);
    }
    if (!reg) throw new AppError("Registration not found", 404);
    assertEditable(reg.status, { allowApproved: options?.allowApproved });

    // School code is system-assigned and unique — never overwrite from client
    let schoolCode = reg.schoolCode?.trim() || "";
    if (!schoolCode) {
      schoolCode = await allocateSchoolCode(
        OLYMPIAD_YEAR_META.code,
        CURRENT_OLYMPIAD_YEAR,
      );
    }

    const updated = await prisma.schoolRegistration.update({
      where: { id: reg.id },
      data: {
        schoolCode,
        schoolName: data.schoolName,
        address: data.address,
        city: data.city,
        district: data.district,
        state: data.state,
        pincode: data.pincode,
        country: data.country,
        countryOther: data.countryOther || "",
        website: data.website || "",
        affiliation: data.affiliation,
        affiliationOther: data.affiliationOther || "",
        trustName: data.trustName,
        schoolMobile: data.schoolMobile,
        landline: data.landline || "",
        stdCode: data.stdCode || "",
        email: data.email,
        principalName: data.principalName,
        principalMobile: data.principalMobile,
        principalEmail: data.principalEmail,
        contactName: data.contactName,
        phone: data.phone,
        inchargeEmail: data.inchargeEmail,
        currentStep: Math.max(reg.currentStep, 2),
        // Keep APPROVED/REJECTED; only drafts reset to DRAFT.
        status: statusAfterAdminEdit(reg.status),
      },
      include: {
        students: { orderBy: [{ grade: "asc" }, { name: "asc" }] },
        payment: true,
      },
    });
    return serializeRegistration(updated);
  },

  async saveStep2(
    accountId: string,
    students: Array<{
      id?: string;
      registrationNumber?: string;
      name: string;
      grade: number;
      section?: string;
      mobile?: string;
      imo: boolean;
      iso: boolean;
      ieo: boolean;
    }>,
    options?: {
      draft?: boolean;
      replaceAll?: boolean;
      finalize?: boolean;
      allowApproved?: boolean;
    },
  ) {
    const year = CURRENT_OLYMPIAD_YEAR;
    const reg = await loadRegistration(accountId, year);
    if (!reg) throw new AppError("Complete school details first", 400);
    assertEditable(reg.status, { allowApproved: options?.allowApproved });
    assertSchoolDetailsComplete(reg);

    const draft = Boolean(options?.draft);
    const replaceAll = options?.replaceAll !== false;
    const finalize = options?.finalize !== false;
    const toSave = students.filter((s) => s.name.trim().length >= 2);

    if (!draft && finalize && replaceAll && toSave.length === 0) {
      throw new AppError("Add at least one student", 400);
    }

    // Single-request full replace, or first estimate before append
    if (replaceAll && finalize && toSave.length > MAX_STUDENTS_PER_REGISTRATION) {
      throw new AppError("Too many students for one registration", 400);
    }
    if (!replaceAll) {
      const existingCount = await prisma.registrationStudent.count({
        where: { schoolRegistrationId: reg.id },
      });
      if (existingCount + toSave.length > MAX_STUDENTS_PER_REGISTRATION) {
        throw new AppError("Too many students for one registration", 400);
      }
    } else if (!finalize && toSave.length > MAX_STUDENTS_PER_REGISTRATION) {
      // First chunk alone should never exceed the cap
      throw new AppError("Too many students for one registration", 400);
    }

    const existingById = new Map(reg.students.map((s) => [s.id, s]));
    const existingByReg = new Map(
      reg.students.map((s) => [s.registrationNumber, s]),
    );
    const existingByIdentity = new Map<string, typeof reg.students>();
    for (const s of reg.students) {
      const key = `${s.name}|${s.grade}|${s.section}`;
      const list = existingByIdentity.get(key);
      if (list) list.push(s);
      else existingByIdentity.set(key, [s]);
    }
    const usedExisting = new Set<string>();

    const resolved: Array<{
      registrationNumber: string | null;
      name: string;
      grade: number;
      section: string;
      mobile: string;
      imo: boolean;
      iso: boolean;
      ieo: boolean;
    }> = toSave.map((s) => {
      const name = s.name.trim().toUpperCase();
      const section = (s.section || "").trim().toUpperCase();
      const mobile = (() => {
        const digits = (s.mobile || "").replace(/\D/g, "");
        if (digits.length === 10) return digits;
        if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
        if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
        return "";
      })();
      let registrationNumber: string | null = null;

      if (s.id && existingById.has(s.id)) {
        registrationNumber = existingById.get(s.id)!.registrationNumber;
      } else if (
        s.registrationNumber &&
        /^\d{8}$/.test(s.registrationNumber)
      ) {
        // Keep client-provided codes across chunked appends (after replace cleared DB)
        registrationNumber = s.registrationNumber;
        if (existingByReg.has(s.registrationNumber)) {
          usedExisting.add(s.registrationNumber);
        }
      } else {
        const key = `${name}|${s.grade}|${section}`;
        const matches = existingByIdentity.get(key);
        if (matches) {
          const match = matches.find(
            (e) => !usedExisting.has(e.registrationNumber),
          );
          if (match) registrationNumber = match.registrationNumber;
        }
      }

      if (registrationNumber) usedExisting.add(registrationNumber);

      return {
        registrationNumber,
        name,
        grade: s.grade,
        section,
        mobile,
        imo: s.imo,
        iso: s.iso,
        ieo: s.ieo,
      };
    });

    const needNew = resolved.filter((s) => !s.registrationNumber).length;
    const freshNumbers =
      needNew > 0 ? await allocateStudentRegistrationNumbers(needNew) : [];
    let freshIdx = 0;
    const withNumbers = resolved.map((s) => ({
      ...s,
      registrationNumber:
        s.registrationNumber || freshNumbers[freshIdx++] || "",
    }));

    if (withNumbers.some((s) => !/^\d{8}$/.test(s.registrationNumber))) {
      throw new AppError("Failed to allocate student registration numbers", 500);
    }

    // Avoid one long interactive transaction (proxy/DB timeouts on large lists).
    // Chunked clients: replaceAll on first request, finalize on last.
    if (replaceAll) {
      await prisma.registrationStudent.deleteMany({
        where: { schoolRegistrationId: reg.id },
      });
    }

    const CREATE_CHUNK = 250;
    for (let i = 0; i < withNumbers.length; i += CREATE_CHUNK) {
      const chunk = withNumbers.slice(i, i + CREATE_CHUNK);
      await prisma.registrationStudent.createMany({
        data: chunk.map((s) => ({
          schoolRegistrationId: reg.id,
          registrationNumber: s.registrationNumber,
          name: s.name,
          grade: s.grade,
          section: s.section,
          mobile: s.mobile,
          imo: s.imo,
          iso: s.iso,
          ieo: s.ieo,
        })),
        skipDuplicates: true,
      });
    }

    if (finalize) {
      const allStudents = await prisma.registrationStudent.findMany({
        where: { schoolRegistrationId: reg.id },
        select: {
          name: true,
          grade: true,
          section: true,
          mobile: true,
          imo: true,
          iso: true,
          ieo: true,
        },
      });
      if (allStudents.length > MAX_STUDENTS_PER_REGISTRATION) {
        throw new AppError("Too many students for one registration", 400);
      }
      if (!draft && allStudents.length === 0) {
        throw new AppError("Add at least one student", 400);
      }
      const feePerSlot =
        typeof reg.concessionFeePerStudent === "number" &&
        reg.concessionFeePerStudent > 0
          ? reg.concessionFeePerStudent
          : PAYMENT_DETAILS.feeAmount;
      const amountExpected = computeRegistrationFee(allStudents, feePerSlot);

      await prisma.schoolRegistration.update({
        where: { id: reg.id },
        data: {
          gradeCounts: gradeCountsFromStudents(allStudents),
          ...olympiadCountsFromStudents(allStudents),
          currentStep: draft
            ? Math.max(reg.currentStep, 2)
            : Math.max(reg.currentStep, 3),
          status: statusAfterAdminEdit(reg.status),
        },
      });

      if (reg.status === RegistrationStatus.APPROVED) {
        await prisma.registrationPayment.updateMany({
          where: { schoolRegistrationId: reg.id },
          data: { amountExpected },
        });
      }
    }

    return serializeRegistration(await loadRegistration(accountId, year));
  },

  async buildStudentTemplate() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Students");
    sheet.columns = [
      { header: "Student Name", key: "name", width: 28 },
      { header: "Grade", key: "grade", width: 10 },
      { header: "Section", key: "section", width: 10 },
      { header: "Mobile", key: "mobile", width: 14 },
      { header: "IMO", key: "imo", width: 10 },
      { header: "ISO", key: "iso", width: 10 },
      { header: "IEO", key: "ieo", width: 10 },
    ];
    sheet.addRow({
      name: "SAI KIRAN BASANI",
      grade: 3,
      section: "A",
      mobile: "8074563902",
      imo: "Yes",
      iso: "Yes",
      ieo: "Yes",
    });
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  },

  async importStudentsFromExcel(buffer: Buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(buffer) as never);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new AppError("Excel file has no sheets", 400);

    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell, col) => {
      headers[col] = String(cell.value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[()]/g, "");
    });

    const findCol = (aliases: string[]) =>
      headers.findIndex((h) => h && aliases.includes(h));

    const nameCol = findCol(["student_name", "name", "student", "name_of_the_student"]);
    const gradeCol = findCol(["grade", "class"]);
    const sectionCol = findCol(["section"]);
    const mobileCol = findCol([
      "whatsapp/mobile",
      "whatsapp_mobile",
      "mobile",
      "whatsapp",
      "phone",
    ]);
    const imoCol = findCol(["imo", "maths_imo", "maths"]);
    const isoCol = findCol(["iso", "science_iso", "science"]);
    const ieoCol = findCol(["ieo", "english_ieo", "english"]);

    if (nameCol < 0 || gradeCol < 0) {
      throw new AppError(
        "Excel file was read, but Student Name and Grade columns were not found. Download the Excel template, fill it, and import that file.",
        400,
      );
    }

    const truthy = (v: unknown) => {
      const s = String(v ?? "")
        .trim()
        .toLowerCase();
      return ["yes", "y", "true", "1", "imo", "iso", "ieo", "✓", "✔"].includes(s);
    };

    const students: Array<{
      name: string;
      grade: number;
      section: string;
      mobile: string;
      imo: boolean;
      iso: boolean;
      ieo: boolean;
      importWarning?: string;
    }> = [];
    const errors: string[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const name = String(row.getCell(nameCol).value ?? "")
        .trim()
        .toUpperCase();
      const gradeRaw = row.getCell(gradeCol).value;
      const grade = Number(gradeRaw);
      if (
        !name &&
        (gradeRaw === null || gradeRaw === undefined || gradeRaw === "")
      ) {
        return;
      }

      const section =
        sectionCol > 0
          ? String(row.getCell(sectionCol).value ?? "")
              .trim()
              .toUpperCase()
          : "";
      const mobile =
        mobileCol > 0
          ? String(row.getCell(mobileCol).value ?? "").replace(/\D/g, "")
          : "";
      const mobileOk =
        mobile.length === 10
          ? mobile
          : mobile.length === 12 && mobile.startsWith("91")
            ? mobile.slice(2)
            : mobile.length === 11 && mobile.startsWith("0")
              ? mobile.slice(1)
              : "";
      const imo = imoCol > 0 ? truthy(row.getCell(imoCol).value) : false;
      const iso = isoCol > 0 ? truthy(row.getCell(isoCol).value) : false;
      const ieo = ieoCol > 0 ? truthy(row.getCell(ieoCol).value) : false;

      const gradeOk = Number.isInteger(grade) && grade >= 3 && grade <= 10;
      const nameOk = name.length >= 2;
      const olympiadOk = imo || iso || ieo;

      if (!nameOk || !gradeOk) {
        const warning = `Row ${rowNumber}: invalid name or grade — fix and save`;
        errors.push(warning);
        students.push({
          name: nameOk ? name : "",
          grade: gradeOk ? grade : 3,
          section,
          mobile: mobileOk,
          imo,
          iso,
          ieo,
          importWarning: warning,
        });
        return;
      }
      if (!olympiadOk) {
        const warning = `Row ${rowNumber}: select at least one olympiad — fix and save`;
        errors.push(warning);
        students.push({
          name,
          grade,
          section,
          mobile: mobileOk,
          imo: false,
          iso: false,
          ieo: false,
          importWarning: warning,
        });
        return;
      }

      students.push({
        name,
        grade,
        section,
        mobile: mobileOk,
        imo,
        iso,
        ieo,
      });
    });

    if (students.length === 0) {
      throw new AppError(
        errors[0] || "No valid student rows found in Excel",
        400,
      );
    }
    if (students.length > MAX_STUDENTS_PER_REGISTRATION) {
      throw new AppError("Too many students to import at once", 400);
    }

    return { students, errors };
  },

  async uploadProof(file: Express.Multer.File) {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];
    if (!allowed.includes(file.mimetype)) {
      throw new AppError("Proof must be JPG, PNG, WEBP, or PDF", 400);
    }
    if (file.size > 8 * 1024 * 1024) {
      throw new AppError("Proof file must be under 8 MB", 400);
    }
    return uploadPaymentProof(file.buffer, file.originalname, file.mimetype);
  },

  async saveStep3(
    accountId: string,
    data: {
      paymentMethod: PaymentMethod;
      utr: string;
      proofUrl: string;
      proofPublicId?: string;
      concessionFeePerStudent?: number | null;
    },
  ) {
    const year = CURRENT_OLYMPIAD_YEAR;
    const reg = await loadRegistration(accountId, year);
    if (!reg) throw new AppError("Registration not found", 404);
    assertEditable(reg.status);
    assertSchoolDetailsComplete(reg);
    if (reg.students.length === 0) {
      throw new AppError(
        "Students are incomplete. Add students before submitting for verification.",
        400,
      );
    }
    const studentIncomplete = reg.students.some(
      (s) =>
        !s.name?.trim() ||
        s.grade < 3 ||
        s.grade > 10 ||
        (!s.imo && !s.iso && !s.ieo),
    );
    if (studentIncomplete) {
      throw new AppError(
        "Students are incomplete. Each student needs a grade and at least one olympiad before submitting for verification.",
        400,
      );
    }

    await assertPaymentReferenceAvailable(data.utr, reg.id);

    const concession =
      typeof data.concessionFeePerStudent === "number"
        ? data.concessionFeePerStudent
        : null;
    const feePerSlot = concession ?? PAYMENT_DETAILS.feeAmount;
    const amountExpected = computeRegistrationFee(reg.students, feePerSlot);

    await prisma.$transaction(async (tx) => {
      await tx.registrationPayment.upsert({
        where: { schoolRegistrationId: reg.id },
        create: {
          schoolRegistrationId: reg.id,
          amountExpected,
          paymentMethod: data.paymentMethod,
          utr: data.utr.trim(),
          proofUrl: data.proofUrl,
          proofPublicId: data.proofPublicId || null,
          status: PaymentReviewStatus.PENDING,
        },
        update: {
          amountExpected,
          paymentMethod: data.paymentMethod,
          utr: data.utr.trim(),
          proofUrl: data.proofUrl,
          proofPublicId: data.proofPublicId || null,
          status: PaymentReviewStatus.PENDING,
          reviewedAt: null,
          reviewedByAdminId: null,
          adminNote: null,
        },
      });
      await tx.schoolRegistration.update({
        where: { id: reg.id },
        data: {
          currentStep: 3,
          status: RegistrationStatus.UNDER_REVIEW,
          submittedAt: new Date(),
          rejectionNote: null,
          concessionFeePerStudent: concession,
        },
      });
    });

    const account = await prisma.schoolAccount.findUnique({
      where: { id: accountId },
      select: { email: true, name: true },
    });
    if (account?.email) {
      void sendRegistrationSubmittedEmail({
        to: account.email,
        schoolName: reg.schoolName || account.name || "School",
        schoolCode: reg.schoolCode || undefined,
        studentCount: reg.studentCount || reg.students.length,
        amountExpected,
      }).catch((err) => {
        console.warn(
          "[mail] submit notify failed",
          err instanceof Error ? err.message : err,
        );
      });
    }

    return serializeRegistration(await loadRegistration(accountId, year));
  },

  async checkPaymentReference(
    accountId: string,
    utr: string,
  ): Promise<{ available: boolean; message?: string }> {
    const year = CURRENT_OLYMPIAD_YEAR;
    const reg = await loadRegistration(accountId, year);
    try {
      await assertPaymentReferenceAvailable(utr, reg?.id);
      return { available: true };
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 400) {
        return { available: false, message: err.message };
      }
      throw err;
    }
  },

  async adminList(input: {
    status?: RegistrationStatus;
    page?: number;
    limit?: number;
  }) {
    const page = input.page ?? 1;
    const limit = input.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = input.status
      ? { status: input.status }
      : { status: { not: RegistrationStatus.DRAFT } };
    const scopedWhere = {
      ...where,
      olympiadYear: CURRENT_OLYMPIAD_YEAR,
    };
    const select = {
      id: true,
      schoolCode: true,
      schoolName: true,
      city: true,
      state: true,
      status: true,
      submittedAt: true,
      updatedAt: true,
      studentCount: true,
      imoCount: true,
      isoCount: true,
      ieoCount: true,
      concessionFeePerStudent: true,
      schoolAccount: { select: { id: true, email: true, password: true, name: true } },
      olympiadYear: true,
      payment: {
        select: {
          id: true,
          status: true,
          paymentMethod: true,
          utr: true,
          amountExpected: true,
          proofUrl: true,
          adminNote: true,
          reviewedAt: true,
        },
      },
    } satisfies Prisma.SchoolRegistrationSelect;

    const [total, rows] = await Promise.all([
      prisma.schoolRegistration.count({ where: scopedWhere }),
      prisma.schoolRegistration.findMany({
        where: scopedWhere,
        orderBy: [{ submittedAt: "desc" }, { updatedAt: "desc" }],
        skip,
        take: limit,
        select,
      }),
    ]);

    return {
      registrations: rows.map((row) => {
        const olympiadTotal = row.imoCount + row.isoCount + row.ieoCount;
        const feePerSlot =
          typeof row.concessionFeePerStudent === "number" &&
          row.concessionFeePerStudent > 0
            ? row.concessionFeePerStudent
            : PAYMENT_DETAILS.feeAmount;
        const amountExpected = olympiadTotal * feePerSlot;
        return {
          ...row,
          olympiadYear: OLYMPIAD_YEAR_META,
          olympiadTotal,
          payment: row.payment
            ? {
                ...row.payment,
                amountExpected,
              }
            : null,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  },

  async adminExportList(status?: RegistrationStatus) {
    const where = status
      ? { status }
      : { status: { not: RegistrationStatus.DRAFT } };
    const rows = await prisma.schoolRegistration.findMany({
      where: {
        ...where,
        olympiadYear: CURRENT_OLYMPIAD_YEAR,
      },
      orderBy: [{ submittedAt: "desc" }, { updatedAt: "desc" }],
      take: 10_000,
      select: {
        schoolCode: true,
        schoolName: true,
        city: true,
        state: true,
        status: true,
        submittedAt: true,
        studentCount: true,
        imoCount: true,
        isoCount: true,
        ieoCount: true,
        schoolAccount: { select: { email: true } },
        payment: {
          select: {
            paymentMethod: true,
            utr: true,
            amountExpected: true,
          },
        },
      },
    });

    return rows.map((row) => ({
      schoolCode: row.schoolCode,
      schoolName: row.schoolName,
      city: row.city,
      state: row.state,
      status: row.status,
      studentCount: row.studentCount,
      imoCount: row.imoCount,
      isoCount: row.isoCount,
      ieoCount: row.ieoCount,
      olympiadTotal: row.imoCount + row.isoCount + row.ieoCount,
      email: row.schoolAccount.email,
      paymentMethod: row.payment?.paymentMethod || "",
      utr: row.payment?.utr || "",
      amountExpected: Number(row.payment?.amountExpected || 0),
      submittedAt: row.submittedAt?.toISOString() || null,
    }));
  },

  buildAdminStudentWhere(input: {
    q?: string;
    schoolCode?: string;
    grade?: number;
    olympiad?: "IMO" | "ISO" | "IEO";
    olympiadYear?: string;
    status?: RegistrationStatus;
  }): Prisma.RegistrationStudentWhereInput {
    const registrationWhere: Prisma.SchoolRegistrationWhereInput = {
      status: input.status ?? RegistrationStatus.APPROVED,
      olympiadYear: CURRENT_OLYMPIAD_YEAR,
    };

    if (input.schoolCode?.trim()) {
      registrationWhere.schoolCode = input.schoolCode.trim();
    }

    const studentWhere: Prisma.RegistrationStudentWhereInput = {
      name: { not: "" },
      schoolRegistration: registrationWhere,
    };

    if (input.grade != null) {
      studentWhere.grade = input.grade;
    }

    if (input.olympiad === "IMO") studentWhere.imo = true;
    if (input.olympiad === "ISO") studentWhere.iso = true;
    if (input.olympiad === "IEO") studentWhere.ieo = true;

    if (input.q?.trim()) {
      const q = input.q.trim();
      studentWhere.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { registrationNumber: { contains: q, mode: "insensitive" } },
        {
          schoolRegistration: {
            schoolName: { contains: q, mode: "insensitive" },
          },
        },
        {
          schoolRegistration: {
            schoolCode: { contains: q, mode: "insensitive" },
          },
        },
      ];
    }

    return studentWhere;
  },

  mapAdminStudentRow(
    s: {
      id: string;
      registrationNumber: string;
      name: string;
      grade: number;
      section: string;
      mobile: string;
      imo: boolean;
      iso: boolean;
      ieo: boolean;
      schoolRegistration: {
        id: string;
        schoolCode: string;
        schoolName: string;
        city: string;
        state: string;
        status: RegistrationStatus;
        olympiadYear: string;
      };
    },
  ) {
    return {
      id: s.id,
      registrationNumber: s.registrationNumber,
      name: s.name,
      grade: s.grade,
      section: s.section,
      mobile: s.mobile,
      imo: s.imo,
      iso: s.iso,
      ieo: s.ieo,
      schoolCode: s.schoolRegistration.schoolCode,
      schoolName: s.schoolRegistration.schoolName,
      city: s.schoolRegistration.city,
      state: s.schoolRegistration.state,
      status: s.schoolRegistration.status,
      registrationId: s.schoolRegistration.id,
      olympiadYear: OLYMPIAD_YEAR_META,
    };
  },

  async adminListStudents(input: {
    q?: string;
    schoolCode?: string;
    grade?: number;
    olympiad?: "IMO" | "ISO" | "IEO";
    olympiadYear?: string;
    status?: RegistrationStatus;
    page: number;
    limit: number;
  }) {
    const studentWhere = this.buildAdminStudentWhere(input);

    const [total, rows, schoolRows, olympiadSums] = await Promise.all([
      prisma.registrationStudent.count({ where: studentWhere }),
      prisma.registrationStudent.findMany({
        where: studentWhere,
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        include: {
          schoolRegistration: {
            select: {
              id: true,
              schoolCode: true,
              schoolName: true,
              city: true,
              state: true,
              status: true,
              olympiadYear: true,
            },
          },
        },
      }),
      prisma.schoolRegistration.findMany({
        where: {
          status: RegistrationStatus.APPROVED,
          schoolCode: { not: "" },
          schoolName: { not: "" },
          olympiadYear: CURRENT_OLYMPIAD_YEAR,
        },
        distinct: ["schoolCode"],
        orderBy: { schoolName: "asc" },
        select: {
          schoolCode: true,
          schoolName: true,
        },
      }),
      prisma.schoolRegistration.aggregate({
        where: {
          status: RegistrationStatus.APPROVED,
          olympiadYear: CURRENT_OLYMPIAD_YEAR,
        },
        _sum: {
          imoCount: true,
          isoCount: true,
          ieoCount: true,
        },
        _count: { _all: true },
      }),
    ]);

    const students = rows.map((s) => this.mapAdminStudentRow(s));
    const imo = olympiadSums._sum.imoCount ?? 0;
    const iso = olympiadSums._sum.isoCount ?? 0;
    const ieo = olympiadSums._sum.ieoCount ?? 0;

    return {
      students,
      filters: {
        schools: schoolRows.map((s) => ({
          schoolCode: s.schoolCode,
          schoolName: s.schoolName,
        })),
        years: listOlympiadYears(),
      },
      totals: {
        schools: olympiadSums._count._all,
        imo,
        ieo,
        iso,
        total: imo + ieo + iso,
      },
      pagination: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / input.limit)),
      },
    };
  },

  async adminUpdateStudent(
    studentId: string,
    input: {
      name: string;
      grade: number;
      section?: string;
      mobile?: string;
      imo: boolean;
      iso: boolean;
      ieo: boolean;
    },
  ) {
    const existing = await prisma.registrationStudent.findUnique({
      where: { id: studentId },
      include: {
        schoolRegistration: {
          select: {
            id: true,
            schoolCode: true,
            schoolName: true,
            city: true,
            state: true,
            status: true,
            olympiadYear: true,
            concessionFeePerStudent: true,
          },
        },
      },
    });

    if (!existing) throw new AppError("Student not found", 404);
    if (existing.schoolRegistration.olympiadYear !== CURRENT_OLYMPIAD_YEAR) {
      throw new AppError("Student is outside the active Olympiad Year", 400);
    }
    if (existing.schoolRegistration.status !== RegistrationStatus.APPROVED) {
      throw new AppError(
        "Only approved registration students can be edited here",
        400,
      );
    }

    const name = input.name.trim().toUpperCase();
    const section = (input.section || "").trim().toUpperCase();
    const mobile = (() => {
      const digits = (input.mobile || "").replace(/\D/g, "");
      if (digits.length === 10) return digits;
      if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
      if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
      return "";
    })();

    if (name.length < 2) {
      throw new AppError("Student name is required", 400);
    }
    if (!input.imo && !input.iso && !input.ieo) {
      throw new AppError(
        "Select at least one olympiad (Maths / Science / English)",
        400,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.registrationStudent.update({
        where: { id: existing.id },
        data: {
          name,
          grade: input.grade,
          section,
          mobile,
          imo: input.imo,
          iso: input.iso,
          ieo: input.ieo,
        },
      });

      const allStudents = await tx.registrationStudent.findMany({
        where: { schoolRegistrationId: existing.schoolRegistrationId },
        select: {
          name: true,
          grade: true,
          section: true,
          mobile: true,
          imo: true,
          iso: true,
          ieo: true,
        },
      });

      const counts = olympiadCountsFromStudents(allStudents);
      const feePerSlot =
        typeof existing.schoolRegistration.concessionFeePerStudent ===
          "number" &&
        existing.schoolRegistration.concessionFeePerStudent > 0
          ? existing.schoolRegistration.concessionFeePerStudent
          : PAYMENT_DETAILS.feeAmount;
      const amountExpected = computeRegistrationFee(allStudents, feePerSlot);

      await tx.schoolRegistration.update({
        where: { id: existing.schoolRegistrationId },
        data: {
          gradeCounts: gradeCountsFromStudents(allStudents),
          ...counts,
        },
      });

      // Keep payment total in sync with current olympiad program slots.
      await tx.registrationPayment.updateMany({
        where: { schoolRegistrationId: existing.schoolRegistrationId },
        data: { amountExpected },
      });

      // Keep results Student demographics in sync when present for this year.
      await tx.student.updateMany({
        where: {
          registrationNumber: existing.registrationNumber,
          olympiadYear: CURRENT_OLYMPIAD_YEAR,
        },
        data: { name, grade: input.grade },
      });
    });

    const updated = await prisma.registrationStudent.findUniqueOrThrow({
      where: { id: existing.id },
      include: {
        schoolRegistration: {
          select: {
            id: true,
            schoolCode: true,
            schoolName: true,
            city: true,
            state: true,
            status: true,
            olympiadYear: true,
          },
        },
      },
    });

    return this.mapAdminStudentRow(updated);
  },

  /**
   * Append students to an approved school registration.
   * Existing students are never deleted. Exact name+grade+section matches are skipped.
   */
  async adminAppendStudents(
    schoolCode: string,
    students: Array<{
      name: string;
      grade: number;
      section?: string;
      mobile?: string;
      imo: boolean;
      iso: boolean;
      ieo: boolean;
    }>,
  ) {
    const code = schoolCode.trim();
    if (!code) throw new AppError("School code is required", 400);

    const reg = await prisma.schoolRegistration.findFirst({
      where: {
        schoolCode: code,
        olympiadYear: CURRENT_OLYMPIAD_YEAR,
        status: RegistrationStatus.APPROVED,
      },
      select: {
        id: true,
        schoolCode: true,
        schoolName: true,
        city: true,
        state: true,
        status: true,
        olympiadYear: true,
        concessionFeePerStudent: true,
        students: {
          select: {
            registrationNumber: true,
            name: true,
            grade: true,
            section: true,
          },
        },
      },
    });

    if (!reg) {
      throw new AppError(
        "Approved school registration not found for this school code",
        404,
      );
    }

    const existingKeys = new Set(
      reg.students.map(
        (s) =>
          `${s.name.trim().toUpperCase()}|${s.grade}|${(s.section || "").trim().toUpperCase()}`,
      ),
    );

    const prepared: Array<{
      name: string;
      grade: number;
      section: string;
      mobile: string;
      imo: boolean;
      iso: boolean;
      ieo: boolean;
    }> = [];
    let skipped = 0;
    const skipNotes: string[] = [];

    for (const raw of students) {
      const name = raw.name.trim().toUpperCase();
      const section = (raw.section || "").trim().toUpperCase();
      const grade = raw.grade;
      if (name.length < 2 || !Number.isInteger(grade) || grade < 3 || grade > 10) {
        continue;
      }
      if (!raw.imo && !raw.iso && !raw.ieo) {
        continue;
      }
      const key = `${name}|${grade}|${section}`;
      if (existingKeys.has(key)) {
        skipped += 1;
        skipNotes.push(`${name} · Grade ${grade}${section ? `-${section}` : ""}`);
        continue;
      }
      existingKeys.add(key);

      const digits = (raw.mobile || "").replace(/\D/g, "");
      const mobile =
        digits.length === 10
          ? digits
          : digits.length === 12 && digits.startsWith("91")
            ? digits.slice(2)
            : digits.length === 11 && digits.startsWith("0")
              ? digits.slice(1)
              : "";

      prepared.push({
        name,
        grade,
        section,
        mobile,
        imo: raw.imo,
        iso: raw.iso,
        ieo: raw.ieo,
      });
    }

    if (prepared.length === 0 && skipped === 0) {
      throw new AppError("No valid students to add", 400);
    }

    if (reg.students.length + prepared.length > MAX_STUDENTS_PER_REGISTRATION) {
      throw new AppError("Too many students for one registration", 400);
    }

    const freshNumbers =
      prepared.length > 0
        ? await allocateStudentRegistrationNumbers(prepared.length)
        : [];

    if (prepared.some((_, i) => !/^\d{8}$/.test(freshNumbers[i] || ""))) {
      throw new AppError("Failed to allocate student registration numbers", 500);
    }

    let addedRows: Array<{
      id: string;
      registrationNumber: string;
      name: string;
      grade: number;
      section: string;
      mobile: string;
      imo: boolean;
      iso: boolean;
      ieo: boolean;
      schoolRegistration: {
        id: string;
        schoolCode: string;
        schoolName: string;
        city: string;
        state: string;
        status: RegistrationStatus;
        olympiadYear: string;
      };
    }> = [];

    if (prepared.length > 0) {
      // Stagger createdAt so Excel row order is preserved with createdAt DESC
      // (row 1 = newest → shows first; row N = oldest in this batch).
      const batchBaseMs = Date.now();
      await prisma.$transaction(async (tx) => {
        await tx.registrationStudent.createMany({
          data: prepared.map((s, i) => ({
            schoolRegistrationId: reg.id,
            registrationNumber: freshNumbers[i]!,
            name: s.name,
            grade: s.grade,
            section: s.section,
            mobile: s.mobile,
            imo: s.imo,
            iso: s.iso,
            ieo: s.ieo,
            createdAt: new Date(batchBaseMs + (prepared.length - i)),
          })),
        });

        const allStudents = await tx.registrationStudent.findMany({
          where: { schoolRegistrationId: reg.id },
          select: {
            name: true,
            grade: true,
            section: true,
            mobile: true,
            imo: true,
            iso: true,
            ieo: true,
          },
        });

        const feePerSlot =
          typeof reg.concessionFeePerStudent === "number" &&
          reg.concessionFeePerStudent > 0
            ? reg.concessionFeePerStudent
            : PAYMENT_DETAILS.feeAmount;

        await tx.schoolRegistration.update({
          where: { id: reg.id },
          data: {
            gradeCounts: gradeCountsFromStudents(allStudents),
            ...olympiadCountsFromStudents(allStudents),
          },
        });

        await tx.registrationPayment.updateMany({
          where: { schoolRegistrationId: reg.id },
          data: {
            amountExpected: computeRegistrationFee(allStudents, feePerSlot),
          },
        });
      });

      addedRows = await prisma.registrationStudent.findMany({
        where: {
          schoolRegistrationId: reg.id,
          registrationNumber: { in: freshNumbers },
        },
        include: {
          schoolRegistration: {
            select: {
              id: true,
              schoolCode: true,
              schoolName: true,
              city: true,
              state: true,
              status: true,
              olympiadYear: true,
            },
          },
        },
      });
    }

    return {
      schoolCode: reg.schoolCode,
      schoolName: reg.schoolName,
      added: addedRows.length,
      skipped,
      skipNotes: skipNotes.slice(0, 20),
      students: addedRows.map((s) => this.mapAdminStudentRow(s)),
    };
  },

  async adminAddStudent(input: {
    schoolCode: string;
    name: string;
    grade: number;
    section?: string;
    mobile?: string;
    imo: boolean;
    iso: boolean;
    ieo: boolean;
  }) {
    const result = await this.adminAppendStudents(input.schoolCode, [input]);
    if (result.added === 0) {
      throw new AppError(
        "This student already exists for the school (same name, grade, and section). Edit the existing record instead.",
        409,
      );
    }
    return result.students[0];
  },

  async adminImportAndAppendStudents(schoolCode: string, buffer: Buffer) {
    const parsed = await this.importStudentsFromExcel(buffer);
    const valid = parsed.students.filter(
      (s) =>
        !s.importWarning &&
        s.name.trim().length >= 2 &&
        Number.isInteger(s.grade) &&
        s.grade >= 3 &&
        s.grade <= 10 &&
        (s.imo || s.iso || s.ieo),
    );
    if (valid.length === 0) {
      throw new AppError(
        parsed.errors[0] ||
          "No valid student rows found in Excel. Fix warnings and try again.",
        400,
      );
    }
    const result = await this.adminAppendStudents(schoolCode, valid);
    return {
      ...result,
      parsed: parsed.students.length,
      parseErrors: parsed.errors.slice(0, 30),
    };
  },

  async adminExportStudents(
    input: {
      q?: string;
      schoolCode?: string;
      grade?: number;
      olympiad?: "IMO" | "ISO" | "IEO";
      olympiadYear?: string;
      status?: RegistrationStatus;
    },
  ) {
    // Unfiltered 7-lakh exports cannot be built in memory. Require a school
    // and/or olympiad (+ preferably grade) so each download stays bounded.
    if (!input.schoolCode?.trim() && !input.olympiad) {
      throw new AppError(
        "Select a school and/or olympiad before exporting. Full-year exports of all students are not supported.",
        400,
      );
    }

    const studentWhere = this.buildAdminStudentWhere(input);

    const total = await prisma.registrationStudent.count({ where: studentWhere });
    const EXPORT_MAX = 25_000;
    if (total > EXPORT_MAX) {
      throw new AppError(
        `Export too large (${total.toLocaleString("en-IN")} rows). Narrow by school, grade, or olympiad (max ${EXPORT_MAX.toLocaleString("en-IN")}).`,
        400,
      );
    }

    const rows = await prisma.registrationStudent.findMany({
      where: studentWhere,
      orderBy: [
        { grade: "asc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
      take: EXPORT_MAX,
      include: {
        schoolRegistration: {
          select: {
            id: true,
            schoolCode: true,
            schoolName: true,
            city: true,
            state: true,
            status: true,
            olympiadYear: true,
          },
        },
      },
    });
    return rows.map((s) => this.mapAdminStudentRow(s));
  },

  async adminGet(id: string) {
    const reg = await prisma.schoolRegistration.findUnique({
      where: { id },
      include: {
        schoolAccount: { select: { id: true, email: true, password: true, name: true } },
        payment: true,
      },
    });
    if (!reg) throw new AppError("Registration not found", 404);
    const serialized = serializeRegistration({
      ...reg,
      students: [],
    });
    const liveAmount = serialized?.feeExpected ?? 0;
    const payment = serializePayment(reg.payment);
    return {
      ...serialized,
      // Admin always sees the submitted payment, including after reject.
      // Amount is live: current olympiad entries × fee per slot.
      payment: payment ? { ...payment, amountExpected: liveAmount } : null,
      schoolAccount: reg.schoolAccount,
    };
  },

  async adminVerify(
    id: string,
    adminId: string,
    action: "approve" | "reject",
    adminNote?: string,
  ) {
    const reg = await prisma.schoolRegistration.findUnique({
      where: { id },
      include: {
        payment: true,
        schoolAccount: { select: { email: true, name: true } },
      },
    });
    if (!reg) throw new AppError("Registration not found", 404);
    if (!reg.payment) {
      throw new AppError("No payment submitted for this registration", 400);
    }
    if (reg.status !== RegistrationStatus.UNDER_REVIEW) {
      throw new AppError("Only submissions under review can be verified", 400);
    }

    const approved = action === "approve";
    const note = adminNote?.trim() || null;
    if (!approved && (!note || note.length < 3)) {
      throw new AppError("Rejection reason is required", 400);
    }

    await prisma.$transaction(async (tx) => {
      if (approved) {
        await tx.registrationPayment.update({
          where: { id: reg.payment!.id },
          data: {
            status: PaymentReviewStatus.VERIFIED,
            reviewedByAdminId: adminId,
            reviewedAt: new Date(),
            adminNote: note,
          },
        });
        await tx.schoolRegistration.update({
          where: { id: reg.id },
          data: {
            status: RegistrationStatus.APPROVED,
            rejectionNote: null,
          },
        });
        return;
      }

      // Keep UTR + proof for admin history; school portal still hides them until resubmit
      await tx.registrationPayment.update({
        where: { id: reg.payment!.id },
        data: {
          status: PaymentReviewStatus.REJECTED,
          reviewedByAdminId: adminId,
          reviewedAt: new Date(),
          adminNote: note,
        },
      });
      await tx.schoolRegistration.update({
        where: { id: reg.id },
        data: {
          status: RegistrationStatus.REJECTED,
          rejectionNote: note,
          currentStep: 3,
        },
      });
    });

    if (reg.schoolAccount.email) {
      const schoolName =
        reg.schoolName || reg.schoolAccount.name || "School";
      if (approved) {
        void sendRegistrationApprovedEmail({
          to: reg.schoolAccount.email,
          schoolName,
          schoolCode: reg.schoolCode || undefined,
        }).catch((err) => {
          console.warn(
            "[mail] approve notify failed",
            err instanceof Error ? err.message : err,
          );
        });
      } else {
        void sendRegistrationRejectedEmail({
          to: reg.schoolAccount.email,
          schoolName,
          schoolCode: reg.schoolCode || undefined,
          reason: note,
        }).catch((err) => {
          console.warn(
            "[mail] reject notify failed",
            err instanceof Error ? err.message : err,
          );
        });
      }
    }

    return this.adminGet(id);
  },

  /**
   * Admin completes payment for a school registration (offline / assisted).
   * Optionally approves immediately.
   */
  async adminSubmitRegistration(
    accountId: string,
    adminId: string,
    data: {
      paymentMethod?: PaymentMethod;
      utr: string;
      proofUrl?: string;
      proofPublicId?: string;
      concessionFeePerStudent?: number | null;
      approve?: boolean;
      adminNote?: string;
    },
  ) {
    const year = CURRENT_OLYMPIAD_YEAR;
    const reg = await loadRegistration(accountId, year);
    if (!reg) throw new AppError("Registration not found", 404);
    assertEditable(reg.status);
    assertSchoolDetailsComplete(reg);
    if (reg.students.length === 0) {
      throw new AppError(
        "Students are incomplete. Add students before submitting for verification.",
        400,
      );
    }
    const studentIncomplete = reg.students.some(
      (s) =>
        !s.name?.trim() ||
        s.grade < 3 ||
        s.grade > 10 ||
        (!s.imo && !s.iso && !s.ieo),
    );
    if (studentIncomplete) {
      throw new AppError(
        "Students are incomplete. Each student needs a grade and at least one olympiad before submitting for verification.",
        400,
      );
    }

    const concession =
      typeof data.concessionFeePerStudent === "number"
        ? data.concessionFeePerStudent
        : null;
    const feePerSlot = concession ?? PAYMENT_DETAILS.feeAmount;
    const amountExpected = computeRegistrationFee(reg.students, feePerSlot);
    const approve = data.approve !== false;
    const paymentMethod = data.paymentMethod || "UPI";
    const utr =
      data.utr.trim() ||
      (approve ? "ADMIN-DIRECT-APPROVAL" : "");
    if (!approve && utr.length < 6) {
      throw new AppError("Enter payment reference number", 400);
    }
    if (data.utr.trim()) {
      await assertPaymentReferenceAvailable(data.utr, reg.id);
    }
    const proofUrl =
      data.proofUrl?.trim() ||
      "https://i-cape.local/admin-offline-payment-proof";
    const note =
      data.adminNote?.trim() ||
      (approve
        ? concession
          ? `Admin direct registration (concession ₹${concession}/Olympiad)`
          : "Admin direct registration"
        : data.proofUrl
          ? null
          : "Registered by admin (offline payment)");

    await prisma.$transaction(async (tx) => {
      await tx.registrationPayment.upsert({
        where: { schoolRegistrationId: reg.id },
        create: {
          schoolRegistrationId: reg.id,
          amountExpected,
          paymentMethod,
          utr,
          proofUrl,
          proofPublicId: data.proofPublicId || null,
          status: approve
            ? PaymentReviewStatus.VERIFIED
            : PaymentReviewStatus.PENDING,
          reviewedByAdminId: approve ? adminId : null,
          reviewedAt: approve ? new Date() : null,
          adminNote: note,
        },
        update: {
          amountExpected,
          paymentMethod,
          utr,
          proofUrl,
          proofPublicId: data.proofPublicId || null,
          status: approve
            ? PaymentReviewStatus.VERIFIED
            : PaymentReviewStatus.PENDING,
          reviewedByAdminId: approve ? adminId : null,
          reviewedAt: approve ? new Date() : null,
          adminNote: note,
        },
      });
      await tx.schoolRegistration.update({
        where: { id: reg.id },
        data: {
          currentStep: 3,
          status: approve
            ? RegistrationStatus.APPROVED
            : RegistrationStatus.UNDER_REVIEW,
          submittedAt: new Date(),
          rejectionNote: null,
          concessionFeePerStudent: concession,
        },
      });
    });

    const account = await prisma.schoolAccount.findUnique({
      where: { id: accountId },
      select: { email: true, name: true },
    });
    if (account?.email) {
      const schoolName = reg.schoolName || account.name || "School";
      if (approve) {
        void sendRegistrationApprovedEmail({
          to: account.email,
          schoolName,
          schoolCode: reg.schoolCode || undefined,
        }).catch((err) => {
          console.warn(
            "[mail] admin approve notify failed",
            err instanceof Error ? err.message : err,
          );
        });
      } else {
        void sendRegistrationSubmittedEmail({
          to: account.email,
          schoolName,
          schoolCode: reg.schoolCode || undefined,
          studentCount: reg.studentCount || reg.students.length,
          amountExpected,
        }).catch((err) => {
          console.warn(
            "[mail] admin submit notify failed",
            err instanceof Error ? err.message : err,
          );
        });
      }
    }

    return serializeRegistration(await loadRegistration(accountId, year));
  },

  async getApprovedRegistration(accountId: string) {
    const year = CURRENT_OLYMPIAD_YEAR;
    const reg = await loadRegistration(accountId, year);
    if (!reg) throw new AppError("Registration not found", 404);
    if (reg.status !== RegistrationStatus.APPROVED) {
      throw new AppError(
        "Student list is available after your registration is approved",
        403,
      );
    }
    return reg;
  },

  filterSchoolStudents(
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
    }>,
    input: { olympiad?: "IMO" | "ISO" | "IEO"; grade?: number },
  ) {
    return students
      .filter((s) => s.name.trim())
      .filter((s) => (input.grade != null ? s.grade === input.grade : true))
      .filter((s) => {
        if (input.olympiad === "IMO") return s.imo;
        if (input.olympiad === "ISO") return s.iso;
        if (input.olympiad === "IEO") return s.ieo;
        return true;
      })
      .sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
  },

  async schoolListStudents(
    accountId: string,
    input: {
      olympiad?: "IMO" | "ISO" | "IEO";
      grade?: number;
      page: number;
      limit: number;
    },
  ) {
    const reg = await prisma.schoolRegistration.findUnique({
      where: {
        schoolAccountId_olympiadYear: {
          schoolAccountId: accountId,
          olympiadYear: CURRENT_OLYMPIAD_YEAR,
        },
      },
      select: {
        id: true,
        schoolCode: true,
        schoolName: true,
        city: true,
        state: true,
        status: true,
        studentCount: true,
        imoCount: true,
        isoCount: true,
        ieoCount: true,
      },
    });
    if (!reg) throw new AppError("Registration not found", 404);
    if (reg.status !== RegistrationStatus.APPROVED) {
      throw new AppError(
        "Student list is available after your registration is approved",
        403,
      );
    }

    const where: Prisma.RegistrationStudentWhereInput = {
      schoolRegistrationId: reg.id,
      name: { not: "" },
      ...(input.grade != null ? { grade: input.grade } : {}),
      ...(input.olympiad === "IMO" ? { imo: true } : {}),
      ...(input.olympiad === "ISO" ? { iso: true } : {}),
      ...(input.olympiad === "IEO" ? { ieo: true } : {}),
    };

    const unfiltered =
      input.grade == null && !input.olympiad;

    const [total, rows, filteredTotals] = await Promise.all([
      unfiltered
        ? Promise.resolve(reg.studentCount)
        : prisma.registrationStudent.count({ where }),
      prisma.registrationStudent.findMany({
        where,
        orderBy: [{ grade: "asc" }, { name: "asc" }],
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        select: {
          id: true,
          registrationNumber: true,
          name: true,
          grade: true,
          section: true,
          mobile: true,
          imo: true,
          iso: true,
          ieo: true,
        },
      }),
      unfiltered
        ? Promise.resolve({
            imo: reg.imoCount,
            iso: reg.isoCount,
            ieo: reg.ieoCount,
          })
        : Promise.all([
            prisma.registrationStudent.count({ where: { ...where, imo: true } }),
            prisma.registrationStudent.count({ where: { ...where, iso: true } }),
            prisma.registrationStudent.count({ where: { ...where, ieo: true } }),
          ]).then(([imo, iso, ieo]) => ({ imo, iso, ieo })),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / input.limit));
    const page = Math.min(Math.max(1, input.page), totalPages);

    return {
      schoolCode: reg.schoolCode,
      schoolName: reg.schoolName,
      city: reg.city,
      state: reg.state,
      status: reg.status,
      students: rows,
      totals: filteredTotals,
      pagination: {
        page,
        limit: input.limit,
        total,
        totalPages,
      },
    };
  },

  async schoolExportStudents(
    accountId: string,
    input: { olympiad?: "IMO" | "ISO" | "IEO"; grade?: number },
  ) {
    const reg = await prisma.schoolRegistration.findUnique({
      where: {
        schoolAccountId_olympiadYear: {
          schoolAccountId: accountId,
          olympiadYear: CURRENT_OLYMPIAD_YEAR,
        },
      },
      select: { id: true, status: true },
    });
    if (!reg) throw new AppError("Registration not found", 404);
    if (reg.status !== RegistrationStatus.APPROVED) {
      throw new AppError(
        "Student list is available after your registration is approved",
        403,
      );
    }

    const where: Prisma.RegistrationStudentWhereInput = {
      schoolRegistrationId: reg.id,
      name: { not: "" },
      ...(input.grade != null ? { grade: input.grade } : {}),
      ...(input.olympiad === "IMO" ? { imo: true } : {}),
      ...(input.olympiad === "ISO" ? { iso: true } : {}),
      ...(input.olympiad === "IEO" ? { ieo: true } : {}),
    };

    const total = await prisma.registrationStudent.count({ where });
    const SCHOOL_EXPORT_MAX = 10_000;
    if (total > SCHOOL_EXPORT_MAX) {
      throw new AppError(
        `Too many students to export at once (${total}). Filter by olympiad or grade.`,
        400,
      );
    }

    const rows = await prisma.registrationStudent.findMany({
      where,
      orderBy: [{ grade: "asc" }, { name: "asc" }],
      take: SCHOOL_EXPORT_MAX,
      select: {
        registrationNumber: true,
        name: true,
        grade: true,
        section: true,
        imo: true,
        iso: true,
        ieo: true,
        schoolRegistration: {
          select: {
            schoolCode: true,
            schoolName: true,
            city: true,
            state: true,
          },
        },
      },
    });

    return rows.map((s) => ({
      registrationNumber: s.registrationNumber,
      name: s.name,
      grade: s.grade,
      section: s.section,
      imo: s.imo,
      iso: s.iso,
      ieo: s.ieo,
      schoolCode: s.schoolRegistration.schoolCode,
      schoolName: s.schoolRegistration.schoolName,
      city: s.schoolRegistration.city,
      state: s.schoolRegistration.state,
    }));
  },

  /** Aggregated overview for the admin dashboard (fixed Olympiad Year). */
  async adminDashboard() {
    const yearFilter = { olympiadYear: CURRENT_OLYMPIAD_YEAR };

    const [
      totalAccounts,
      statusGroups,
      paymentGroups,
      approvedStudentAgg,
      underReviewStudentAgg,
      allNamedAgg,
      pendingPayments,
      attentionRows,
      recentApproved,
      gradeRows,
    ] = await Promise.all([
      prisma.schoolAccount.count(),
      prisma.schoolRegistration.groupBy({
        by: ["status"],
        where: yearFilter,
        _count: { _all: true },
        _sum: {
          studentCount: true,
          imoCount: true,
          isoCount: true,
          ieoCount: true,
        },
      }),
      prisma.registrationPayment.groupBy({
        by: ["status"],
        where: { schoolRegistration: yearFilter },
        _count: { _all: true },
        _sum: { amountExpected: true },
      }),
      prisma.registrationStudent.count({
        where: {
          schoolRegistration: {
            ...yearFilter,
            status: RegistrationStatus.APPROVED,
          },
        },
      }),
      prisma.registrationStudent.count({
        where: {
          schoolRegistration: {
            ...yearFilter,
            status: RegistrationStatus.UNDER_REVIEW,
          },
        },
      }),
      prisma.schoolRegistration.aggregate({
        where: yearFilter,
        _sum: {
          studentCount: true,
          imoCount: true,
          isoCount: true,
          ieoCount: true,
        },
        _count: { _all: true },
      }),
      prisma.registrationPayment.count({
        where: {
          status: PaymentReviewStatus.PENDING,
          schoolRegistration: {
            ...yearFilter,
            status: RegistrationStatus.UNDER_REVIEW,
          },
        },
      }),
      prisma.schoolRegistration.findMany({
        where: {
          ...yearFilter,
          status: {
            in: [RegistrationStatus.UNDER_REVIEW, RegistrationStatus.REJECTED],
          },
        },
        orderBy: [{ submittedAt: "desc" }, { updatedAt: "desc" }],
        take: 8,
        select: {
          id: true,
          schoolName: true,
          schoolCode: true,
          status: true,
          studentCount: true,
          submittedAt: true,
          payment: {
            select: { status: true, amountExpected: true },
          },
        },
      }),
      prisma.schoolRegistration.findMany({
        where: {
          ...yearFilter,
          status: RegistrationStatus.APPROVED,
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          schoolName: true,
          schoolCode: true,
          studentCount: true,
          updatedAt: true,
        },
      }),
      prisma.$queryRaw<
        Array<{
          grade: number;
          students: bigint;
          imo: bigint;
          iso: bigint;
          ieo: bigint;
          approvedStudents: bigint;
          approvedImo: bigint;
          approvedIso: bigint;
          approvedIeo: bigint;
        }>
      >`
        SELECT
          rs.grade AS grade,
          COUNT(*) AS "students",
          COUNT(*) FILTER (WHERE rs.imo) AS "imo",
          COUNT(*) FILTER (WHERE rs.iso) AS "iso",
          COUNT(*) FILTER (WHERE rs.ieo) AS "ieo",
          COUNT(*) FILTER (WHERE sr.status = 'APPROVED'::"RegistrationStatus") AS "approvedStudents",
          COUNT(*) FILTER (WHERE rs.imo AND sr.status = 'APPROVED'::"RegistrationStatus") AS "approvedImo",
          COUNT(*) FILTER (WHERE rs.iso AND sr.status = 'APPROVED'::"RegistrationStatus") AS "approvedIso",
          COUNT(*) FILTER (WHERE rs.ieo AND sr.status = 'APPROVED'::"RegistrationStatus") AS "approvedIeo"
        FROM "RegistrationStudent" rs
        JOIN "SchoolRegistration" sr ON sr.id = rs."schoolRegistrationId"
        WHERE sr."olympiadYear" = ${CURRENT_OLYMPIAD_YEAR}
        GROUP BY rs.grade
        ORDER BY rs.grade ASC
      `,
    ]);

    const countByStatus = (status: RegistrationStatus) =>
      statusGroups.find((g) => g.status === status)?._count._all ?? 0;

    const draft = countByStatus(RegistrationStatus.DRAFT);
    const underReview = countByStatus(RegistrationStatus.UNDER_REVIEW);
    const approved = countByStatus(RegistrationStatus.APPROVED);
    const rejected = countByStatus(RegistrationStatus.REJECTED);
    const withRegistration = draft + underReview + approved + rejected;

    const accountsWithoutReg = Math.max(0, totalAccounts - withRegistration);
    const incomplete = draft + rejected + accountsWithoutReg;

    const sumPayment = (status: PaymentReviewStatus) => {
      const row = paymentGroups.find((g) => g.status === status);
      return {
        count: row?._count._all ?? 0,
        amount: Number(row?._sum.amountExpected ?? 0),
      };
    };
    const pendingPay = sumPayment(PaymentReviewStatus.PENDING);
    const verifiedPay = sumPayment(PaymentReviewStatus.VERIFIED);
    const rejectedPay = sumPayment(PaymentReviewStatus.REJECTED);

    const approvedGroup = statusGroups.find(
      (g) => g.status === RegistrationStatus.APPROVED,
    );

    return {
      olympiadYear: OLYMPIAD_YEAR_META,
      schools: {
        totalAccounts,
        withRegistration,
        draft,
        underReview,
        approved,
        rejected,
        incomplete,
      },
      students: {
        approved: approvedStudentAgg,
        underReview: underReviewStudentAgg,
        totalNamed: allNamedAgg._sum.studentCount ?? 0,
        imo: allNamedAgg._sum.imoCount ?? 0,
        iso: allNamedAgg._sum.isoCount ?? 0,
        ieo: allNamedAgg._sum.ieoCount ?? 0,
        imoApproved: approvedGroup?._sum.imoCount ?? 0,
        isoApproved: approvedGroup?._sum.isoCount ?? 0,
        ieoApproved: approvedGroup?._sum.ieoCount ?? 0,
      },
      byGrade: gradeRows.map((r) => ({
        grade: Number(r.grade),
        students: Number(r.students),
        imo: Number(r.imo),
        iso: Number(r.iso),
        ieo: Number(r.ieo),
        approvedStudents: Number(r.approvedStudents),
        approvedImo: Number(r.approvedImo),
        approvedIso: Number(r.approvedIso),
        approvedIeo: Number(r.approvedIeo),
      })),
      payments: {
        pending: pendingPay.count,
        verified: verifiedPay.count,
        rejected: rejectedPay.count,
        pendingAmount: pendingPay.amount,
        verifiedAmount: verifiedPay.amount,
        awaitingReview: pendingPayments,
      },
      attention: attentionRows.map((r) => ({
        id: r.id,
        schoolName: r.schoolName || "Unnamed school",
        schoolCode: r.schoolCode || "—",
        status: r.status,
        studentCount: r.studentCount,
        amountExpected: Number(r.payment?.amountExpected ?? 0),
        submittedAt: r.submittedAt?.toISOString() ?? null,
        paymentStatus: r.payment?.status ?? null,
      })),
      recentApproved: recentApproved.map((r) => ({
        id: r.id,
        schoolName: r.schoolName || "Unnamed school",
        schoolCode: r.schoolCode || "—",
        studentCount: r.studentCount,
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  },
};
