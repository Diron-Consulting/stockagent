const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PAYPAL_BASE = process.env.PAYPAL_MODE === "sandbox"
  ? "https://api-m.sandbox.paypal.com"
  : "https://api-m.paypal.com";

const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const isMock = () => !CLIENT_ID || CLIENT_ID === "sandbox_placeholder";

const transactions = [];

// ── MCP Tool: list_tools ─────────────────────────────────────────
app.get("/tools", (req, res) => {
  res.json({
    tools: [
      {
        name: "get_paypal_token",
        description: "Get a PayPal access token for API calls",
        parameters: {}
      },
      {
        name: "send_payout",
        description: "Send a PayPal payout to a supplier",
        parameters: {
          recipient_email: "string — supplier PayPal email",
          amount_usd: "number — amount in USD",
          note: "string — payment note/reference",
          sender_item_id: "string — unique reference ID"
        }
      },
      {
        name: "create_invoice",
        description: "Create and send a PayPal invoice to a recipient",
        parameters: {
          recipient_email: "string — recipient email address",
          recipient_name: "string — recipient business/person name",
          items: "array — [{name, quantity, unit_price, currency}]",
          note: "string — invoice note",
          due_date: "string — YYYY-MM-DD due date"
        }
      },
      {
        name: "send_invoice",
        description: "Send an already-created draft PayPal invoice",
        parameters: {
          invoice_id: "string — PayPal invoice ID"
        }
      },
      {
        name: "get_invoice_status",
        description: "Check the payment status of a PayPal invoice",
        parameters: {
          invoice_id: "string — PayPal invoice ID"
        }
      },
      {
        name: "get_transaction_status",
        description: "Get status of a PayPal payout batch",
        parameters: {
          batch_id: "string — PayPal payout batch ID"
        }
      },
      {
        name: "get_transactions",
        description: "List recent PayPal transactions (payouts and invoices)",
        parameters: {}
      }
    ]
  });
});

// ── Helper: get access token ─────────────────────────────────────
async function getAccessToken() {
  if (isMock()) {
    return "SANDBOX_TOKEN";
  }
  const response = await axios.post(
    `${PAYPAL_BASE}/v1/oauth2/token`,
    "grant_type=client_credentials",
    {
      auth: { username: CLIENT_ID, password: CLIENT_SECRET },
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    }
  );
  return response.data.access_token;
}

// ── Tool: send_payout ────────────────────────────────────────────
app.post("/tools/send_payout", async (req, res) => {
  const { recipient_email, amount_usd, note, sender_item_id } = req.body;

  if (isMock()) {
    const batch_id = `SB-BATCH-${Date.now()}`;
    console.log(`[MCP][Sandbox] Payout: $${amount_usd} → ${recipient_email} | Ref: ${sender_item_id}`);
    const tx = {
      type: "payout", id: batch_id, sandbox: true,
      recipient: recipient_email, amount_usd: parseFloat(amount_usd),
      note, status: "SUCCESS", timestamp: new Date().toISOString()
    };
    transactions.unshift(tx);
    return res.json({
      success: true, sandbox: true, batch_id,
      status: "PENDING",
      message: `Sandbox payout of $${amount_usd} to ${recipient_email} queued`,
      timestamp: tx.timestamp
    });
  }

  try {
    const token = await getAccessToken();
    const response = await axios.post(
      `${PAYPAL_BASE}/v1/payments/payouts`,
      {
        sender_batch_header: {
          sender_batch_id: sender_item_id,
          email_subject: "Payment from Mama Pima Distributors",
          email_message: note
        },
        items: [{
          recipient_type: "EMAIL",
          amount: { value: parseFloat(amount_usd).toFixed(2), currency: "USD" },
          note,
          sender_item_id,
          receiver: recipient_email
        }]
      },
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );
    const batch_id = response.data.batch_header.payout_batch_id;
    transactions.unshift({
      type: "payout", id: batch_id, sandbox: false,
      recipient: recipient_email, amount_usd: parseFloat(amount_usd),
      note, status: "PENDING", timestamp: new Date().toISOString()
    });
    res.json({ success: true, batch_id, status: "PENDING" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// ── Tool: get_transaction_status ─────────────────────────────────
app.get("/tools/transaction_status/:batch_id", async (req, res) => {
  if (req.params.batch_id.startsWith("SB-")) {
    return res.json({ status: "SUCCESS", sandbox: true, batch_id: req.params.batch_id });
  }
  try {
    const token = await getAccessToken();
    const response = await axios.get(
      `${PAYPAL_BASE}/v1/payments/payouts/${req.params.batch_id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    res.json({ status: response.data.batch_header.batch_status, details: response.data });
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ── Tool: create_invoice ─────────────────────────────────────────
app.post("/tools/create_invoice", async (req, res) => {
  const { recipient_email, recipient_name, items, note, due_date } = req.body;

  if (!recipient_email || !items || !items.length) {
    return res.status(400).json({ success: false, error: "recipient_email and items[] are required" });
  }

  if (isMock()) {
    const invoice_id = `SB-INV-${Date.now()}`;
    const total = items.reduce((s, i) => s + (i.quantity || 1) * (i.unit_price || 0), 0);
    const currency = items[0]?.currency || "USD";
    console.log(`[MCP][Sandbox] Invoice: ${invoice_id} → ${recipient_email} | $${total.toFixed(2)} ${currency}`);
    const tx = {
      type: "invoice", id: invoice_id, sandbox: true,
      recipient: recipient_email, recipient_name,
      amount: total, currency, items,
      note, due_date, status: "SENT",
      timestamp: new Date().toISOString()
    };
    transactions.unshift(tx);
    return res.json({
      success: true, sandbox: true, invoice_id,
      status: "SENT", total, currency,
      message: `Sandbox invoice of $${total.toFixed(2)} ${currency} sent to ${recipient_email}`,
      detail: {
        id: invoice_id, recipient_email, recipient_name,
        items, note, due_date, total, currency,
        view_url: `https://www.sandbox.paypal.com/invoice/p/#${invoice_id}`
      },
      timestamp: tx.timestamp
    });
  }

  try {
    const token = await getAccessToken();
    const currency = items[0]?.currency || "USD";

    const invoiceBody = {
      detail: {
        invoice_number: `SA-${Date.now()}`,
        currency_code: currency,
        note: note || "Invoice from Mama Pima Distributors via StockAgent",
        payment_term: due_date ? { due_date } : undefined
      },
      invoicer: {
        name: { given_name: "Mama Pima", surname: "Distributors" },
        email_address: CLIENT_ID ? undefined : "mamapima@business.example.com"
      },
      primary_recipients: [{
        billing_info: {
          name: { given_name: recipient_name || "Customer" },
          email_address: recipient_email
        }
      }],
      items: items.map(item => ({
        name: item.name,
        quantity: String(item.quantity || 1),
        unit_amount: {
          currency_code: item.currency || currency,
          value: parseFloat(item.unit_price || 0).toFixed(2)
        },
        unit_of_measure: "QUANTITY"
      }))
    };

    const createRes = await axios.post(
      `${PAYPAL_BASE}/v2/invoicing/invoices`,
      invoiceBody,
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );

    const invoiceHref = createRes.data.href;
    const invoice_id = invoiceHref.split("/").pop();

    await axios.post(
      `${PAYPAL_BASE}/v2/invoicing/invoices/${invoice_id}/send`,
      { send_to_invoicer: true },
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );

    const total = items.reduce((s, i) => s + (i.quantity || 1) * (i.unit_price || 0), 0);
    transactions.unshift({
      type: "invoice", id: invoice_id, sandbox: false,
      recipient: recipient_email, recipient_name,
      amount: total, currency, items,
      note, due_date, status: "SENT",
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true, invoice_id, status: "SENT", total, currency,
      message: `Invoice sent to ${recipient_email}`,
      detail: { id: invoice_id, recipient_email, recipient_name, items, note, due_date, total, currency }
    });
  } catch (err) {
    const detail = err.response?.data;
    console.error("[MCP] create_invoice error:", JSON.stringify(detail || err.message));
    res.status(500).json({ success: false, error: detail || err.message });
  }
});

// ── Tool: send_invoice ───────────────────────────────────────────
app.post("/tools/send_invoice/:invoice_id", async (req, res) => {
  const { invoice_id } = req.params;

  if (invoice_id.startsWith("SB-")) {
    return res.json({
      success: true, sandbox: true, invoice_id, status: "SENT",
      message: `Sandbox invoice ${invoice_id} sent`,
      timestamp: new Date().toISOString()
    });
  }

  try {
    const token = await getAccessToken();
    await axios.post(
      `${PAYPAL_BASE}/v2/invoicing/invoices/${invoice_id}/send`,
      { send_to_invoicer: true },
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );
    res.json({ success: true, invoice_id, status: "SENT", message: `Invoice ${invoice_id} sent` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// ── Tool: invoice_status ─────────────────────────────────────────
app.get("/tools/invoice_status/:invoice_id", async (req, res) => {
  const { invoice_id } = req.params;

  if (invoice_id.startsWith("SB-")) {
    const recorded = transactions.find(t => t.id === invoice_id);
    return res.json({
      success: true, sandbox: true, invoice_id,
      status: recorded?.status || "SENT",
      amount: recorded?.amount || 0,
      currency: recorded?.currency || "USD",
      recipient: recorded?.recipient || "unknown",
      timestamp: recorded?.timestamp || new Date().toISOString()
    });
  }

  try {
    const token = await getAccessToken();
    const response = await axios.get(
      `${PAYPAL_BASE}/v2/invoicing/invoices/${invoice_id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const inv = response.data;
    res.json({
      success: true, invoice_id,
      status: inv.status,
      amount: inv.amount?.value,
      currency: inv.amount?.currency_code,
      recipient: inv.primary_recipients?.[0]?.billing_info?.email_address,
      detail: inv
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// ── Tool: transactions list ──────────────────────────────────────
app.get("/tools/transactions", async (req, res) => {
  if (isMock()) {
    return res.json({
      success: true, sandbox: true,
      transactions: transactions.slice(0, 50),
      count: transactions.length
    });
  }

  try {
    const merged = [...transactions];

    const token = await getAccessToken();
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
      const txRes = await axios.get(
        `${PAYPAL_BASE}/v1/reporting/transactions`, {
          params: {
            start_date: thirtyDaysAgo.toISOString(),
            end_date: now.toISOString(),
            fields: "all",
            page_size: 20
          },
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      const paypalTxs = (txRes.data.transaction_details || []).map(tx => ({
        type: tx.transaction_info?.transaction_event_code?.startsWith("T11") ? "payout" : "invoice",
        id: tx.transaction_info?.transaction_id,
        amount: parseFloat(tx.transaction_info?.transaction_amount?.value || 0),
        currency: tx.transaction_info?.transaction_amount?.currency_code,
        status: tx.transaction_info?.transaction_status,
        timestamp: tx.transaction_info?.transaction_initiation_date,
        sandbox: false
      }));
      merged.push(...paypalTxs);
    } catch (e) {
      // transactions API may not be available in sandbox
    }

    merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json({ success: true, transactions: merged.slice(0, 50), count: merged.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// ── Health check ─────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    mode: isMock() ? "sandbox" : (process.env.PAYPAL_MODE || "live"),
    tools: ["send_payout", "create_invoice", "send_invoice", "invoice_status", "transaction_status", "transactions"],
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`MCP Server running on port ${PORT} [${isMock() ? "sandbox" : "live"} mode]`));
