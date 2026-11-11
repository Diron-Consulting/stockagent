const axios = require("axios");
const nodemailer = require("nodemailer");

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
const WHATSAPP_TO = process.env.WHATSAPP_NOTIFY_NUMBER;
const CALLMEBOT_APIKEY = process.env.CALLMEBOT_APIKEY;

const EMAIL_FROM = process.env.EMAIL_FROM;
const EMAIL_APP_PASSWORD = process.env.EMAIL_APP_PASSWORD;
const EMAIL_TO = process.env.EMAIL_TO || EMAIL_FROM;

const emailTransport =
  EMAIL_FROM && EMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: "gmail",
        auth: { user: EMAIL_FROM, pass: EMAIL_APP_PASSWORD },
      })
    : null;

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

async function sendEmail(subject, html) {
  if (!emailTransport) return;
  try {
    await emailTransport.sendMail({
      from: `"StockAgent" <${EMAIL_FROM}>`,
      to: EMAIL_TO,
      subject,
      html,
    });
    console.log("[Notify][Email] Sent:", subject);
  } catch (err) {
    console.error("[Notify][Email]", err.message);
  }
}

async function sendWhatsAppTwilio(message) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !WHATSAPP_TO) return false;
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
    const params = {
      To: `whatsapp:${WHATSAPP_TO}`,
      Body: message,
    };
    if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
      params.MessagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    } else {
      params.From = TWILIO_FROM;
    }
    const resp = await axios.post(
      url,
      new URLSearchParams(params).toString(),
      {
        auth: { username: TWILIO_SID, password: TWILIO_TOKEN },
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );
    console.log("[Notify][WhatsApp][Twilio] Sent:", resp.data.sid);
    return true;
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error("[Notify][WhatsApp][Twilio]", JSON.stringify(detail));
    return false;
  }
}

async function sendWhatsAppCallMeBot(message) {
  if (!CALLMEBOT_APIKEY || !WHATSAPP_TO) return false;
  try {
    const phone = WHATSAPP_TO.replace("+", "");
    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&apikey=${CALLMEBOT_APIKEY}&text=${encodeURIComponent(message)}`;
    await axios.get(url);
    console.log("[Notify][WhatsApp][CallMeBot] Sent to", WHATSAPP_TO);
    return true;
  } catch (err) {
    console.error("[Notify][WhatsApp][CallMeBot]", err.message);
    return false;
  }
}

async function sendWhatsApp(message) {
  if (CALLMEBOT_APIKEY && WHATSAPP_TO) {
    return sendWhatsAppCallMeBot(message);
  }
  return sendWhatsAppTwilio(message);
}

function notifyStockAlert(analysis, recommendations) {
  const critical = recommendations.filter((r) => r.severity === "critical");
  const low = recommendations.filter((r) => r.severity === "low");
  const timestamp = new Date().toISOString();

  if (critical.length === 0 && low.length === 0) {
    sendDiscord({
      title: "✅ Inventory Scan Complete — All Stock Healthy",
      description: analysis,
      color: 0x22c55e,
      fields: [
        { name: "Status", value: "All products above reorder threshold", inline: true },
        { name: "Scanned At", value: new Date().toLocaleString(), inline: true },
      ],
      timestamp,
    });

    sendWhatsApp(
      [`✅ *StockAgent Scan Complete*`, ``, analysis, ``, `All products above reorder threshold. No action needed.`].join("\n")
    );

    sendEmail(
      `✅ Inventory Scan — All Stock Healthy`,
      `<h2>Inventory Scan Complete</h2><p>${analysis}</p><p style="color:#22c55e;font-weight:bold">All products are above their reorder thresholds. No reorders needed.</p><p style="color:#64748b;font-size:12px">Scanned at ${new Date().toLocaleString()}</p>`
    );
    return;
  }

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
    timestamp,
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

  const rows = recommendations
    .map(
      (r) =>
        `<tr><td>${r.severity === "critical" ? "🔴 Critical" : "🟡 Low"}</td><td>${r.product_name}</td><td>${r.current_stock}/${r.threshold}</td><td>${r.quantity} from ${r.supplier_name}</td></tr>`
    )
    .join("");
  sendEmail(
    `📦 Stock Alert — ${critical.length} critical, ${low.length} low`,
    `<h2>Stock Alert — Reorder Needed</h2><p>${analysis}</p><table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Severity</th><th>Product</th><th>Stock/Threshold</th><th>Reorder</th></tr>${rows}</table>`
  );
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

  sendEmail(
    `💳 PayPal Payout — $${amountUsd} to ${cycle.supplier_name}`,
    `<h2>PayPal Payout Sent</h2><table border="1" cellpadding="6" style="border-collapse:collapse"><tr><td><b>Product</b></td><td>${cycle.product_name}</td></tr><tr><td><b>Supplier</b></td><td>${cycle.supplier_name}</td></tr><tr><td><b>Amount</b></td><td>$${amountUsd} USD (KES ${cycle.total_kes.toLocaleString()})</td></tr><tr><td><b>Quantity</b></td><td>${cycle.quantity} units</td></tr><tr><td><b>Batch ID</b></td><td><code>${batchId}</code></td></tr></table>`
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

  sendEmail(
    `🧾 Invoice ${invoice.invoice_number} — KES ${totalKes.toLocaleString()}`,
    `<h2>Invoice Generated</h2><table border="1" cellpadding="6" style="border-collapse:collapse"><tr><td><b>Invoice</b></td><td>${invoice.invoice_number}</td></tr><tr><td><b>Recipient</b></td><td>${recipientName}</td></tr><tr><td><b>Total</b></td><td>KES ${totalKes.toLocaleString()}</td></tr><tr><td><b>Due</b></td><td>${invoice.due_date || "On delivery"}</td></tr></table>`
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

  const rows = cycles
    .map(
      (c) =>
        `<tr><td>${c.product_name}</td><td>${c.supplier_name}</td><td>${c.quantity} units</td><td>KES ${c.total_kes.toLocaleString()}</td></tr>`
    )
    .join("");
  sendEmail(
    `🔄 ${cycles.length} Reorder Cycle(s) Created — Awaiting Approval`,
    `<h2>${cycles.length} Reorder Cycle(s) Created</h2><p>Awaiting approval to trigger PayPal payouts.</p><table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Product</th><th>Supplier</th><th>Quantity</th><th>Total</th></tr>${rows}</table><p><b>Approve in the StockAgent dashboard to send payment.</b></p>`
  );
}

module.exports = {
  notifyStockAlert,
  notifyPayoutSent,
  notifyInvoiceCreated,
  notifyCycleCreated,
  DISCORD_ENABLED: !!DISCORD_WEBHOOK,
  WHATSAPP_ENABLED: !!((TWILIO_SID && TWILIO_TOKEN && WHATSAPP_TO) || (CALLMEBOT_APIKEY && WHATSAPP_TO)),
  EMAIL_ENABLED: !!emailTransport,
};
