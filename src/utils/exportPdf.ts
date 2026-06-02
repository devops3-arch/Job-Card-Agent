import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { JobCardData } from "@/types/jobCard";

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

export async function generateGlobalPDF(jobs: any[]) {
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
        head: [['Job #', 'Customer', 'Technician', 'Date', 'Status', 'Total']],
        body: jobs.map(job => [
            job.job_card_no,
            job.customer_name,
            job.engineer_name,
            job.job_date,
            job.status || 'New',
            job.grand_total || 'N/A'
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

  let managerSignPromise = Promise.resolve(null);
  if (data.managerName === "Nitesh gawali") {
    managerSignPromise = loadImageAsBase64(niteshSvgDataUri) as any;
  } else if (data.managerName === "Arvind kumar Jaiswal") {
    managerSignPromise = loadImageAsBase64("/images/sign_arvind.png") as any;
  } else if (data.managerName === "Mohan Krishnan") {
    managerSignPromise = loadImageAsBase64(mohanSvgDataUri) as any;
  }

  let engineerSignPromise = Promise.resolve(null);
  if (data.customerInfo.engineerName === "Bijmon Mathai") {
    engineerSignPromise = loadImageAsBase64("/images/sign_bijmon_hd.png") as any;
  } else if (data.customerInfo.engineerName === "Sinoy Syamalan") {
    engineerSignPromise = loadImageAsBase64("/images/sign_sinoy_hd.png") as any;
  } else if (data.customerInfo.engineerName === "Fasil Musthafa") {
    engineerSignPromise = loadImageAsBase64("/images/sign_fasil_hd.png") as any;
  } else if (data.customerInfo.engineerName === "Sameer Lambay") {
    engineerSignPromise = loadImageAsBase64("/images/sign_sameer.png") as any;
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

  y = (doc as any).lastAutoTable.finalY + 8.5;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Dear Sir,", 14, y);
  y += 7;
  doc.text("          We are pleased to submit our offer for the following items as per enquiry:", 14, y);
  y += 7;

  const partsBody = data.parts.map((p, i) => [
    (i + 1).toString(),
    p.description,
    "",
    p.qty.toString(),
    p.unitPrice.toFixed(2),
    p.totalPrice.toFixed(2),
  ]);

  while (partsBody.length < 3) {
    partsBody.push([(partsBody.length + 1).toString(), "", "", "", "", ""]);
  }

  const totalParts = data.parts.reduce((s, p) => s + p.totalPrice, 0);
  const totalLabor = data.labor.reduce((s, l) => s + l.totalCost, 0);
  const totalAmount = totalParts + totalLabor + data.otherExpenses + (data.serviceCharge || 0);
  const discount = totalAmount * (data.discountPercentage / 100);
  const totalAfterDiscount = totalAmount - discount;
  const vat = totalAfterDiscount * 0.05;
  const grandTotal = totalAfterDiscount + vat;

  if (data.serviceCharge && data.serviceCharge > 0) {
    partsBody.push([
      { content: "SERVICE CHARGE", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
      data.serviceCharge.toFixed(2),
    ] as any);
  }

  if (data.discountPercentage > 0) {
    partsBody.push([
      { content: "TOTAL AMOUNT", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
      totalAmount.toFixed(2),
    ] as any);
    partsBody.push([
      { content: `DISCOUNT (${data.discountPercentage}%)`, colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
      `- ${discount.toFixed(2)}`,
    ] as any);
    partsBody.push([
      { content: "AFTER DISCOUNT", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
      totalAfterDiscount.toFixed(2),
    ] as any);
  } else {
    partsBody.push([
      { content: "TOTAL AMOUNT", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
      totalAmount ? totalAmount.toFixed(2) : "",
    ] as any);
  }
  partsBody.push([
    { content: "VAT 5%", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
    vat ? vat.toFixed(2) : "",
  ] as any);
  partsBody.push([
    { content: "TOTAL PRICE INCLUSIVE VAT", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
    grandTotal ? grandTotal.toFixed(2) : "",
  ] as any);

  autoTable(doc, {
    startY: y,
    theme: "grid",
    tableWidth: pageWidth - 28,
    margin: { left: 14 },
    styles: { fontSize: 9.5, cellPadding: { top: 1.6, right: 1.6, bottom: 1.6, left: 1.6 }, lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0], valign: "middle" },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", halign: "center" },
    head: [["SN", "ITEM DESCRIPTION", "PART NUMBER", "QTY", "UNIT PRICE\n(DHS)", "TOTAL PRICE\n(DHS)"]],
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

  y = (doc as any).lastAutoTable.finalY + 9;

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

  y += 12;

  doc.setFontSize(11.5);
  doc.setFont("helvetica", "bold");
  doc.text("Best Regards,", 14, y);
  y += 10;

  // Left Signature: Selected Engineer
  if (engineerSignImg && engineerSignImg.length > 10 && data.customerInfo.engineerName) {
    if (data.customerInfo.engineerName === "Fasil Musthafa") {
      doc.addImage(engineerSignImg, "JPEG", 14, y - 6, 36, 12);
    } else {
      doc.addImage(engineerSignImg, "JPEG", 14, y - 4, 30, 9);
    }
  }

  // Right Signature: Selected Manager
  if (managerSignImg && managerSignImg.length > 10 && data.managerName) {
    if (data.managerName === "Arvind kumar Jaiswal") {
      doc.addImage(managerSignImg, "JPEG", 130, y - 6, 36, 12);
    } else {
      doc.addImage(managerSignImg, "JPEG", 130, y - 4, 30, 9);
    }
  }

  y += 14;

  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bolditalic");
  
  // Left Name
  doc.text(data.customerInfo.engineerName || "Engineer Name", 14, y);
  // Right Name
  if (data.managerName) {
    doc.text(data.managerName, 130, y);
  }

  y += 5;

  // Left Designation
  let engDesignation = "";
  if (data.customerInfo.engineerName === "Bijmon Mathai") engDesignation = "BDE-Service";
  else if (data.customerInfo.engineerName === "Sinoy Syamalan") engDesignation = "Service Sales Engineer";
  else if (data.customerInfo.engineerName === "Fasil Musthafa") engDesignation = "Sales Engineer";
  else if (data.customerInfo.engineerName === "Sameer Lambay") engDesignation = "Assistant Service Manager";
  doc.text(engDesignation, 14, y);

  // Right Designation
  if (data.managerName) {
    let designation = "";
    if (data.managerName === "Arvind kumar Jaiswal") designation = "Assistant Operations Manager";
    else if (data.managerName === "Mohan Krishnan") designation = "Manager";
    else if (data.managerName === "Nitesh gawali") designation = "Service Manager";
    doc.text(designation, 130, y);
  }

  y += 5;

  // Left Number
  let phone = "04-8132672";
  if (data.customerInfo.engineerName === "Sameer Lambay") phone = "04-8132672(055-904-1721)";
  else if (data.customerInfo.engineerName === "Fasil Musthafa") phone = "04-8132670(056-2812627)";
  else if (data.customerInfo.engineerName === "Sinoy Syamalan") phone = "04-8132672";
  else if (data.customerInfo.engineerName === "Bijmon Mathai") phone = "04-8132672";
  doc.text(phone, 14, y);
  
  // Right Number
  if (data.managerName) {
    let rightPhone = "";
    if (data.managerName === "Nitesh gawali") rightPhone = "04-8132672 (056-153-8433)";
    else if (data.managerName === "Arvind kumar Jaiswal") rightPhone = "02-5545875 (055-376-7147)";
    else rightPhone = "04-8132672";
    doc.text(rightPhone, 130, y);
  }

  y += 10;


  drawFooter(doc, pageWidth, pageHeight, footerImages);
  triggerDownload(doc.output("blob"), `Quotation_${data.customerInfo.jobCardNo || "report"}.pdf`);
}
