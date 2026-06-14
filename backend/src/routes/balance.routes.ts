import { Router, Response } from "express";
import { AuthenticatedRequest, requireAuth } from "../middleware/auth.middleware.js";
import {
  computeGroupBalances,
  computeWhoPaysWhom,
  getPairwiseTraceability,
} from "../services/balance.service.js";

const router = Router();

// Get overall net balances and simplified debt transfers for a group
router.get("/group/:groupId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { groupId } = req.params;

    const balances = await computeGroupBalances(groupId);
    const transfers = await computeWhoPaysWhom(groupId);

    res.status(200).json({
      balances,
      transfers,
    });
  } catch (error) {
    console.error("Error computing balances:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get pairwise audit trail (traceability chain) between userA and userB
router.get("/group/:groupId/trace", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const userA = req.query.userA as string;
    const userB = req.query.userB as string;

    if (!userA || !userB) {
      res.status(400).json({ error: "Query parameters 'userA' and 'userB' are required" });
      return;
    }

    const trace = await getPairwiseTraceability(groupId, userA, userB);
    res.status(200).json(trace);
  } catch (error: any) {
    console.error("Error tracing pairwise balance:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

export default router;
