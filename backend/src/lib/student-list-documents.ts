import { createWriteStream, existsSync, readFileSync } from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import type { Response } from "express";
import type { WriteStream } from "fs";

export const OLYMPIAD_YEAR_LABEL = "2026-2027";

export type StudentListExportRow = {
  registrationNumber: string;
  name: string;
  grade: number;
  section: string;
  imo: boolean;
  iso: boolean;
  ieo: boolean;
  schoolCode: string;
  schoolName: string;
  city: string;
  state: string;
};

export type StudentListFilterMeta = {
  olympiad?: string;
  grade?: number;
};

export function formatStudentListFilters(meta?: StudentListFilterMeta) {
  const olympiadLabel = meta?.olympiad?.trim()
    ? meta.olympiad.trim().toUpperCase()
    : "All olympiads";
  const classLabel =
    meta?.grade != null ? `Class ${meta.grade}` : "All classes";
  return {
    olympiadLabel,
    classLabel,
    summaryLine: `Olympiad: ${olympiadLabel}  |  Class: ${classLabel}`,
  };
}

function resolveLogoPath() {
  const candidates = [
    path.join(process.cwd(), "assets/icape-logo.png"),
    path.join(__dirname, "../../assets/icape-logo.png"),
  ];
  return candidates.find((p) => existsSync(p)) || null;
}

function getLogoDataUri() {
  const logoPath = resolveLogoPath();
  if (!logoPath) return "";
  return `data:image/png;base64,${readFileSync(logoPath).toString("base64")}`;
}

export function olympiadFlags(row: {
  imo: boolean;
  iso: boolean;
  ieo: boolean;
}) {
  return [row.imo ? "IMO" : null, row.iso ? "ISO" : null, row.ieo ? "IEO" : null]
    .filter(Boolean)
    .join(", ");
}

export function exportFilename(
  prefix: string,
  ext: string,
  query: {
    schoolCode?: string;
    schoolName?: string;
    olympiad?: string;
    grade?: number;
    olympiadYear?: string;
  },
) {
  const schoolLabel = query.schoolName?.trim() || query.schoolCode;
  const parts = [
    schoolLabel ? null : prefix,
    schoolLabel,
    query.olympiad,
    query.grade != null ? `G${query.grade}` : null,
    query.olympiadYear,
  ]
    .filter(Boolean)
    .map((part) =>
      String(part)
        .trim()
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean);
  return `${parts.join("-") || prefix}.${ext}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function groupStudentsBySchool(students: StudentListExportRow[]) {
  const groups: Array<{
    schoolCode: string;
    schoolName: string;
    city: string;
    state: string;
    students: StudentListExportRow[];
  }> = [];
  const index = new Map<string, number>();
  for (const row of students) {
    const key = `${row.schoolCode}::${row.schoolName}`;
    const existing = index.get(key);
    if (existing === undefined) {
      index.set(key, groups.length);
      groups.push({
        schoolCode: row.schoolCode,
        schoolName: row.schoolName,
        city: row.city,
        state: row.state,
        students: [row],
      });
    } else {
      groups[existing].students.push(row);
    }
  }
  return groups;
}

export function buildStudentListPrintHtml(
  students: StudentListExportRow[],
  filters?: StudentListFilterMeta,
) {
  const groups = groupStudentsBySchool(students);
  const logoSrc = getLogoDataUri();
  const filterText = formatStudentListFilters(filters);

  const sections =
    groups.length === 0
      ? `<section class="school"><p class="empty">No students for the selected filters.</p></section>`
      : groups
          .map((group, groupIdx) => {
            const rows = group.students
              .map(
                (row, index) => `<tr>
  <td class="num">${index + 1}</td>
  <td class="mono">${escapeHtml(row.registrationNumber)}</td>
  <td>${escapeHtml(row.name)}</td>
  <td>${escapeHtml(String(row.grade))}</td>
  <td>${escapeHtml(row.section || "—")}</td>
  <td>${escapeHtml(olympiadFlags(row) || "—")}</td>
</tr>`,
              )
              .join("\n");
            return `<section class="school${groupIdx > 0 ? " break" : ""}">
  <header class="school-head">
    <div class="head-left">
      ${logoSrc ? `<img src="${logoSrc}" alt="i-CAPE" />` : `<span class="logo-fallback">i-CAPE</span>`}
    </div>
    <div class="head-center">
      <h2>${escapeHtml(group.schoolName || "Unnamed school")}</h2>
      <p class="filter-line">${escapeHtml(filterText.summaryLine)}</p>
    </div>
    <div class="head-right">
      <p>School Code : ${escapeHtml(group.schoolCode || "—")}</p>
      <p>${OLYMPIAD_YEAR_LABEL}</p>
    </div>
  </header>
  <table>
    <thead>
      <tr>
        <th class="num">S.No.</th>
        <th>Reg. No.</th>
        <th>Student</th>
        <th>Grade</th>
        <th>Sec</th>
        <th>Olympiads</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
          })
          .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>i-CAPE Student List</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px 20px;
      color: #0f172a;
      background: #fff;
      font: 12px/1.4 Helvetica, Arial, sans-serif;
    }
    .school { margin: 0; }
    .school.break { page-break-before: always; break-before: page; }
    .school-head {
      display: grid;
      grid-template-columns: 140px 1fr 180px;
      align-items: center;
      gap: 12px;
      border: 1px solid #d5dce8;
      border-bottom: 3px solid #d4af37;
      background: #f5f7fb;
      padding: 10px 12px;
      margin-bottom: 0;
    }
    .head-left img {
      display: block;
      height: 52px;
      width: auto;
      max-width: 130px;
      object-fit: contain;
    }
    .logo-fallback {
      font-weight: 700;
      font-size: 18px;
      color: #0d173b;
    }
    .head-center { text-align: center; min-width: 0; }
    .head-center h2 {
      margin: 0;
      font-size: 16px;
      color: #0d173b;
      line-height: 1.25;
    }
    .filter-line {
      margin: 4px 0 0;
      color: #475569;
      font-size: 11px;
      font-weight: 600;
    }
    .head-right {
      text-align: right;
      color: #0d173b;
      font-size: 12px;
      font-weight: 600;
    }
    .head-right p { margin: 0; }
    .head-right p + p { margin-top: 4px; font-weight: 500; color: #475569; }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid #d5dce8;
      padding: 5px 6px;
      text-align: left;
      vertical-align: top;
      word-wrap: break-word;
    }
    th { background: #0d173b; color: #fff; font-size: 11px; }
    td { font-size: 11px; }
    th.num, td.num { width: 48px; text-align: center; }
    tr:nth-child(even) td { background: #f8fafc; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .empty { text-align: center; color: #64748b; padding: 24px; }
    @page { size: A4 landscape; margin: 10mm; }
    @media print {
      body { padding: 0; }
      th, .school-head, tr:nth-child(even) td {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      th { background: #0d173b !important; color: #fff !important; }
    }
  </style>
</head>
<body>
  ${sections}
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () {
        window.focus();
        window.print();
      }, 200);
    });
  </script>
</body>
</html>`;
}

export function writeStudentListPdf(
  res: Response,
  students: StudentListExportRow[],
  filename: string,
  filters?: StudentListFilterMeta,
) {
  const doc = new PDFDocument({
    margin: 28,
    size: "A4",
    layout: "landscape",
    autoFirstPage: true,
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);

  const NAVY = "#0D173B";
  const GOLD = "#D4AF37";
  const WHITE = "#FFFFFF";
  const MUTED = "#475569";
  const SOFT = "#F5F7FB";
  const BORDER = "#D5DCE8";
  const ROW_ALT = "#F8FAFC";
  const INK = "#0F172A";
  const filterText = formatStudentListFilters(filters);

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const margin = 28;
  const width = pageW - margin * 2;
  let y = margin;
  const logoPath = resolveLogoPath();
  const groups = groupStudentsBySchool(students);
  type SchoolGroup = (typeof groups)[number];

  const cols = [
    { key: "sno", label: "S.No.", w: 42 },
    { key: "reg", label: "Reg. No.", w: 100 },
    { key: "name", label: "Student", w: 0 },
    { key: "grade", label: "Grade", w: 55 },
    { key: "sec", label: "Sec", w: 50 },
    { key: "oly", label: "Olympiads", w: 120 },
  ];
  {
    const fixed = cols.reduce((sum, col) => sum + col.w, 0);
    cols[2].w = Math.max(180, width - fixed);
  }

  const rowH = 18;
  const headerH = 20;
  const schoolHeadH = 68;
  const xFor = (index: number) => {
    let x = margin;
    for (let i = 0; i < index; i++) x += cols[i].w;
    return x;
  };

  const strokeCellBorder = (
    x: number,
    cellY: number,
    cellW: number,
    cellHeight: number,
  ) => {
    doc
      .lineWidth(0.6)
      .strokeColor(BORDER)
      .rect(x, cellY, cellW, cellHeight)
      .stroke();
  };

  const cell = (
    text: string,
    x: number,
    cellY: number,
    cellW: number,
    color: string,
    bold = false,
    cellHeight = rowH,
    align: "left" | "center" = "left",
  ) => {
    doc.save();
    doc.rect(x, cellY, cellW, cellHeight).clip();
    doc
      .fillColor(color)
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(8)
      .text(text, x + 4, cellY + 5, {
        width: cellW - 8,
        height: cellHeight - 6,
        ellipsis: true,
        lineBreak: false,
        align,
      });
    doc.restore();
  };

  const drawPageChrome = () => {
    doc.save();
    doc.rect(0, 0, pageW, pageH).fill(WHITE);
    doc.restore();
  };

  const drawSchoolHeader = (group: SchoolGroup) => {
    y = margin;
    const leftW = 130;
    const rightW = 170;
    const centerX = margin + leftW;
    const centerW = width - leftW - rightW;

    doc.save();
    doc.rect(margin, y, width, schoolHeadH).fill(SOFT);
    doc
      .lineWidth(0.8)
      .strokeColor(BORDER)
      .rect(margin, y, width, schoolHeadH)
      .stroke();
    doc.rect(margin, y + schoolHeadH - 3, width, 3).fill(GOLD);
    doc.restore();

    if (logoPath) {
      try {
        doc.image(logoPath, margin + 10, y + 12, { fit: [110, 42] });
      } catch {
        doc
          .fillColor(NAVY)
          .font("Helvetica-Bold")
          .fontSize(14)
          .text("i-CAPE", margin + 10, y + 24, { width: leftW - 20 });
      }
    } else {
      doc
        .fillColor(NAVY)
        .font("Helvetica-Bold")
        .fontSize(14)
        .text("i-CAPE", margin + 10, y + 24, { width: leftW - 20 });
    }

    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(13)
      .text(group.schoolName || "Unnamed school", centerX, y + 14, {
        width: centerW,
        align: "center",
        lineBreak: false,
      });
    doc
      .fillColor(MUTED)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(filterText.summaryLine, centerX, y + 34, {
        width: centerW,
        align: "center",
        lineBreak: false,
      });

    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(
        `School Code : ${group.schoolCode || "—"}`,
        margin + width - rightW,
        y + 18,
        { width: rightW - 10, align: "right", lineBreak: false },
      );
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(10)
      .text(OLYMPIAD_YEAR_LABEL, margin + width - rightW, y + 36, {
        width: rightW - 10,
        align: "right",
        lineBreak: false,
      });

    y += schoolHeadH + 8;
  };

  const drawTableHeader = () => {
    doc.save();
    doc.rect(margin, y, width, headerH).fill(NAVY);
    doc.restore();
    cols.forEach((col, i) => {
      const x = xFor(i);
      cell(
        col.label,
        x,
        y,
        col.w,
        WHITE,
        true,
        headerH,
        i === 0 ? "center" : "left",
      );
      strokeCellBorder(x, y, col.w, headerH);
    });
    y += headerH;
  };

  const drawDataRow = (values: string[], index: number) => {
    if (index % 2 === 1) {
      doc.save();
      doc.rect(margin, y, width, rowH).fill(ROW_ALT);
      doc.restore();
    }
    values.forEach((value, i) => {
      const x = xFor(i);
      cell(
        value,
        x,
        y,
        cols[i].w,
        INK,
        i === 2,
        rowH,
        i === 0 ? "center" : "left",
      );
      strokeCellBorder(x, y, cols[i].w, rowH);
    });
    y += rowH;
  };

  const startSchoolPage = (group: SchoolGroup, isFirstPage: boolean) => {
    if (!isFirstPage) {
      doc.addPage({ size: "A4", layout: "landscape", margin: 28 });
    }
    drawPageChrome();
    drawSchoolHeader(group);
    drawTableHeader();
  };

  if (!groups.length) {
    drawPageChrome();
    y = margin;
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(10)
      .text("No students for the selected filters.", margin, y + 12, {
        width,
        align: "center",
      });
    doc.end();
    return;
  }

  groups.forEach((group, groupIdx) => {
    startSchoolPage(group, groupIdx === 0);
    group.students.forEach((row, index) => {
      if (y + rowH > pageH - margin - 16) {
        startSchoolPage(group, false);
      }
      drawDataRow(
        [
          String(index + 1),
          row.registrationNumber,
          row.name,
          String(row.grade),
          row.section || "—",
          olympiadFlags(row) || "—",
        ],
        index,
      );
    });
  });

  doc.end();
}

/** Stream a branded student list PDF to disk (for async high-volume exports). */
export function createStudentListPdfFileWriter(
  filePath: string,
  filters?: StudentListFilterMeta,
) {
  const doc = new PDFDocument({
    margin: 28,
    size: "A4",
    layout: "landscape",
    autoFirstPage: true,
  });
  const out: WriteStream = createWriteStream(filePath);
  doc.pipe(out);

  const NAVY = "#0D173B";
  const GOLD = "#D4AF37";
  const WHITE = "#FFFFFF";
  const MUTED = "#475569";
  const SOFT = "#F5F7FB";
  const BORDER = "#D5DCE8";
  const ROW_ALT = "#F8FAFC";
  const INK = "#0F172A";
  const filterText = formatStudentListFilters(filters);

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const margin = 28;
  const width = pageW - margin * 2;
  let y = margin;
  const logoPath = resolveLogoPath();

  const cols = [
    { key: "sno", label: "S.No.", w: 42 },
    { key: "reg", label: "Reg. No.", w: 100 },
    { key: "name", label: "Student", w: 0 },
    { key: "grade", label: "Grade", w: 55 },
    { key: "sec", label: "Sec", w: 50 },
    { key: "oly", label: "Olympiads", w: 120 },
  ];
  {
    const fixed = cols.reduce((sum, col) => sum + col.w, 0);
    cols[2].w = Math.max(180, width - fixed);
  }

  const rowH = 18;
  const headerH = 20;
  const schoolHeadH = 68;
  const xFor = (index: number) => {
    let x = margin;
    for (let i = 0; i < index; i++) x += cols[i].w;
    return x;
  };

  const strokeCellBorder = (
    x: number,
    cellY: number,
    cellW: number,
    cellHeight: number,
  ) => {
    doc
      .lineWidth(0.6)
      .strokeColor(BORDER)
      .rect(x, cellY, cellW, cellHeight)
      .stroke();
  };

  const cell = (
    text: string,
    x: number,
    cellY: number,
    cellW: number,
    color: string,
    bold = false,
    cellHeight = rowH,
    align: "left" | "center" = "left",
  ) => {
    doc.save();
    doc.rect(x, cellY, cellW, cellHeight).clip();
    doc
      .fillColor(color)
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(8)
      .text(text, x + 4, cellY + 5, {
        width: cellW - 8,
        height: cellHeight - 6,
        ellipsis: true,
        lineBreak: false,
        align,
      });
    doc.restore();
  };

  const drawPageChrome = () => {
    doc.save();
    doc.rect(0, 0, pageW, pageH).fill(WHITE);
    doc.restore();
  };

  type SchoolGroup = { schoolCode: string; schoolName: string };

  const drawSchoolHeader = (group: SchoolGroup) => {
    y = margin;
    const leftW = 130;
    const rightW = 170;
    const centerX = margin + leftW;
    const centerW = width - leftW - rightW;

    doc.save();
    doc.rect(margin, y, width, schoolHeadH).fill(SOFT);
    doc
      .lineWidth(0.8)
      .strokeColor(BORDER)
      .rect(margin, y, width, schoolHeadH)
      .stroke();
    doc.rect(margin, y + schoolHeadH - 3, width, 3).fill(GOLD);
    doc.restore();

    if (logoPath) {
      try {
        doc.image(logoPath, margin + 10, y + 12, { fit: [110, 42] });
      } catch {
        doc
          .fillColor(NAVY)
          .font("Helvetica-Bold")
          .fontSize(14)
          .text("i-CAPE", margin + 10, y + 24, { width: leftW - 20 });
      }
    } else {
      doc
        .fillColor(NAVY)
        .font("Helvetica-Bold")
        .fontSize(14)
        .text("i-CAPE", margin + 10, y + 24, { width: leftW - 20 });
    }

    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(13)
      .text(group.schoolName || "Unnamed school", centerX, y + 14, {
        width: centerW,
        align: "center",
        lineBreak: false,
      });
    doc
      .fillColor(MUTED)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(filterText.summaryLine, centerX, y + 34, {
        width: centerW,
        align: "center",
        lineBreak: false,
      });

    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(
        `School Code : ${group.schoolCode || "—"}`,
        margin + width - rightW,
        y + 18,
        { width: rightW - 10, align: "right", lineBreak: false },
      );
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(10)
      .text(OLYMPIAD_YEAR_LABEL, margin + width - rightW, y + 36, {
        width: rightW - 10,
        align: "right",
        lineBreak: false,
      });

    y += schoolHeadH + 8;
  };

  const drawTableHeader = () => {
    doc.save();
    doc.rect(margin, y, width, headerH).fill(NAVY);
    doc.restore();
    cols.forEach((col, i) => {
      const x = xFor(i);
      cell(
        col.label,
        x,
        y,
        col.w,
        WHITE,
        true,
        headerH,
        i === 0 ? "center" : "left",
      );
      strokeCellBorder(x, y, col.w, headerH);
    });
    y += headerH;
  };

  const drawDataRow = (values: string[], index: number) => {
    if (index % 2 === 1) {
      doc.save();
      doc.rect(margin, y, width, rowH).fill(ROW_ALT);
      doc.restore();
    }
    values.forEach((value, i) => {
      const x = xFor(i);
      cell(
        value,
        x,
        y,
        cols[i].w,
        INK,
        i === 2,
        rowH,
        i === 0 ? "center" : "left",
      );
      strokeCellBorder(x, y, cols[i].w, rowH);
    });
    y += rowH;
  };

  let currentSchool: SchoolGroup | null = null;
  let rowIndex = 0;
  let started = false;
  let wroteAny = false;

  const startSchoolPage = (group: SchoolGroup, isFirstPage: boolean) => {
    if (!isFirstPage) {
      doc.addPage({ size: "A4", layout: "landscape", margin: 28 });
    }
    drawPageChrome();
    drawSchoolHeader(group);
    drawTableHeader();
  };

  return {
    beginSchool(school: SchoolGroup) {
      currentSchool = school;
      rowIndex = 0;
      startSchoolPage(school, !started);
      started = true;
      wroteAny = true;
    },
    addStudent(row: {
      registrationNumber: string;
      name: string;
      grade: number;
      section: string;
      imo: boolean;
      iso: boolean;
      ieo: boolean;
    }) {
      if (!currentSchool) {
        throw new Error("beginSchool must be called before addStudent");
      }
      if (y + rowH > pageH - margin - 16) {
        startSchoolPage(currentSchool, false);
      }
      drawDataRow(
        [
          String(rowIndex + 1),
          row.registrationNumber,
          row.name,
          String(row.grade),
          row.section || "—",
          olympiadFlags(row) || "—",
        ],
        rowIndex,
      );
      rowIndex += 1;
    },
    end(): Promise<void> {
      return new Promise((resolve, reject) => {
        out.on("finish", () => resolve());
        out.on("error", reject);
        doc.on("error", reject);
        if (!wroteAny) {
          drawPageChrome();
          y = margin;
          doc
            .fillColor(MUTED)
            .font("Helvetica")
            .fontSize(10)
            .text("No students for the selected filters.", margin, y + 12, {
              width,
              align: "center",
            });
        }
        doc.end();
      });
    },
  };
}

export async function writeStudentListExcel(
  res: Response,
  students: StudentListExportRow[],
  filename: string,
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "i-CAPE";
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
  sheet.getRow(1).font = { bold: true };

  let lastSchoolKey = "";
  let serial = 0;
  for (const row of students) {
    const schoolKey = `${row.schoolCode}::${row.schoolName}`;
    if (schoolKey !== lastSchoolKey) {
      lastSchoolKey = schoolKey;
      serial = 0;
    }
    serial += 1;
    sheet.addRow({
      serial,
      schoolCode: row.schoolCode,
      schoolName: row.schoolName,
      registrationNumber: row.registrationNumber,
      name: row.name,
      grade: row.grade,
      section: row.section || "",
      olympiads: olympiadFlags(row),
    });
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}
