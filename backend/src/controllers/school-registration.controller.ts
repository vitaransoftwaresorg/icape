import { Request, Response, NextFunction } from "express";
import {
  getRequestAdmin,
  getRequestSchool,
} from "../middleware/auth.middleware";
import {
  adminCreateSchoolAccountSchema,
  adminPaymentStepSchema,
  adminRegistrationsQuerySchema,
  adminSetSchoolPasswordSchema,
  adminStudentsQuerySchema,
  adminUpdateStudentSchema,
  adminAddStudentSchema,
  adminImportStudentsSchoolSchema,
  paymentStepSchema,
  paymentReferenceCheckSchema,
  registrationStudentSchema,
  schoolDetailsSchema,
  schoolStudentsQuerySchema,
  studentsStepSchema,
  verifyPaymentSchema,
} from "../validators/school.validators";
import { schoolRegistrationService } from "../services/school-registration.service";
import { schoolAuthService } from "../services/school-auth.service";
import { studentExportService } from "../services/student-export.service";
import { RegistrationStatus } from "@prisma/client";
import { AppError } from "../middleware/error.middleware";
import {
  buildStudentListPrintHtml,
  exportFilename,
  writeStudentListExcel,
  writeStudentListPdf,
} from "../lib/student-list-documents";
import {
  buildPaymentVerificationPrintHtml,
  writePaymentVerificationPdf,
} from "../lib/payment-verification-documents";
import {
  buildIncompleteRegistrationsPrintHtml,
  writeIncompleteRegistrationsPdf,
} from "../lib/incomplete-registration-documents";

export const schoolRegistrationController = {
  async paymentInfo(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({
        success: true,
        message: "OK",
        data: schoolRegistrationService.getPaymentInfo(),
      });
    } catch (err) {
      next(err);
    }
  },

  async getMine(req: Request, res: Response, next: NextFunction) {
    try {
      const school = getRequestSchool(req);
      const data = await schoolRegistrationService.getMine(school.sub);
      res.json({ success: true, message: "OK", data });
    } catch (err) {
      next(err);
    }
  },

  async startMine(req: Request, res: Response, next: NextFunction) {
    try {
      const school = getRequestSchool(req);
      const data = await schoolRegistrationService.getOrCreateDraft(school.sub);
      res.status(201).json({ success: true, message: "Registration started", data });
    } catch (err) {
      next(err);
    }
  },

  async saveStep1(req: Request, res: Response, next: NextFunction) {
    try {
      const school = getRequestSchool(req);
      const body = schoolDetailsSchema.parse(req.body);
      const data = await schoolRegistrationService.saveStep1(school.sub, body);
      res.json({ success: true, message: "School details saved", data });
    } catch (err) {
      next(err);
    }
  },

  async saveStep2(req: Request, res: Response, next: NextFunction) {
    try {
      const school = getRequestSchool(req);
      const body = studentsStepSchema.parse(req.body);
      const students = body.students.map((s) => {
        const base = {
          id: typeof s.id === "string" ? s.id : undefined,
          registrationNumber:
            typeof s.registrationNumber === "string"
              ? s.registrationNumber
              : undefined,
          name: String(s.name ?? "").trim(),
          grade: Number(s.grade),
          section: String(s.section ?? ""),
          mobile: String(s.mobile ?? ""),
          imo: Boolean(s.imo),
          iso: Boolean(s.iso),
          ieo: Boolean(s.ieo),
        };
        if (!body.draft) {
          registrationStudentSchema.parse(base);
        }
        return base;
      });
      const data = await schoolRegistrationService.saveStep2(
        school.sub,
        students,
        {
          draft: Boolean(body.draft),
          replaceAll: body.replaceAll !== false,
          finalize: body.finalize !== false,
        },
      );
      res.json({
        success: true,
        message: body.draft ? "Draft saved" : "Students saved",
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  async downloadTemplate(_req: Request, res: Response, next: NextFunction) {
    try {
      const buffer = await schoolRegistrationService.buildStudentTemplate();
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="i-CAPE-Student-Registration-Template.xlsx"',
      );
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  },

  async importStudents(req: Request, res: Response, next: NextFunction) {
    try {
      getRequestSchool(req);
      const file = req.file;
      if (!file) throw new AppError("Excel file is required", 400);
      const result = await schoolRegistrationService.importStudentsFromExcel(
        file.buffer,
      );
      res.json({
        success: true,
        message: `Parsed ${result.students.length} student(s)`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  async uploadProof(req: Request, res: Response, next: NextFunction) {
    try {
      getRequestSchool(req);
      const file = req.file;
      if (!file) throw new AppError("Payment proof file is required", 400);
      const uploaded = await schoolRegistrationService.uploadProof(file);
      res.json({
        success: true,
        message: "Proof uploaded",
        data: uploaded,
      });
    } catch (err) {
      next(err);
    }
  },

  async saveStep3(req: Request, res: Response, next: NextFunction) {
    try {
      const school = getRequestSchool(req);
      const body = paymentStepSchema.parse(req.body);
      const data = await schoolRegistrationService.saveStep3(school.sub, body);
      res.json({
        success: true,
        message: "Registration submitted for payment verification",
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  async checkPaymentReference(req: Request, res: Response, next: NextFunction) {
    try {
      const school = getRequestSchool(req);
      const query = paymentReferenceCheckSchema.parse(req.query);
      const data = await schoolRegistrationService.checkPaymentReference(
        school.sub,
        query.utr,
      );
      res.json({
        success: true,
        message: data.available ? "OK" : data.message || "Already used",
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  async listMyStudents(req: Request, res: Response, next: NextFunction) {
    try {
      const school = getRequestSchool(req);
      const query = schoolStudentsQuerySchema.parse(req.query);
      const data = await schoolRegistrationService.schoolListStudents(
        school.sub,
        query,
      );
      res.json({ success: true, message: "OK", data });
    } catch (err) {
      next(err);
    }
  },

  async exportMyStudentsExcel(req: Request, res: Response, next: NextFunction) {
    try {
      const school = getRequestSchool(req);
      const query = schoolStudentsQuerySchema.parse(req.query);
      const students = await schoolRegistrationService.schoolExportStudents(
        school.sub,
        query,
      );
      const filename = exportFilename("i-cape-students", "xlsx", {
        schoolCode: students[0]?.schoolCode,
        olympiad: query.olympiad,
        grade: query.grade,
      });
      await writeStudentListExcel(res, students, filename);
    } catch (err) {
      next(err);
    }
  },

  async exportMyStudentsPrint(req: Request, res: Response, next: NextFunction) {
    try {
      const school = getRequestSchool(req);
      const query = schoolStudentsQuerySchema.parse(req.query);
      const students = await schoolRegistrationService.schoolExportStudents(
        school.sub,
        query,
      );
      const html = buildStudentListPrintHtml(students, {
        olympiad: query.olympiad,
        grade: query.grade,
      });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.status(200).send(html);
    } catch (err) {
      next(err);
    }
  },

  async exportMyStudentsPdf(req: Request, res: Response, next: NextFunction) {
    try {
      const school = getRequestSchool(req);
      const query = schoolStudentsQuerySchema.parse(req.query);
      const students = await schoolRegistrationService.schoolExportStudents(
        school.sub,
        query,
      );
      const filename = exportFilename("i-cape-students", "pdf", {
        schoolCode: students[0]?.schoolCode,
        olympiad: query.olympiad,
        grade: query.grade,
      });
      writeStudentListPdf(res, students, filename, {
        olympiad: query.olympiad,
        grade: query.grade,
      });
    } catch (err) {
      next(err);
    }
  },
};

export const adminSchoolRegistrationController = {
  async dashboard(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await schoolRegistrationService.adminDashboard();
      res.json({ success: true, message: "OK", data });
    } catch (err) {
      next(err);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = adminRegistrationsQuerySchema.parse(req.query);
      const data = await schoolRegistrationService.adminList(query);
      res.json({ success: true, message: "OK", data });
    } catch (err) {
      next(err);
    }
  },

  async exportRegistrationsPdf(req: Request, res: Response, next: NextFunction) {
    try {
      const query = adminRegistrationsQuerySchema
        .omit({ page: true, limit: true })
        .parse(req.query);
      const rows = await schoolRegistrationService.adminExportList(query.status);
      writePaymentVerificationPdf(res, rows, query.status);
    } catch (err) {
      next(err);
    }
  },

  async exportRegistrationsPrint(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const query = adminRegistrationsQuerySchema
        .omit({ page: true, limit: true })
        .parse(req.query);
      const rows = await schoolRegistrationService.adminExportList(query.status);
      const html = buildPaymentVerificationPrintHtml(rows, query.status);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.status(200).send(html);
    } catch (err) {
      next(err);
    }
  },

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const data = await schoolRegistrationService.adminGet(id);
      res.json({ success: true, message: "OK", data });
    } catch (err) {
      next(err);
    }
  },

  async verify(req: Request, res: Response, next: NextFunction) {
    try {
      const admin = getRequestAdmin(req);
      const body = verifyPaymentSchema.parse(req.body);
      const data = await schoolRegistrationService.adminVerify(
        String(req.params.id),
        admin.sub,
        body.action,
        body.adminNote,
      );
      res.json({
        success: true,
        message:
          body.action === "approve" ? "Payment verified" : "Payment rejected",
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  async listAccounts(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;
      const q = typeof req.query.q === "string" ? req.query.q : "";
      const incomplete =
        req.query.incomplete === "1" ||
        req.query.incomplete === "true" ||
        req.query.incomplete === "yes";
      const approved =
        req.query.approved === "1" ||
        req.query.approved === "true" ||
        req.query.approved === "yes";
      const data = await schoolAuthService.listAccounts({
        page,
        limit,
        q,
        incomplete,
        approved,
      });
      res.json({ success: true, message: "OK", data });
    } catch (err) {
      next(err);
    }
  },

  async exportIncompleteAccountsPdf(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : "";
      const rows = await schoolAuthService.exportIncompleteAccounts({ q });
      writeIncompleteRegistrationsPdf(res, rows, q.trim() || undefined);
    } catch (err) {
      next(err);
    }
  },

  async exportIncompleteAccountsPrint(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : "";
      const rows = await schoolAuthService.exportIncompleteAccounts({ q });
      const html = buildIncompleteRegistrationsPrintHtml(
        rows,
        q.trim() || undefined,
      );
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.status(200).send(html);
    } catch (err) {
      next(err);
    }
  },

  async createAccount(req: Request, res: Response, next: NextFunction) {
    try {
      const body = adminCreateSchoolAccountSchema.parse(req.body);
      const account = await schoolAuthService.adminCreateAccount(body);
      const registration = await schoolRegistrationService.getOrCreateDraft(
        account.id,
      );
      res.status(201).json({
        success: true,
        message: "School account created",
        data: { account, registration },
      });
    } catch (err) {
      next(err);
    }
  },

  async getAccountDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await schoolAuthService.getAccountDetail(
        String(req.params.id),
      );
      res.json({ success: true, message: "OK", data });
    } catch (err) {
      next(err);
    }
  },

  async getAccountRegistration(req: Request, res: Response, next: NextFunction) {
    try {
      const accountId = String(req.params.id);
      const account = await schoolAuthService.me(accountId);
      const forceCreate =
        req.query.create === "1" ||
        req.query.create === "true" ||
        req.query.create === "yes";
      const registration = forceCreate
        ? await schoolRegistrationService.getOrCreateDraft(accountId)
        : await schoolRegistrationService.getMine(accountId).catch((err) => {
            if (err instanceof AppError && err.statusCode === 404) return null;
            throw err;
          });
      res.json({
        success: true,
        message: "OK",
        data: { account, registration },
      });
    } catch (err) {
      next(err);
    }
  },

  async saveAccountStep1(req: Request, res: Response, next: NextFunction) {
    try {
      const accountId = String(req.params.id);
      const body = schoolDetailsSchema.parse(req.body);
      const data = await schoolRegistrationService.saveStep1(accountId, body, {
        allowApproved: true,
      });
      res.json({ success: true, message: "School details saved", data });
    } catch (err) {
      next(err);
    }
  },

  async saveAccountStep2(req: Request, res: Response, next: NextFunction) {
    try {
      const accountId = String(req.params.id);
      const body = studentsStepSchema.parse(req.body);
      const students = body.students.map((s) => {
        const base = {
          id: typeof s.id === "string" ? s.id : undefined,
          registrationNumber:
            typeof s.registrationNumber === "string"
              ? s.registrationNumber
              : undefined,
          name: String(s.name ?? "").trim(),
          grade: Number(s.grade),
          section: String(s.section ?? ""),
          mobile: String(s.mobile ?? ""),
          imo: Boolean(s.imo),
          iso: Boolean(s.iso),
          ieo: Boolean(s.ieo),
        };
        if (!body.draft) {
          registrationStudentSchema.parse(base);
        }
        return base;
      });
      const data = await schoolRegistrationService.saveStep2(
        accountId,
        students,
        {
          draft: Boolean(body.draft),
          replaceAll: body.replaceAll !== false,
          finalize: body.finalize !== false,
          allowApproved: true,
        },
      );
      res.json({
        success: true,
        message: body.draft ? "Draft saved" : "Students saved",
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  async downloadTemplate(_req: Request, res: Response, next: NextFunction) {
    try {
      const buffer = await schoolRegistrationService.buildStudentTemplate();
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="i-CAPE-Student-Registration-Template.xlsx"',
      );
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  },

  async importStudentsExcel(req: Request, res: Response, next: NextFunction) {
    try {
      const file = req.file;
      if (!file) throw new AppError("Excel file is required", 400);
      const result = await schoolRegistrationService.importStudentsFromExcel(
        file.buffer,
      );
      res.json({
        success: true,
        message: `Parsed ${result.students.length} student(s)`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  async saveAccountStep3(req: Request, res: Response, next: NextFunction) {
    try {
      const admin = getRequestAdmin(req);
      const accountId = String(req.params.id);
      const body = adminPaymentStepSchema.parse(req.body);
      const data = await schoolRegistrationService.adminSubmitRegistration(
        accountId,
        admin.sub,
        body,
      );
      res.json({
        success: true,
        message:
          body.approve !== false
            ? "School registered and approved"
            : "School submitted for payment verification",
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  async listStudents(req: Request, res: Response, next: NextFunction) {
    try {
      const query = adminStudentsQuerySchema.parse(req.query);
      const data = await schoolRegistrationService.adminListStudents(query);
      res.json({ success: true, message: "OK", data });
    } catch (err) {
      next(err);
    }
  },

  async updateStudent(req: Request, res: Response, next: NextFunction) {
    try {
      const body = adminUpdateStudentSchema.parse(req.body);
      const data = await schoolRegistrationService.adminUpdateStudent(
        String(req.params.id),
        body,
      );
      res.json({ success: true, message: "Student updated", data });
    } catch (err) {
      next(err);
    }
  },

  async addStudent(req: Request, res: Response, next: NextFunction) {
    try {
      const body = adminAddStudentSchema.parse(req.body);
      const data = await schoolRegistrationService.adminAddStudent(body);
      res.status(201).json({ success: true, message: "Student added", data });
    } catch (err) {
      next(err);
    }
  },

  async importAndAppendStudents(req: Request, res: Response, next: NextFunction) {
    try {
      const file = req.file;
      if (!file) throw new AppError("Excel file is required", 400);
      const { schoolCode } = adminImportStudentsSchoolSchema.parse(req.body);
      const data = await schoolRegistrationService.adminImportAndAppendStudents(
        schoolCode,
        file.buffer,
      );
      res.status(201).json({
        success: true,
        message: `Added ${data.added} student(s)${
          data.skipped ? `, skipped ${data.skipped} existing` : ""
        }`,
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  async exportStudentsExcel(req: Request, res: Response, next: NextFunction) {
    try {
      const query = adminStudentsQuerySchema.parse(req.query);
      const students = await schoolRegistrationService.adminExportStudents(query);
      const filename = exportFilename("i-cape-students", "xlsx", {
        ...query,
        schoolName: students[0]?.schoolName,
      });
      await writeStudentListExcel(res, students, filename);
    } catch (err) {
      next(err);
    }
  },

  async exportStudentsPrint(req: Request, res: Response, next: NextFunction) {
    try {
      const query = adminStudentsQuerySchema.parse(req.query);
      const students = await schoolRegistrationService.adminExportStudents(query);
      const html = buildStudentListPrintHtml(students, {
        olympiad: query.olympiad,
        grade: query.grade,
      });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.status(200).send(html);
    } catch (err) {
      next(err);
    }
  },

  async exportStudentsPdf(req: Request, res: Response, next: NextFunction) {
    try {
      const query = adminStudentsQuerySchema.parse(req.query);
      const students = await schoolRegistrationService.adminExportStudents(query);
      const filename = exportFilename("i-cape-students", "pdf", {
        ...query,
        schoolName: students[0]?.schoolName,
      });
      writeStudentListPdf(res, students, filename, {
        olympiad: query.olympiad,
        grade: query.grade,
      });
    } catch (err) {
      next(err);
    }
  },

  async startStudentExportJob(req: Request, res: Response, next: NextFunction) {
    try {
      const admin = getRequestAdmin(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const query = adminStudentsQuerySchema.omit({ page: true, limit: true }).parse(
        body,
      );
      const format =
        body.format === "xlsx" || body.format === "excel" ? "xlsx" : "pdf";
      const data = await studentExportService.startJob(admin.sub, {
        q: query.q,
        schoolCode: query.schoolCode,
        grade: query.grade,
        olympiad: query.olympiad,
        olympiadYear: query.olympiadYear,
        status: query.status as RegistrationStatus | undefined,
        format,
      });
      res.status(202).json({
        success: true,
        message: "Export started. Download when status is COMPLETED.",
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  async getStudentExportJob(req: Request, res: Response, next: NextFunction) {
    try {
      const admin = getRequestAdmin(req);
      const data = await studentExportService.getJob(
        String(req.params.jobId),
        admin.sub,
      );
      res.json({ success: true, message: "OK", data });
    } catch (err) {
      next(err);
    }
  },

  async latestStudentExportJob(req: Request, res: Response, next: NextFunction) {
    try {
      const admin = getRequestAdmin(req);
      const data = await studentExportService.latestJob(admin.sub);
      res.json({ success: true, message: "OK", data });
    } catch (err) {
      next(err);
    }
  },

  async downloadStudentExportJob(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const admin = getRequestAdmin(req);
      const { fileName, stream, contentType } =
        await studentExportService.openDownloadStream(
          String(req.params.jobId),
          admin.sub,
        );
      res.setHeader("Content-Type", contentType || "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`,
      );
      res.setHeader("Cache-Control", "no-store");
      stream.on("error", next);
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  },

  async setPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const body = adminSetSchoolPasswordSchema.parse(req.body);
      const data = await schoolAuthService.adminSetPassword(
        String(req.params.id),
        body.password,
      );
      res.json({
        success: true,
        message: "School password updated. Login details emailed to the school.",
        data,
      });
    } catch (err) {
      next(err);
    }
  },
};
