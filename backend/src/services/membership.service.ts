import prisma from "../lib/prisma.js";

/**
 * Retrieves the active members of a group on a specific date.
 * A member is active on a date if:
 *   joinedAt <= date AND (leftAt is null OR leftAt >= date)
 * AND the membership has not been soft-deleted.
 */
export async function getActiveMembersOnDate(groupId: string, date: Date) {
  // Normalize the query date to end of day to prevent sub-day timezone mismatches
  const targetDate = new Date(date);

  const memberships = await prisma.groupMembership.findMany({
    where: {
      groupId,
      joinedAt: {
        lte: targetDate,
      },
      OR: [
        { leftAt: null },
        { leftAt: { gte: targetDate } },
      ],
      deletedAt: null,
    },
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
  });

  return memberships.map((m) => ({
    membershipId: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    joinedAt: m.joinedAt,
    leftAt: m.leftAt,
  }));
}

/**
 * Checks if a specific user is active in a group on a specific date.
 */
export async function isMemberActiveOnDate(groupId: string, userId: string, date: Date): Promise<boolean> {
  const targetDate = new Date(date);

  const membership = await prisma.groupMembership.findFirst({
    where: {
      groupId,
      userId,
      joinedAt: {
        lte: targetDate,
      },
      OR: [
        { leftAt: null },
        { leftAt: { gte: targetDate } },
      ],
      deletedAt: null,
    },
  });

  return !!membership;
}
