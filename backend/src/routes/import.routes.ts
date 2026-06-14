import { Router, Response } from "express";
import prisma from "../lib/prisma.js";
import { AuthenticatedRequest, requireAuth } from "../middleware/auth.middleware.js";
import { parseCSV, mapCsvHeaders } from "../services/csv.service.js";
import { createAuditLog } from "../services/audit.service.js";
import { z } from "zod";

const router = Router();

const importCsvSchema = z.zod.object({
  fileName: z.zod.string().min(1, "File name is required"),
  csvContent: z.zod.string().min(1, "CSV content is required"),
});

// Import CSV endpoint
router.post("/group/:groupId/import", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const authUser = req.auth;
    if (!authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { groupId } = req.params;
    const { fileName, csvContent } = importCsvSchema.parse(req.body);

    // Verify group exists and user is a member
    const membership = await prisma.groupMembership.findFirst({
      where: { groupId, userId: authUser.userId, deletedAt: null },
    });

    if (!membership) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // 1. Parse CSV Content
    const rawLines = parseCSV(csvContent);
    if (rawLines.length < 2) {
      res.status(400).json({ error: "CSV must contain at least a header row and one data row" });
      return;
    }

    const headers = rawLines[0];
    const dataRows = rawLines.slice(1);
    const headerMapping = mapCsvHeaders(headers);

    // Establish default mapping indices if not auto-detected
    const idxDate = headerMapping.date ?? 0;
    const idxDesc = headerMapping.description ?? 1;
    const idxAmount = headerMapping.amount ?? 2;
    const idxPayer = headerMapping.payer ?? 3;
    const idxPart = headerMapping.participants ?? 4;
    const idxSplitType = headerMapping.splitType ?? 5;
    const idxSplitVal = headerMapping.splitValues ?? 6;
    const idxCurr = headerMapping.currency ?? 7;

    // 2. Initialize Import Session in database
    const session = await prisma.importSession.create({
      data: {
        groupId,
        uploadedById: authUser.userId,
        fileName,
        status: "PROCESSING",
        totalRows: dataRows.length,
        importedRows: 0,
        skippedRows: 0,
        startedAt: new Date(),
      },
    });

    // 3. Store raw records and run basic validation
    const recordsData = dataRows.map((row, index) => {
      const rawContentObj = {
        date: row[idxDate] || "",
        description: row[idxDesc] || "",
        amount: row[idxAmount] || "",
        payer: row[idxPayer] || "",
        participants: row[idxPart] || "",
        splitType: row[idxSplitType] || "",
        splitValues: row[idxSplitVal] || "",
        currency: row[idxCurr] || "",
      };

      return {
        sessionId: session.id,
        rowIndex: index + 1,
        rawContent: JSON.stringify(rawContentObj),
        status: "PENDING",
      };
    });

    // Create records
    await prisma.importRecord.createMany({
      data: recordsData,
    });

    const records = await prisma.importRecord.findMany({
      where: { sessionId: session.id },
      orderBy: { rowIndex: "asc" },
    });

    await createAuditLog({
      userId: authUser.userId,
      action: "CSV_IMPORTED",
      entityType: "ImportSession",
      entityId: session.id,
      newValues: { fileName, totalRows: dataRows.length },
    });

    res.status(201).json({
      session,
      records,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error("CSV Import Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// List all import sessions for a group
router.get("/group/:groupId/sessions", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const sessions = await prisma.importSession.findMany({
      where: { groupId },
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json(sessions);
  } catch (error) {
    console.error("Error fetching sessions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get import session details (including records and anomalies)
router.get("/session/:sessionId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = await prisma.importSession.findUnique({
      where: { id: sessionId },
      include: {
        records: { orderBy: { rowIndex: "asc" } },
        anomalies: true,
      },
    });

    if (!session) {
      res.status(404).json({ error: "Import session not found" });
      return;
    }

    res.status(200).json(session);
  } catch (error) {
    console.error("Error fetching session details:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
