-- StockAgent Database Schema

CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  email VARCHAR(255),
  paypal_email VARCHAR(255),
  phone VARCHAR(50),
  lead_time_days INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  unit VARCHAR(50) DEFAULT 'bag',
  unit_price_kes NUMERIC(10,2),
  current_stock INT DEFAULT 0,
  reorder_threshold INT DEFAULT 40,
  reorder_quantity INT DEFAULT 100,
  preferred_supplier_id INT REFERENCES suppliers(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_events (
  id SERIAL PRIMARY KEY,
  product_id INT REFERENCES products(id),
  event_type VARCHAR(50), -- 'dispatch', 'restock', 'adjustment'
  quantity INT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reorder_cycles (
  id SERIAL PRIMARY KEY,
  product_id INT REFERENCES products(id),
  supplier_id INT REFERENCES suppliers(id),
  quantity INT,
  unit_price_kes NUMERIC(10,2),
  total_kes NUMERIC(12,2),
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, paid, delivered
  approval_requested_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  paypal_transaction_id VARCHAR(255),
  agent_reasoning TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Seed Data: Mama Pima Distributors ──────────────────────────

INSERT INTO suppliers (name, contact_name, email, paypal_email, phone, lead_time_days) VALUES
  ('Unga Group', 'Peter Otieno', 'peter@unga.co.ke', 'payments@unga.co.ke', '+254700000001', 1),
  ('Bidco Africa', 'Mary Kamau', 'mary@bidco.co.ke', 'payments@bidco.co.ke', '+254700000002', 2),
  ('Kapa Oil', 'John Njoroge', 'john@kapa.co.ke', 'payments@kapa.co.ke', '+254700000003', 2);

INSERT INTO products (sku, name, unit, unit_price_kes, current_stock, reorder_threshold, reorder_quantity, preferred_supplier_id) VALUES
  ('UNG-MF-50', 'Unga Maize Flour 50kg', 'bag', 3200.00, 12, 40, 100, 1),
  ('BID-CO-20', 'Bidco Cooking Oil 20L', 'jerrycan', 4500.00, 8, 20, 50, 2),
  ('KAP-SG-50', 'Kapa Sugar 50kg', 'bag', 5500.00, 35, 30, 80, 3),
  ('UNG-WF-50', 'Unga Wheat Flour 50kg', 'bag', 3800.00, 55, 40, 100, 1),
  ('BID-SP-500', 'Bidco Soap 500g x 24', 'carton', 1800.00, 22, 15, 60, 2);
