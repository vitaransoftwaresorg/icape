import PDFDocument from "pdfkit";
import type { Response } from "express";
import { exportFilename } from "./student-list-documents";

export type ApprovedSchoolExportRow = {
  schoolName: string;
  schoolCode: string;
  contactName: string;
  phone: string;
  city: string;
  state: string;
  status: string;
  studentCount: number;
  imoCount: number;
  ieoCount: number;
  isoCount: number;
  olympiadTotal: number;
  amountExpected: number;
};

function formatMoney(amount: number) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

export function writeApprovedSchoolsPdf(
  res: Response,
  rows: ApprovedSchoolExportRow[],
  search?: string,
) {
  const filename = exportFilename("i-cape-approved-schools", "pdf", {
    olympiadYear: search ? "filtered" : "all",
  });
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 24,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-store");
  doc.pipe(res);

  doc
    .fontSize(16)
    .fillColor("#0d173b")
    .text("Approved schools — olympiad registration");
  doc
    .moveDown(0.3)
    .fontSize(10)
    .fillColor("#5b6785")
    .text(
      `${rows.length} school${rows.length === 1 ? "" : "s"}${
        search ? ` · Filter: ${search}` : ""
      } · Generated ${new Date().toLocaleString("en-IN")}`,
    );
  doc.moveDown(0.5);

  const headers = [
    "#",
    "School",
    "Code",
    "Contact",
    "Status",
    "IMO",
    "IEO",
    "ISO",
    "Entries",
    "Students",
    "Payment",
  ];
  const widths = [28, 130, 70, 100, 70, 40, 40, 40, 48, 55, 70];
  const startX = doc.page.margins.left;
  let y = doc.y;
  const rowHeight = 22;

  function drawHeader() {
    let x = startX;
    doc
      .rect(
        startX,
        y,
        widths.reduce((a, b) => a + b, 0),
        rowHeight,
      )
      .fill("#0d173b");
    doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold");
    headers.forEach((header, i) => {
      doc.text(header, x + 3, y + 7, { width: widths[i] - 6, ellipsis: true });
      x += widths[i];
    });
    y += rowHeight;
    doc.font("Helvetica").fillColor("#0d173b");
  }

  drawHeader();

  rows.forEach((row, index) => {
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
    }
    if (index % 2 === 1) {
      doc
        .rect(
          startX,
          y,
          widths.reduce((a, b) => a + b, 0),
          rowHeight,
        )
        .fill("#f4f7fb");
      doc.fillColor("#0d173b");
    }
    const location = [row.city, row.state].filter(Boolean).join(", ");
    const contact = [row.contactName || "—", row.phone || ""]
      .filter(Boolean)
      .join(" · ");
    const cells = [
      String(index + 1),
      `${row.schoolName || "—"}${location ? `\n${location}` : ""}`,
      row.schoolCode || "—",
      contact,
      row.status || "—",
      String(row.imoCount || 0),
      String(row.ieoCount || 0),
      String(row.isoCount || 0),
      String(row.olympiadTotal || 0),
      String(row.studentCount || 0),
      formatMoney(row.amountExpected || 0),
    ];
    let x = startX;
    cells.forEach((cell, i) => {
      doc.fontSize(7).text(cell, x + 3, y + 5, {
        width: widths[i] - 6,
        height: rowHeight - 6,
        ellipsis: true,
        lineBreak: i === 1 || i === 3,
      });
      x += widths[i];
    });
    y += rowHeight;
  });

  doc.end();
}
