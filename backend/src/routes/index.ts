import { Router } from "express";
import healthRouter from "./health.routes";
import authRouter from "./auth.routes";
import resultRouter from "./result.routes";
import schoolAuthRouter from "./school-auth.routes";
import schoolRegistrationRouter from "./school-registration.routes";
import adminSchoolRegistrationRouter from "./admin-school-registration.routes";
import adminDatabaseRouter from "./admin-database.routes";
import publicObjectsRouter from "./public-objects.routes";

const apiRouter = Router();

apiRouter.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "i-CAPE API",
    data: { health: "/api/health" },
  });
});

apiRouter.use("/health", healthRouter);
apiRouter.use("/public", publicObjectsRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/results", resultRouter);
apiRouter.use("/school-auth", schoolAuthRouter);
apiRouter.use("/school-registration", schoolRegistrationRouter);
apiRouter.use("/admin/school-registrations", adminSchoolRegistrationRouter);
apiRouter.use("/admin/database", adminDatabaseRouter);

export default apiRouter;
