import { Router, Response } from "express";
import prisma from "../lib/prisma.js";
import { AuthenticatedRequest, requireAuth } from "../middleware/auth.middleware.js";
import { createAuditLog } from "../services/audit.service.js";

const router = Router();

// Sync current Clerk / Mock user to our database
router.post("/sync", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const authUser = req.auth;
    if (!authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { userId, email, name } = authUser;

    const user = await prisma.user.upsert({
      where: { id: userId },
      update: {
        email: email || `${userId}@example.com`,
        name: name || "Demo User",
      },
      create: {
        id: userId,
        email: email || `${userId}@example.com`,
        name: name || "Demo User",
      },
    });

    await createAuditLog({
      userId: user.id,
      action: "USER_SYNCED",
      entityType: "User",
      entityId: user.id,
      newValues: { email: user.email, name: user.name },
    });

    res.status(200).json(user);
  } catch (error: any) {
    console.error("Error syncing user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all users in the system (useful for dropdowns/invites in demo mode)
router.get("/all", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        imageUrl: true,
      },
    });
    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
