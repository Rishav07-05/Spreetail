import { Router, Response } from "express";
import prisma from "../lib/prisma.js";
import { AuthenticatedRequest, requireAuth } from "../middleware/auth.middleware.js";
import { isMemberActiveOnDate } from "../services/membership.service.js";
import { createAuditLog } from "../services/audit.service.js";
import { z } from "zod";

const router = Router();

const createSettlementSchema = z.object({
  groupId: z.string().uuid("Invalid group ID"),
  payerId: z.string().min(1, "Payer ID is required"),
  payeeId: z.string().min(1, "Payee ID is required"),
  amount: z.number().positive("Amount must be greater than zero"),
  date: z.string().refine((val: string) => !isNaN(Date.parse(val)), "Invalid date"),
});

// Record a settlement payment
router.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const authUser = req.auth;
    if (!authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { groupId, payerId, payeeId, amount, date } = createSettlementSchema.parse(req.body);
    const settlementDate = new Date(date);

    if (payerId === payeeId) {
      res.status(400).json({ error: "Payer and payee cannot be the same person" });
      return;
    }

    // 1. Verify payer is active on settlement date
    const payerActive = await isMemberActiveOnDate(groupId, payerId, settlementDate);
    if (!payerActive) {
      res.status(400).json({ error: "Payer was not an active member on the transaction date" });
      return;
    }

    // 2. Verify payee is active on settlement date
    const payeeActive = await isMemberActiveOnDate(groupId, payeeId, settlementDate);
    if (!payeeActive) {
      res.status(400).json({ error: "Payee was not an active member on the transaction date" });
      return;
    }

    // 3. Record in DB
    const settlement = await prisma.settlement.create({
      data: {
        groupId,
        payerId,
        payeeId,
        amount,
        date: settlementDate,
      },
    });

    await createAuditLog({
      userId: authUser.userId,
      action: "SETTLEMENT_RECORDED",
      entityType: "Settlement",
      entityId: settlement.id,
      newValues: settlement,
    });

    res.status(201).json(settlement);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error("Error recording settlement:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// List all settlements in a group
router.get("/group/:groupId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { groupId } = req.params;

    const settlements = await prisma.settlement.findMany({
      where: {
        groupId,
        deletedAt: null,
      },
      orderBy: {
        date: "desc",
      },
    });

    res.status(200).json(settlements);
  } catch (error) {
    console.error("Error fetching settlements:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete (soft delete) a settlement payment
router.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const authUser = req.auth;
    if (!authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;

    const existingSettlement = await prisma.settlement.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existingSettlement) {
      res.status(404).json({ error: "Settlement record not found" });
      return;
    }

    const deletedSettlement = await prisma.settlement.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await createAuditLog({
      userId: authUser.userId,
      action: "SETTLEMENT_DELETED",
      entityType: "Settlement",
      entityId: id,
      oldValues: existingSettlement,
    });

    res.status(200).json({ success: true, message: "Settlement deleted successfully", deletedSettlement });
  } catch (error) {
    console.error("Error deleting settlement:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
