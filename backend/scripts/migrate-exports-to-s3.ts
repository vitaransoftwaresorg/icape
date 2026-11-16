/**
 * One-shot: upload local storage/exports files to SeaweedFS and update StudentExportJob.filePath.
 * Usage (on server): npx tsx scripts/migrate-exports-to-s3.ts
 */
import { readdir, readFile, access } from "fs/promises";
import path from "path";
import { PrismaClient } from "@prisma/client";
import {
  isS3KeyRef,
  putObject,
  toS3KeyRef,
} from "../src/lib/object-storage";

const prisma = new PrismaClient();
const EXPORT_DIR = path.join(process.cwd(), "storage", "exports");

async function main() {
  const jobs = await prisma.studentExportJob.findMany({
    where: { filePath: { not: null } },
    select: { id: true, filePath: true, fileName: true },
  });

  let migrated = 0;
  let skipped = 0;

  for (const job of jobs) {
    if (!job.filePath || isS3KeyRef(job.filePath)) {
      skipped += 1;
      continue;
    }

    try {
      await access(job.filePath);
    } catch {
      console.warn(`missing local file for job ${job.id}: ${job.filePath}`);
      skipped += 1;
      continue;
    }

    const ext = path.extname(job.filePath).replace(".", "") || "bin";
    const key = `exports/${job.id}.${ext}`;
    const body = await readFile(job.filePath);
    const contentType =
      ext === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : ext === "pdf"
          ? "application/pdf"
          : "application/octet-stream";

    await putObject({ key, body, contentType });
    await prisma.studentExportJob.update({
      where: { id: job.id },
      data: { filePath: toS3KeyRef(key) },
    });
    migrated += 1;
    console.log(`migrated ${job.id} -> s3:${key}`);
  }

  // Orphan files in exports dir (no job) — still upload under orphans/
  try {
    const files = await readdir(EXPORT_DIR);
    for (const name of files) {
      const full = path.join(EXPORT_DIR, name);
      const key = `exports/orphans/${name}`;
      const body = await readFile(full);
      await putObject({
        key,
        body,
        contentType: name.endsWith(".pdf")
          ? "application/pdf"
          : "application/octet-stream",
      });
      console.log(`uploaded orphan ${name} -> s3:${key}`);
    }
  } catch {
    /* dir may be empty */
  }

  console.log(JSON.stringify({ migrated, skipped }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
