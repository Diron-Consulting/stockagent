# Case Study: Mama Pima Distributors

> A realistic composite of a common East African FMCG distributor — illustrating the exact problem StockAgent solves.

---

## Who They Are

**Mama Pima Distributors** is a mid-tier FMCG distributor based in Eldoret, Kenya.
They supply 47 retail dukas, 3 supermarkets, and 12 schools across Uasin Gishu County.

| Detail | Info |
|---|---|
| SKUs | 200+ (cooking oil, sugar, flour, soap, rice, maize flour) |
| Active Suppliers | 8 (Bidco, Unga Group, Kapa Oil, 4 local) |
| Monthly Procurement Spend | KES 2.3M (~$18,000) |
| Staff | 11 people |
| Owner | James Waweru, 44 — uses WhatsApp, M-Pesa, Excel |

---

## A Normal Tuesday — The Problem in Full Detail

**6:00 AM** — Morning dispatch. 50kg bags of Unga maize flour going out to schools.

**7:30 AM** — Loading complete. Team realizes only **12 bags remain** — below Thursday's delivery requirement.

**8:15 AM** — Grace (procurement officer) is in traffic. Stock position lives in her head and her laptop Excel file.

**9:00 AM** — Grace arrives. Checks Excel. Notes 12 bags vs 40-bag threshold. Needs to reorder.

**9:20 AM** — Grace calls Unga Group rep Peter. No answer. Sends WhatsApp. Waits.

**10:45 AM** — Peter calls back. Negotiates: 100 bags × KES 3,200 = **KES 320,000**. Needs payment before raising delivery order.

**11:00 AM** — Grace walks to James's office. James is in a meeting with a school bursar about a KES 800,000 tender. She waits 20 minutes.

**11:25 AM** — James approves verbally. Grace returns to desk.

**11:30 AM** — Grace tries M-Pesa Paybill. Daily limit is KES 150,000. Blocked.

**12:00 PM** — James logs into Equity Bank portal. Slow. Fills transfer details. Submits.

**2:30 PM** — Bank transfer processes. Grace sends Peter confirmation screenshot on WhatsApp.

**3:00 PM** — Peter raises delivery order internally.

**Next day, Wednesday 10:00 AM** — Unga truck delivers 100 bags.

---

## The Damage From One Reorder Cycle

| Problem | Impact |
|---|---|
| Grace spent 3+ hours on one reorder | 30% of her working day on a routine task |
| James interrupted twice during client meeting | Risks losing KES 800,000 school tender |
| 18-hour gap: stock alert → delivery order raised | Thursday deliveries nearly failed |
| Manual Excel tracking — Grace is single point of failure | If Grace is sick, nobody knows what to reorder |
| Bank transfer fees | KES 280 × ~30 transactions/month = **KES 8,400/month** |
| 3 other SKUs also below threshold — nobody checked | Discovered Friday. Nearly caused stockouts. |

**This happens roughly 30 times a month across different SKUs and suppliers.**

---

## The Same Tuesday With StockAgent

**6:00 AM** — Warehouse team logs morning dispatch (simple web form or WhatsApp bot).

**6:03 AM** — EventBridge trigger fires. Stock DB: 12 bags < 40-bag threshold.

**6:04 AM** — Primary Logistics Agent activates:
- Stock Sub-Agent: confirms 12 bags, 30 bags needed Thursday, reorder qty = 100
- Order Sub-Agent: selects Unga Group (best price + lead time), calculates KES 320,000
- Compliance Sub-Agent: NDA valid, payment terms clear, no disputes

**6:05 AM** — James receives WhatsApp:

```
StockAgent Alert — Mama Pima Distributors

LOW STOCK: Unga Maize Flour
Current: 12 bags | Threshold: 40 bags
Pending deliveries Thursday: 30 bags

Recommended order:
• Supplier: Unga Group (Peter Otieno)
• Quantity: 100 × 50kg bags
• Unit price: KES 3,200
• Total: KES 320,000
• Expected delivery: Tomorrow by 10AM

Reply APPROVE to confirm payment.
```

**6:07 AM** — James is having breakfast. Replies: **APPROVE**

**6:07 AM** — MCP Server executes PayPal Payout to Unga Group. Confirmation sent to Peter automatically.

**6:08 AM** — Peter raises delivery order.

**Next day, Wednesday 10:00 AM** — Unga truck delivers as scheduled. James never left his breakfast table.

---

## Impact Summary

| Metric | Before StockAgent | After StockAgent |
|---|---|---|
| Time: stock alert → payment | 18+ hours | **7 minutes** |
| Staff hours per reorder cycle | 3+ hours | **0 hours** |
| Owner interruptions per reorder | 2 | **0** |
| Monthly bank transfer fees | KES 8,400 | **~KES 750 (PayPal)** |
| Stockout incidents per month | 4–6 | **Near zero** |
| Single point of failure (Grace) | Yes | **No** |
| Monthly staff time freed | — | **~30 hours** |

---

## Why James Would Pay for This

At KES 3,000/month (~$23) for the platform:

> *"I used to spend 30 hours of Grace's time every month just chasing suppliers and doing bank transfers. At her salary, that's KES 9,000 of labour cost for a task a machine now does in 7 minutes. The system pays for itself 3x over before I count the stockouts it prevents."*

---

## The One-Line Pitch

> *StockAgent is the difference between a distributor owner interrupting a KES 800,000 client meeting to approve a flour reorder — and him replying "APPROVE" from his breakfast table in 7 minutes.*

---

## Reference

- [AWS Agentic AI Supply Chain Architecture](https://aws.amazon.com/blogs/industries/transform-supply-chain-logistics-with-agentic-ai/)
- [StockAgent Architecture — README](./README.md)
- [PayPal AI Hackathon](https://developer.paypal.com/community/hackathon/)
