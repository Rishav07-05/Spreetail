# Shared Expense Management Platform

An enterprise-grade, timeline-aware multi-user debt settlement and financial dashboard built with **React 19**, **Express**, **Prisma ORM**, and **Tailwind CSS v4**.

---

## Key Features

* **🛡️ Hybrid Authentication (Clerk + Developer Mock Mode)**: Validates standard Clerk JWT tokens in production, falling back to a quick multi-user mock profile switcher (Aisha, Priya, Rohan, Meera, Sam) in offline/development environments.
* **📅 Timeline-Aware Group Membership**: Validates member transaction eligibility using distinct entry (`joinedAt`) and exit (`leftAt`) timestamps, preventing retroactive liabilities and self-settlements.
* **🧮 Exact & Weighted Splits Engine**: Supports `EQUAL`, `EXACT`, `PERCENTAGE`, and `WEIGHTED` divisions, with automatic IEEE-754 remainder adjustment (up to a ₹0.01 threshold) shifted onto the primary participant.
* **📥 CSV Data Quality Import Pipeline**: Ingests comma-separated spreadsheet logs via an RFC-4180 compliant parser. Runs a 21-rule background anomaly scanner verifying data integrity before saving to the live database.
* **⚠️ Staging & Anomaly Resolution Center**: Provides a visual workspace for line-by-line review of flagged CSV anomalies, allowing manual value edits, rejection of rows, and atomic finalized batch updates.
* **🔍 Audit Trail & Pairwise Traceability**: Goes beyond basic debt minimization to expose chronological audit chains showing every shared transaction between two users that led to their current balance.
* **📜 Immutable Central Auditing**: Implements database triggers/services to capture all create, update, and delete actions with old-vs-new JSON diff visualizers.
* **📄 Client-Side PDF Reports**: Generates detailed, themed ledger summaries of CSV import transactions for easy printing.

---

## Tech Stack

* **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, TanStack Query v5, React Hook Form, Zod, Lucide Icons, jsPDF.
* **Backend**: Node.js, Express.js, TypeScript, Prisma ORM.
* **Database**: PostgreSQL (Prisma Client).

---

## Project Structure

```text
├── backend/
│   ├── prisma/             # Schema files & database migrations
│   ├── src/
│   │   ├── middleware/     # Auth checks
│   │   ├── routes/         # Express API controllers
│   │   ├── services/       # Split service, membership validator, CSV parsing, audit loggers
│   │   └── server.ts       # Express app configuration
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── assets/         # Images and SVGs
│   │   ├── context/        # Clerk/Mock Auth providers
│   │   ├── lib/            # Type-safe API client wrapper
│   │   ├── App.tsx         # Dashboard views, staging sheets, pairwise overlays
│   │   └── index.css       # Tailwind CSS v4 theme config
│   ├── vite.config.ts      # Tailwind plugin & proxy setup
│   └── tsconfig.json
├── package.json            # Monorepo workspaces configuration
└── README.md
```

---

## Getting Started

### 1. Prerequisite Installations
* **Node.js**: `v18.x` or higher
* **PostgreSQL**: Local database instance running or remote endpoint (e.g. NeonDB)

### 2. Environment Variables

Create a `.env` file inside the `backend/` directory:
```env
PORT=5000
DATABASE_URL="postgresql://username:password@localhost:5432/spreetail_expense"
FRONTEND_URL="http://localhost:5173"
# Clerk Keys (Optional for production auth)
# CLERK_PUBLISHABLE_KEY=pk_test_...
# CLERK_SECRET_KEY=sk_test_...
```

Create a `.env` file inside the `frontend/` directory:
```env
# Optional for production auth
# VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

### 3. Installation Workflows

From the root workspace directory, run:
```bash
# Install packages for all workspaces (workspaces auto-configure)
npm install
```

### 4. Database Setup & Migration

Generate the Prisma Client and run migrations against your database:
```bash
# Inside monorepo root:
npm run build:backend
```
This automatically runs `prisma generate` and compiles the typescript code.
To initialize migrations and seed tables:
```bash
cd backend
npx prisma migrate dev --name init
```

### 5. Running the Application locally

Start the Express backend and Vite frontend development servers in parallel:
```bash
# Run both dev servers concurrently from the root directory
npm run dev
```

The application will be accessible at:
* **Frontend**: `http://localhost:5173`
* **Backend API**: `http://localhost:5000`

---

## AI Collaboration

This project was built using a pair-programming model with **Antigravity**, a high-efficiency agentic AI coding assistant developed by the Google DeepMind team. For concrete prompts, error resolutions, and AI tool logs, please refer to [AI_USAGE.md](file:///home/xenoz/Desktop/Spreetail/AI_USAGE.md).
