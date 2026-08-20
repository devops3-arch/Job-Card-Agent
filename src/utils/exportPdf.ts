import jsPDF from "jspdf";
import autoTable, { RowInput } from "jspdf-autotable";
import { ApiJob, JobCardData } from "@/types/jobCard";
import { computePricingSummary } from "@/lib/pricing";
import { formatStatus } from "@/lib/jobStatus";
import { CURRENCY, formatAmount, NOT_PRICED } from "@/lib/money";

/**
 * jspdf-autotable hangs the geometry of the table it just drew off the jsPDF
 * instance, but it does not declare that on jsPDF's own type — so reading where a
 * table ended needs this. Layout here is a running `y` cursor handed from one
 * table to the next, so every table but the first depends on it.
 */
type DocWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } };

/** Where the table drawn most recently ended. */
const lastTableBottom = (doc: jsPDF): number => (doc as DocWithAutoTable).lastAutoTable.finalY;

function triggerDownload(blob: Blob, filename: string) {
  // Force PDF mime type so browser & viewers recognize it correctly
  const pdfBlob = blob.type === "application/pdf"
    ? blob
    : new Blob([blob], { type: "application/pdf" });
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

type FooterImages = {
  kaeser: string;
  hanwha: string;
  excel: string;
  clivet: string;
  nederman: string;
  onsigen: string;
};

// Helper to load image as base64 — resolves to empty string on failure so PDF still generates
// Always converts to JPEG (white background, q=0.75) to keep PDF size small and viewer-friendly.
// Signatures with transparent PNG backgrounds look identical on white PDF pages.
async function loadImageAsBase64(url: string): Promise<string> {
  return new Promise((resolve) => {
    if (!url) { resolve(""); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        // Cap dimensions at 800px on longest side to limit data size
        const maxSide = 800;
        let w = img.naturalWidth || 1;
        let h = img.naturalHeight || 1;
        if (Math.max(w, h) > maxSide) {
          const scale = maxSide / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        // White background so transparent PNGs (signatures) look identical on white PDF page
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      } catch {
        resolve("");
      }
    };
    img.onerror = () => resolve("");
    img.src = url;
  });
}

function drawHeader(doc: jsPDF, pageWidth: number, headerImg: string) {
  if (!headerImg) return;
  const imgWidth = pageWidth - 28;
  const imgHeight = imgWidth * (97 / 600);
  doc.addImage(headerImg, "JPEG", 14, 8, imgWidth, imgHeight);
}

function drawFooter(doc: jsPDF, pageWidth: number, pageHeight: number, images: FooterImages) {
  const lineY = pageHeight - 21;
  const logosY = pageHeight - 17;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.line(14, lineY, pageWidth - 14, lineY);

  if (images.kaeser)   doc.addImage(images.kaeser,   "JPEG", 14,    logosY,       25, 8);
  if (images.hanwha)   doc.addImage(images.hanwha,   "JPEG", 43.2,  logosY + 0.5, 32, 7);
  if (images.excel)    doc.addImage(images.excel,    "JPEG", 79.4,  logosY - 0.5, 22, 9);
  if (images.clivet)   doc.addImage(images.clivet,   "JPEG", 105.6, logosY + 0.5, 32, 7);
  if (images.nederman) doc.addImage(images.nederman, "JPEG", 141.8, logosY + 0.5, 32, 7);
  if (images.onsigen)  doc.addImage(images.onsigen,  "JPEG", 178,   logosY - 1,   18, 10);
}

/**
 * Who signs the quotation, and how they are identified on it.
 *
 * Previously five if-else chains keyed on the same name string in five places —
 * designation, phone, signature image and image size — so adding a colleague meant
 * editing all of them and any one could be missed.
 */
type Signatory = { designation: string; phone: string; wideSignature?: boolean };

const DEFAULT_PHONE = "04-8132672";

const ENGINEERS: Record<string, Signatory> = {
  "Bijmon Mathai": { designation: "BDE-Service", phone: DEFAULT_PHONE },
  "Sinoy Syamalan": { designation: "Service Sales Engineer", phone: DEFAULT_PHONE },
  "Fasil Musthafa": { designation: "Sales Engineer", phone: "04-8132670(056-2812627)", wideSignature: true },
  "Sameer Lambay": { designation: "Assistant Service Manager", phone: "04-8132672(055-904-1721)" },
};

const MANAGERS: Record<string, Signatory> = {
  "Nitesh gawali": { designation: "Service Manager", phone: "04-8132672 (056-153-8433)" },
  "Arvind kumar Jaiswal": { designation: "Assistant Operations Manager", phone: "02-5545875 (055-376-7147)", wideSignature: true },
  "Mohan Krishnan": { designation: "Manager", phone: DEFAULT_PHONE },
};

/**
 * Draws one signatory column: signature, name, designation, phone.
 *
 * Both columns go through this, so the engineer and the manager blocks line up
 * with each other by construction rather than by two sets of coordinates that
 * have to be kept in step.
 */
const drawSignatory = (
  doc: jsPDF,
  x: number,
  signatureY: number,
  name: string,
  details: Signatory | undefined,
  signatureImage: string | null,
) => {
  if (signatureImage && signatureImage.length > 10) {
    if (details?.wideSignature) doc.addImage(signatureImage, "JPEG", x, signatureY - 6, 36, 12);
    else doc.addImage(signatureImage, "JPEG", x, signatureY - 4, 30, 9);
  }

  let lineY = signatureY + 11;
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bolditalic");
  doc.text(name, x, lineY);

  lineY += 5;
  if (details?.designation) doc.text(details.designation, x, lineY);

  lineY += 5;
  doc.text(details?.phone ?? DEFAULT_PHONE, x, lineY);

  return lineY;
};

export async function generateGlobalPDF(jobs: ApiJob[]) {
    const doc = new jsPDF({ compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const [headerImg, kaeserImg, hanwhaImg, excelImg, clivetImg, nedermanImg, onsigenImg] = await Promise.all([
        loadImageAsBase64("/images/bb-header-thumb.jpg"),
        loadImageAsBase64("/images/footer-kaeser.jpg"),
        loadImageAsBase64("/images/footer-hanwha.jpg"),
        loadImageAsBase64("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMjQwIiBoZWlnaHQ9IjEwMCIgZmlsbD0id2hpdGUiLz48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMjQwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjMkEzMzc1Ii8+PHRleHQgeD0iMTIwIiB5PSI2MCIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjYwIiBmb250LXdlaWdodD0iYm9sZCIgZm9udC1zdHlsZT0iaXRhbGljIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+RXhjZWw8L3RleHQ+PHJlY3QgeD0iMCIgeT0iODUiIHdpZHRoPSIyNDAiIGhlaWdodD0iMyIgZmlsbD0iI0QzMTIyNCIvPjx0ZXh0IHg9IjEyMCIgeT0iOTgiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxMiIgZm9udC13ZWlnaHQ9ImJvbGQiIGxldHRlci1zcGFjaW5nPSIzIiBmaWxsPSIjMkEzMzc1IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5NQUNISU5FIFRPT0xTPC90ZXh0Pjwvc3ZnPg=="),
        loadImageAsBase64("/images/footer-clivet.jpg"),
        loadImageAsBase64("/images/footer-nederman.png"),
        loadImageAsBase64("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iODAiPjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iODAiIGZpbGw9IndoaXRlIi8+PGNpcmNsZSBjeD0iMzAiIGN5PSI0MCIgcj0iMTUiIGZpbGw9IiMwMEEwREYiLz48Y2lyY2xlIGN4PSI1MCIgY3k9IjI1IiByPSIxMCIgZmlsbD0iIzAwNzdCNSIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNTUiIHI9IjgiIGZpbGw9IiM1NUM5RTYiLz48Y2lyY2xlIGN4PSIxNSIgY3k9IjI1IiByPSI2IiBmaWxsPSIjMDA1NThDIi8+PGNpcmNsZSBjeD0iMTUiIGN5PSI1NSIgcj0iNSIgZmlsbD0iIzAwQTBERiIvPjx0ZXh0IHg9Ijc1IiB5PSI1MCIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjMyIiBmb250LXdlaWdodD0ibm9ybWFsIiBmaWxsPSIjM0QzRDNEIj5vbnNpZ2VuPC90ZXh0Pjwvc3ZnPg=="),
    ]);

    const footerImages: FooterImages = {
        kaeser: kaeserImg,
        hanwha: hanwhaImg,
        excel: excelImg,
        clivet: clivetImg,
        nederman: nedermanImg,
        onsigen: onsigenImg,
    };

    drawHeader(doc, pageWidth, headerImg);

    autoTable(doc, {
        startY: 48,
        head: [['Job #', 'Customer', 'Technician', 'Date', 'Status', `Total (${CURRENCY})`]],
        body: jobs.map(job => [
            job.job_card_no,
            job.customer_name,
            job.engineer_name,
            job.job_date,
            formatStatus(job.status),
            job.grand_total ? formatAmount(job.grand_total) : NOT_PRICED
        ]),
        theme: 'grid',
        tableWidth: pageWidth - 28,
        margin: { left: 14 },
        styles: { fontSize: 9, cellPadding: 1.5, lineColor: [0, 0, 0], lineWidth: 0.2 },
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
    });

    drawFooter(doc, pageWidth, pageHeight, footerImages);
    triggerDownload(doc.output("blob"), "all-jobs.pdf");
}

export async function generatePDF(data: JobCardData) {
  const excelSvgDataUri = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMjQwIiBoZWlnaHQ9IjEwMCIgZmlsbD0id2hpdGUiLz48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMjQwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjMkEzMzc1Ii8+PHRleHQgeD0iMTIwIiB5PSI2MCIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjYwIiBmb250LXdlaWdodD0iYm9sZCIgZm9udC1zdHlsZT0iaXRhbGljIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+RXhjZWw8L3RleHQ+PHJlY3QgeD0iMCIgeT0iODUiIHdpZHRoPSIyNDAiIGhlaWdodD0iMyIgZmlsbD0iI0QzMTIyNCIvPjx0ZXh0IHg9IjEyMCIgeT0iOTgiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxMiIgZm9udC13ZWlnaHQ9ImJvbGQiIGxldHRlci1zcGFjaW5nPSIzIiBmaWxsPSIjMkEzMzc1IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5NQUNISU5FIFRPT0xTPC90ZXh0Pjwvc3ZnPg==";
  const onsigenSvgDataUri = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iODAiPjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iODAiIGZpbGw9IndoaXRlIi8+PGNpcmNsZSBjeD0iMzAiIGN5PSI0MCIgcj0iMTUiIGZpbGw9IiMwMEEwREYiLz48Y2lyY2xlIGN4PSI1MCIgY3k9IjI1IiByPSIxMCIgZmlsbD0iIzAwNzdCNSIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNTUiIHI9IjgiIGZpbGw9IiM1NUM5RTYiLz48Y2lyY2xlIGN4PSIxNSIgY3k9IjI1IiByPSI2IiBmaWxsPSIjMDA1NThDIi8+PGNpcmNsZSBjeD0iMTUiIGN5PSI1NSIgcj0iNSIgZmlsbD0iIzAwQTBERiIvPjx0ZXh0IHg9Ijc1IiB5PSI1MCIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjMyIiBmb250LXdlaWdodD0ibm9ybWFsIiBmaWxsPSIjM0QzRDNEIj5vbnNpZ2VuPC90ZXh0Pjwvc3ZnPg==";

  const niteshSvgDataUri = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iNjAiPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IndoaXRlIi8+PHRleHQgeD0iMTAwIiB5PSIzNSIgZm9udC1mYW1pbHk9IlRpbWVzIE5ldyBSb21hbiwgc2VyaWYiIGZvbnQtc3R5bGU9Iml0YWxpYyIgZm9udC1zaXplPSIyOCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzAwMCI+Tml0ZXNoIEdhd2FsaTwvdGV4dD48L3N2Zz4K";
  const arvindSvgDataUri = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNTAiIGhlaWdodD0iODAiPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IndoaXRlIi8+PHRleHQgeD0iMTI1IiB5PSI0NSIgZm9udC1mYW1pbHk9IkJydXNoIFNjcmlwdCBNVCwgY3Vyc2l2ZSIgZm9udC1zdHlsZT0iaXRhbGljIiBmb250LXNpemU9IjQyIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjMDAwIj5BcnZpbmQgamFpc3dhbDwvdGV4dD48cGF0aCBkPSJNIDQwIDYwIFEgMTIwIDU1IDIxMCA1MCBMIDE5MCA2MCIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiIC8+PC9zdmc+Cg==";
  const mohanSvgDataUri = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iNjAiPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IndoaXRlIi8+PHRleHQgeD0iMTAwIiB5PSIzNSIgZm9udC1mYW1pbHk9IkJydXNoIFNjcmlwdCBNVCwgY3Vyc2l2ZSIgZm9udC1zaXplPSIzMiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzAwMCI+TW9oYW4gS3Jpc2huYW48L3RleHQ+PC9zdmc+Cg==";
  const sameerSvgDataUri = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iNjAiPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IndoaXRlIi8+PHRleHQgeD0iMTAwIiB5PSIzNSIgZm9udC1mYW1pbHk9IkJydXNoIFNjcmlwdCBNVCwgY3Vyc2l2ZSIgZm9udC1zaXplPSIzMiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzAwMCIgZm9udC1zdHlsZT0iaXRhbGljIj5TYW1lZXIgTGFtYmF5PC90ZXh0Pjwvc3ZnPgo=";

  // Declared as the union up front so each branch below can assign the loader's
  // promise directly; the casts that used to be here only existed because the
  // initialiser narrowed this to Promise<null>.
  let managerSignPromise: Promise<string | null> = Promise.resolve(null);
  if (data.managerName === "Nitesh gawali") {
    managerSignPromise = loadImageAsBase64(niteshSvgDataUri);
  } else if (data.managerName === "Arvind kumar Jaiswal") {
    managerSignPromise = loadImageAsBase64("/images/sign_arvind.png");
  } else if (data.managerName === "Mohan Krishnan") {
    managerSignPromise = loadImageAsBase64(mohanSvgDataUri);
  }

  let engineerSignPromise: Promise<string | null> = Promise.resolve(null);
  if (data.customerInfo.engineerName === "Bijmon Mathai") {
    engineerSignPromise = loadImageAsBase64("/images/sign_bijmon_hd.png");
  } else if (data.customerInfo.engineerName === "Sinoy Syamalan") {
    engineerSignPromise = loadImageAsBase64("/images/sign_sinoy_hd.png");
  } else if (data.customerInfo.engineerName === "Fasil Musthafa") {
    engineerSignPromise = loadImageAsBase64("/images/sign_fasil_hd.png");
  } else if (data.customerInfo.engineerName === "Sameer Lambay") {
    engineerSignPromise = loadImageAsBase64("/images/sign_sameer.png");
  }

  const [headerImg, kaeserImg, hanwhaImg, excelImg, clivetImg, nedermanImg, onsigenImg, managerSignImg, engineerSignImg] = await Promise.all([
    loadImageAsBase64("/images/bb-header-thumb.jpg"),
    loadImageAsBase64("/images/footer-kaeser.jpg"),
    loadImageAsBase64("/images/footer-hanwha.jpg"),
    loadImageAsBase64(excelSvgDataUri),
    loadImageAsBase64("/images/footer-clivet.jpg"),
    loadImageAsBase64("/images/footer-nederman.png"),
    loadImageAsBase64(onsigenSvgDataUri),
    managerSignPromise,
    engineerSignPromise
  ]);

  const footerImages: FooterImages = {
    kaeser: kaeserImg,
    hanwha: hanwhaImg,
    excel: excelImg,
    clivet: clivetImg,
    nederman: nedermanImg,
    onsigen: onsigenImg,
  };

  const doc = new jsPDF({ compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  drawHeader(doc, pageWidth, headerImg);

  let y = 48;

  autoTable(doc, {
    startY: y,
    theme: "grid",
    tableWidth: pageWidth - 28,
    margin: { left: 14 },
    styles: { fontSize: 9.6, cellPadding: { top: 1.8, right: 2, bottom: 1.8, left: 2 }, lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0] },
    headStyles: { fillColor: [255, 255, 255] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 25.5 },
      1: { cellWidth: 74 },
      2: { fontStyle: "bold", cellWidth: 25.5 },
      3: { cellWidth: 50 },
    },
    body: [
      ["ORG:", data.customerInfo.customerName, "DATE:", data.customerInfo.date],
      ["EMAIL:", data.customerInfo.email, "PAGE:", "1 of 1"],
      ["TEL:", data.customerInfo.contactNo, "SUBJECT:", data.customerInfo.equipmentPartNo || ""],
      ["ATTN:", data.customerInfo.attentionOf, "MODEL:", data.customerInfo.equipmentModel || ""],
      ["YOUR-REF:", data.customerInfo.refNo, "OUR-DOC:", data.customerInfo.jobCardNo],
    ],
  });

  y = lastTableBottom(doc) + 8.5;

  // Purpose of Visit mapping
  let purposeLabel = "";
  if (data.serviceType === "service_contract") purposeLabel = "Service Contract";
  else if (data.serviceType === "warranty") purposeLabel = "Under Warranty / AMC";
  else if (data.serviceType === "customer_request") purposeLabel = "Customer Request";
  else if (data.serviceType === "breakdown_call") purposeLabel = "Breakdown Call";

  if (purposeLabel) {
    doc.setFontSize(10.5);
    doc.setFont("helvetica", "bold");
    doc.text("Purpose Of Visit:", 14, y);
    const purposeTextWidth = doc.getTextWidth("Purpose Of Visit:");
    doc.setFont("helvetica", "normal");
    doc.text(purposeLabel, 14 + purposeTextWidth + 3, y);
    y += 7;
  }

  if (data.serviceType === "breakdown_call" && data.breakdownCallType) {
    const breakdownCallTypeLabel = data.breakdownCallType === "warranty_amc"
      ? "Under Warranty / AMC"
      : "Chargeable";
    doc.setFontSize(10.5);
    doc.setFont("helvetica", "bold");
    doc.text("Breakdown Call Type:", 14, y);
    const labelWidth = doc.getTextWidth("Breakdown Call Type:");
    doc.setFont("helvetica", "normal");
    doc.text(breakdownCallTypeLabel, 14 + labelWidth + 3, y);
    y += 7;
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Dear Sir,", 14, y);
  y += 7;
  doc.text("          We are pleased to submit our offer for the following items as per enquiry:", 14, y);
  y += 7;

  // PartItem carries qty and unitPrice as number | string, because the form binds
  // them straight to text inputs. Coercing here rather than calling toFixed on the
  // union keeps a part that was typed but not yet re-parsed from throwing mid-export.
  const partsBody: RowInput[] = data.parts.map((p, i) => [
    (i + 1).toString(),
    p.description,
    p.partNumber || "",
    String(p.qty),
    Number(p.unitPrice).toFixed(2),
    Number(p.totalPrice).toFixed(2),
  ]);

  while (partsBody.length < 3) {
    partsBody.push([(partsBody.length + 1).toString(), "", "", "", "", ""]);
  }

  const pricingSummary = computePricingSummary({
    parts: data.parts,
    labor: data.labor,
    otherExpenses: data.otherExpenses,
    serviceCharge: data.serviceCharge || 0,
    discountPercentage: data.discountPercentage,
  });

  const {
    partsTotal,
    laborTotal,
    totalCost,
    discount,
    totalAfterDiscount,
    vat,
    grandTotal,
  } = pricingSummary;

  partsBody.push([
    { content: "PARTS TOTAL", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
    partsTotal.toFixed(2),
  ]);
  partsBody.push([
    { content: "LABOR TOTAL", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
    laborTotal.toFixed(2),
  ]);

  if (data.serviceCharge && data.serviceCharge > 0) {
    partsBody.push([
      { content: "SERVICE CHARGE", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
      data.serviceCharge.toFixed(2),
    ]);
  }

  if (data.otherExpenses && data.otherExpenses > 0) {
    partsBody.push([
      { content: "OTHER EXPENSES", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
      data.otherExpenses.toFixed(2),
    ]);
  }

  partsBody.push([
    { content: "TOTAL AMOUNT", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
    totalCost.toFixed(2),
  ]);

  if (data.discountPercentage > 0) {
    partsBody.push([
      { content: `DISCOUNT (${data.discountPercentage}%)`, colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
      `- ${discount.toFixed(2)}`,
    ]);
  }

  partsBody.push([
    { content: "VAT 5%", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
    vat.toFixed(2),
  ]);
  partsBody.push([
    { content: "TOTAL PRICE INCLUSIVE VAT", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
    grandTotal.toFixed(2),
  ]);

  autoTable(doc, {
    startY: y,
    theme: "grid",
    tableWidth: pageWidth - 28,
    margin: { left: 14 },
    styles: { fontSize: 9.5, cellPadding: { top: 1.6, right: 1.6, bottom: 1.6, left: 1.6 }, lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0], valign: "middle" },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", halign: "center" },
    head: [["SN", "ITEM DESCRIPTION", "PART NUMBER", "QTY", `UNIT PRICE\n(${CURRENCY})`, `TOTAL PRICE\n(${CURRENCY})`]],
    body: partsBody,
    columnStyles: {
      0: { cellWidth: 15.5, halign: "center" },
      1: { cellWidth: 62.5 },
      2: { cellWidth: 33.5, halign: "center" },
      3: { cellWidth: 16, halign: "center" },
      4: { cellWidth: 25.5, halign: "center" },
      5: { cellWidth: 30.5, halign: "center" },
    },
  });

  y = lastTableBottom(doc) + 9;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("TERMS AND CONDITION: -", 14, y);
  doc.setLineWidth(0.3);
  doc.line(14, y + 1.1, 62, y + 1.1);

  y += 6.5;
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "normal");

  const termsLines = [
    "DELIVERY    : Ex stock Subject to prior sale.",
    "TERM'S      : Prices mentioned above are net in Dirhams, based on items and quantities stated.",
    "VALIDITY    : 15 days",
    "PAYMENT'S : 30 days from the date of delivery.",
  ];

  termsLines.forEach((line) => {
    doc.text(line, 14, y);
    y += 5.4;
  });

  y += 5;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("TAX Registrations No# Bhatia Brothers FZE - TRN Code – 100276105200003", 14, y);
  doc.setLineWidth(0.4);
  const taxTextWidth = doc.getTextWidth("TAX Registrations No# Bhatia Brothers FZE - TRN Code – 100276105200003");
  doc.line(14, y + 1.1, 14 + taxTextWidth, y + 1.1);

  // 9mm rather than 12: the sign-off below runs ~31mm and the footer claims the
  // last 21mm of the page, so the old rhythm put the phone line on top of the
  // partner logos on a full quotation.
  y += 9;

  // Keep the sign-off clear of the footer. The footer rule and the partner logos
  // occupy the last 21mm of the page, and the signatory block runs about 26mm from
  // the "Best Regards" baseline — on a full quotation the phone line landed on top
  // of the logos. If it will not fit, finish this page properly (footer and all)
  // and carry the sign-off onto a fresh one under the same letterhead.
  const footerTop = pageHeight - 24;
  const signOffHeight = 31;
  if (y + signOffHeight > footerTop) {
    drawFooter(doc, pageWidth, pageHeight, footerImages);
    doc.addPage();
    drawHeader(doc, pageWidth, headerImg);
    y = 48;
  }

  doc.setFontSize(11.5);
  doc.setFont("helvetica", "bold");
  doc.text("Best Regards,", 14, y);
  y += 8;

  // Two signatory columns on the left and right halves of the content area. The
  // right column used to sit at a hard-coded x=130, which left the left half far
  // wider than the right and the manager's block crowded toward the page edge.
  const contentLeft = 14;
  const contentRight = pageWidth - 14;
  const columnRight = (contentLeft + contentRight) / 2;

  const engineerName = data.customerInfo.engineerName?.trim() || "";
  const managerName = data.managerName?.trim() || "";

  // No placeholder name. This document goes to a customer, so printing the words
  // "Engineer Name" where a person should be is worse than leaving the space
  // blank — and until GET /jobs/:id returned the name at all, that placeholder was
  // what every PDF exported from the pricing screen actually carried.
  const lastLeftY = engineerName
    ? drawSignatory(doc, contentLeft, y, engineerName, ENGINEERS[engineerName], engineerSignImg)
    : y + 14;

  const lastRightY = managerName
    ? drawSignatory(doc, columnRight, y, managerName, MANAGERS[managerName], managerSignImg)
    : y + 14;

  y = Math.max(lastLeftY, lastRightY);

  y += 10;


  drawFooter(doc, pageWidth, pageHeight, footerImages);
  triggerDownload(doc.output("blob"), `Quotation_${data.customerInfo.jobCardNo || "report"}.pdf`);
}
