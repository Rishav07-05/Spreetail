# Architectural Decisions Log

This document details key architectural decisions, design options considered, and the rationale behind final selections.

---

## 1. Hybrid Authentication Model

### Options Considered
* **Option A (Clerk-Only Auth)**: Force active Clerk keys and configuration in all environments.
* **Option B (Custom DB Auth)**: Build standard JWT sessions using username/passwords.
* **Option C (Hybrid Clerk + Development Mock Fallback)**: Validate Clerk JWT signatures in production, falling back in development to a local `localStorage` mock profile switcher with a standard `mock-token-*` authorization header prefix.

### Decision & Rationale
**Option C** was chosen. In local sandbox environments, third-party authentication configurations can introduce massive deployment hurdles (e.g., API key expiry, internet requirements, redirect URI configs). The fallback mock authenticator allows developers to spin up the entire monorepo instantly, switch between five simulated profiles (Aisha, Rohan, Priya, Meera, Sam) in one-click, and test timeline splitting scenarios offline while retaining a standard production-grade Clerk engine.

---

## 2. CSV Import Pipelines: Direct Ingest vs. Staging Quarantine

### Options Considered
* **Option A (Direct Ingest)**: Read rows, insert valid ones, and abort on first error (fail-fast).
* **Option B (Log & Skip)**: Insert valid rows and write errors to log files, skipping bad rows without manual correction options.
* **Option C (Quarantine & Review Board)**: Parse all rows, write them to staging tables (`ImportSession`, `ImportRecord`), quarantine invalid lines with descriptive `ImportAnomaly` warnings, and expose a UI review board for manual corrections before committing.

### Decision & Rationale
**Option C** was chosen. In real-world data imports, files often contain minor spelling casing issues or date mismatches. Option A creates partial ingestion states, leading to duplicates upon retry. Option B drops data silently. Option C provides total audit-compliant control: the user sees what went wrong, edits fields in the staging dashboard, rejects rows that represent duplicates, and atomically commits the finalized session.

---

## 3. Debt Minimization vs. Pairwise Audit Traceability

### Options Considered
* **Option A (Simplified Debts Only)**: Use a greedy debt-minimization solver (e.g. using a heap/greedy match) to reduce total transaction paths.
* **Option B (Chronological Pairwise Ledgers)**: Expose only direct pairwise debts.
* **Option C (Greedy Minimization + Chronological Pairwise Trace Ledger)**: Use the minimization solver to offer a "Quick Settle" button, but provide an interactive pairwise ledger tracking every expense/payment between two users.

### Decision & Rationale
**Option C** was chosen. Debt simplification is highly convenient for reducing the number of physical bank transfers, but it destroys transaction history (e.g., if Aisha owes Priya, and Priya owes ris, simplification computes Aisha paying ris directly, hiding Priya's involvement). By combining a greedy balance match for quick settlements with a complete chronological pairwise audit trace, the app guarantees full balance auditability.

---

## 4. Client-Side PDF Report Generation

### Options Considered
* **Option A (Server-side PDF Rendering)**: Render reports on the backend using Puppeteer (headless Chrome) or PDFKit and return them as download streams.
* **Option B (Client-side Rendering)**: Aggregate metadata on the backend and build the PDF in the user's browser using `jspdf` and `jspdf-autotable`.

### Decision & Rationale
**Option B** was chosen. Server-side PDF generators require heavy native system dependencies (which complicate cloud deployment on platforms like Vercel/Railway) and increase server CPU/RAM usage. Offloading PDF compilation to the client leverages local browser resources, ensures compatibility across lightweight cloud runtimes, and enables instantaneous, network-free downloads.

---

## 5. Database Soft Deletes (`deletedAt`)

### Options Considered
* **Option A (Physical Deletion)**: Run physical SQL `DELETE` operations on models.
* **Option B (Soft Deletions with Boolean Flags)**: Set `isDeleted = true`.
* **Option C (Soft Deletions with nullable `deletedAt` timestamps)**: Set `deletedAt = DateTime`.

### Decision & Rationale
**Option C** was chosen. In expense systems, deleting historical records physically ruins historical timelines and ledger balances. Soft-deleting via a nullable timestamp preserves records for auditing and tracking, preserves historical timeline membership slots, and makes it easy to filter active records using `where: { deletedAt: null }` in Prisma.
