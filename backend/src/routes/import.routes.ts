import { Router, Response } from "express";
import prisma from "../lib/prisma.js";
import { AuthenticatedRequest, requireAuth } from "../middleware/auth.middleware.js";
import { parseCSV, mapCsvHeaders, detectAnomaliesForSession } from "../services/csv.service.js";
import { calculateSplit } from "../services/split.service.js";
import { isMemberActiveOnDate } from "../services/membership.service.js";
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

    // 4. Run Anomaly Detection Engine
    const updatedSession = await detectAnomaliesForSession(session.id, groupId);

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
      session: updatedSession,
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

// Resolve a specific anomaly
const resolveAnomalySchema = z.zod.object({
  decision: z.zod.enum(["APPROVED", "REJECTED"]),
  correction: z.zod.object({
    date: z.zod.string(),
    description: z.zod.string(),
    amount: z.zod.string(),
    payer: z.zod.string(),
    participants: z.zod.string(),
    splitType: z.zod.string(),
    splitValues: z.zod.string(),
    currency: z.zod.string(),
  }).optional(),
});

router.post("/anomaly/:anomalyId/resolve", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const authUser = req.auth;
    if (!authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { anomalyId } = req.params;
    const { decision, correction } = resolveAnomalySchema.parse(req.body);

    const anomaly = await prisma.importAnomaly.findUnique({
      where: { id: anomalyId },
      include: { record: true },
    });

    if (!anomaly) {
      res.status(404).json({ error: "Anomaly not found" });
      return;
    }

    // Update anomaly decision
    const updatedAnomaly = await prisma.importAnomaly.update({
      where: { id: anomalyId },
      data: {
        userDecision: decision,
        resolvedById: authUser.userId,
        resolvedAt: new Date(),
      },
    });

    // If approved and correction is provided, update the raw content of the parent record
    if (decision === "APPROVED" && correction && anomaly.recordId) {
      await prisma.importRecord.update({
        where: { id: anomaly.recordId },
        data: {
          rawContent: JSON.stringify(correction),
        },
      });
    }

    await createAuditLog({
      userId: authUser.userId,
      action: `ANOMALY_RESOLVED_${decision}`,
      entityType: "ImportAnomaly",
      entityId: anomalyId,
      newValues: { decision, correction },
    });

    res.status(200).json(updatedAnomaly);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error("Error resolving anomaly:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Finalize import session and create actual expenses / settlements
router.post("/session/:sessionId/finalize", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const authUser = req.auth;
    if (!authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { sessionId } = req.params;

    const session = await prisma.importSession.findUnique({
      where: { id: sessionId },
      include: {
        records: {
          include: {
            anomalies: true,
          },
        },
      },
    });

    if (!session) {
      res.status(404).json({ error: "Import session not found" });
      return;
    }

    if (session.status === "COMPLETED") {
      res.status(400).json({ error: "Import session is already finalized and completed." });
      return;
    }

    // Verify all anomalies in this session are resolved (APPROVED or REJECTED)
    const pendingAnomaliesCount = await prisma.importAnomaly.count({
      where: {
        sessionId,
        userDecision: "PENDING",
      },
    });

    if (pendingAnomaliesCount > 0) {
      res.status(400).json({
        error: `Cannot finalize session. There are still ${pendingAnomaliesCount} pending anomalies requiring review.`,
      });
      return;
    }

    // Get group members for user matching and timeline verification
    const groupMembers = await prisma.groupMembership.findMany({
      where: { groupId: session.groupId, deletedAt: null },
      include: { user: true },
    });

    let importedCount = 0;
    let skippedCount = 0;

    // Run creation in a database transaction
    await prisma.$transaction(async (tx) => {
      for (const record of session.records) {
        // Determine record state:
        // If any associated anomaly is REJECTED, skip this record.
        const hasRejectedAnomaly = record.anomalies.some(a => a.userDecision === "REJECTED");

        if (hasRejectedAnomaly) {
          await tx.importRecord.update({
            where: { id: record.id },
            data: { status: "SKIPPED" },
          });
          skippedCount++;
          continue;
        }

        // Parse content
        const content = JSON.parse(record.rawContent);
        const amount = parseFloat(content.amount.replace(/[^\d.-]/g, ""));
        const expenseDate = new Date(content.date);
        const splitType = (content.splitType || "EQUAL").toUpperCase() as "EQUAL" | "EXACT" | "PERCENTAGE" | "WEIGHTED";
        const payerStr = content.payer.trim();
        const partStr = content.participants || "";
        const descStr = content.description || "CSV Imported Expense";

        // Helper to match user
        const findUser = (str: string) => {
          const lower = str.toLowerCase();
          return groupMembers.find(
            (m) => m.user.email.toLowerCase() === lower || m.user.name.toLowerCase() === lower
          )?.user;
        };

        const payerUser = findUser(payerStr);
        if (!payerUser) {
          throw new Error(`Row ${record.rowIndex}: Payer '${payerStr}' could not be matched to an active group member.`);
        }

        // Check if settlement or expense
        const isSettlement = descStr.toLowerCase().includes("settle") || descStr.toLowerCase().includes("payment");
        const participantStrings = partStr.split(";").map((p: string) => p.trim()).filter((p: string) => p !== "");

        if (isSettlement) {
          // Record is a Settlement
          const recipientStr = participantStrings[0];
          const recipientUser = recipientStr ? findUser(recipientStr) : null;

          if (!recipientUser) {
            throw new Error(`Row ${record.rowIndex}: Recipient '${recipientStr}' for settlement could not be matched.`);
          }

          await tx.settlement.create({
            data: {
              groupId: session.groupId,
              payerId: payerUser.id,
              payeeId: recipientUser.id,
              amount,
              date: expenseDate,
            },
          });
        } else {
          // Record is an Expense
          const splitParticipants: { userId: string; shareValue: number }[] = [];

          if (splitType === "EQUAL") {
            for (const pStr of participantStrings) {
              const u = findUser(pStr);
              if (u) {
                splitParticipants.push({ userId: u.id, shareValue: 1 });
              }
            }
          } else {
            const splitVals = content.splitValues.split(";").map((v: string) => parseFloat(v.trim())).filter((v: number) => !isNaN(v));
            for (let i = 0; i < participantStrings.length; i++) {
              const u = findUser(participantStrings[i]);
              const val = splitVals[i] ?? 0;
              if (u) {
                splitParticipants.push({ userId: u.id, shareValue: val });
              }
            }
          }

          if (splitParticipants.length === 0) {
            throw new Error(`Row ${record.rowIndex}: No valid participants found for expense.`);
          }

          // Compute splits
          const computedShares = calculateSplit(amount, splitType, splitParticipants);

          // Create expense
          await tx.expense.create({
            data: {
              groupId: session.groupId,
              payerId: payerUser.id,
              amount,
              description: descStr,
              date: expenseDate,
              splitType,
              participants: {
                create: computedShares.map((cs) => ({
                  userId: cs.userId,
                  shareAmount: cs.shareAmount,
                  shareValue: cs.shareValue,
                })),
              },
            },
          });
        }

        // Mark record as applied
        await tx.importRecord.update({
          where: { id: record.id },
          data: { status: "APPLIED" },
        });

        importedCount++;
      }

      // Finalize session details
      await tx.importSession.update({
        where: { id: sessionId },
        data: {
          status: "COMPLETED",
          importedRows: importedCount,
          skippedRows: skippedCount,
          completedAt: new Date(),
        },
      });
    });

    await createAuditLog({
      userId: authUser.userId,
      action: "CSV_IMPORT_FINALIZED",
      entityType: "ImportSession",
      entityId: sessionId,
      newValues: { importedRows: importedCount, skippedRows: skippedCount },
    });

    res.status(200).json({
      success: true,
      message: `Session finalized successfully. Imported ${importedCount} records, skipped ${skippedCount}.`,
    });
  } catch (error: any) {
    console.error("Error finalizing session:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Generate import session report summary
router.get("/session/:sessionId/report", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = await prisma.importSession.findUnique({
      where: { id: sessionId },
      include: { anomalies: true },
    });

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const anomaliesFound = session.anomalies.length;
    const anomaliesFixed = session.anomalies.filter(a => a.userDecision === "APPROVED").length;
    const rejectedRecords = session.anomalies.filter(a => a.userDecision === "REJECTED").length;
    const durationMs = session.completedAt 
      ? session.completedAt.getTime() - session.startedAt.getTime() 
      : 0;

    res.status(200).json({
      fileName: session.fileName,
      status: session.status,
      totalRows: session.totalRows,
      importedRows: session.importedRows,
      skippedRows: session.skippedRows,
      anomaliesFound,
      anomaliesFixed,
      rejectedRecords,
      importDurationSec: (durationMs / 1000).toFixed(2),
      timestamp: session.completedAt || new Date(),
    });
  } catch (error) {
    console.error("Error generating report metadata:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

