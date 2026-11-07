const express = require("express");
const Database = require("better-sqlite3");
const axios = require("axios");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

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

// ── AGENTS ────────────────────────────────────────────────────────
function runStockSubAgent() {
  return db.prepare(`
    SELECT p.*, s.name as supplier_name, s.paypal_email, s.lead_time_days
    FROM products p
    LEFT JOIN suppliers s ON s.id = p.preferred_supplier_id
    WHERE p.current_stock <= p.reorder_threshold
  `).all();
}

function runOrderSubAgent(product) {
  const total_kes = product.reorder_quantity * product.unit_price_kes;
  return {
    product_id: product.id, product_name: product.name,
    supplier_id: product.preferred_supplier_id, supplier_name: product.supplier_name,
    paypal_email: product.paypal_email,
    quantity: product.reorder_quantity, unit_price_kes: product.unit_price_kes,
    total_kes, total_usd: parseFloat(kesToUsd(total_kes)),
    reasoning: `Stock at ${product.current_stock} ${product.unit}s — below threshold of ${product.reorder_threshold}. ` +
               `Reorder ${product.reorder_quantity} from ${product.supplier_name} @ KES ${product.unit_price_kes}. ` +
               `Delivery in ${product.lead_time_days} day(s).`
  };
}

function runComplianceSubAgent(order) {
  const existing = db.prepare("SELECT id FROM reorder_cycles WHERE supplier_id=? AND status='pending' LIMIT 1").get(order.supplier_id);
  return {
    approved: !existing,
    reason: existing
      ? `${order.supplier_name} already has a pending order.`
      : `Compliance passed for ${order.supplier_name}.`
  };
}

function runPrimaryAgent() {
  console.log("[Agent] Primary Logistics Agent triggered");
  const lowStock = runStockSubAgent();
  if (lowStock.length === 0) return { message: "All stock levels healthy.", cycles: [] };
  const cycles = [];
  for (const product of lowStock) {
    const order = runOrderSubAgent(product);
    const compliance = runComplianceSubAgent(order);
    if (!compliance.approved) { console.log(`[Compliance] ${compliance.reason}`); continue; }
    const result = db.prepare(`
      INSERT INTO reorder_cycles (product_id,supplier_id,quantity,unit_price_kes,total_kes,status,approval_requested_at,agent_reasoning)
      VALUES (?,?,?,?,?,'pending',datetime('now'),?)
    `).run(order.product_id, order.supplier_id, order.quantity, order.unit_price_kes, order.total_kes, order.reasoning);
    cycles.push({ cycle_id: result.lastInsertRowid, order });
    console.log(`[Agent] Cycle #${result.lastInsertRowid}: ${order.product_name} → ${order.supplier_name} KES ${order.total_kes}`);
  }
  return { message: `${cycles.length} cycle(s) queued`, cycles };
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

  res.json({ ...db.prepare("SELECT * FROM products WHERE id=?").get(req.params.id), dispatch_id: dispatch.lastInsertRowid });
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
  const { dispatch_ids } = req.body; // optional: specific dispatches, else all unbilled

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

// ── Reorder cycles ────────────────────────────────────────────────
app.post("/api/agent/scan", (req, res) => {
  try { res.json(runPrimaryAgent()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

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
    res.json({ success: true, message: `Payment of $${amount_usd} (KES ${cycle.total_kes}) sent to ${cycle.supplier_name}`, paypal: payoutRes.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Health ────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok", db: "sqlite", timestamp: new Date().toISOString() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`StockAgent API on http://localhost:${PORT}`);
  setTimeout(() => runPrimaryAgent(), 1500);
});
