# AI Usage Documentation

This document logs the AI tools utilized, key prompts, and three concrete case studies where the AI generated erroneous code, how it was caught, and how we resolved it.

---

## 1. AI Tools & Key Prompts

### Tool Used
* **Antigravity**: An agentic AI coding assistant developed by the Google DeepMind team.

### Key Prompts
* **Scaffolding**: *"Initialize a TypeScript Node/Express backend with Prisma, React 19, and Vite frontend. Establish a monorepo setup using npm workspaces."*
* **Design Theme**: *"Implement a minimalist SaaS dashboard using Tailwind CSS v4. Apply a Crimson (#DC143C) on Near-Black (#0B0B0B) color palette. Avoid flashy gradients, prioritize clean spacing, card-based layouts, responsive grids, skeleton loaders, and empty states."*
* **Ingestion Scanner**: *"Create a 21-rule CSV anomaly scanner checking for blank fields, negative amounts, USD indicators, date formatting, and member timeline validity spans."*
* **State Management**: *"Integrate TanStack Query for cache invalidation when creating groups, registering member entry/exit dates, adding expenses, and finalizing CSV import sessions."*

---

## 2. Concrete Case Studies: AI Errors & Fixes

Here are three concrete instances where the AI generated incorrect code or configuration, how it was identified, and the engineering resolutions applied:

### Case Study 1: UI State Setter Reference Mismatch
* **The Error**: During the large-scale layout build of `App.tsx`, the AI declared state variable `isCreateGroupOpen` and its setter `setIsCreateGroupOpen`. However, in the button handlers (lines 415, 800, and 1411), it wrote `setIsCreateOpen(true/false)`, which was undefined, and declared a dummy helper `let setIsCreateOpen` at the bottom of the file to bypass local editor markers.
* **How Caught**: Compiled the frontend project via `npm run build:frontend`. The compiler failed with a type check error indicating that `setIsCreateOpen` was being re-assigned or invoked improperly, and the console flagged it as dead code.
* **Resolution**: Removed the global dummy helper and replaced all references to `setIsCreateOpen` with the proper React state setter `setIsCreateGroupOpen`.

---

### Case Study 2: Missing Member Fetch Endpoint (`GET /:id/members`)
* **The Error**: The AI engineered the frontend client wrapper (`api.ts`) to request group members via `GET /api/groups/:groupId/members` to populate select dropdowns for expense payers and participant check-lists. However, it forgot to register this route on the backend Express router in `backend/src/routes/group.routes.ts`.
* **How Caught**: Discovered during verification when checking the members tab list and the expense creation form. The UI elements remained blank, and the browser console logged a `404 Not Found` for the `/members` path.
* **Resolution**: Added the missing `GET /:id/members` route handler to `group.routes.ts` on the backend, ensuring it checks membership authorization before querying and returning group member lists.

---

### Case Study 3: Mismatched CSV Ingestion Route Definitions
* **The Error**: The AI implemented backend routes for CSV uploads and sessions as group-specific endpoints (`/api/import/group/:groupId/import` and `/api/import/group/:groupId/sessions`) to ensure transactions are scoped to a group. However, in the frontend client (`api.ts`), it wrote generic requests calling `/api/import/upload` and `/api/import/sessions` without sending the `groupId`, causing 404s.
* **How Caught**: Run in the browser agent. Navigating to the CSV Import Center failed to fetch or upload session lists, showing network failures in the console log.
* **Resolution**: Refactored `api.ts` to receive `groupId` for these calls and aligned the fetch URL patterns. Updated `App.tsx`'s `useQuery` query keys and query functions to pass the selected group ID dynamically.
