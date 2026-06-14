import { Router, Response } from "express";
import prisma from "../lib/prisma.js";
import { AuthenticatedRequest, requireAuth } from "../middleware/auth.middleware.js";
import { isMemberActiveOnDate } from "../services/membership.service.js";
import { calculateSplit } from "../services/split.service.js";
import { createAuditLog } from "../services/audit.service.js";
import { z } from "zod";

const router = Router();

const participantSchema = z.zod.object({
  userId: z.zod.string().min(1, "Participant user ID is required"),
  shareValue: z.zod.number().nonnegative("Share value must be positive or zero"),
});

const createExpenseSchema = z.zod.object({
  groupId: z.zod.string().uuid("Invalid group ID"),
  payerId: z.zod.string().min(1, "Payer ID is required"),
  amount: z.zod.number().positive("Amount must be greater than zero"),
  description: z.zod.string().min(1, "Description is required").max(255),
  date: z.zod.string().refine((val) => !isNaN(Date.parse(val)), "Invalid date"),
  splitType: z.zod.enum(["EQUAL", "EXACT", "PERCENTAGE", "WEIGHTED"]),
  participants: z.zod.array(participantSchema).min(1, "At least one participant is required"),
});

// Create an expense
router.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const authUser = req.auth;
    if (!authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { groupId, payerId, amount, description, date, splitType, participants } = createExpenseSchema.parse(req.body);
    const expenseDate = new Date(date);

    // 1. Verify payer is active on that date
    const payerActive = await isMemberActiveOnDate(groupId, payerId, expenseDate);
    if (!payerActive) {
      res.status(400).json({ error: "Payer is not an active member of the group on this date" });
      return;
    }

    // 2. Verify all participants are active on that date
    for (const p of participants) {
      const active = await isMemberActiveOnDate(groupId, p.userId, expenseDate);
      if (!active) {
        res.status(400).json({ error: `Participant with ID ${p.userId} is not an active member on this date` });
        return;
      }
    }

    // 3. Pre-calculate shares using Split Engine
    let computedParticipants;
    try {
      computedParticipants = calculateSplit(amount, splitType, participants);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
      return;
    }

    // 4. Create in DB
    const expense = await prisma.expense.create({
      data: {
        groupId,
        payerId,
        amount,
        description,
        date: expenseDate,
        splitType,
        participants: {
          create: computedParticipants.map((p) => ({
            userId: p.userId,
            shareAmount: p.shareAmount,
            shareValue: p.shareValue,
          })),
        },
      },
      include: {
        participants: true,
      },
    });

    await createAuditLog({
      userId: authUser.userId,
      action: "EXPENSE_CREATED",
      entityType: "Expense",
      entityId: expense.id,
      newValues: expense,
    });

    res.status(201).json(expense);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error("Error creating expense:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all expenses for a group
router.get("/group/:groupId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { groupId } = req.params;

    const expenses = await prisma.expense.findMany({
      where: {
        groupId,
        deletedAt: null,
      },
      include: {
        participants: {
          where: { deletedAt: null },
        },
      },
      orderBy: {
        date: "desc",
      },
    });

    res.status(200).json(expenses);
  } catch (error) {
    console.error("Error fetching expenses:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update an expense
router.put("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const authUser = req.auth;
    if (!authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;
    const { groupId, payerId, amount, description, date, splitType, participants } = createExpenseSchema.parse(req.body);
    const expenseDate = new Date(date);

    // Get existing expense
    const existingExpense = await prisma.expense.findFirst({
      where: { id, deletedAt: null },
      include: { participants: true },
    });

    if (!existingExpense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }

    // Verify payer & participants active
    const payerActive = await isMemberActiveOnDate(groupId, payerId, expenseDate);
    if (!payerActive) {
      res.status(400).json({ error: "Payer is not active on this date" });
      return;
    }

    for (const p of participants) {
      const active = await isMemberActiveOnDate(groupId, p.userId, expenseDate);
      if (!active) {
        res.status(400).json({ error: `Participant with ID ${p.userId} is not active on this date` });
        return;
      }
    }

    // Split calculations using Split Engine
    let computedParticipants;
    try {
      computedParticipants = calculateSplit(amount, splitType, participants);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
      return;
    }

    // Run update in transaction: soft delete previous participants, update expense details, create new participants
    const updatedExpense = await prisma.$transaction(async (tx) => {
      // Soft delete current participants
      await tx.expenseParticipant.updateMany({
        where: { expenseId: id },
        data: { deletedAt: new Date() },
      });

      // Update core expense details
      return await tx.expense.update({
        where: { id },
        data: {
          payerId,
          amount,
          description,
          date: expenseDate,
          splitType,
          participants: {
            create: computedParticipants.map((p) => ({
              userId: p.userId,
              shareAmount: p.shareAmount,
              shareValue: p.shareValue,
            })),
          },
        },
        include: {
          participants: {
            where: { deletedAt: null },
          },
        },
      });
    });

    await createAuditLog({
      userId: authUser.userId,
      action: "EXPENSE_UPDATED",
      entityType: "Expense",
      entityId: id,
      oldValues: existingExpense,
      newValues: updatedExpense,
    });

    res.status(200).json(updatedExpense);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error("Error updating expense:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete (soft delete) an expense
router.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const authUser = req.auth;
    if (!authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;

    const existingExpense = await prisma.expense.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existingExpense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }

    // Soft delete expense and participants
    await prisma.$transaction([
      prisma.expense.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
      prisma.expenseParticipant.updateMany({
        where: { expenseId: id },
        data: { deletedAt: new Date() },
      }),
    ]);

    await createAuditLog({
      userId: authUser.userId,
      action: "EXPENSE_DELETED",
      entityType: "Expense",
      entityId: id,
      oldValues: existingExpense,
    });

    res.status(200).json({ success: true, message: "Expense deleted successfully" });
  } catch (error) {
    console.error("Error deleting expense:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
