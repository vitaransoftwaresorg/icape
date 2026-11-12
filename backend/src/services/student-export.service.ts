import { createReadStream } from "fs";
import { mkdir, unlink, access } from "fs/promises";
import path from "path";
import ExcelJS from "exceljs";
import {
  Prisma,
  RegistrationStatus,
  StudentExportJobStatus,
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  CURRENT_OLYMPIAD_YEAR,
} from "../lib/olympiad-year";
import { AppError } from "../middleware/error.middleware";
import { sendStudentExportReadyEmail } from "../lib/mail";
import {
  createStudentListPdfFileWriter,
  olympiadFlags,
} from "../lib/student-list-documents";
import { schoolRegistrationService } from "./school-registration.service";

const BATCH_SIZE = 500;
const EXPORT_DIR = path.join(process.cwd(), "storage", "exports");
const JOB_TTL_MS = 24 * 60 * 60 * 1000;

export type StudentExportFormat = "pdf" | "xlsx";

export type StudentExportFilters = {
  q?: string;
  schoolCode?: string;
  grade?: number;
  olympiad?: "IMO" | "ISO" | "IEO";
  olympiadYear?: string;
  status?: RegistrationStatus;
  format?: StudentExportFormat;
};

type FilterJson = StudentExportFilters & { format?: string };

function slugFilePart(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function buildStudentExportFileName(
  filters: StudentExportFilters,
  stamp: string,
  ext: string,
) {
  const parts: string[] = [];

  if (filters.schoolCode?.trim()) {
    const school = await prisma.schoolRegistration.findFirst({
      where: {
        schoolCode: filters.schoolCode.trim(),
        olympiadYear: CURRENT_OLYMPIAD_YEAR,
      },
      select: { schoolName: true, schoolCode: true },
      orderBy: { updatedAt: "desc" },
    });
    const schoolLabel =
      school?.schoolName?.trim() ||
      school?.schoolCode?.trim() ||
      filters.schoolCode.trim();
    parts.push(slugFilePart(schoolLabel) || "school");
  } else {
    parts.push("i-cape-students");
  }

  if (filters.olympiad) parts.push(filters.olympiad);
  if (filters.grade != null) parts.push(`G${filters.grade}`);
  parts.push(stamp);

  return `${parts.filter(Boolean).join("-")}.${ext}`;
}

function parseFilters(raw: unknown): StudentExportFilters {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const f = raw as FilterJson;
  const olympiad =
    f.olympiad === "IMO" || f.olympiad === "ISO" || f.olympiad === "IEO"
      ? f.olympiad
      : undefined;
  const status =
    f.status === "DRAFT" ||
    f.status === "UNDER_REVIEW" ||
    f.status === "APPROVED" ||
    f.status === "REJECTED"
      ? f.status
      : undefined;
  const format: StudentExportFormat =
    f.format === "xlsx" ? "xlsx" : "pdf";
  return {
    q: f.q?.trim() || undefined,
    schoolCode: f.schoolCode?.trim() || undefined,
    grade: typeof f.grade === "number" ? f.grade : undefined,
    olympiad,
    olympiadYear: f.olympiadYear?.trim() || undefined,
    status,
    format,
  };
}

async function ensureExportDir() {
  await mkdir(EXPORT_DIR, { recursive: true });
}

function filePathForJob(jobId: string, format: StudentExportFormat) {
  return path.join(EXPORT_DIR, `${jobId}.${format === "xlsx" ? "xlsx" : "pdf"}`);
}

function contentTypeFor(format: StudentExportFormat) {
  return format === "xlsx"
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "application/pdf";
}

async function cleanupExpiredJobs() {
  const expired = await prisma.studentExportJob.findMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        {
          status: {
            in: [
              StudentExportJobStatus.COMPLETED,
              StudentExportJobStatus.FAILED,
            ],
          },
          createdAt: { lt: new Date(Date.now() - JOB_TTL_MS) },
        },
      ],
    },
    select: { id: true, filePath: true },
    take: 50,
  });

  for (const job of expired) {
    if (job.filePath) {
      try {
        await unlink(job.filePath);
      } catch {
        /* ignore missing file */
      }
    }
    await prisma.studentExportJob.delete({ where: { id: job.id } }).catch(() => {
      /* ignore */
    });
  }
}

async function listExportSchools(
  filters: StudentExportFilters,
  scopedWhere: Prisma.RegistrationStudentWhereInput,
) {
  return prisma.schoolRegistration.findMany({
    where: {
      status: filters.status ?? RegistrationStatus.APPROVED,
      olympiadYear: CURRENT_OLYMPIAD_YEAR,
      ...(filters.schoolCode?.trim()
        ? { schoolCode: filters.schoolCode.trim() }
        : {}),
      students: { some: scopedWhere },
    },
    orderBy: { schoolName: "asc" },
    select: {
      id: true,
      schoolCode: true,
      schoolName: true,
    },
  });
}

async function processExportJob(jobId: string) {
  const job = await prisma.studentExportJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  const filters = parseFilters(job.filters);
  const format: StudentExportFormat = filters.format === "xlsx" ? "xlsx" : "pdf";

  const scopedWhere = schoolRegistrationService.buildAdminStudentWhere({
    ...filters,
    olympiadYear: CURRENT_OLYMPIAD_YEAR,
    status: filters.status ?? RegistrationStatus.APPROVED,
  });

  const totalRows = await prisma.registrationStudent.count({
    where: scopedWhere,
  });

  await ensureExportDir();
  const filePath = filePathForJob(jobId, format);
  const stamp = new Date().toISOString().slice(0, 10);
  const ext = format === "xlsx" ? "xlsx" : "pdf";
  const fileName = await buildStudentExportFileName(filters, stamp, ext);

  await prisma.studentExportJob.update({
    where: { id: jobId },
    data: {
      status: StudentExportJobStatus.PROCESSING,
      startedAt: new Date(),
      totalRows,
      processedRows: 0,
      fileName,
      filePath,
      errorMessage: null,
    },
  });

  let processed = 0;

  try {
    const schools = await listExportSchools(filters, scopedWhere);

    if (format === "pdf") {
      const pdf = createStudentListPdfFileWriter(filePath, {
        olympiad: filters.olympiad,
        grade: filters.grade,
      });

      for (const school of schools) {
        const schoolStudentWhere: Prisma.RegistrationStudentWhereInput = {
          AND: [scopedWhere, { schoolRegistrationId: school.id }],
        };

        let skip = 0;
        let schoolStarted = false;

        while (true) {
          const rows = await prisma.registrationStudent.findMany({
            where: schoolStudentWhere,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip,
            take: BATCH_SIZE,
            select: {
              id: true,
              registrationNumber: true,
              name: true,
              grade: true,
              section: true,
              imo: true,
              iso: true,
              ieo: true,
            },
          });

          if (rows.length === 0) break;

          if (!schoolStarted) {
            pdf.beginSchool({
              schoolCode: school.schoolCode,
              schoolName: school.schoolName,
            });
            schoolStarted = true;
          }

          for (const row of rows) {
            pdf.addStudent(row);
          }

          skip += rows.length;
          processed += rows.length;

          await prisma.studentExportJob.update({
            where: { id: jobId },
            data: { processedRows: processed },
          });

          if (rows.length < BATCH_SIZE) break;
        }
      }

      await pdf.end();
    } else {
      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
        filename: filePath,
        useStyles: false,
        useSharedStrings: false,
      });
      const sheet = workbook.addWorksheet("Students");
      sheet.columns = [
        { header: "S.No.", key: "serial", width: 8 },
        { header: "Reg. No.", key: "registrationNumber", width: 14 },
        { header: "Student", key: "name", width: 28 },
        { header: "School Code", key: "schoolCode", width: 14 },
        { header: "School Name", key: "schoolName", width: 32 },
        { header: "Grade", key: "grade", width: 8 },
        { header: "Section", key: "section", width: 10 },
        { header: "Olympiads", key: "olympiads", width: 16 },
      ];
      sheet.getRow(1).commit();

      for (const school of schools) {
        const schoolStudentWhere: Prisma.RegistrationStudentWhereInput = {
          AND: [scopedWhere, { schoolRegistrationId: school.id }],
        };

        let skip = 0;
        let serial = 0;

        while (true) {
          const rows = await prisma.registrationStudent.findMany({
            where: schoolStudentWhere,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip,
            take: BATCH_SIZE,
            select: {
              id: true,
              registrationNumber: true,
              name: true,
              grade: true,
              section: true,
              imo: true,
              iso: true,
              ieo: true,
            },
          });

          if (rows.length === 0) break;

          for (const row of rows) {
            serial += 1;
            sheet
              .addRow({
                serial,
                schoolCode: school.schoolCode,
                schoolName: school.schoolName,
                registrationNumber: row.registrationNumber,
                name: row.name,
                grade: row.grade,
                section: row.section || "",
                olympiads: olympiadFlags(row),
              })
              .commit();
          }

          skip += rows.length;
          processed += rows.length;

          await prisma.studentExportJob.update({
            where: { id: jobId },
            data: { processedRows: processed },
          });

          if (rows.length < BATCH_SIZE) break;
        }
      }

      await workbook.commit();
    }

    const expiresAt = new Date(Date.now() + JOB_TTL_MS);
    await prisma.studentExportJob.update({
      where: { id: jobId },
      data: {
        status: StudentExportJobStatus.COMPLETED,
        processedRows: processed,
        completedAt: new Date(),
        expiresAt,
      },
    });

    const admin = await prisma.admin.findUnique({
      where: { id: job.createdById },
      select: { email: true, name: true },
    });
    if (admin?.email) {
      await sendStudentExportReadyEmail({
        to: admin.email,
        adminName: admin.name,
        fileName,
        totalRows: processed,
        jobId,
      }).catch((err) => {
        console.warn("[export] email failed", err);
      });
    }
  } catch (err) {
    try {
      await unlink(filePath);
    } catch {
      /* ignore */
    }
    await prisma.studentExportJob.update({
      where: { id: jobId },
      data: {
        status: StudentExportJobStatus.FAILED,
        errorMessage:
          err instanceof Error ? err.message : "Export failed unexpectedly",
        completedAt: new Date(),
        filePath: null,
      },
    });
  }
}

export const studentExportService = {
  async startJob(adminId: string, filters: StudentExportFilters = {}) {
    await cleanupExpiredJobs();

    const active = await prisma.studentExportJob.findFirst({
      where: {
        createdById: adminId,
        status: {
          in: [
            StudentExportJobStatus.PENDING,
            StudentExportJobStatus.PROCESSING,
          ],
        },
      },
      select: { id: true, status: true },
    });
    if (active) {
      throw new AppError(
        `An export is already ${active.status.toLowerCase()}. Wait for it to finish or download it.`,
        409,
      );
    }

    const format: StudentExportFormat =
      filters.format === "xlsx" ? "xlsx" : "pdf";

    const job = await prisma.studentExportJob.create({
      data: {
        createdById: adminId,
        filters: { ...filters, format } as Prisma.InputJsonValue,
        status: StudentExportJobStatus.PENDING,
      },
    });

    setImmediate(() => {
      void processExportJob(job.id);
    });

    return this.getJob(job.id, adminId);
  },

  async getJob(jobId: string, adminId: string) {
    const job = await prisma.studentExportJob.findFirst({
      where: { id: jobId, createdById: adminId },
    });
    if (!job) throw new AppError("Export job not found", 404);

    const filters = parseFilters(job.filters);
    const format: StudentExportFormat =
      filters.format === "xlsx" ? "xlsx" : "pdf";

    const percent =
      job.totalRows > 0
        ? Math.min(100, Math.round((job.processedRows / job.totalRows) * 100))
        : job.status === StudentExportJobStatus.COMPLETED
          ? 100
          : 0;

    return {
      id: job.id,
      status: job.status,
      format,
      filters,
      totalRows: job.totalRows,
      processedRows: job.processedRows,
      percent,
      fileName: job.fileName || null,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      expiresAt: job.expiresAt,
      downloadReady: job.status === StudentExportJobStatus.COMPLETED,
      createdAt: job.createdAt,
    };
  },

  async latestJob(adminId: string) {
    const job = await prisma.studentExportJob.findFirst({
      where: { createdById: adminId },
      orderBy: { createdAt: "desc" },
    });
    if (!job) return null;
    return this.getJob(job.id, adminId);
  },

  async openDownloadStream(jobId: string, adminId: string) {
    const job = await prisma.studentExportJob.findFirst({
      where: { id: jobId, createdById: adminId },
    });
    if (!job) throw new AppError("Export job not found", 404);
    if (job.status !== StudentExportJobStatus.COMPLETED || !job.filePath) {
      throw new AppError("Export file is not ready yet", 409);
    }
    if (job.expiresAt && job.expiresAt < new Date()) {
      throw new AppError("Export file has expired. Start a new export.", 410);
    }

    try {
      await access(job.filePath);
    } catch {
      throw new AppError("Export file is missing. Start a new export.", 404);
    }

    const filters = parseFilters(job.filters);
    const format: StudentExportFormat =
      filters.format === "xlsx" ? "xlsx" : "pdf";

    return {
      fileName:
        job.fileName ||
        `students-${jobId}.${format === "xlsx" ? "xlsx" : "pdf"}`,
      contentType: contentTypeFor(format),
      stream: createReadStream(job.filePath),
      filePath: job.filePath,
    };
  },
};
