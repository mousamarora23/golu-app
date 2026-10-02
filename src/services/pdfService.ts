import { jsPDF } from "jspdf";
import { extractText, getResolvedPDFJS } from "unpdf";
import { createWorker } from "tesseract.js";

export interface ExtractedPdf {
  title: string;
  totalPages: number;
  pages: string[];
  fullText: string;
  wordCount: number;
  sizeKb: number;
  isScanned?: boolean;
}

export interface GeneratedPdfDocument {
  title: string;
  filename: string;
  blob: Blob;
  url: string;
  sizeKb: number;
}

export interface PdfChunk {
  page: number;
  text: string;
}

/**
 * Renders a single PDF page to an in-memory HTMLCanvasElement for OCR processing.
 */
async function renderPageToCanvas(
  pdfDoc: any,
  pageNum: number,
): Promise<HTMLCanvasElement | null> {
  try {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x scale for sharp OCR accuracy

    if (typeof document !== "undefined" && typeof document.createElement === "function") {
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        await page.render({ canvasContext: ctx, viewport }).promise;
        return canvas;
      }
    }
  } catch (err) {
    console.warn(`Failed to render page ${pageNum} for OCR:`, err);
  }
  return null;
}

/**
 * Extracts text and metadata from an ArrayBuffer of a PDF.
 * Supports standard text PDFs, scanned/image PDFs, and mixed documents with OCR fallback.
 */
export async function extractPdfFromBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  onProgress?: (status: string) => void,
): Promise<ExtractedPdf> {
  const sizeKb = Math.max(1, Math.round(buffer.byteLength / 1024));

  if (buffer.byteLength > 35 * 1024 * 1024) {
    throw new Error("PDF file is larger than 35MB. Please choose a smaller document.");
  }

  const uint8 = new Uint8Array(buffer);

  // Step 1: Direct text extraction using unpdf (fast)
  let directResult: any = null;
  try {
    directResult = await extractText(uint8);
  } catch (err) {
    console.warn("Direct PDF text extraction notice:", err);
  }

  // Step 2: Load PDF document structure via PDFJS (in browser canvas environment)
  let pdfDoc: any = null;
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    try {
      const pdfjs = await getResolvedPDFJS();
      if (pdfjs?.getDocument) {
        const loadingTask = pdfjs.getDocument({
          data: uint8,
          useSystemFonts: true,
        });
        pdfDoc = await loadingTask.promise;
      }
    } catch (err) {
      console.warn("PDFJS document proxy notice:", err);
    }
  }

  const totalPages = pdfDoc?.numPages || directResult?.totalPages || 1;
  const rawPages: string[] = (directResult?.text || []).map((t: string) => (t || "").trim());

  while (rawPages.length < totalPages) {
    rawPages.push("");
  }

  const finalPages: string[] = [];
  let isScanned = false;
  let ocrWorker: any = null;

  try {
    for (let i = 0; i < totalPages; i++) {
      const pageNum = i + 1;
      let pageText = (rawPages[i] || "")
        .replace(/\r\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      const wordCount = pageText.split(/\s+/).filter(Boolean).length;

      // If this page has sufficient direct text (>= 5 words or >= 25 characters), use it directly
      if (wordCount >= 5 || pageText.length >= 25) {
        finalPages.push(pageText);
        continue;
      }

      // Step 3: OCR Fallback for scanned/image pages
      if (pdfDoc) {
        try {
          if (onProgress) {
            onProgress(`Scanning Page ${pageNum}/${totalPages} with OCR...`);
          }

          const canvas = await renderPageToCanvas(pdfDoc, pageNum);
          if (canvas) {
            if (!ocrWorker) {
              ocrWorker = await createWorker("eng");
            }

            const ocrResult = await ocrWorker.recognize(canvas);
            const ocrText = (ocrResult?.data?.text || "")
              .replace(/\r\n/g, "\n")
              .replace(/\n{3,}/g, "\n\n")
              .trim();

            if (ocrText.length > 5) {
              isScanned = true;
              pageText = ocrText;
            }
          }
        } catch (ocrErr) {
          console.warn(`OCR fallback on page ${pageNum} encountered an issue:`, ocrErr);
        }
      }

      finalPages.push(pageText);
    }
  } finally {
    if (ocrWorker) {
      try {
        await ocrWorker.terminate();
      } catch {}
    }
  }

  const fullText = finalPages
    .map((page, idx) => `[Page ${idx + 1}]\n${page}`)
    .filter((p) => p.trim().length > 10)
    .join("\n\n---\n\n");

  const totalWords = fullText.split(/\s+/).filter(Boolean).length;

  if (totalWords < 2) {
    throw new Error(
      "Could not extract readable text from this PDF. The document may be blank, encrypted, or unreadable.",
    );
  }

  const cleanTitle = fileName
    .replace(/\.pdf$/i, "")
    .replace(/[_-]/g, " ")
    .trim();

  return {
    title: cleanTitle || "Document",
    totalPages,
    pages: finalPages,
    fullText,
    wordCount: totalWords,
    sizeKb,
    isScanned,
  };
}

/**
 * Breaks extracted PDF pages into clean context chunks.
 */
export function createPdfChunks(extracted: ExtractedPdf): PdfChunk[] {
  const chunks: PdfChunk[] = [];
  extracted.pages.forEach((pageText, idx) => {
    if (!pageText.trim()) return;

    if (pageText.length > 2500) {
      const sentences = pageText.split(/(?<=[.?!])\s+/);
      let currentSlice = "";
      for (const sentence of sentences) {
        if ((currentSlice + sentence).length > 2000) {
          if (currentSlice.trim()) {
            chunks.push({ page: idx + 1, text: currentSlice.trim() });
          }
          currentSlice = sentence + " ";
        } else {
          currentSlice += sentence + " ";
        }
      }
      if (currentSlice.trim()) {
        chunks.push({ page: idx + 1, text: currentSlice.trim() });
      }
    } else {
      chunks.push({ page: idx + 1, text: pageText.trim() });
    }
  });

  return chunks;
}

/**
 * Retrieves the most relevant chunks from the PDF for a query.
 */
export function getRelevantPdfContext(
  extracted: ExtractedPdf,
  query: string,
  maxWords = 8000,
): string {
  if (extracted.wordCount <= maxWords) {
    return extracted.fullText;
  }

  const queryTerms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);

  const chunks = createPdfChunks(extracted);
  if (queryTerms.length === 0) {
    return chunks
      .slice(0, 8)
      .map((c) => `[Page ${c.page}]\n${c.text}`)
      .join("\n\n---\n\n");
  }

  const scoredChunks = chunks.map((chunk) => {
    const textLower = chunk.text.toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      const matches = textLower.split(term).length - 1;
      score += matches * (term.length > 4 ? 2 : 1);
    }
    return { chunk, score };
  });

  scoredChunks.sort((a, b) => b.score - a.score);

  const selected: PdfChunk[] = [];
  let currentWords = 0;

  for (const item of scoredChunks) {
    const chunkWords = item.chunk.text.split(/\s+/).length;
    if (currentWords + chunkWords > maxWords) break;
    selected.push(item.chunk);
    currentWords += chunkWords;
  }

  selected.sort((a, b) => a.page - b.page);

  return selected
    .map((c) => `[Page ${c.page}]\n${c.text}`)
    .join("\n\n---\n\n");
}

/**
 * Generates a clean A4 PDF document using jsPDF.
 */
export function generatePdfDocument(options: {
  title: string;
  subtitle?: string;
  content: string;
  author?: string;
}): GeneratedPdfDocument {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const title = options.title.replace(/[#*`_]/g, "").trim() || "Document";
  const author = options.author || "AI Golu (Developed by Mousam Arora)";

  // Header Banner
  doc.setFillColor(20, 20, 32);
  doc.rect(0, 0, pageWidth, 28, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("GOLU AI ASSISTANT", margin, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(180, 180, 200);
  doc.text(
    `Generated on ${new Date().toLocaleDateString("en-US", { dateStyle: "medium" })}`,
    pageWidth - margin,
    12,
    { align: "right" },
  );

  y = 38;

  // Document Title
  doc.setTextColor(30, 27, 75);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  const titleLines = doc.splitTextToSize(title, contentWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 8 + 2;

  // Subtitle
  if (options.subtitle) {
    doc.setTextColor(100, 100, 120);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    const subLines = doc.splitTextToSize(options.subtitle, contentWidth);
    doc.text(subLines, margin, y);
    y += subLines.length * 5 + 4;
  }

  // Divider Line
  doc.setDrawColor(220, 220, 235);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Content rendering
  const lines = options.content.split("\n");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 50);

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (y > pageHeight - 25) {
      doc.addPage();
      y = margin + 5;
    }

    if (!trimmed) {
      y += 4;
      continue;
    }

    // Heading 1 (# Heading)
    if (trimmed.startsWith("# ")) {
      y += 3;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(50, 40, 90);
      const heading = trimmed.slice(2).replace(/[*_#]/g, "");
      const hLines = doc.splitTextToSize(heading, contentWidth);
      doc.text(hLines, margin, y);
      y += hLines.length * 6 + 3;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 50);
      continue;
    }

    // Heading 2 (## Heading)
    if (trimmed.startsWith("## ")) {
      y += 2.5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(60, 50, 110);
      const heading = trimmed.slice(3).replace(/[*_#]/g, "");
      const hLines = doc.splitTextToSize(heading, contentWidth);
      doc.text(hLines, margin, y);
      y += hLines.length * 5.5 + 2;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 50);
      continue;
    }

    // Heading 3 (### Heading)
    if (trimmed.startsWith("### ")) {
      y += 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(70, 60, 120);
      const heading = trimmed.slice(4).replace(/[*_#]/g, "");
      const hLines = doc.splitTextToSize(heading, contentWidth);
      doc.text(hLines, margin, y);
      y += hLines.length * 5 + 1.5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 50);
      continue;
    }

    // Bullet points (- or *)
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const bulletText = trimmed.slice(2).replace(/[*_`]/g, "");
      const bLines = doc.splitTextToSize(bulletText, contentWidth - 6);
      doc.setFillColor(120, 100, 200);
      doc.circle(margin + 2, y - 1.2, 1, "F");
      doc.text(bLines, margin + 6, y);
      y += bLines.length * 4.5 + 1.5;
      continue;
    }

    // Regular paragraphs
    const cleanParagraph = trimmed.replace(/[*_`]/g, "");
    const pLines = doc.splitTextToSize(cleanParagraph, contentWidth);
    doc.text(pLines, margin, y);
    y += pLines.length * 4.5 + 2;
  }

  // Footers on all pages
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 160);
    doc.setDrawColor(230, 230, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);

    doc.text(`Author: ${author}`, margin, pageHeight - 9);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 9, {
      align: "right",
    });
  }

  const cleanFilename =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "golu-document";

  const filename = `${cleanFilename}.pdf`;
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const sizeKb = Math.max(1, Math.round(blob.size / 1024));

  return {
    title,
    filename,
    blob,
    url,
    sizeKb,
  };
}

/**
 * Downloads a PDF file in browser.
 */
export function downloadPdf(blobOrUrl: Blob | string, filename: string): void {
  const url = typeof blobOrUrl === "string" ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Opens a PDF in a new browser tab.
 */
export function openPdfInNewTab(blobOrUrl: Blob | string): void {
  const url = typeof blobOrUrl === "string" ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  window.open(url, "_blank");
}
