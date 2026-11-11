require("dotenv").config();
const express = require("express");
const Database = require("better-sqlite3");
const axios = require("axios");
const cors = require("cors");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");

const { router: invoicePdfRouter } = require("./invoice-pdf");
const { notifyStockAlert, notifyPayoutSent, notifyInvoiceCreated, notifyCycleCreated, getEmailTo, setEmailTo, sendAdminEmail, DISCORD_ENABLED, WHATSAPP_ENABLED, EMAIL_ENABLED } = require("./notifications");

const app = express();
app.use(cors());
app.use(express.json());

// ── AI Client ────────────────────────────────────────────────────
const AI_ENABLED = !!process.env.ANTHROPIC_API_KEY;
const anthropic = AI_ENABLED ? new Anthropic() : null;
const AI_MODEL = "claude-haiku-5-5";

// ── Database setup ────────────────────────────────────────────────
const db = new Database(path.join(__dirname, "stockagent.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_name TEXT,
    email TEXT,
    paypal_email TEXT,
    phone TEXT,
    lead_time_days INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'duka',
    contact_name TEXT,
    phone TEXT,
    email TEXT,
    location TEXT,
    color TEXT DEFAULT '#3b82f6',
    initials TEXT,
    payment_terms TEXT DEFAULT 'cash',
    credit_limit_kes REAL DEFAULT 0,
    stocking_frequency TEXT DEFAULT 'weekly',
    stocking_day TEXT DEFAULT 'Monday',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    unit TEXT DEFAULT 'bag',
    unit_price_kes REAL,
    current_stock INTEGER DEFAULT 0,
    reorder_threshold INTEGER DEFAULT 40,
    reorder_quantity INTEGER DEFAULT 100,
    preferred_supplier_id INTEGER REFERENCES suppliers(id),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dispatches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_id INTEGER REFERENCES recipients(id),
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER,
    unit_price_kes REAL,
    total_kes REAL,
    invoice_id INTEGER,
    dispatched_at TEXT DEFAULT (datetime('now')),
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT UNIQUE NOT NULL,
    recipient_id INTEGER REFERENCES recipients(id),
    total_kes REAL,
    status TEXT DEFAULT 'unpaid',
    due_date TEXT,
    paypal_invoice_id TEXT,
    issued_at TEXT DEFAULT (datetime('now')),
    paid_at TEXT
  );

  CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER REFERENCES invoices(id),
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER,
    unit_price_kes REAL,
    total_kes REAL
  );

  CREATE TABLE IF NOT EXISTS stock_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER REFERENCES products(id),
    event_type TEXT,
    quantity INTEGER,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reorder_cycles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER REFERENCES products(id),
    supplier_id INTEGER REFERENCES suppliers(id),
    quantity INTEGER,
    unit_price_kes REAL,
    total_kes REAL,
    status TEXT DEFAULT 'pending',
    approval_requested_at TEXT,
    approved_at TEXT,
    paid_at TEXT,
    paypal_transaction_id TEXT,
    agent_reasoning TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agent_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    step TEXT NOT NULL,
    message TEXT NOT NULL,
    data TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ── Seed data ─────────────────────────────────────────────────────
const supplierCount = db.prepare("SELECT COUNT(*) as n FROM suppliers").get().n;
if (supplierCount === 0) {
  // Suppliers
  db.prepare(`INSERT INTO suppliers (name,contact_name,email,paypal_email,phone,lead_time_days) VALUES (?,?,?,?,?,?)`).run("Unga Group","Peter Otieno","peter@unga.co.ke","payments@unga.co.ke","+254700000001",1);
  db.prepare(`INSERT INTO suppliers (name,contact_name,email,paypal_email,phone,lead_time_days) VALUES (?,?,?,?,?,?)`).run("Bidco Africa","Mary Kamau","mary@bidco.co.ke","payments@bidco.co.ke","+254700000002",2);
  db.prepare(`INSERT INTO suppliers (name,contact_name,email,paypal_email,phone,lead_time_days) VALUES (?,?,?,?,?,?)`).run("Kapa Oil","John Njoroge","john@kapa.co.ke","payments@kapa.co.ke","+254700000003",2);

  // Recipients — the dukas, supermarkets, schools Mama Pima delivers to
  const insertRecipient = db.prepare(`INSERT INTO recipients (name,type,contact_name,phone,email,location,color,initials,payment_terms,credit_limit_kes,stocking_frequency,stocking_day) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  insertRecipient.run("Westlands Supermarket","supermarket","Alice Njeri","+254711000001","orders@westlands.co.ke","Westlands, Nairobi","#8b5cf6","WS","net-30",150000,"twice-weekly","Monday,Thursday");
  insertRecipient.run("Eldoret Highway Mart","supermarket","Brian Kiptoo","+254711000002","procurement@highwaymart.co.ke","Eldoret Town","#06b6d4","EH","net-14",80000,"weekly","Tuesday");
  insertRecipient.run("Mama Njeri Duka","duka","Njeri Wambui","+254711000003","","Pipeline Estate, Eldoret","#f59e0b","MN","cash",0,"twice-weekly","Monday,Friday");
  insertRecipient.run("Jua Kali Grocers","duka","Kamau Mwangi","+254711000004","","Langas, Eldoret","#10b981","JK","cash",0,"weekly","Wednesday");
  insertRecipient.run("St. Patrick's School","school","Fr. Omondi","+254711000005","bursar@stpatricks.sc.ke","Eldoret","#ef4444","SP","net-7",30000,"monthly","1st");
  insertRecipient.run("Eldoret Primary School","school","Headmistress Chege","+254711000006","eldoretprimary@edu.ke","Eldoret","#f97316","EP","net-7",25000,"monthly","1st");
  insertRecipient.run("Tumaini Duka","duka","Joyce Auma","+254711000007","","Racecourse, Eldoret","#06b6d4","TD","cash",0,"weekly","Thursday");
  insertRecipient.run("Quick Stop Minimart","duka","Hassan Omar","+254711000008","","Muindi Mbingu St","#84cc16","QS","net-7",15000,"twice-weekly","Tuesday,Friday");
  insertRecipient.run("Kapsabet Secondary","school","Mr. Rono","+254711000009","kapsabet.school@edu.ke","Kapsabet","#a855f7","KS","net-14",20000,"monthly","15th");
  insertRecipient.run("Plateau Wholesale","wholesale","Grace Sang","+254711000010","grace@plateauwholesale.co.ke","Industrial Area","#ec4899","PW","net-30",200000,"weekly","Wednesday");
  insertRecipient.run("Mwamba Grocers","duka","Peter Mwamba","+254711000011","","Chepkoilel, Eldoret","#14b8a6","MG","cash",0,"weekly","Monday");
  insertRecipient.run("Green Valley Stores","supermarket","Irene Mutai","+254711000012","irene@greenvalley.co.ke","Nakuru Road","#f43f5e","GV","net-14",60000,"twice-weekly","Monday,Thursday");

  // Products
  db.prepare(`INSERT INTO products (sku,name,unit,unit_price_kes,current_stock,reorder_threshold,reorder_quantity,preferred_supplier_id) VALUES (?,?,?,?,?,?,?,?)`).run("UNG-MF-50","Unga Maize Flour 50kg","bag",3200,12,40,100,1);
  db.prepare(`INSERT INTO products (sku,name,unit,unit_price_kes,current_stock,reorder_threshold,reorder_quantity,preferred_supplier_id) VALUES (?,?,?,?,?,?,?,?)`).run("BID-CO-20","Bidco Cooking Oil 20L","jerrycan",4500,8,20,50,2);
  db.prepare(`INSERT INTO products (sku,name,unit,unit_price_kes,current_stock,reorder_threshold,reorder_quantity,preferred_supplier_id) VALUES (?,?,?,?,?,?,?,?)`).run("KAP-SG-50","Kapa Sugar 50kg","bag",5500,35,30,80,3);
  db.prepare(`INSERT INTO products (sku,name,unit,unit_price_kes,current_stock,reorder_threshold,reorder_quantity,preferred_supplier_id) VALUES (?,?,?,?,?,?,?,?)`).run("UNG-WF-50","Unga Wheat Flour 50kg","bag",3800,55,40,100,1);
  db.prepare(`INSERT INTO products (sku,name,unit,unit_price_kes,current_stock,reorder_threshold,reorder_quantity,preferred_supplier_id) VALUES (?,?,?,?,?,?,?,?)`).run("BID-SP-500","Bidco Soap 500g x24","carton",1800,22,15,60,2);

  // Seed historical dispatches (last 4 weeks)
  const insertDispatch = db.prepare(`INSERT INTO dispatches (recipient_id,product_id,quantity,unit_price_kes,total_kes,dispatched_at) VALUES (?,?,?,?,?,?)`);
  const days = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };
  insertDispatch.run(1,1,10,3400,34000,days(28)); insertDispatch.run(1,2,5,4700,23500,days(28));
  insertDispatch.run(2,1,8,3400,27200,days(27)); insertDispatch.run(2,3,6,5700,34200,days(27));
  insertDispatch.run(3,1,3,3500,10500,days(25)); insertDispatch.run(4,1,2,3500,7000,days(25));
  insertDispatch.run(5,1,20,3200,64000,days(24)); insertDispatch.run(6,1,15,3200,48000,days(24));
  insertDispatch.run(1,1,10,3400,34000,days(21)); insertDispatch.run(7,2,4,4700,18800,days(21));
  insertDispatch.run(8,1,4,3500,14000,days(20)); insertDispatch.run(10,3,15,5500,82500,days(19));
  insertDispatch.run(2,1,8,3400,27200,days(14)); insertDispatch.run(3,2,3,4700,14100,days(14));
  insertDispatch.run(4,4,2,3900,7800,days(13)); insertDispatch.run(11,1,3,3500,10500,days(13));
  insertDispatch.run(12,1,8,3400,27200,days(12)); insertDispatch.run(12,2,4,4700,18800,days(12));
  insertDispatch.run(5,1,20,3200,64000,days(7)); insertDispatch.run(6,1,15,3200,48000,days(7));
  insertDispatch.run(9,3,5,5500,27500,days(7)); insertDispatch.run(1,1,10,3400,34000,days(7));
  insertDispatch.run(2,1,8,3400,27200,days(3)); insertDispatch.run(10,1,20,3200,64000,days(3));
  insertDispatch.run(3,1,3,3500,10500,days(2)); insertDispatch.run(4,2,2,4700,9400,days(2));

  console.log("[DB] Seeded with Mama Pima full dataset");
}

const MCP_URL = process.env.MCP_SERVER_URL || "http://localhost:3001";
const kesToUsd = (kes) => (kes / 130).toFixed(2);

// ── Invoice number generator ──────────────────────────────────────
function nextInvoiceNumber() {
  const count = db.prepare("SELECT COUNT(*) as n FROM invoices").get().n;
  const pad = String(count + 1).padStart(4, "0");
  const date = new Date().toISOString().slice(0,7).replace("-","");
  return `INV-${date}-${pad}`;
}

// ── Agent log helper ─────────────────────────────────────────────
function agentLog(step, message, data = null) {
  db.prepare("INSERT INTO agent_logs (step, message, data) VALUES (?, ?, ?)").run(
    step, message, data ? JSON.stringify(data) : null
  );
  console.log(`[Agent][${step}] ${message}`);
}

// ── Gather inventory snapshot for AI ─────────────────────────────
function gatherInventorySnapshot() {
  const products = db.prepare(`
    SELECT p.*, s.name as supplier_name, s.paypal_email, s.lead_time_days, s.id as supplier_id
    FROM products p
    LEFT JOIN suppliers s ON s.id = p.preferred_supplier_id
  `).all();
  const suppliers = db.prepare("SELECT * FROM suppliers").all();
  const pendingCycles = db.prepare(`
    SELECT rc.*, p.name as product_name, s.name as supplier_name
    FROM reorder_cycles rc
    JOIN products p ON p.id = rc.product_id
    JOIN suppliers s ON s.id = rc.supplier_id
    WHERE rc.status = 'pending'
  `).all();
  const recentDispatches = db.prepare(`
    SELECT d.product_id, p.name as product_name, SUM(d.quantity) as total_dispatched
    FROM dispatches d JOIN products p ON p.id = d.product_id
    WHERE d.dispatched_at >= datetime('now', '-7 days')
    GROUP BY d.product_id
  `).all();
  return { products, suppliers, pendingCycles, recentDispatches };
}

// ── SYSTEM PROMPT ────────────────────────────────────────────────
const AGENT_SYSTEM_PROMPT = `You are StockAgent, an autonomous AI supply chain agent for Mama Pima Distributors — an FMCG distributor based in Eldoret, Kenya serving dukas, supermarkets, schools, and wholesale outlets.

Your role is to:
1. STOCK SUB-AGENT: Analyze current inventory levels against reorder thresholds. Flag items as "critical" (stock <= 30% of threshold), "low" (stock <= threshold), or "ok".
2. ORDER SUB-AGENT: For items needing reorder, select the preferred supplier, determine optimal reorder quantity (use the product's default reorder_quantity), and calculate total cost in KES.
3. COMPLIANCE SUB-AGENT: Check for duplicate pending orders — if a supplier already has a pending reorder cycle, flag compliance_check as "fail" to prevent double-ordering.

Consider recent dispatch velocity (last 7 days) when assessing urgency. Higher dispatch rates on a low-stock item mean more urgency.

IMPORTANT: Return ONLY valid JSON matching the exact schema below. No markdown, no explanation outside the JSON.`;

const AGENT_USER_TEMPLATE = (snapshot) => `Analyze this inventory and recommend reorder actions.

CURRENT INVENTORY:
${JSON.stringify(snapshot.products, null, 2)}

SUPPLIERS:
${JSON.stringify(snapshot.suppliers, null, 2)}

PENDING REORDER CYCLES (check for duplicates):
${JSON.stringify(snapshot.pendingCycles, null, 2)}

RECENT DISPATCH VELOCITY (last 7 days):
${JSON.stringify(snapshot.recentDispatches, null, 2)}

Return a JSON object with this exact schema:
{
  "analysis": "<2-3 sentence overall supply chain assessment>",
  "recommendations": [
    {
      "product_id": <number>,
      "product_name": "<string>",
      "current_stock": <number>,
      "threshold": <number>,
      "severity": "critical" | "low" | "ok",
      "supplier_id": <number>,
      "supplier_name": "<string>",
      "quantity": <number>,
      "unit_price_kes": <number>,
      "total_kes": <number>,
      "reasoning": "<1-2 sentence explanation of why this reorder is needed, referencing dispatch velocity and stock ratio>",
      "compliance_check": "pass" | "fail",
      "compliance_note": "<explanation — e.g. 'No pending orders for this supplier' or 'Supplier already has pending cycle #X'>"
    }
  ]
}

Only include products that need reordering (severity "critical" or "low"). If all stock is healthy, return an empty recommendations array.`;

// ── Mock AI response for demo/no-key mode ────────────────────────
function generateMockAIResponse(snapshot) {
  const lowStock = snapshot.products.filter(p => p.current_stock <= p.reorder_threshold);
  const pendingSupplierIds = new Set(snapshot.pendingCycles.map(c => c.supplier_id));
  const dispatchMap = {};
  for (const d of snapshot.recentDispatches) dispatchMap[d.product_id] = d.total_dispatched;

  const recommendations = lowStock.map(p => {
    const ratio = p.current_stock / p.reorder_threshold;
    const severity = ratio <= 0.3 ? "critical" : "low";
    const hasPending = pendingSupplierIds.has(p.preferred_supplier_id);
    const velocity = dispatchMap[p.id] || 0;
    return {
      product_id: p.id,
      product_name: p.name,
      current_stock: p.current_stock,
      threshold: p.reorder_threshold,
      severity,
      supplier_id: p.preferred_supplier_id,
      supplier_name: p.supplier_name,
      quantity: p.reorder_quantity,
      unit_price_kes: p.unit_price_kes,
      total_kes: p.reorder_quantity * p.unit_price_kes,
      reasoning: `Stock at ${p.current_stock}/${p.reorder_threshold} (${(ratio * 100).toFixed(0)}%). ${velocity > 0 ? `${velocity} units dispatched in the last 7 days — high burn rate.` : "Low recent dispatch activity."} Reorder ${p.reorder_quantity} ${p.unit}s from ${p.supplier_name} at KES ${p.unit_price_kes} each. Lead time: ${p.lead_time_days} day(s).`,
      compliance_check: hasPending ? "fail" : "pass",
      compliance_note: hasPending
        ? `Supplier ${p.supplier_name} already has a pending reorder cycle. Skipping to prevent duplicate order.`
        : `No pending orders for ${p.supplier_name}. Clear to proceed.`
    };
  });

  const criticalCount = recommendations.filter(r => r.severity === "critical").length;
  const lowCount = recommendations.filter(r => r.severity === "low").length;

  return {
    analysis: `Inventory scan complete. ${criticalCount} product(s) at CRITICAL levels and ${lowCount} at LOW levels requiring immediate reorder. ${snapshot.pendingCycles.length > 0 ? `${snapshot.pendingCycles.length} existing pending cycle(s) detected — compliance checks applied.` : "No pending cycles — all suppliers clear for new orders."}`,
    recommendations
  };
}

// ── AI-Powered Primary Agent ─────────────────────────────────────
async function runPrimaryAgent() {
  agentLog("scan_start", "Primary Logistics Agent triggered — gathering inventory data");

  const snapshot = gatherInventorySnapshot();
  agentLog("data_gathered", `Inventory snapshot: ${snapshot.products.length} products, ${snapshot.suppliers.length} suppliers, ${snapshot.pendingCycles.length} pending cycles`, {
    products: snapshot.products.length,
    low_stock: snapshot.products.filter(p => p.current_stock <= p.reorder_threshold).length
  });

  let aiResult;
  const mode = AI_ENABLED ? "ai" : "rule_engine";

  if (AI_ENABLED) {
    agentLog("ai_call", `Calling Claude ${AI_MODEL} for supply chain analysis...`);
    try {
      const response = await anthropic.messages.create({
        model: AI_MODEL,
        max_tokens: 4096,
        system: AGENT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: AGENT_USER_TEMPLATE(snapshot) }],
      });

      const text = response.content.find(b => b.type === "text")?.text || "{}";
      agentLog("ai_response", `Claude responded (${response.usage.input_tokens} input, ${response.usage.output_tokens} output tokens)`, {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        model: response.model
      });

      // Parse — strip any markdown fences the model might add
      const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
      aiResult = JSON.parse(cleaned);
    } catch (err) {
      agentLog("ai_error", `AI call failed: ${err.message} — falling back to rule-based analysis`);
      aiResult = generateMockAIResponse(snapshot);
    }
  } else {
    agentLog("rule_engine", "Using rule-based inventory analysis engine");
    aiResult = generateMockAIResponse(snapshot);
  }

  agentLog("analysis", aiResult.analysis, { recommendation_count: aiResult.recommendations?.length || 0 });

  // Process recommendations into reorder cycles
  const cycles = [];
  const passedRecs = (aiResult.recommendations || []).filter(r => r.compliance_check === "pass" && (r.severity === "critical" || r.severity === "low"));

  for (const rec of passedRecs) {
    const existing = db.prepare("SELECT id FROM reorder_cycles WHERE product_id=? AND status='pending'").get(rec.product_id);
    if (existing) {
      agentLog("compliance_block", `Skipped ${rec.product_name} — pending cycle #${existing.id} already exists`);
      continue;
    }

    const result = db.prepare(`
      INSERT INTO reorder_cycles (product_id, supplier_id, quantity, unit_price_kes, total_kes, status, approval_requested_at, agent_reasoning)
      VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'), ?)
    `).run(rec.product_id, rec.supplier_id, rec.quantity, rec.unit_price_kes, rec.total_kes, rec.reasoning);

    cycles.push({ cycle_id: result.lastInsertRowid, ...rec });
    agentLog("cycle_created", `Reorder cycle #${result.lastInsertRowid}: ${rec.product_name} → ${rec.supplier_name} | ${rec.quantity} units @ KES ${rec.total_kes}`, {
      cycle_id: result.lastInsertRowid,
      severity: rec.severity
    });
  }

  const skipped = (aiResult.recommendations || []).filter(r => r.compliance_check === "fail");
  for (const s of skipped) {
    agentLog("compliance_skip", `${s.product_name}: ${s.compliance_note}`);
  }

  const summary = `${cycles.length} reorder cycle(s) created. ${skipped.length} skipped (compliance).`;
  agentLog("scan_complete", summary, { cycles_created: cycles.length, skipped: skipped.length });

  notifyStockAlert(aiResult.analysis, aiResult.recommendations || []);
  notifyCycleCreated(cycles);

  return {
    message: summary,
    analysis: aiResult.analysis,
    mode,
    cycles,
    skipped,
    all_recommendations: aiResult.recommendations || []
  };
}

// ══════════════════════════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════════════════════════

// ── Products ──────────────────────────────────────────────────────
app.get("/api/products", (req, res) => {
  res.json(db.prepare(`
    SELECT p.*, s.name as supplier_name
    FROM products p LEFT JOIN suppliers s ON s.id = p.preferred_supplier_id
    ORDER BY (CAST(p.current_stock AS REAL)/p.reorder_threshold) ASC
  `).all());
});

app.post("/api/products/:id/dispatch", (req, res) => {
  const { quantity, recipient_id, unit_price_kes } = req.body;
  const product = db.prepare("SELECT * FROM products WHERE id=?").get(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });

  const price = unit_price_kes || product.unit_price_kes;
  const total = quantity * price;

  db.prepare("UPDATE products SET current_stock = MAX(0, current_stock - ?) WHERE id=?").run(parseInt(quantity), req.params.id);

  const dispatch = db.prepare(`
    INSERT INTO dispatches (recipient_id,product_id,quantity,unit_price_kes,total_kes)
    VALUES (?,?,?,?,?)
  `).run(recipient_id || null, req.params.id, quantity, price, total);

  db.prepare("INSERT INTO stock_events (product_id,event_type,quantity,note) VALUES (?,?,?,?)").run(
    req.params.id, "dispatch", quantity,
    recipient_id ? `Dispatched to recipient #${recipient_id}` : "Manual dispatch"
  );

  const updated = db.prepare("SELECT * FROM products WHERE id=?").get(req.params.id);
  res.json({ ...updated, dispatch_id: dispatch.lastInsertRowid });

  // Auto-trigger: if stock dropped below threshold, run agent scan asynchronously
  if (updated.current_stock <= updated.reorder_threshold) {
    agentLog("auto_trigger", `${updated.name} dropped to ${updated.current_stock}/${updated.reorder_threshold} after dispatch — triggering agent scan`);
    runPrimaryAgent().catch(err => agentLog("auto_trigger_error", err.message));
  }
});

// ── Recipients ────────────────────────────────────────────────────
app.get("/api/recipients", (req, res) => {
  const recipients = db.prepare("SELECT * FROM recipients WHERE active=1 ORDER BY name").all();
  res.json(recipients.map(r => {
    const stats = db.prepare(`
      SELECT COUNT(*) as total_dispatches,
             COALESCE(SUM(total_kes),0) as total_value_kes,
             MAX(dispatched_at) as last_dispatch
      FROM dispatches WHERE recipient_id=?
    `).get(r.id);
    const topProduct = db.prepare(`
      SELECT p.name, SUM(d.quantity) as qty
      FROM dispatches d JOIN products p ON p.id=d.product_id
      WHERE d.recipient_id=? GROUP BY d.product_id ORDER BY qty DESC LIMIT 1
    `).get(r.id);
    const unpaidInvoices = db.prepare("SELECT COUNT(*) as n, COALESCE(SUM(total_kes),0) as total FROM invoices WHERE recipient_id=? AND status='unpaid'").get(r.id);
    return { ...r, ...stats, top_product: topProduct?.name, unpaid_invoices: unpaidInvoices.n, unpaid_kes: unpaidInvoices.total };
  }));
});

app.get("/api/recipients/:id", (req, res) => {
  const r = db.prepare("SELECT * FROM recipients WHERE id=?").get(req.params.id);
  if (!r) return res.status(404).json({ error: "Not found" });
  const dispatches = db.prepare(`
    SELECT d.*, p.name as product_name, p.sku, p.unit
    FROM dispatches d JOIN products p ON p.id=d.product_id
    WHERE d.recipient_id=? ORDER BY d.dispatched_at DESC LIMIT 30
  `).all(req.params.id);
  const invoices = db.prepare("SELECT * FROM invoices WHERE recipient_id=? ORDER BY issued_at DESC").all(req.params.id);
  const summary = db.prepare(`
    SELECT COUNT(*) as total_dispatches, COALESCE(SUM(total_kes),0) as total_value_kes,
           COUNT(DISTINCT product_id) as unique_products
    FROM dispatches WHERE recipient_id=?
  `).get(req.params.id);
  res.json({ ...r, dispatches, invoices, summary });
});

app.post("/api/recipients", (req, res) => {
  const { name, type, contact_name, phone, email, location, color, initials, payment_terms, credit_limit_kes, stocking_frequency, stocking_day } = req.body;
  const ini = initials || name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0,2);
  const result = db.prepare(`
    INSERT INTO recipients (name,type,contact_name,phone,email,location,color,initials,payment_terms,credit_limit_kes,stocking_frequency,stocking_day)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(name, type||"duka", contact_name, phone, email, location, color||"#3b82f6", ini, payment_terms||"cash", credit_limit_kes||0, stocking_frequency||"weekly", stocking_day||"Monday");
  res.json(db.prepare("SELECT * FROM recipients WHERE id=?").get(result.lastInsertRowid));
});

// ── Invoices ──────────────────────────────────────────────────────
app.post("/api/invoices/generate/:recipient_id", (req, res) => {
  const { recipient_id } = req.params;
  const { dispatch_ids } = req.body;

  const recipient = db.prepare("SELECT * FROM recipients WHERE id=?").get(recipient_id);
  if (!recipient) return res.status(404).json({ error: "Recipient not found" });

  const query = dispatch_ids?.length
    ? `SELECT d.*,p.name as product_name FROM dispatches d JOIN products p ON p.id=d.product_id WHERE d.invoice_id IS NULL AND d.recipient_id=? AND d.id IN (${dispatch_ids.map(()=>"?").join(",")})`
    : `SELECT d.*,p.name as product_name FROM dispatches d JOIN products p ON p.id=d.product_id WHERE d.invoice_id IS NULL AND d.recipient_id=?`;

  const params = dispatch_ids?.length ? [recipient_id, ...dispatch_ids] : [recipient_id];
  const unbilled = db.prepare(query).all(...params);
  if (unbilled.length === 0) return res.status(400).json({ error: "No unbilled dispatches found for this recipient" });

  const total_kes = unbilled.reduce((sum, d) => sum + d.total_kes, 0);
  const dueDate = new Date();
  const terms = { "cash": 0, "net-7": 7, "net-14": 14, "net-30": 30 };
  dueDate.setDate(dueDate.getDate() + (terms[recipient.payment_terms] || 0));

  const invoiceNum = nextInvoiceNumber();
  const invoice = db.prepare(`
    INSERT INTO invoices (invoice_number,recipient_id,total_kes,status,due_date)
    VALUES (?,?,?,'unpaid',?)
  `).run(invoiceNum, recipient_id, total_kes, dueDate.toISOString().slice(0,10));

  const invoiceId = invoice.lastInsertRowid;

  for (const d of unbilled) {
    db.prepare("INSERT INTO invoice_items (invoice_id,product_id,quantity,unit_price_kes,total_kes) VALUES (?,?,?,?,?)").run(invoiceId, d.product_id, d.quantity, d.unit_price_kes, d.total_kes);
    db.prepare("UPDATE dispatches SET invoice_id=? WHERE id=?").run(invoiceId, d.id);
  }

  const fullInvoice = db.prepare("SELECT * FROM invoices WHERE id=?").get(invoiceId);
  const items = db.prepare(`SELECT ii.*,p.name as product_name,p.sku,p.unit FROM invoice_items ii JOIN products p ON p.id=ii.product_id WHERE ii.invoice_id=?`).all(invoiceId);

  axios.post(`${MCP_URL}/tools/create_invoice`, {
    recipient_email: recipient.email || "customer@example.com",
    recipient_name: recipient.name,
    items: unbilled.map(d => ({
      name: d.product_name,
      quantity: d.quantity,
      unit_price: parseFloat(kesToUsd(d.total_kes / d.quantity)),
      currency: "USD"
    })),
    note: `StockAgent Invoice ${invoiceNum}`,
    due_date: dueDate.toISOString().slice(0,10)
  }).catch(err => console.error("[MCP Invoice]", err.message));

  notifyInvoiceCreated(fullInvoice, recipient.name, total_kes);
  res.json({ invoice: fullInvoice, items, recipient, total_kes });
});

app.get("/api/invoices", (req, res) => {
  const invoices = db.prepare(`
    SELECT i.*, r.name as recipient_name, r.type as recipient_type, r.color, r.initials
    FROM invoices i JOIN recipients r ON r.id=i.recipient_id
    ORDER BY i.issued_at DESC LIMIT 50
  `).all();
  res.json(invoices);
});

app.get("/api/invoices/:id", (req, res) => {
  const invoice = db.prepare(`SELECT i.*,r.name as recipient_name,r.contact_name,r.phone,r.email,r.location,r.color,r.initials,r.payment_terms FROM invoices i JOIN recipients r ON r.id=i.recipient_id WHERE i.id=?`).get(req.params.id);
  if (!invoice) return res.status(404).json({ error: "Not found" });
  const items = db.prepare(`SELECT ii.*,p.name as product_name,p.sku,p.unit FROM invoice_items ii JOIN products p ON p.id=ii.product_id WHERE ii.invoice_id=?`).all(req.params.id);
  res.json({ invoice, items });
});

app.post("/api/invoices/:id/mark-paid", (req, res) => {
  db.prepare("UPDATE invoices SET status='paid', paid_at=datetime('now') WHERE id=?").run(req.params.id);
  res.json(db.prepare("SELECT * FROM invoices WHERE id=?").get(req.params.id));
});

app.post("/api/invoices/:id/send-paypal", async (req, res) => {
  const invoice = db.prepare(`SELECT i.*,r.email,r.name as recipient_name FROM invoices i JOIN recipients r ON r.id=i.recipient_id WHERE i.id=?`).get(req.params.id);
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });

  const items_data = db.prepare(`SELECT ii.*,p.name as product_name,p.unit FROM invoice_items ii JOIN products p ON p.id=ii.product_id WHERE ii.invoice_id=?`).all(req.params.id);
  const amount_usd = parseFloat(kesToUsd(invoice.total_kes));

  try {
    const mcpRes = await axios.post(`${MCP_URL}/tools/create_invoice`, {
      recipient_email: invoice.email || "customer@example.com",
      recipient_name: invoice.recipient_name,
      note: `StockAgent Invoice ${invoice.invoice_number}`,
      due_date: invoice.due_date,
      items: items_data.map(it => ({
        name: it.product_name,
        quantity: it.quantity,
        unit_price: parseFloat(kesToUsd(it.unit_price_kes)),
        currency: "USD"
      }))
    });

    db.prepare("UPDATE invoices SET paypal_invoice_id=? WHERE id=?").run(mcpRes.data.invoice_id, req.params.id);
    agentLog("invoice_sent", `Invoice ${invoice.invoice_number} sent via PayPal: ${mcpRes.data.invoice_id}`);
    res.json({ success: true, paypal: mcpRes.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Analytics: recipient stocking frequency heatmap data ─────────
app.get("/api/analytics/recipients", (req, res) => {
  const data = db.prepare(`
    SELECT r.id, r.name, r.type, r.color, r.initials, r.stocking_frequency,
           COUNT(d.id) as dispatch_count,
           COALESCE(SUM(d.total_kes),0) as total_kes,
           COALESCE(SUM(d.quantity),0) as total_units,
           MAX(d.dispatched_at) as last_dispatch,
           MIN(d.dispatched_at) as first_dispatch
    FROM recipients r
    LEFT JOIN dispatches d ON d.recipient_id=r.id
    WHERE r.active=1
    GROUP BY r.id ORDER BY total_kes DESC
  `).all();
  res.json(data);
});

// ── Dispatches ──────────────────────────────────────────────────
app.get("/api/dispatches", (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(db.prepare(`
    SELECT d.*, p.name as product_name, p.sku, p.unit, r.name as recipient_name, r.initials, r.color
    FROM dispatches d
    JOIN products p ON p.id = d.product_id
    LEFT JOIN recipients r ON r.id = d.recipient_id
    ORDER BY d.dispatched_at DESC LIMIT ?
  `).all(limit));
});

// ── Agent scan (AI-powered) ──────────────────────────────────────
app.post("/api/agent/scan", async (req, res) => {
  try {
    const result = await runPrimaryAgent();
    res.json(result);
  } catch (err) {
    agentLog("scan_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Agent logs ───────────────────────────────────────────────────
app.get("/api/agent/logs", (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const logs = db.prepare("SELECT * FROM agent_logs ORDER BY id DESC LIMIT ?").all(limit);
  res.json(logs.reverse());
});

// ── Demo mode ────────────────────────────────────────────────────
app.post("/api/agent/demo", async (req, res) => {
  const steps = [];
  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  try {
    agentLog("demo_start", "=== FULL DEMO SEQUENCE STARTED ===");
    steps.push({ step: "demo_start", message: "Demo sequence initiated" });

    // Step 1: Pick a product and recipient, dispatch enough to make stock critical
    const product = db.prepare(`
      SELECT p.*, s.name as supplier_name
      FROM products p LEFT JOIN suppliers s ON s.id = p.preferred_supplier_id
      ORDER BY (CAST(p.current_stock AS REAL) / p.reorder_threshold) DESC LIMIT 1
    `).get();

    const recipient = db.prepare("SELECT * FROM recipients LIMIT 1").get();

    const dispatchQty = Math.max(1, product.current_stock - Math.floor(product.reorder_threshold * 0.2));
    agentLog("demo_dispatch", `Dispatching ${dispatchQty} ${product.unit}s of ${product.name} to ${recipient.name} to simulate demand spike`);
    steps.push({ step: "dispatch", message: `Dispatching ${dispatchQty}x ${product.name} to ${recipient.name}` });

    db.prepare("UPDATE products SET current_stock = MAX(0, current_stock - ?) WHERE id=?").run(dispatchQty, product.id);
    const dispResult = db.prepare(`INSERT INTO dispatches (recipient_id,product_id,quantity,unit_price_kes,total_kes) VALUES (?,?,?,?,?)`).run(
      recipient.id, product.id, dispatchQty, product.unit_price_kes, dispatchQty * product.unit_price_kes
    );
    db.prepare("INSERT INTO stock_events (product_id,event_type,quantity,note) VALUES (?,?,?,?)").run(
      product.id, "dispatch", dispatchQty, `Demo dispatch to ${recipient.name}`
    );

    const updatedProduct = db.prepare("SELECT * FROM products WHERE id=?").get(product.id);
    steps.push({ step: "stock_dropped", message: `${product.name} stock dropped to ${updatedProduct.current_stock}/${updatedProduct.reorder_threshold}`, product: updatedProduct });

    await delay(800);

    // Step 2: Run AI agent scan
    agentLog("demo_scan", "Triggering AI agent scan after stock drop...");
    steps.push({ step: "agent_scan", message: "AI agent analyzing inventory..." });
    const scanResult = await runPrimaryAgent();
    steps.push({ step: "scan_result", message: scanResult.message, analysis: scanResult.analysis, cycles: scanResult.cycles });

    await delay(500);

    // Step 3: Auto-approve first pending cycle and pay via PayPal
    if (scanResult.cycles.length > 0) {
      const cycle = db.prepare(`
        SELECT rc.*, p.name as product_name, s.paypal_email, s.name as supplier_name
        FROM reorder_cycles rc JOIN products p ON p.id=rc.product_id JOIN suppliers s ON s.id=rc.supplier_id
        WHERE rc.id=? AND rc.status='pending'
      `).get(scanResult.cycles[0].cycle_id);

      if (cycle) {
        const amount_usd = parseFloat(kesToUsd(cycle.total_kes));
        agentLog("demo_approve", `Auto-approving cycle #${cycle.id}: paying $${amount_usd} to ${cycle.supplier_name} via PayPal`);
        steps.push({ step: "payment", message: `Sending $${amount_usd} to ${cycle.supplier_name} via PayPal` });

        try {
          const payoutRes = await axios.post(`${MCP_URL}/tools/send_payout`, {
            recipient_email: cycle.paypal_email,
            amount_usd,
            note: `StockAgent reorder: ${cycle.product_name} x${cycle.quantity}`,
            sender_item_id: `STOCKAGENT-DEMO-${cycle.id}-${Date.now()}`
          });
          db.prepare("UPDATE reorder_cycles SET status='paid',approved_at=datetime('now'),paid_at=datetime('now'),paypal_transaction_id=? WHERE id=?").run(payoutRes.data.batch_id, cycle.id);
          db.prepare("UPDATE products SET current_stock=current_stock+? WHERE id=?").run(cycle.quantity, cycle.product_id);
          db.prepare("INSERT INTO stock_events (product_id,event_type,quantity,note) VALUES (?,?,?,?)").run(cycle.product_id, "restock", cycle.quantity, `PayPal Demo: ${payoutRes.data.batch_id}`);

          const restockedProduct = db.prepare("SELECT * FROM products WHERE id=?").get(cycle.product_id);
          steps.push({ step: "payment_complete", message: `Payment sent! Batch: ${payoutRes.data.batch_id}. Stock restocked to ${restockedProduct.current_stock}.`, paypal: payoutRes.data });
          agentLog("demo_paid", `PayPal payout complete: ${payoutRes.data.batch_id}. Stock restocked to ${restockedProduct.current_stock}.`);
          notifyPayoutSent(cycle, payoutRes.data.batch_id, amount_usd);
        } catch (err) {
          steps.push({ step: "payment_error", message: `PayPal call failed: ${err.message}` });
          agentLog("demo_pay_error", err.message);
        }
      }
    }

    // Step 4: Generate invoice for the dispatch
    const unbilled = db.prepare(`
      SELECT d.* FROM dispatches d WHERE d.invoice_id IS NULL AND d.recipient_id=? AND d.id=?
    `).get(recipient.id, dispResult.lastInsertRowid);

    if (unbilled) {
      const invoiceNum = nextInvoiceNumber();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);
      const dueDateStr = dueDate.toISOString().slice(0,10);
      const inv = db.prepare(`INSERT INTO invoices (invoice_number,recipient_id,total_kes,status,due_date) VALUES (?,?,?,'unpaid',?)`).run(
        invoiceNum, recipient.id, unbilled.total_kes, dueDateStr
      );
      db.prepare("INSERT INTO invoice_items (invoice_id,product_id,quantity,unit_price_kes,total_kes) VALUES (?,?,?,?,?)").run(
        inv.lastInsertRowid, unbilled.product_id, unbilled.quantity, unbilled.unit_price_kes, unbilled.total_kes
      );
      db.prepare("UPDATE dispatches SET invoice_id=? WHERE id=?").run(inv.lastInsertRowid, unbilled.id);
      const demoInvoice = db.prepare("SELECT * FROM invoices WHERE id=?").get(inv.lastInsertRowid);

      try {
        const invoiceProduct = db.prepare("SELECT name FROM products WHERE id=?").get(unbilled.product_id);
        const amount_usd = parseFloat(kesToUsd(unbilled.total_kes));
        await axios.post(`${MCP_URL}/tools/create_invoice`, {
          recipient_email: recipient.email || "customer@example.com",
          recipient_name: recipient.name,
          items: [{
            name: invoiceProduct?.name || "Goods dispatched",
            quantity: unbilled.quantity,
            unit_price: parseFloat(kesToUsd(unbilled.unit_price_kes)),
            currency: "USD"
          }],
          note: `StockAgent Invoice ${invoiceNum}`,
          due_date: dueDateStr
        });
        agentLog("demo_paypal_invoice", `PayPal invoice created via MCP for ${recipient.name}: $${amount_usd}`);
      } catch (err) {
        agentLog("demo_paypal_invoice_error", `MCP invoice call failed: ${err.message}`);
      }

      notifyInvoiceCreated(demoInvoice, recipient.name, unbilled.total_kes);
      steps.push({ step: "invoice", message: `Invoice ${invoiceNum} generated for ${recipient.name}: KES ${unbilled.total_kes.toLocaleString()}` });
      agentLog("demo_invoice", `Invoice ${invoiceNum} created: KES ${unbilled.total_kes}`);
    }

    agentLog("demo_complete", "=== DEMO SEQUENCE COMPLETE ===");
    steps.push({ step: "demo_complete", message: "Full agentic commerce cycle complete: Dispatch → AI Analysis → Supplier Payment → Invoice" });

    res.json({ success: true, steps });
  } catch (err) {
    agentLog("demo_error", err.message);
    res.status(500).json({ error: err.message, steps });
  }
});

// ── Reorder cycles ────────────────────────────────────────────────
app.get("/api/cycles", (req, res) => {
  res.json(db.prepare(`
    SELECT rc.*, p.name as product_name, p.sku, s.name as supplier_name
    FROM reorder_cycles rc JOIN products p ON p.id=rc.product_id JOIN suppliers s ON s.id=rc.supplier_id
    ORDER BY rc.created_at DESC LIMIT 20
  `).all());
});

app.post("/api/cycles/:id/approve", async (req, res) => {
  const cycle = db.prepare(`
    SELECT rc.*, p.name as product_name, s.paypal_email, s.name as supplier_name
    FROM reorder_cycles rc JOIN products p ON p.id=rc.product_id JOIN suppliers s ON s.id=rc.supplier_id
    WHERE rc.id=? AND rc.status='pending'
  `).get(req.params.id);
  if (!cycle) return res.status(404).json({ error: "Cycle not found or already processed" });

  const amount_usd = parseFloat(kesToUsd(cycle.total_kes));
  try {
    const payoutRes = await axios.post(`${MCP_URL}/tools/send_payout`, {
      recipient_email: cycle.paypal_email, amount_usd,
      note: `StockAgent reorder: ${cycle.product_name} x${cycle.quantity}`,
      sender_item_id: `STOCKAGENT-${cycle.id}-${Date.now()}`
    });
    db.prepare("UPDATE reorder_cycles SET status='paid',approved_at=datetime('now'),paid_at=datetime('now'),paypal_transaction_id=? WHERE id=?").run(payoutRes.data.batch_id, req.params.id);
    db.prepare("UPDATE products SET current_stock=current_stock+? WHERE id=?").run(cycle.quantity, cycle.product_id);
    db.prepare("INSERT INTO stock_events (product_id,event_type,quantity,note) VALUES (?,?,?,?)").run(cycle.product_id, "restock", cycle.quantity, `PayPal: ${payoutRes.data.batch_id}`);
    agentLog("cycle_approved", `Cycle #${cycle.id} approved — $${amount_usd} sent to ${cycle.supplier_name}`, { batch_id: payoutRes.data.batch_id });
    notifyPayoutSent(cycle, payoutRes.data.batch_id, amount_usd);
    res.json({ success: true, message: `Payment of $${amount_usd} (KES ${cycle.total_kes}) sent to ${cycle.supplier_name}`, paypal: payoutRes.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Notification settings ────────────────────────────────────────
app.get("/api/notifications/email", (req, res) => {
  res.json({ email: getEmailTo() || "", enabled: EMAIL_ENABLED });
});

app.put("/api/notifications/email", (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Valid email address required" });
  }
  const prev = getEmailTo();
  setEmailTo(email);
  sendAdminEmail(
    `StockAgent: new subscriber ${email}`,
    `<p>Someone subscribed to StockAgent notifications.</p><table border="1" cellpadding="6" style="border-collapse:collapse"><tr><td><b>Email</b></td><td>${email}</td></tr><tr><td><b>Previous</b></td><td>${prev || 'none'}</td></tr><tr><td><b>Time</b></td><td>${new Date().toLocaleString()}</td></tr></table>`
  );
  res.json({ email: getEmailTo(), enabled: EMAIL_ENABLED, message: `Notifications will be sent to ${email}` });
});

// ── Health ────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({
  status: "ok",
  db: "sqlite",
  ai: AI_ENABLED ? "claude" : "rule_engine",
  model: AI_MODEL,
  timestamp: new Date().toISOString()
}));

// ── Invoice PDF route ────────────────────────────────────────────
app.locals.db = db;
app.use(invoicePdfRouter);

const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MINUTES || "60", 10) * 60 * 1000;

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`StockAgent API on http://localhost:${PORT}`);
  console.log(`AI Mode: ${AI_ENABLED ? `Claude ${AI_MODEL}` : "Rule Engine (set ANTHROPIC_API_KEY for AI)"}`);
  console.log(`Scheduled scan: every ${SCAN_INTERVAL_MS / 60000} minutes`);
  setTimeout(() => runPrimaryAgent().catch(err => console.error("[Agent] Startup scan error:", err.message)), 1500);
  setInterval(() => {
    agentLog("scheduled_scan", "Scheduled inventory scan triggered");
    runPrimaryAgent().catch(err => agentLog("scheduled_scan_error", err.message));
  }, SCAN_INTERVAL_MS);
});
