import * as XLSX from "xlsx-js-style";
import { JobCardData, ServiceType } from "@/types/jobCard";

type CellStyle = {
  font?: {
    bold?: boolean;
    sz?: number;
    color?: { rgb: string };
    name?: string;
  };
  alignment?: {
    horizontal?: "left" | "center" | "right";
    vertical?: "top" | "center" | "bottom";
    wrapText?: boolean;
  };
  fill?: {
    patternType?: "solid";
    fgColor?: { rgb: string };
  };
  border?: {
    top?: { style: "thin" | "medium"; color: { rgb: string } };
    right?: { style: "thin" | "medium"; color: { rgb: string } };
    bottom?: { style: "thin" | "medium"; color: { rgb: string } };
    left?: { style: "thin" | "medium"; color: { rgb: string } };
  };
};

const BORDER_THIN = { style: "thin" as const, color: { rgb: "222222" } };
const BORDER_MEDIUM = { style: "medium" as const, color: { rgb: "222222" } };

const baseCellStyle: CellStyle = {
  font: { name: "Calibri", sz: 9 },
  alignment: { horizontal: "left", vertical: "center", wrapText: true },
  border: {
    top: BORDER_THIN,
    right: BORDER_THIN,
    bottom: BORDER_THIN,
    left: BORDER_THIN,
  },
};

const labelStyle: CellStyle = {
  ...baseCellStyle,
  font: { name: "Calibri", sz: 8.5, bold: true },
};

const centerBoldStyle: CellStyle = {
  ...baseCellStyle,
  font: { name: "Calibri", sz: 9, bold: true },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
};

const sectionHeaderStyle: CellStyle = {
  ...centerBoldStyle,
  fill: { patternType: "solid", fgColor: { rgb: "D9D9D9" } },
};

const topBandStyle: CellStyle = {
  ...baseCellStyle,
  fill: { patternType: "solid", fgColor: { rgb: "2F2F2F" } },
  border: {
    top: BORDER_MEDIUM,
    right: BORDER_MEDIUM,
    bottom: BORDER_MEDIUM,
    left: BORDER_MEDIUM,
  },
};

const TITLE_COLUMNS = 20;
const LAST_ROW = 58;

const serviceTypeLabels: Record<ServiceType, string> = {
  service_contract: "SERVICE CONTRACT",
  warranty: "WARRANTY",
  customer_request: "CUSTOMER REQUEST",
  breakdown_call: "BREAKDOWN CALL",
};

function colLetter(index: number): string {
  return XLSX.utils.encode_col(index);
}

function addr(row: number, col: number): string {
  return `${colLetter(col)}${row}`;
}

function setCell(
  ws: XLSX.WorkSheet,
  row: number,
  col: number,
  value: string | number,
  style: CellStyle = baseCellStyle
) {
  const cellAddress = addr(row, col);
  ws[cellAddress] = {
    t: typeof value === "number" ? "n" : "s",
    v: value,
    s: style,
  };
}

function setMerged(
  ws: XLSX.WorkSheet,
  range: string,
  value: string | number,
  style: CellStyle = baseCellStyle
) {
  if (!ws["!merges"]) ws["!merges"] = [];
  ws["!merges"].push(XLSX.utils.decode_range(range));
  const start = XLSX.utils.decode_range(range).s;
  setCell(ws, start.r + 1, start.c, value, style);
}

function applyStyleToRange(ws: XLSX.WorkSheet, range: string, style: CellStyle) {
  const decoded = XLSX.utils.decode_range(range);
  for (let r = decoded.s.r; r <= decoded.e.r; r += 1) {
    for (let c = decoded.s.c; c <= decoded.e.c; c += 1) {
      const a = XLSX.utils.encode_cell({ r, c });
      const existing = ws[a]?.v ?? "";
      ws[a] = {
        t: typeof existing === "number" ? "n" : "s",
        v: existing,
        s: style,
      };
    }
  }
}

function tickLabel(active: boolean, text: string): string {
  return `${active ? "☑" : "☐"} ${text}`;
}

export function generateExcel(data: JobCardData) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([]);

  ws["!cols"] = [
    { wch: 8 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 10 },
    { wch: 8 },
    { wch: 9 },
    { wch: 10 },
    { wch: 8 },
    { wch: 8 },
    { wch: 9 },
    { wch: 10 },
    { wch: 8 },
    { wch: 9 },
    { wch: 8 },
    { wch: 9 },
    { wch: 10 },
    { wch: 12 },
  ];

  ws["!rows"] = Array.from({ length: LAST_ROW }, (_, idx) => {
    const row = idx + 1;
    if (row === 1) return { hpt: 10 };
    if (row === 3) return { hpt: 22 };
    if (row >= 15 && row <= 16) return { hpt: 26 };
    if (row >= 17 && row <= 34) return { hpt: 22 };
    if (row >= 38 && row <= 40) return { hpt: 24 };
    return { hpt: 20 };
  });

  for (let row = 1; row <= LAST_ROW; row += 1) {
    for (let col = 0; col < TITLE_COLUMNS; col += 1) {
      setCell(ws, row, col, "", baseCellStyle);
    }
  }

  setMerged(ws, "A1:T1", "", topBandStyle);
  setMerged(ws, "A3:T3", "FIELD SERVICE REPORT (INTERNAL)", {
    ...centerBoldStyle,
    font: { name: "Calibri", sz: 12, bold: true },
    border: {
      top: BORDER_MEDIUM,
      right: BORDER_MEDIUM,
      bottom: BORDER_MEDIUM,
      left: BORDER_MEDIUM,
    },
  });

  setMerged(ws, "A4:T4", `REF NO: ${data.customerInfo.refNo || "XXXXXXX"}`, labelStyle);

  const setTriBlockRow = (
    row: number,
    leftLabel: string,
    leftValue: string,
    midLabel: string,
    midValue: string,
    rightLabel: string,
    rightValue: string
  ) => {
    setMerged(ws, `A${row}:B${row}`, leftLabel, labelStyle);
    setMerged(ws, `C${row}:E${row}`, leftValue, baseCellStyle);
    setMerged(ws, `F${row}:J${row}`, midLabel, labelStyle);
    setMerged(ws, `K${row}:M${row}`, midValue, baseCellStyle);
    setMerged(ws, `N${row}:P${row}`, rightLabel, labelStyle);
    setMerged(ws, `Q${row}:T${row}`, rightValue, baseCellStyle);
  };

  setTriBlockRow(
    5,
    "CUSTOMER NAME",
    data.customerInfo.customerName,
    "DATE",
    data.customerInfo.date,
    "JOB CARD NO.",
    data.customerInfo.jobCardNo
  );
  setTriBlockRow(
    6,
    "CUSTOMER CODE",
    data.customerInfo.customerCode,
    "ATTENTION OF",
    data.customerInfo.attentionOf,
    "DOCUMENT DATE:",
    data.customerInfo.date
  );
  setTriBlockRow(
    7,
    "EMAIL",
    data.customerInfo.email,
    "CONTACT NO:",
    data.customerInfo.contactNo,
    "SALES AREA:",
    data.customerInfo.salesArea
  );

  setMerged(ws, "A8:B8", "PURPOSE OF VISIT", labelStyle);
  setMerged(ws, "C8:E8", tickLabel(data.serviceType === "service_contract", serviceTypeLabels.service_contract), {
    ...baseCellStyle,
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
  });
  setMerged(ws, "F8:J8", tickLabel(data.serviceType === "warranty", serviceTypeLabels.warranty), {
    ...baseCellStyle,
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
  });
  setMerged(ws, "K8:M8", tickLabel(data.serviceType === "customer_request", serviceTypeLabels.customer_request), {
    ...baseCellStyle,
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
  });
  setMerged(ws, "N8:T8", tickLabel(data.serviceType === "breakdown_call", serviceTypeLabels.breakdown_call), {
    ...baseCellStyle,
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
  });

  setMerged(ws, "A9:E9", "EQUIPMENT DETAILS", sectionHeaderStyle);
  applyStyleToRange(ws, "F9:T9", sectionHeaderStyle);

  setTriBlockRow(10, "MODEL", "", "TOTAL TRAVEL HRS", "", "SERVICE ENGINEER:", "");
  setTriBlockRow(11, "BRAND DESCRIPTION", "", "TOTAL WORK HOURS", "", "EMPLOYEE CODE", "");
  setTriBlockRow(12, "PART NO", "", "NO. OF VISIT", "1", "CUSTOMER P.O. Ref :", "");
  setTriBlockRow(13, "SERIAL NO", "", "FOLLOW UP ACTIONS", "", "NETSUITE INVOICE NO:", "");
  setTriBlockRow(14, "YEAR", "", "", "", "PENDING PAYMENT", "NETSUITE AGEING REPORT:");

  setMerged(ws, "A15:D15", "CHECKS PERFORMED\n(ENCLOSED DETAILED CHECKLIST)", sectionHeaderStyle);
  setMerged(ws, "E15:H15", "WORK REQUIRED", sectionHeaderStyle);
  setMerged(ws, "I15:M15", "ESTIMATE", sectionHeaderStyle);
  setMerged(ws, "N15:T15", "ACTUAL (INVOICE)", sectionHeaderStyle);

  setMerged(ws, "A16:A16", "", centerBoldStyle);
  setMerged(ws, "B16:D16", "ITEM CODE AND\nDESCRIPTION.", centerBoldStyle);
  setMerged(ws, "E16:G16", "PART NUMBER", centerBoldStyle);
  setMerged(ws, "H16:H16", "QTY", centerBoldStyle);
  setMerged(ws, "I16:I16", "Estimated\nWork Hrs.", centerBoldStyle);
  setMerged(ws, "J16:J16", "Labour Chrgs/\nhr", centerBoldStyle);
  setMerged(ws, "K16:K16", "Qty.", centerBoldStyle);
  setMerged(ws, "L16:L16", "Unit Price", centerBoldStyle);
  setMerged(ws, "M16:M16", "Total Price", centerBoldStyle);
  setMerged(ws, "N16:N16", "Actual Work Hrs.", centerBoldStyle);
  setMerged(ws, "O16:O16", "Labour\nChrgs/ hr", centerBoldStyle);
  setMerged(ws, "P16:P16", "Qty.", centerBoldStyle);
  setMerged(ws, "Q16:Q16", "Unit Price", centerBoldStyle);
  setMerged(ws, "R16:R16", "Taxable Amt", centerBoldStyle);
  setMerged(ws, "S16:T16", "Gross Amount\nIncl. VAT", centerBoldStyle);

  const checklistLines = data.compressorChecklist.map((item) => `${item.id}: ${item.description}`);
  const rowStart = 17;

  for (let r = rowStart; r <= 34; r += 1) {
    const idx = r - rowStart;
    const checkValue = checklistLines[idx] || "";
    const partValue = data.parts[idx]?.description || "";
    const qty = data.parts[idx]?.qty ?? "";
    const unitPrice = data.parts[idx]?.unitPrice ?? "";
    const totalPrice = data.parts[idx]?.totalPrice ?? "";
    const laborHours = data.labor[idx]?.hours ?? "";
    const laborRate = data.labor[idx]?.ratePerHour ?? "";

    setCell(ws, r, 0, idx < checklistLines.length ? idx + 1 : "", {
      ...baseCellStyle,
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
    });
    setMerged(ws, `B${r}:D${r}`, checkValue, baseCellStyle);
    setMerged(ws, `E${r}:G${r}`, partValue, baseCellStyle);
    setCell(ws, r, 7, qty as string | number, {
      ...baseCellStyle,
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
    });
    setCell(ws, r, 8, laborHours as string | number, {
      ...baseCellStyle,
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
    });
    setCell(ws, r, 9, laborRate as string | number, {
      ...baseCellStyle,
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
    });
    setCell(ws, r, 10, qty as string | number, {
      ...baseCellStyle,
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
    });
    setCell(ws, r, 11, unitPrice as string | number, baseCellStyle);
    setCell(ws, r, 12, totalPrice as string | number, baseCellStyle);

    setCell(ws, r, 13, laborHours as string | number, {
      ...baseCellStyle,
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
    });
    setCell(ws, r, 14, laborRate as string | number, {
      ...baseCellStyle,
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
    });
    setCell(ws, r, 15, qty as string | number, {
      ...baseCellStyle,
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
    });
    setCell(ws, r, 16, unitPrice as string | number, baseCellStyle);
    setCell(ws, r, 17, totalPrice as string | number, baseCellStyle);

    const gross = typeof totalPrice === "number" ? totalPrice * 1.05 : "";
    setMerged(ws, `S${r}:T${r}`, gross as string | number, baseCellStyle);
  }

  const totalLabor = data.labor.reduce((sum, row) => sum + row.totalCost, 0);

  setMerged(ws, "A35:M35", "TOTAL LABOR COST", labelStyle);
  setCell(ws, 35, 13, totalLabor as string | number, baseCellStyle); // N is 13
  setCell(ws, 35, 14, "", baseCellStyle); // O
  setCell(ws, 35, 15, "", baseCellStyle); // P
  setCell(ws, 35, 16, "", baseCellStyle); // Q
  setCell(ws, 35, 17, "", baseCellStyle); // R
  setMerged(ws, "S35:T35", "", baseCellStyle);

  setMerged(ws, "A36:M36", "OUTSOURCED ACTIVITY IF ANY", labelStyle);
  setCell(ws, 36, 13, "", baseCellStyle);
  setCell(ws, 36, 14, "", baseCellStyle);
  setCell(ws, 36, 15, "", baseCellStyle);
  setCell(ws, 36, 16, "", baseCellStyle);
  setCell(ws, 36, 17, "", baseCellStyle);
  setMerged(ws, "S36:T36", "", baseCellStyle);

  setMerged(ws, "A37:M37", "OTHER EXPENSES:", labelStyle);
  setCell(ws, 37, 13, data.otherExpenses as string | number, baseCellStyle);
  setCell(ws, 37, 14, "", baseCellStyle);
  setCell(ws, 37, 15, "", baseCellStyle);
  setCell(ws, 37, 16, "", baseCellStyle);
  setCell(ws, 37, 17, "", baseCellStyle);
  setMerged(ws, "S37:T37", "", baseCellStyle);

  setMerged(ws, "A38:D38", "TECHNICIAN:", centerBoldStyle);
  setMerged(ws, "A39:D39", "SUPERVISOR:", centerBoldStyle);
  setMerged(ws, "A40:D40", "", centerBoldStyle);
  setMerged(ws, "E38:J38", "", baseCellStyle);
  setMerged(ws, "E39:J39", "", baseCellStyle);
  setMerged(ws, "E40:J40", "", baseCellStyle);

  setMerged(ws, "K38:M38", "COST AND ESTIMATION\n(C & E):", centerBoldStyle);
  setMerged(ws, "K39:M39", "MANAGER:", centerBoldStyle);
  setMerged(ws, "K40:M40", "", centerBoldStyle);
  setMerged(ws, "N38:O38", "", baseCellStyle);
  setMerged(ws, "N39:O39", "", baseCellStyle);
  setMerged(ws, "N40:O40", "", baseCellStyle);

  setMerged(ws, "P38:Q38", "SUPERVISOR:", centerBoldStyle);
  setMerged(ws, "P39:Q39", "MANAGER:", centerBoldStyle);
  setMerged(ws, "P40:Q40", "ACCOUNTANT:", centerBoldStyle);
  setMerged(ws, "R38:T38", "", baseCellStyle);
  setMerged(ws, "R39:T39", "", baseCellStyle);
  setMerged(ws, "R40:T40", "", baseCellStyle);

  setMerged(ws, "A42:A42", "NOTE:", labelStyle);
  setMerged(ws, "B42:T42", "TO BE UTILIZED FOR GPS / INCENTIVE / COMPLAINTS / FINAL INVOICE", labelStyle);

  applyStyleToRange(ws, "A1:T58", baseCellStyle);
  applyStyleToRange(ws, "A1:T1", topBandStyle);
  applyStyleToRange(ws, "A3:T3", {
    ...centerBoldStyle,
    font: { name: "Calibri", sz: 12, bold: true },
    border: {
      top: BORDER_MEDIUM,
      right: BORDER_MEDIUM,
      bottom: BORDER_MEDIUM,
      left: BORDER_MEDIUM,
    },
  });
  applyStyleToRange(ws, "A15:T15", sectionHeaderStyle);

  ws["!ref"] = `A1:T${LAST_ROW}`;

  XLSX.utils.book_append_sheet(wb, ws, "Field Service Report");
  XLSX.writeFile(wb, `FieldServiceReport_${data.customerInfo.jobCardNo || "report"}.xlsx`);
}
