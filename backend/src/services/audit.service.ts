import prisma from "../lib/prisma.js";

export async function createAuditLog(params: {
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: any;
  newValues?: any;
}) {
  try {
    return await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error("Failed to create audit log:", error);
  }
}
