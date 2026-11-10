const express = require("express");
const PDFDocument = require("pdfkit");
const router = express.Router();

function kes(n) {
  return "KES " + Number(n).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function generateInvoicePDF(invoice, items, recipient) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const blue = "#3b82f6";
    const dark = "#1a1d2e";
    const gray = "#64748b";
    const pageW = doc.page.width - 100;

    // ── Header bar ──────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 90).fill(blue);
    doc.fontSize(26).fill("#ffffff").text("StockAgent", 50, 28, { continued: false });
    doc.fontSize(10).fill("#dbeafe").text("Mama Pima Distributors  •  Eldoret, Kenya", 50, 58);

    // ── Invoice title & meta ────────────────────────────────────
    doc.moveDown(2);
    const metaY = 115;
    doc.fontSize(20).fill(dark).text("INVOICE", 50, metaY);
    doc.fontSize(10).fill(gray);
    doc.text(`Invoice #:  ${invoice.invoice_number}`, 350, metaY, { width: 200, align: "right" });
    doc.text(`Issued:      ${new Date(invoice.issued_at).toLocaleDateString("en-GB")}`, 350, metaY + 15, { width: 200, align: "right" });
    doc.text(`Due:           ${invoice.due_date || "On delivery"}`, 350, metaY + 30, { width: 200, align: "right" });

    const statusColor = invoice.status === "paid" ? "#16a34a" : invoice.status === "unpaid" ? "#dc2626" : "#f59e0b";
    doc.fontSize(11).fill(statusColor).text(invoice.status.toUpperCase(), 350, metaY + 50, { width: 200, align: "right" });

    // ── Bill To ─────────────────────────────────────────────────
    const billY = metaY + 80;
    doc.fontSize(9).fill(gray).text("BILL TO", 50, billY);
    doc.moveTo(50, billY + 14).lineTo(250, billY + 14).strokeColor("#e2e8f0").lineWidth(0.5).stroke();
    doc.fontSize(12).fill(dark).text(recipient.name || invoice.recipient_name, 50, billY + 20);
    doc.fontSize(9).fill(gray);
    let y = billY + 36;
    if (recipient.contact_name) { doc.text(recipient.contact_name, 50, y); y += 13; }
    if (recipient.phone) { doc.text(recipient.phone, 50, y); y += 13; }
    if (recipient.email) { doc.text(recipient.email, 50, y); y += 13; }
    if (recipient.location) { doc.text(recipient.location, 50, y); y += 13; }
    doc.text(`Payment Terms: ${recipient.payment_terms || "cash"}`, 50, y);

    // ── Items table ─────────────────────────────────────────────
    const tableTop = Math.max(y + 35, 310);
    const cols = { product: 50, sku: 220, qty: 310, price: 370, total: 460 };

    // Header row
    doc.rect(50, tableTop, pageW, 22).fill("#f1f5f9");
    doc.fontSize(8).fill(gray);
    doc.text("PRODUCT", cols.product + 6, tableTop + 7);
    doc.text("SKU", cols.sku, tableTop + 7);
    doc.text("QTY", cols.qty, tableTop + 7, { width: 50, align: "right" });
    doc.text("UNIT PRICE", cols.price, tableTop + 7, { width: 80, align: "right" });
    doc.text("TOTAL", cols.total, tableTop + 7, { width: 85, align: "right" });

    let rowY = tableTop + 26;
    doc.fontSize(9);
    for (const item of items) {
      if (rowY > 720) {
        doc.addPage();
        rowY = 50;
      }
      const bg = items.indexOf(item) % 2 === 1 ? "#f8fafc" : "#ffffff";
      doc.rect(50, rowY - 4, pageW, 20).fill(bg);

      doc.fill(dark).text(item.product_name, cols.product + 6, rowY, { width: 160 });
      doc.fill(gray).text(item.sku || "", cols.sku, rowY, { width: 80 });
      doc.fill(dark).text(`${item.quantity} ${item.unit || ""}`, cols.qty, rowY, { width: 50, align: "right" });
      doc.text(kes(item.unit_price_kes), cols.price, rowY, { width: 80, align: "right" });
      doc.font("Helvetica-Bold").text(kes(item.total_kes), cols.total, rowY, { width: 85, align: "right" });
      doc.font("Helvetica");
      rowY += 22;
    }

    // Total line
    doc.moveTo(350, rowY + 4).lineTo(50 + pageW, rowY + 4).strokeColor("#2d3748").lineWidth(1).stroke();
    doc.fontSize(13).fill(dark).font("Helvetica-Bold");
    doc.text("TOTAL", 350, rowY + 12, { width: 100, align: "right" });
    doc.text(kes(invoice.total_kes), cols.total, rowY + 12, { width: 85, align: "right" });
    doc.font("Helvetica");

    // ── Footer ──────────────────────────────────────────────────
    const footerY = rowY + 60;
    doc.moveTo(50, footerY).lineTo(50 + pageW, footerY).strokeColor("#e2e8f0").lineWidth(0.5).stroke();
    doc.fontSize(8).fill(gray).text(
      "Powered by StockAgent — Diron Technologies  •  Agentic Commerce for FMCG Distributors",
      50, footerY + 8, { width: pageW, align: "center" }
    );
    doc.fontSize(7).text(
      "This invoice was generated automatically. For questions, contact your Mama Pima account manager.",
      50, footerY + 22, { width: pageW, align: "center" }
    );

    doc.end();
  });
}

// ── Route: GET /api/invoices/:id/pdf ────────────────────────────
router.get("/api/invoices/:id/pdf", async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) return res.status(500).json({ error: "Database not available" });

    const invoice = db.prepare(`
      SELECT i.*, r.name as recipient_name, r.contact_name, r.phone, r.email,
             r.location, r.color, r.initials, r.payment_terms
      FROM invoices i JOIN recipients r ON r.id = i.recipient_id
      WHERE i.id = ?
    `).get(req.params.id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const items = db.prepare(`
      SELECT ii.*, p.name as product_name, p.sku, p.unit
      FROM invoice_items ii JOIN products p ON p.id = ii.product_id
      WHERE ii.invoice_id = ?
    `).all(req.params.id);

    const pdf = await generateInvoicePDF(invoice, items, invoice);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${invoice.invoice_number}.pdf"`);
    res.setHeader("Content-Length", pdf.length);
    res.send(pdf);
  } catch (err) {
    console.error("[PDF] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, generateInvoicePDF };
