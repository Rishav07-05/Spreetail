# Scope Decisions & AI Usage Documentation

This document outlines key technical decisions, scope trade-offs, and details regarding AI-human pair programming collaboration for the Shared Expense Management Platform.

---

## Architectural & Scope Decisions

### 1. Local Fallback Authentication ("Demo Mode")
* **Decision**: We integrated a hybrid authentication system. In production, the backend verifies real JWT tokens from Clerk. In local development, the system falls back to a **Demo Mode** using a mock token authenticator.
* **Rationale**: This decouples development from third-party API availability, allowing developers to spin up the app offline with instant multi-user simulation without requiring active Clerk API keys.

### 2. Client-Side PDF Report Generation
* **Decision**: CSV import reports are generated entirely on the frontend using `jspdf` and `jspdf-autotable`, consuming aggregated metadata from the backend `/api/import/session/:sessionId/report` endpoint.
* **Rationale**: Offloading PDF generation to the client browser eliminates server-side PDF canvas dependencies, reduces CPU load on the backend API server, and allows instant downloads.

### 3. Chronological Pairwise Ledger Traceability
* **Decision**: In addition to computing simplified debts using a greedy balance-minimization algorithm, we implemented a pairwise transaction audit trail between any two members.
* **Rationale**: Simple debt reduction is convenient but destroys history (e.g. if A owes B, and B owes C, simplification resolves to A paying C, hiding B's involvement). Pairwise ledger chains ensure total auditability, allowing users to verify every transaction that led to their current balance.

### 4. Database-Level Soft Deletes (`deletedAt`)
* **Decision**: All entities (Users, Groups, Expenses, Settlements, Group Memberships) implement soft deletes via a nullable `deletedAt` field instead of physical row deletions.
* **Rationale**: Reconstructs historically accurate group states and balances. Even if an expense is deleted or a member leaves, audit logs and historic membership spans remain auditable.

---

## AI Collaboration & Tooling Details

This platform was built through a pair programming workflow between the developer and **Antigravity**, an agentic AI coding assistant developed by the Google DeepMind team.

### Division of Labor
* **Antigravity (AI)**:
  * Scaffolded the monorepo structure.
  * Designed the database schemas and ran Prisma migrations.
  * Implemented the timeline active membership check, split calculations, CSV parsing logic, and the 21-rule anomaly detector.
  * Maintained a strict, incremental Git commit history corresponding to individual features.
* **Developer (Human)**:
  * Provided high-level feature requirements and design decisions.
  * Verified database constraints and Docker containers.
  * Steered structural design patterns (e.g. transactional isolation in the CSV finalizer).

### Development Environment & Status
* **Operating System**: Linux (Ubuntu Desktop)
* **IDE**: Cursor / VS Code
* **Version Control**: Git (automated incremental feature commits)
* **Database**: PostgreSQL (running locally in Docker)
