const axios = require("axios");

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
const WHATSAPP_TO = process.env.WHATSAPP_NOTIFY_NUMBER;

async function sendDiscord(embed) {
  if (!DISCORD_WEBHOOK) return;
  try {
    await axios.post(DISCORD_WEBHOOK, {
      username: "StockAgent",
      avatar_url: "https://img.icons8.com/color/96/warehouse.png",
      embeds: [embed],
    });
  } catch (err) {
    console.error("[Notify][Discord]", err.message);
  }
}

async function sendWhatsApp(message) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !WHATSAPP_TO) return;
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
    await axios.post(
      url,
      new URLSearchParams({
        From: TWILIO_FROM,
        To: `whatsapp:${WHATSAPP_TO}`,
        Body: message,
      }).toString(),
      {
        auth: { username: TWILIO_SID, password: TWILIO_TOKEN },
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );
  } catch (err) {
    console.error("[Notify][WhatsApp]", err.message);
  }
}

function notifyStockAlert(analysis, recommendations) {
  const critical = recommendations.filter((r) => r.severity === "critical");
  const low = recommendations.filter((r) => r.severity === "low");

  if (critical.length === 0 && low.length === 0) return;

  const items = recommendations
    .map(
      (r) =>
        `${r.severity === "critical" ? "🔴" : "🟡"} **${r.product_name}**: ${r.current_stock}/${r.threshold} → reorder ${r.quantity} from ${r.supplier_name}`
    )
    .join("\n");

  sendDiscord({
    title: "📦 Stock Alert — Reorder Needed",
    description: analysis,
    color: critical.length > 0 ? 0xff4444 : 0xf59e0b,
    fields: [
      { name: "Critical", value: String(critical.length), inline: true },
      { name: "Low", value: String(low.length), inline: true },
      { name: "Products", value: items.slice(0, 1024) },
    ],
    timestamp: new Date().toISOString(),
  });

  const wa = [
    `📦 *StockAgent Alert*`,
    ``,
    analysis,
    ``,
    ...recommendations.map(
      (r) =>
        `${r.severity === "critical" ? "🔴" : "🟡"} ${r.product_name}: ${r.current_stock}/${r.threshold} → reorder ${r.quantity} from ${r.supplier_name}`
    ),
  ].join("\n");
  sendWhatsApp(wa);
}

function notifyPayoutSent(cycle, batchId, amountUsd) {
  sendDiscord({
    title: "💳 PayPal Payout Sent",
    color: 0x0070ba,
    fields: [
      { name: "Product", value: cycle.product_name, inline: true },
      { name: "Supplier", value: cycle.supplier_name, inline: true },
      { name: "Amount", value: `$${amountUsd} USD (KES ${cycle.total_kes.toLocaleString()})`, inline: true },
      { name: "Quantity", value: `${cycle.quantity} units`, inline: true },
      { name: "Batch ID", value: `\`${batchId}\`` },
    ],
    timestamp: new Date().toISOString(),
  });

  sendWhatsApp(
    [
      `💳 *PayPal Payout Sent*`,
      ``,
      `Product: ${cycle.product_name}`,
      `Supplier: ${cycle.supplier_name}`,
      `Amount: $${amountUsd} USD`,
      `Batch: ${batchId}`,
    ].join("\n")
  );
}

function notifyInvoiceCreated(invoice, recipientName, totalKes) {
  sendDiscord({
    title: "🧾 Invoice Generated",
    color: 0x22c55e,
    fields: [
      { name: "Invoice", value: invoice.invoice_number, inline: true },
      { name: "Recipient", value: recipientName, inline: true },
      { name: "Total", value: `KES ${totalKes.toLocaleString()}`, inline: true },
      { name: "Due", value: invoice.due_date || "On delivery", inline: true },
    ],
    timestamp: new Date().toISOString(),
  });

  sendWhatsApp(
    [
      `🧾 *Invoice Created*`,
      ``,
      `${invoice.invoice_number} → ${recipientName}`,
      `Total: KES ${totalKes.toLocaleString()}`,
      `Due: ${invoice.due_date || "On delivery"}`,
    ].join("\n")
  );
}

function notifyCycleCreated(cycles) {
  if (cycles.length === 0) return;

  const items = cycles
    .map((c) => `• ${c.product_name} → ${c.supplier_name}: ${c.quantity} units (KES ${c.total_kes.toLocaleString()})`)
    .join("\n");

  sendDiscord({
    title: `🔄 ${cycles.length} Reorder Cycle(s) Created`,
    description: "Awaiting approval to trigger PayPal payouts.",
    color: 0x8b5cf6,
    fields: [{ name: "Cycles", value: items.slice(0, 1024) }],
    timestamp: new Date().toISOString(),
  });

  sendWhatsApp(
    [
      `🔄 *${cycles.length} Reorder Cycle(s) Created*`,
      ``,
      ...cycles.map(
        (c) => `• ${c.product_name} → ${c.supplier_name}: ${c.quantity} units (KES ${c.total_kes.toLocaleString()})`
      ),
      ``,
      `Approve in the StockAgent dashboard to send payment.`,
    ].join("\n")
  );
}

module.exports = {
  notifyStockAlert,
  notifyPayoutSent,
  notifyInvoiceCreated,
  notifyCycleCreated,
  DISCORD_ENABLED: !!DISCORD_WEBHOOK,
  WHATSAPP_ENABLED: !!(TWILIO_SID && TWILIO_TOKEN && WHATSAPP_TO),
};
