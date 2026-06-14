import { Router, Response } from "express";
import prisma from "../lib/prisma.js";
import { AuthenticatedRequest, requireAuth } from "../middleware/auth.middleware.js";
import { createAuditLog } from "../services/audit.service.js";
import { getActiveMembersOnDate } from "../services/membership.service.js";
import { z } from "zod";

const router = Router();

const createGroupSchema = z.object({
  name: z.string().min(1, "Group name is required"),
  description: z.string().optional(),
});

// Create a new group
router.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const authUser = req.auth;
    if (!authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { name, description } = createGroupSchema.parse(req.body);

    const group = await prisma.group.create({
      data: {
        name,
        description,
        createdById: authUser.userId,
        memberships: {
          create: {
            userId: authUser.userId,
            joinedAt: new Date(),
          },
        },
      },
      include: {
        memberships: {
          include: {
            user: true,
          },
        },
      },
    });

    await createAuditLog({
      userId: authUser.userId,
      action: "GROUP_CREATED",
      entityType: "Group",
      entityId: group.id,
      newValues: { name, description },
    });

    res.status(201).json(group);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error("Error creating group:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all groups the user is a member of (active or historic)
router.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const authUser = req.auth;
    if (!authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const memberships = await prisma.groupMembership.findMany({
      where: {
        userId: authUser.userId,
        deletedAt: null,
        group: { deletedAt: null },
      },
      include: {
        group: {
          include: {
            memberships: {
              where: { deletedAt: null },
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    const groups = memberships.map((m) => {
      const activeMembersCount = m.group.memberships.filter((mem) => !mem.leftAt).length;
      return {
        id: m.group.id,
        name: m.group.name,
        description: m.group.description,
        createdById: m.group.createdById,
        createdAt: m.group.createdAt,
        joinedAt: m.joinedAt,
        leftAt: m.leftAt,
        membersCount: m.group.memberships.length,
        activeMembersCount,
        members: m.group.memberships,
      };
    });

    res.status(200).json(groups);
  } catch (error) {
    console.error("Error fetching groups:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get details of a single group
router.get("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const authUser = req.auth;
    if (!authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;

    // Verify user is/was a member
    const userMembership = await prisma.groupMembership.findFirst({
      where: {
        groupId: id,
        userId: authUser.userId,
        deletedAt: null,
      },
    });

    if (!userMembership) {
      res.status(403).json({ error: "Access denied. You are not a member of this group." });
      return;
    }

    const group = await prisma.group.findFirst({
      where: { id, deletedAt: null },
      include: {
        memberships: {
          where: { deletedAt: null },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                imageUrl: true,
              },
            },
          },
        },
      },
    });

    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    res.status(200).json(group);
  } catch (error) {
    console.error("Error fetching group details:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const inviteMemberSchema = z.object({
  email: z.string().email("Invalid email format"),
  name: z.string().min(1, "Name is required"),
  joinedAt: z.string().optional(), // ISO date
});

// Invite / Add a member to a group
router.post("/:id/invite", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const authUser = req.auth;
    if (!authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id: groupId } = req.params;
    const { email, name, joinedAt } = inviteMemberSchema.parse(req.body);

    // Verify current user is a member
    const userMembership = await prisma.groupMembership.findFirst({
      where: { groupId, userId: authUser.userId, deletedAt: null },
    });

    if (!userMembership) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // Upsert the invited user in our database (since Clerk handles credentials, we represent them locally)
    const normalizedEmail = email.toLowerCase().trim();
    
    // Find by email
    let invitedUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!invitedUser) {
      // Create a local placeholder/mock user for the invite
      const mockId = `usr_${normalizedEmail.split("@")[0]}_${Math.random().toString(36).substring(2, 6)}`;
      invitedUser = await prisma.user.create({
        data: {
          id: mockId,
          email: normalizedEmail,
          name: name.trim(),
        },
      });
    }

    // Check if membership already exists (active or left)
    const existingMembership = await prisma.groupMembership.findFirst({
      where: {
        groupId,
        userId: invitedUser.id,
        deletedAt: null,
      },
      orderBy: { joinedAt: "desc" },
    });

    const joinDate = joinedAt ? new Date(joinedAt) : new Date();

    if (existingMembership) {
      if (!existingMembership.leftAt) {
        res.status(400).json({ error: "User is already an active member of this group" });
        return;
      }
      
      // If they left, but we want to re-add them, we can create a new membership slice
      const newMembership = await prisma.groupMembership.create({
        data: {
          groupId,
          userId: invitedUser.id,
          joinedAt: joinDate,
        },
        include: { user: true },
      });

      await createAuditLog({
        userId: authUser.userId,
        action: "MEMBER_REJOINED",
        entityType: "GroupMembership",
        entityId: newMembership.id,
        newValues: { userId: invitedUser.id, joinedAt: joinDate },
      });

      res.status(200).json(newMembership);
      return;
    }

    const membership = await prisma.groupMembership.create({
      data: {
        groupId,
        userId: invitedUser.id,
        joinedAt: joinDate,
      },
      include: { user: true },
    });

    await createAuditLog({
      userId: authUser.userId,
      action: "MEMBER_INVITED",
      entityType: "GroupMembership",
      entityId: membership.id,
      newValues: { userId: invitedUser.id, email: normalizedEmail, joinedAt: joinDate },
    });

    res.status(201).json(membership);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error("Error inviting member:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const leaveGroupSchema = z.object({
  leftAt: z.string().optional(), // ISO date
});

// Leave a group (sets leftAt field)
router.post("/:id/leave", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const authUser = req.auth;
    if (!authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id: groupId } = req.params;
    const { leftAt } = leaveGroupSchema.parse(req.body);

    const leaveDate = leftAt ? new Date(leftAt) : new Date();

    // Find the active membership for this user
    const membership = await prisma.groupMembership.findFirst({
      where: {
        groupId,
        userId: authUser.userId,
        leftAt: null,
        deletedAt: null,
      },
    });

    if (!membership) {
      res.status(400).json({ error: "You do not have an active membership in this group." });
      return;
    }

    if (leaveDate < new Date(membership.joinedAt)) {
      res.status(400).json({ error: "Leave date cannot be before join date." });
      return;
    }

    const updatedMembership = await prisma.groupMembership.update({
      where: { id: membership.id },
      data: {
        leftAt: leaveDate,
      },
    });

    await createAuditLog({
      userId: authUser.userId,
      action: "MEMBER_LEFT",
      entityType: "GroupMembership",
      entityId: membership.id,
      newValues: { leftAt: leaveDate },
    });

    res.status(200).json(updatedMembership);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error("Error leaving group:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get active members on a specific date (query param ?date=...)
router.get("/:id/active-members", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: groupId } = req.params;
    const dateStr = req.query.date as string;
    const date = dateStr ? new Date(dateStr) : new Date();

    if (isNaN(date.getTime())) {
      res.status(400).json({ error: "Invalid date format" });
      return;
    }

    const activeMembers = await getActiveMembersOnDate(groupId, date);
    res.status(200).json(activeMembers);
  } catch (error) {
    console.error("Error fetching active members:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

