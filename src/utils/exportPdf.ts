import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { JobCardData } from "@/types/jobCard";

type FooterImages = {
  kaeser: string;
  hanwha: string;
  excel: string;
  clivet: string;
  nederman: string;
  onsigen: string;
};

// Helper to load image as base64
async function loadImageAsBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const isPng = url.toLowerCase().endsWith(".png");
      resolve(isPng ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.95));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function drawHeader(doc: jsPDF, pageWidth: number, headerImg: string) {
  const imgWidth = pageWidth - 28; // Leaving 14mm margin on both sides
  const imgHeight = imgWidth * (97 / 600); // Maintain aspect ratio for bb-header-thumb.jpg
  doc.addImage(headerImg, "JPEG", 14, 8, imgWidth, imgHeight);
}

function drawFooter(doc: jsPDF, pageWidth: number, pageHeight: number, images: FooterImages) {
  const lineY = pageHeight - 21;
  const logosY = pageHeight - 17;
  
  // thin black line
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.line(14, lineY, pageWidth - 14, lineY);

  // Logos arranged in a single row
  doc.addImage(images.kaeser, "JPEG", 14, logosY, 25, 8);
  doc.addImage(images.hanwha, "JPEG", 43.2, logosY + 0.5, 32, 7);
  doc.addImage(images.excel, "JPEG", 79.4, logosY - 0.5, 22, 9);
  doc.addImage(images.clivet, "JPEG", 105.6, logosY + 0.5, 32, 7);
  doc.addImage(images.nederman, "PNG", 141.8, logosY + 0.5, 32, 7);
  doc.addImage(images.onsigen, "JPEG", 178, logosY - 1, 18, 10);
}

export async function generatePDF(data: JobCardData) {
  const excelSvgDataUri = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMjQwIiBoZWlnaHQ9IjEwMCIgZmlsbD0id2hpdGUiLz48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMjQwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjMkEzMzc1Ii8+PHRleHQgeD0iMTIwIiB5PSI2MCIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjYwIiBmb250LXdlaWdodD0iYm9sZCIgZm9udC1zdHlsZT0iaXRhbGljIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+RXhjZWw8L3RleHQ+PHJlY3QgeD0iMCIgeT0iODUiIHdpZHRoPSIyNDAiIGhlaWdodD0iMyIgZmlsbD0iI0QzMTIyNCIvPjx0ZXh0IHg9IjEyMCIgeT0iOTgiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxMiIgZm9udC13ZWlnaHQ9ImJvbGQiIGxldHRlci1zcGFjaW5nPSIzIiBmaWxsPSIjMkEzMzc1IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5NQUNISU5FIFRPT0xTPC90ZXh0Pjwvc3ZnPg==";
  const onsigenSvgDataUri = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iODAiPjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iODAiIGZpbGw9IndoaXRlIi8+PGNpcmNsZSBjeD0iMzAiIGN5PSI0MCIgcj0iMTUiIGZpbGw9IiMwMEEwREYiLz48Y2lyY2xlIGN4PSI1MCIgY3k9IjI1IiByPSIxMCIgZmlsbD0iIzAwNzdCNSIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNTUiIHI9IjgiIGZpbGw9IiM1NUM5RTYiLz48Y2lyY2xlIGN4PSIxNSIgY3k9IjI1IiByPSI2IiBmaWxsPSIjMDA1NThDIi8+PGNpcmNsZSBjeD0iMTUiIGN5PSI1NSIgcj0iNSIgZmlsbD0iIzAwQTBERiIvPjx0ZXh0IHg9Ijc1IiB5PSI1MCIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjMyIiBmb250LXdlaWdodD0ibm9ybWFsIiBmaWxsPSIjM0QzRDNEIj5vbnNpZ2VuPC90ZXh0Pjwvc3ZnPg==";

  const [headerImg, kaeserImg, hanwhaImg, excelImg, clivetImg, nedermanImg, onsigenImg] = await Promise.all([
    loadImageAsBase64("/images/bb-header-thumb.jpg"),
    loadImageAsBase64("/images/footer-kaeser.jpg"),
    loadImageAsBase64("/images/footer-hanwha.jpg"),
    loadImageAsBase64(excelSvgDataUri),
    loadImageAsBase64("/images/footer-clivet.jpg"),
    loadImageAsBase64("/images/footer-nederman.png"),
    loadImageAsBase64(onsigenSvgDataUri),
  ]);

  const footerImages: FooterImages = {
    kaeser: kaeserImg,
    hanwha: hanwhaImg,
    excel: excelImg,
    clivet: clivetImg,
    nederman: nedermanImg,
    onsigen: onsigenImg,
  };

  const doc = new jsPDF();
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
      ["EMAIL:", data.customerInfo.email, "PAGE:", ""],
      ["TEL:", data.customerInfo.contactNo, "SUBJECT:", ""],
      ["ATTN:", data.customerInfo.attentionOf, "MODEL:", ""],
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
  const totalAmount = totalParts + totalLabor + data.otherExpenses;
  const discount = totalAmount * (data.discountPercentage / 100);
  const totalAfterDiscount = totalAmount - discount;
  const vat = totalAfterDiscount * 0.05;
  const grandTotal = totalAfterDiscount + vat;

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
  doc.text("TERMS AND CONDITION:", 14, y);
  doc.setLineWidth(0.3);
  doc.line(14, y + 1.1, 65, y + 1.1);

  y += 7.5;
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "normal");

  const termsLines = [
    "DELIVERY    : Item No. 1, 4-5 working weeks from the date of order confirmation. Balance items: Ex. Stock",
    "available TERM'S    : Prices mentioned above are net in Dirhams, based on items and quantities stated.",
    "VALIDITY    : 15 days",
    "PAYMENT'S : 30 days from the date of delivery.",
  ];

  termsLines.forEach((line) => {
    doc.text(line, 14, y);
    y += 5.4;
  });

  y += 11;

  doc.setFontSize(11.5);
  doc.setFont("helvetica", "bold");
  doc.text("BEST REGARDS,", 14, y);
  y += 20;


  drawFooter(doc, pageWidth, pageHeight, footerImages);

  doc.save(`Quotation_${data.customerInfo.jobCardNo || "report"}.pdf`);
}
