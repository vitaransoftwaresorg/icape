import { Router } from "express";
import multer from "multer";
import { requireAdmin } from "../middleware/auth.middleware";
import { adminSchoolRegistrationController } from "../controllers/school-registration.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const adminSchoolRegistrationRouter = Router();

adminSchoolRegistrationRouter.use(requireAdmin);

adminSchoolRegistrationRouter.get(
  "/dashboard",
  adminSchoolRegistrationController.dashboard,
);
adminSchoolRegistrationRouter.get(
  "/",
  adminSchoolRegistrationController.list,
);
adminSchoolRegistrationRouter.get(
  "/export.pdf",
  adminSchoolRegistrationController.exportRegistrationsPdf,
);
adminSchoolRegistrationRouter.get(
  "/export.print",
  adminSchoolRegistrationController.exportRegistrationsPrint,
);
adminSchoolRegistrationRouter.get(
  "/accounts",
  adminSchoolRegistrationController.listAccounts,
);
adminSchoolRegistrationRouter.get(
  "/accounts/export.incomplete.pdf",
  adminSchoolRegistrationController.exportIncompleteAccountsPdf,
);
adminSchoolRegistrationRouter.get(
  "/accounts/export.incomplete.print",
  adminSchoolRegistrationController.exportIncompleteAccountsPrint,
);
adminSchoolRegistrationRouter.post(
  "/accounts",
  adminSchoolRegistrationController.createAccount,
);
adminSchoolRegistrationRouter.get(
  "/accounts/:id/detail",
  adminSchoolRegistrationController.getAccountDetail,
);
adminSchoolRegistrationRouter.get(
  "/accounts/:id",
  adminSchoolRegistrationController.getAccountRegistration,
);
adminSchoolRegistrationRouter.put(
  "/accounts/:id/step/1",
  adminSchoolRegistrationController.saveAccountStep1,
);
adminSchoolRegistrationRouter.put(
  "/accounts/:id/step/2",
  adminSchoolRegistrationController.saveAccountStep2,
);
adminSchoolRegistrationRouter.get(
  "/step/2/template",
  adminSchoolRegistrationController.downloadTemplate,
);
adminSchoolRegistrationRouter.post(
  "/step/2/import",
  upload.single("file"),
  adminSchoolRegistrationController.importStudentsExcel,
);
adminSchoolRegistrationRouter.put(
  "/accounts/:id/step/3",
  adminSchoolRegistrationController.saveAccountStep3,
);
adminSchoolRegistrationRouter.post(
  "/accounts/:id/password",
  adminSchoolRegistrationController.setPassword,
);
adminSchoolRegistrationRouter.get(
  "/students",
  adminSchoolRegistrationController.listStudents,
);
adminSchoolRegistrationRouter.put(
  "/students/:id",
  adminSchoolRegistrationController.updateStudent,
);
adminSchoolRegistrationRouter.post(
  "/students/export-jobs",
  adminSchoolRegistrationController.startStudentExportJob,
);
adminSchoolRegistrationRouter.get(
  "/students/export-jobs/latest",
  adminSchoolRegistrationController.latestStudentExportJob,
);
adminSchoolRegistrationRouter.get(
  "/students/export-jobs/:jobId",
  adminSchoolRegistrationController.getStudentExportJob,
);
adminSchoolRegistrationRouter.get(
  "/students/export-jobs/:jobId/download",
  adminSchoolRegistrationController.downloadStudentExportJob,
);
adminSchoolRegistrationRouter.get(
  "/students/export.xlsx",
  adminSchoolRegistrationController.exportStudentsExcel,
);
adminSchoolRegistrationRouter.get(
  "/students/export.pdf",
  adminSchoolRegistrationController.exportStudentsPdf,
);
adminSchoolRegistrationRouter.get(
  "/students/export.print",
  adminSchoolRegistrationController.exportStudentsPrint,
);
adminSchoolRegistrationRouter.get(
  "/:id",
  adminSchoolRegistrationController.get,
);
adminSchoolRegistrationRouter.post(
  "/:id/verify",
  adminSchoolRegistrationController.verify,
);

export default adminSchoolRegistrationRouter;
