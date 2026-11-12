import { z } from "zod";

const mobileDigitsRegex = /^[0-9]{10}$/;
const mobileError = "Enter a valid 10-digit mobile number";

export const schoolRegisterSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().trim().min(2, "School name is required").max(120),
  mobile: z.string().trim().regex(mobileDigitsRegex, mobileError),
});

export const schoolLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email(),
});

export const resetPasswordSchema = z.object({
  email: z.string().trim().email(),
  otp: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Enter the 4-digit OTP"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const phoneSchema = z.string().trim().regex(mobileDigitsRegex, mobileError);

const optionalPhoneSchema = z
  .string()
  .trim()
  .refine((v) => v === "" || mobileDigitsRegex.test(v), mobileError);

const gradeCountValue = z.coerce.number().int().min(0).max(500);

export const schoolDetailsSchema = z
  .object({
    schoolCode: z.string().trim().max(40).optional().default(""),
    schoolName: z.string().trim().min(2, "School name is required"),
    address: z.string().trim().min(5, "Address is required"),
    city: z.string().trim().min(2, "City is required"),
    district: z.string().trim().min(2, "District is required"),
    state: z.string().trim().min(2, "State is required"),
    pincode: z.string().trim().min(4).max(12),
    country: z.enum(["India", "Other"]),
    countryOther: z.string().trim().max(80).optional().default(""),
    website: z.string().trim().max(200).optional().default(""),
    affiliation: z.enum(["CBSE", "ICSE", "STATE_BOARD", "OTHER"]),
    affiliationOther: z.string().trim().max(80).optional().default(""),
    trustName: z.string().trim().min(2, "Trust / Society name is required"),
    schoolMobile: phoneSchema,
    landline: z.string().trim().max(20).optional().default(""),
    stdCode: z.string().trim().max(10).optional().default(""),
    email: z.string().trim().email(),
    principalName: z.string().trim().min(2, "Principal name is required"),
    principalMobile: phoneSchema,
    principalEmail: z.string().trim().email(),
    contactName: z
      .string()
      .trim()
      .min(2, "Olympiad incharge name is required"),
    phone: phoneSchema,
    inchargeEmail: z.string().trim().email(),
    gradeCounts: z
      .record(z.string(), gradeCountValue)
      .optional()
      .default({}),
  })
  .superRefine((data, ctx) => {
    if (data.country === "Other" && !data.countryOther.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter country name",
        path: ["countryOther"],
      });
    }
    if (data.affiliation === "OTHER" && !data.affiliationOther.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Mention affiliation",
        path: ["affiliationOther"],
      });
    }
  });

export const registrationStudentDraftSchema = z.object({
  id: z.string().optional(),
  registrationNumber: z
    .string()
    .regex(/^\d{8}$/)
    .optional(),
  name: z.string().trim().min(2),
  grade: z.number().int().min(3).max(10),
  section: z.string().trim().max(20).optional().default(""),
  mobile: optionalPhoneSchema.optional().default(""),
  imo: z.boolean(),
  iso: z.boolean(),
  ieo: z.boolean(),
});

export const registrationStudentSchema = registrationStudentDraftSchema.refine(
  (s) => s.imo || s.iso || s.ieo,
  {
    message: "Select at least one olympiad (Maths / Science / English)",
  },
);

export const studentsStepSchema = z
  .object({
    students: z.array(z.any()).default([]),
    draft: z.boolean().optional().default(false),
    /** First chunk of a multi-request save clears existing students. Default true. */
    replaceAll: z.boolean().optional().default(true),
    /** Last chunk updates counts / step. Default true. */
    finalize: z.boolean().optional().default(true),
  })
  .superRefine((data, ctx) => {
    const schema = data.draft
      ? registrationStudentDraftSchema
      : registrationStudentSchema;
    // Only require at least one student on a finalizing non-draft save that replaces all
    if (
      !data.draft &&
      data.finalize !== false &&
      data.replaceAll !== false &&
      data.students.length < 1
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add at least one student",
        path: ["students"],
      });
      return;
    }
    data.students.forEach((raw, index) => {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        parsed.error.issues.forEach((issue) => {
          ctx.addIssue({
            ...issue,
            path: ["students", index, ...(issue.path || [])],
          });
        });
      }
    });
  });

export const paymentMethodSchema = z.enum(["UPI", "NEFT", "RTGS", "IMPS"], {
  message: "Select payment method",
});

export const paymentReferenceCheckSchema = z.object({
  utr: z.string().trim().min(6, "Enter payment reference number"),
});

export const paymentStepSchema = z.object({
  paymentMethod: paymentMethodSchema,
  utr: z.string().trim().min(6, "Enter payment reference number"),
  proofUrl: z.string().url("Upload payment proof first"),
  proofPublicId: z.string().optional(),
  /**
   * Concessional ₹ per Olympiad. Omit / null / empty = full rate (150).
   * Must be a whole rupee from 1–150 when provided.
   */
  concessionFeePerStudent: z.preprocess(
    (value) => {
      if (value === "" || value === undefined || value === null) return null;
      if (typeof value === "string" && value.trim() === "") return null;
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) ? n : value;
    },
    z
      .number()
      .int("Enter a whole number")
      .min(1, "Concession fee must be at least ₹1")
      .max(150, "Concession fee cannot exceed ₹150")
      .nullable()
      .optional(),
  ),
});

export const verifyPaymentSchema = z
  .object({
    action: z.enum(["approve", "reject"]),
    adminNote: z.string().trim().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === "reject" && (!data.adminNote || data.adminNote.length < 3)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Rejection reason is required",
        path: ["adminNote"],
      });
    }
  });

export const adminSetSchoolPasswordSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const adminCreateSchoolAccountSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  mobile: z.string().trim().regex(mobileDigitsRegex, mobileError),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const adminPaymentStepSchema = z
  .object({
    paymentMethod: z.preprocess(
      (value) => (value === "" || value == null ? undefined : value),
      paymentMethodSchema.optional(),
    ),
    utr: z.string().trim().optional().default(""),
    proofUrl: z.string().url().optional(),
    proofPublicId: z.string().optional(),
    concessionFeePerStudent: z.preprocess(
      (value) => {
        if (value === "" || value === undefined || value === null) return null;
        if (typeof value === "string" && value.trim() === "") return null;
        const n = typeof value === "number" ? value : Number(value);
        return Number.isFinite(n) ? n : value;
      },
      z
        .number()
        .int("Enter a whole number")
        .min(1, "Concession fee must be at least ₹1")
        .max(150, "Concession fee cannot exceed ₹150")
        .nullable()
        .optional(),
    ),
    /** When true, mark payment verified and registration approved */
    approve: z.boolean().optional().default(true),
    adminNote: z.string().trim().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.approve && data.utr.trim().length < 6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter payment reference number",
        path: ["utr"],
      });
    }
  });

const emptyToUndefined = (value: unknown) =>
  value === "" || value === undefined || value === null ? undefined : value;

export const adminRegistrationsQuerySchema = z.object({
  status: z.preprocess(
    emptyToUndefined,
    z.enum(["DRAFT", "UNDER_REVIEW", "APPROVED", "REJECTED"]).optional(),
  ),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const adminStudentsQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  schoolCode: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  grade: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(3).max(10).optional(),
  ),
  olympiad: z.preprocess(
    emptyToUndefined,
    z.enum(["IMO", "ISO", "IEO"]).optional(),
  ),
  olympiadYear: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  status: z.preprocess(
    emptyToUndefined,
    z.enum(["DRAFT", "UNDER_REVIEW", "APPROVED", "REJECTED"]).optional(),
  ),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

/** Admin edit of an approved registration student — registration number is never writable. */
export const adminUpdateStudentSchema = registrationStudentDraftSchema
  .omit({ id: true, registrationNumber: true })
  .refine((s) => s.imo || s.iso || s.ieo, {
    message: "Select at least one olympiad (Maths / Science / English)",
  });

export const schoolStudentsQuerySchema = z.object({
  grade: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(3).max(10).optional(),
  ),
  olympiad: z.preprocess(
    emptyToUndefined,
    z.enum(["IMO", "ISO", "IEO"]).optional(),
  ),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
});
