import { prisma } from "../lib/prisma";
import {
  generatePasswordOtp,
  passwordResetTokenKey,
  sendAccountCreatedEmail,
  sendPasswordOtpEmail,
  sendPasswordUpdatedEmail,
} from "../lib/mail";
import { AppError } from "../middleware/error.middleware";
import {
  CURRENT_OLYMPIAD_YEAR,
  olympiadYearMeta,
} from "../lib/olympiad-year";
import { PAYMENT_DETAILS } from "../lib/payment-details";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Live fee = olympiad program slots × fee per slot (concession or standard). */
function amountFromOlympiadCounts(
  imo: number,
  iso: number,
  ieo: number,
  concessionFeePerStudent?: number | null,
) {
  const feePerSlot =
    typeof concessionFeePerStudent === "number" && concessionFeePerStudent > 0
      ? concessionFeePerStudent
      : PAYMENT_DETAILS.feeAmount;
  return (imo + iso + ieo) * feePerSlot;
}

function queueMail(promise: Promise<unknown>) {
  void promise.catch((err) => {
    console.warn("[mail]", err instanceof Error ? err.message : err);
  });
}

export const schoolAuthService = {
  async register(input: {
    email: string;
    password: string;
    name?: string;
    mobile?: string;
  }) {
    const email = normalizeEmail(input.email);
    const existing = await prisma.schoolAccount.findUnique({ where: { email } });
    if (existing) {
      throw new AppError("An account with this email already exists", 409);
    }
    const password = input.password;
    const account = await prisma.schoolAccount.create({
      data: {
        email,
        password,
        name: input.name?.trim() || null,
        mobile: input.mobile?.trim() || "",
      },
    });
    queueMail(
      sendAccountCreatedEmail({
        to: account.email,
        schoolName: account.name || "School",
        email: account.email,
        password,
      }),
    );
    return {
      id: account.id,
      email: account.email,
      name: account.name || "School",
      mobile: account.mobile || "",
    };
  },

  async login(email: string, password: string) {
    const account = await prisma.schoolAccount.findUnique({
      where: { email: normalizeEmail(email) },
    });
    if (!account) throw new AppError("Account not found", 404);
    if (account.password !== password) {
      throw new AppError("Incorrect password", 401);
    }
    return {
      id: account.id,
      email: account.email,
      name: account.name || "School",
      mobile: account.mobile || "",
    };
  },

  async me(accountId: string) {
    const account = await prisma.schoolAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) throw new AppError("Unauthorized", 401);
    return {
      id: account.id,
      email: account.email,
      name: account.name || "School",
      mobile: account.mobile || "",
    };
  },

  async forgotPassword(email: string) {
    const account = await prisma.schoolAccount.findUnique({
      where: { email: normalizeEmail(email) },
    });
    if (!account) {
      throw new AppError("No school account found for this email", 404);
    }

    // Invalidate previous unused OTPs for this account
    await prisma.passwordResetToken.updateMany({
      where: {
        schoolAccountId: account.id,
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });

    const otp = generatePasswordOtp();
    const token = passwordResetTokenKey(account.id, otp);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await prisma.passwordResetToken.create({
      data: {
        token,
        schoolAccountId: account.id,
        expiresAt,
      },
    });

    try {
      await sendPasswordOtpEmail(
        account.email,
        otp,
        account.name || undefined,
      );
    } catch (err) {
      throw new AppError(
        err instanceof Error ? err.message : "Failed to send OTP email",
        500,
      );
    }
    return { ok: true, email: account.email };
  },

  async resetPassword(input: {
    email: string;
    otp: string;
    password: string;
  }) {
    const account = await prisma.schoolAccount.findUnique({
      where: { email: normalizeEmail(input.email) },
    });
    if (!account) {
      throw new AppError("Invalid OTP or email", 400);
    }
    const otp = input.otp.trim();
    if (!/^\d{4}$/.test(otp)) {
      throw new AppError("Enter the 4-digit OTP", 400);
    }
    const token = passwordResetTokenKey(account.id, otp);
    const row = await prisma.passwordResetToken.findUnique({
      where: { token },
    });
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      throw new AppError("OTP is invalid or expired", 400);
    }
    if (row.schoolAccountId !== account.id) {
      throw new AppError("OTP is invalid or expired", 400);
    }
    await prisma.$transaction([
      prisma.schoolAccount.update({
        where: { id: account.id },
        data: { password: input.password },
      }),
      prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
    ]);
    return { ok: true };
  },

  async adminSetPassword(accountId: string, password: string) {
    const account = await prisma.schoolAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) throw new AppError("School account not found", 404);
    await prisma.schoolAccount.update({
      where: { id: accountId },
      data: { password },
    });
    queueMail(
      sendPasswordUpdatedEmail({
        to: account.email,
        schoolName: account.name || "School",
        email: account.email,
        password,
      }),
    );
    return { id: account.id, email: account.email, password };
  },

  async getAccountDetail(accountId: string) {
    const row = await prisma.schoolAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        email: true,
        password: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { registrations: true } },
        registrations: {
          where: { olympiadYear: CURRENT_OLYMPIAD_YEAR },
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: {
            id: true,
            schoolCode: true,
            schoolName: true,
            address: true,
            city: true,
            district: true,
            state: true,
            pincode: true,
            country: true,
            countryOther: true,
            website: true,
            affiliation: true,
            affiliationOther: true,
            trustName: true,
            schoolMobile: true,
            landline: true,
            stdCode: true,
            email: true,
            principalName: true,
            principalMobile: true,
            principalEmail: true,
            contactName: true,
            phone: true,
            inchargeEmail: true,
            status: true,
            currentStep: true,
            submittedAt: true,
            updatedAt: true,
            olympiadYear: true,
            studentCount: true,
            imoCount: true,
            isoCount: true,
            ieoCount: true,
            concessionFeePerStudent: true,
            payment: {
              select: {
                status: true,
                paymentMethod: true,
                utr: true,
                amountExpected: true,
              },
            },
          },
        },
      },
    });
    if (!row) throw new AppError("School account not found", 404);

    const registration = row.registrations[0] || null;
    const imo = registration?.imoCount ?? 0;
    const iso = registration?.isoCount ?? 0;
    const ieo = registration?.ieoCount ?? 0;
    const olympiadTotal = imo + iso + ieo;
    const amountExpected = amountFromOlympiadCounts(
      imo,
      iso,
      ieo,
      registration?.concessionFeePerStudent,
    );
    const registrationWithLivePayment = registration
      ? {
          ...registration,
          payment: registration.payment
            ? {
                ...registration.payment,
                amountExpected,
              }
            : null,
        }
      : null;

    return {
      id: row.id,
      email: row.email,
      password: row.password,
      name: row.name,
      createdAt: row.createdAt,
      updatedAt: registration?.updatedAt || row.updatedAt,
      registrationCount: row._count.registrations,
      schoolName: registration?.schoolName || row.name || "",
      schoolCode: registration?.schoolCode || "",
      city: registration?.city || "",
      state: registration?.state || "",
      district: registration?.district || "",
      contactName: registration?.contactName || "",
      phone: registration?.phone || registration?.schoolMobile || "",
      status: registration?.status || null,
      currentStep: registration?.currentStep ?? 0,
      studentCount: registration?.studentCount ?? 0,
      imoCount: imo,
      isoCount: iso,
      ieoCount: ieo,
      olympiadTotal,
      amountExpected,
      olympiadYear: registration?.olympiadYear
        ? olympiadYearMeta(registration.olympiadYear)
        : null,
      registration: registrationWithLivePayment,
    };
  },

  /** Admin creates a school portal account (no login cookie). */
  async adminCreateAccount(input: {
    email: string;
    password: string;
    name: string;
    mobile: string;
  }) {
    const email = normalizeEmail(input.email);
    const existing = await prisma.schoolAccount.findUnique({ where: { email } });
    if (existing) {
      throw new AppError("An account with this email already exists", 409);
    }
    const password = input.password;
    const account = await prisma.schoolAccount.create({
      data: {
        email,
        password,
        name: input.name.trim(),
        mobile: input.mobile.trim(),
      },
    });
    queueMail(
      sendAccountCreatedEmail({
        to: account.email,
        schoolName: account.name || "School",
        email: account.email,
        password,
      }),
    );
    return {
      id: account.id,
      email: account.email,
      name: account.name || "School",
      mobile: account.mobile || "",
      password,
    };
  },

  async listAccounts(params?: {
    page?: number;
    limit?: number;
    q?: string;
    incomplete?: boolean;
    approved?: boolean;
  }) {
    const page = Math.max(1, Number(params?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params?.limit) || 20));
    const skip = (page - 1) * limit;
    const q = (params?.q || "").trim();
    const incomplete = Boolean(params?.incomplete);
    const approved = Boolean(params?.approved);

    const activeYear =
      incomplete || approved ? CURRENT_OLYMPIAD_YEAR : null;

    const searchWhere = q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
            {
              registrations: {
                some: {
                  OR: [
                    {
                      schoolName: {
                        contains: q,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      schoolCode: {
                        contains: q,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      city: { contains: q, mode: "insensitive" as const },
                    },
                    {
                      contactName: {
                        contains: q,
                        mode: "insensitive" as const,
                      },
                    },
                  ],
                },
              },
            },
          ],
        }
      : {};

    const incompleteWhere =
      incomplete && activeYear
        ? {
            OR: [
              {
                registrations: {
                  none: { olympiadYear: activeYear },
                },
              },
              {
                registrations: {
                  some: {
                    olympiadYear: activeYear,
                    status: { in: ["DRAFT" as const, "REJECTED" as const] },
                  },
                },
              },
            ],
          }
        : {};

    const approvedWhere =
      approved && activeYear
        ? {
            registrations: {
              some: {
                olympiadYear: activeYear,
                status: "APPROVED" as const,
              },
            },
          }
        : {};

    const andParts = [searchWhere, incompleteWhere, approvedWhere].filter(
      (part) => Object.keys(part).length > 0,
    );
    const where = andParts.length > 0 ? { AND: andParts } : {};

    // Incomplete list only needs summary fields; approved needs profile drawer fields.
    const countFields = {
      studentCount: true,
      imoCount: true,
      isoCount: true,
      ieoCount: true,
    } as const;

    const registrationSelect = incomplete
      ? {
          id: true,
          schoolCode: true,
          schoolName: true,
          city: true,
          district: true,
          state: true,
          status: true,
          currentStep: true,
          updatedAt: true,
          contactName: true,
          phone: true,
          schoolMobile: true,
          email: true,
          olympiadYear: true,
          ...countFields,
        }
      : {
          id: true,
          schoolCode: true,
          schoolName: true,
          address: true,
          city: true,
          district: true,
          state: true,
          pincode: true,
          country: true,
          countryOther: true,
          website: true,
          affiliation: true,
          affiliationOther: true,
          trustName: true,
          schoolMobile: true,
          landline: true,
          stdCode: true,
          email: true,
          principalName: true,
          principalMobile: true,
          principalEmail: true,
          contactName: true,
          phone: true,
          inchargeEmail: true,
          status: true,
          currentStep: true,
          submittedAt: true,
          updatedAt: true,
          olympiadYear: true,
          concessionFeePerStudent: true,
          ...countFields,
          payment: {
            select: {
              status: true,
              paymentMethod: true,
              utr: true,
              amountExpected: true,
            },
          },
        };

    const [total, rows] = await Promise.all([
      prisma.schoolAccount.count({ where }),
      prisma.schoolAccount.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          password: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          registrations: {
            ...(activeYear
              ? { where: { olympiadYear: activeYear } }
              : {}),
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: registrationSelect,
          },
          _count: { select: { registrations: true } },
        },
      }),
    ]);

    const accounts = rows.map((row) => {
      const registration = row.registrations[0] || null;
      const contactName =
        registration && "contactName" in registration
          ? String(registration.contactName || "")
          : "";
      const phone =
        registration && "phone" in registration
          ? String(
              registration.phone ||
                ("schoolMobile" in registration
                  ? registration.schoolMobile
                  : "") ||
                "",
            )
          : "";
      const registrationUpdatedAt =
        registration && "updatedAt" in registration
          ? (registration.updatedAt as Date)
          : null;
      const imo = registration?.imoCount ?? 0;
      const iso = registration?.isoCount ?? 0;
      const ieo = registration?.ieoCount ?? 0;
      const concession =
        registration && "concessionFeePerStudent" in registration
          ? (registration.concessionFeePerStudent as number | null)
          : null;
      const olympiadTotal = imo + iso + ieo;
      const amountExpected = amountFromOlympiadCounts(
        imo,
        iso,
        ieo,
        concession,
      );
      const registrationOut =
        incomplete || !registration
          ? null
          : {
              ...registration,
              payment:
                "payment" in registration && registration.payment
                  ? {
                      ...registration.payment,
                      amountExpected,
                    }
                  : null,
            };
      return {
        id: row.id,
        email: row.email,
        password: row.password,
        name: row.name,
        createdAt: row.createdAt,
        updatedAt: registrationUpdatedAt || row.updatedAt,
        registrationCount: row._count.registrations,
        registrationId: registration?.id || null,
        schoolName: registration?.schoolName || row.name || "",
        schoolCode: registration?.schoolCode || "",
        city: registration?.city || "",
        state: registration?.state || "",
        district: registration?.district || "",
        contactName,
        phone,
        status: registration?.status || null,
        currentStep: registration?.currentStep ?? 0,
        studentCount: registration?.studentCount ?? 0,
        imoCount: imo,
        isoCount: iso,
        ieoCount: ieo,
        olympiadTotal,
        amountExpected,
        feePerSlot:
          typeof concession === "number" && concession > 0
            ? concession
            : PAYMENT_DETAILS.feeAmount,
        olympiadYear: registration?.olympiadYear
          ? olympiadYearMeta(registration.olympiadYear)
          : null,
        registration: registrationOut,
      };
    });

    let totals = {
      imo: 0,
      iso: 0,
      ieo: 0,
      total: 0,
      payment: 0,
      schools: total,
    };
    if (approved && activeYear) {
      const registrationFilter = {
        olympiadYear: activeYear,
        status: "APPROVED" as const,
        ...(q ? { schoolAccount: where } : {}),
      };
      const feeRows = await prisma.schoolRegistration.findMany({
        where: registrationFilter,
        select: {
          imoCount: true,
          isoCount: true,
          ieoCount: true,
          concessionFeePerStudent: true,
        },
      });
      let imoTotal = 0;
      let isoTotal = 0;
      let ieoTotal = 0;
      let paymentTotal = 0;
      for (const r of feeRows) {
        imoTotal += r.imoCount;
        isoTotal += r.isoCount;
        ieoTotal += r.ieoCount;
        paymentTotal += amountFromOlympiadCounts(
          r.imoCount,
          r.isoCount,
          r.ieoCount,
          r.concessionFeePerStudent,
        );
      }
      totals = {
        imo: imoTotal,
        iso: isoTotal,
        ieo: ieoTotal,
        total: imoTotal + isoTotal + ieoTotal,
        payment: paymentTotal,
        schools: total,
      };
    }

    return {
      accounts,
      totals,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  },

  async exportIncompleteAccounts(params?: { q?: string }) {
    const data = await this.listAccounts({
      page: 1,
      limit: 100,
      q: params?.q,
      incomplete: true,
    });

    // Fetch all pages (supports 3k+ schools for marketing follow-up)
    const all = [...data.accounts];
    const totalPages = data.pagination.totalPages;
    for (let page = 2; page <= totalPages; page += 1) {
      const next = await this.listAccounts({
        page,
        limit: 100,
        q: params?.q,
        incomplete: true,
      });
      all.push(...next.accounts);
    }

    function progressLabel(status: string | null, currentStep: number) {
      if (!status) return "Account only";
      if (status === "REJECTED") return "Rejected — resubmit";
      if (currentStep <= 1) return "School details";
      if (currentStep === 2) return "Students";
      return "Payment";
    }

    function statusLabel(status: string | null) {
      if (!status) return "Not started";
      return status.replaceAll("_", " ");
    }

    return all.map((row) => ({
      schoolName: row.schoolName || row.name || "Unnamed school",
      schoolCode: row.schoolCode || "",
      email: row.email,
      password: row.password || "",
      contactName: row.contactName || "",
      phone: row.phone || "",
      city: row.city || "",
      state: row.state || "",
      status: statusLabel(row.status),
      progress: progressLabel(row.status, row.currentStep),
      studentCount: row.studentCount,
      updatedAt:
        row.updatedAt instanceof Date
          ? row.updatedAt.toISOString()
          : row.updatedAt
            ? String(row.updatedAt)
            : null,
    }));
  },
};
