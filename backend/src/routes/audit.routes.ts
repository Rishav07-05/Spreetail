import { Router, Response } from "express";
import prisma from "../lib/prisma.js";
import { AuthenticatedRequest, requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

// Get all audit logs associated with a group
router.get("/group/:groupId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { groupId } = req.params;

    // 1. Verify group exists and user has membership access
    const membership = await prisma.groupMembership.findFirst({
      where: { groupId, userId: req.auth?.userId, deletedAt: null },
    });

    if (!membership) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // 2. Fetch all entity IDs belonging to this group
    const expenses = await prisma.expense.findMany({
      where: { groupId },
      select: { id: true },
    });
    const settlements = await prisma.settlement.findMany({
      where: { groupId },
      select: { id: true },
    });
    const importSessions = await prisma.importSession.findMany({
      where: { groupId },
      select: { id: true },
    });

    const expenseIds = expenses.map(e => e.id);
    const settlementIds = settlements.map(s => s.id);
    const importSessionIds = importSessions.map(i => i.id);

    // 3. Query all AuditLog records corresponding to these entities
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: "Group", entityId: groupId },
          { entityType: "Expense", entityId: { in: expenseIds } },
          { entityType: "Settlement", entityId: { in: settlementIds } },
          { entityType: "ImportSession", entityId: { in: importSessionIds } },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        timestamp: "desc",
      },
    });

    res.status(200).json(auditLogs);
  } catch (error) {
    console.error("Error fetching group audit logs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
