import prisma from "../lib/prisma.js";

interface UserBalance {
  userId: string;
  name: string;
  email: string;
  netBalance: number; // Positive means they are owed, Negative means they owe
}

interface DebtTransfer {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
}

interface TraceabilityItem {
  id: string;
  type: "EXPENSE" | "SETTLEMENT";
  date: Date;
  description: string;
  totalAmount: number;
  yourShare: number; // What the user participated with
  whoPaid: string;
  effectAmount: number; // How it affects the pairwise balance
}

/**
 * Computes net balances for all group members.
 */
export async function computeGroupBalances(groupId: string): Promise<UserBalance[]> {
  const memberships = await prisma.groupMembership.findMany({
    where: { groupId, deletedAt: null },
    include: { user: true },
  });

  const expenses = await prisma.expense.findMany({
    where: { groupId, deletedAt: null },
    include: {
      participants: { where: { deletedAt: null } },
    },
  });

  const settlements = await prisma.settlement.findMany({
    where: { groupId, deletedAt: null },
  });

  const balanceMap: Record<string, { name: string; email: string; net: number }> = {};

  // Initialize map
  memberships.forEach((m) => {
    balanceMap[m.userId] = {
      name: m.user.name,
      email: m.user.email,
      net: 0,
    };
  });

  // Process expenses
  expenses.forEach((e) => {
    // If payer is in group, credit them the total expense amount
    if (balanceMap[e.payerId]) {
      balanceMap[e.payerId].net += e.amount;
    }

    // Debit each participant
    e.participants.forEach((p) => {
      if (balanceMap[p.userId]) {
        balanceMap[p.userId].net -= p.shareAmount;
      }
    });
  });

  // Process settlements
  settlements.forEach((s) => {
    // Payer of settlement gave money -> credit
    if (balanceMap[s.payerId]) {
      balanceMap[s.payerId].net += s.amount;
    }
    // Payee of settlement received money -> debit
    if (balanceMap[s.payeeId]) {
      balanceMap[s.payeeId].net -= s.amount;
    }
  });

  return Object.entries(balanceMap).map(([userId, val]) => ({
    userId,
    name: val.name,
    email: val.email,
    netBalance: parseFloat(val.net.toFixed(2)),
  }));
}

/**
 * Computes simplified transactions (who pays whom) to settle all balances.
 */
export async function computeWhoPaysWhom(groupId: string): Promise<DebtTransfer[]> {
  const balances = await computeGroupBalances(groupId);

  const debtors = balances
    .filter((b) => b.netBalance < -0.01)
    .map((b) => ({ ...b, balance: Math.abs(b.netBalance) }));

  const creditors = balances
    .filter((b) => b.netBalance > 0.01)
    .map((b) => ({ ...b, balance: b.netBalance }));

  const transfers: DebtTransfer[] = [];

  let debtorIndex = 0;
  let creditorIndex = 0;

  // Greedy matching of largest debtor to largest creditor
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];

    const amountToTransfer = Math.min(debtor.balance, creditor.balance);

    if (amountToTransfer > 0.01) {
      transfers.push({
        from: debtor.userId,
        fromName: debtor.name,
        to: creditor.userId,
        toName: creditor.name,
        amount: parseFloat(amountToTransfer.toFixed(2)),
      });
    }

    debtor.balance -= amountToTransfer;
    creditor.balance -= amountToTransfer;

    if (debtor.balance <= 0.01) debtorIndex++;
    if (creditor.balance <= 0.01) creditorIndex++;
  }

  return transfers;
}

/**
 * Builds the exact chronological chain of transactions between User A and User B.
 * Returns the ledger items that sum up to A's net pairwise balance against B.
 */
export async function getPairwiseTraceability(
  groupId: string,
  userAId: string,
  userBId: string
): Promise<{
  userA: { id: string; name: string };
  userB: { id: string; name: string };
  netPairwiseBalance: number; // If positive, B owes A. If negative, A owes B.
  chain: TraceabilityItem[];
}> {
  const userA = await prisma.user.findUnique({ where: { id: userAId } });
  const userB = await prisma.user.findUnique({ where: { id: userBId } });

  if (!userA || !userB) {
    throw new Error("Users not found");
  }

  // 1. Fetch expenses involving both A and B
  // Either A paid and B participated, OR B paid and A participated
  const expenses = await prisma.expense.findMany({
    where: {
      groupId,
      deletedAt: null,
      OR: [
        { payerId: userAId, participants: { some: { userId: userBId, deletedAt: null } } },
        { payerId: userBId, participants: { some: { userId: userAId, deletedAt: null } } },
      ],
    },
    include: {
      participants: { where: { deletedAt: null } },
    },
  });

  // 2. Fetch settlements between A and B
  const settlements = await prisma.settlement.findMany({
    where: {
      groupId,
      deletedAt: null,
      OR: [
        { payerId: userAId, payeeId: userBId },
        { payerId: userBId, payeeId: userAId },
      ],
    },
  });

  const chain: TraceabilityItem[] = [];
  let netBalance = 0; // Positive means B owes A, negative means A owes B

  // Format expenses
  expenses.forEach((e) => {
    const isAPayer = e.payerId === userAId;
    const payerName = isAPayer ? userA.name : userB.name;

    if (isAPayer) {
      // A paid, B participated. B owes A the amount B's share.
      const bPart = e.participants.find((p) => p.userId === userBId);
      const bShare = bPart ? bPart.shareAmount : 0;
      netBalance += bShare;
      chain.push({
        id: e.id,
        type: "EXPENSE",
        date: e.date,
        description: e.description,
        totalAmount: e.amount,
        yourShare: 0, // A paid, so A's share is irrelevant to B's debt here
        whoPaid: payerName,
        effectAmount: bShare, // B owes A +bShare
      });
    } else {
      // B paid, A participated. A owes B the amount A's share.
      const aPart = e.participants.find((p) => p.userId === userAId);
      const aShare = aPart ? aPart.shareAmount : 0;
      netBalance -= aShare;
      chain.push({
        id: e.id,
        type: "EXPENSE",
        date: e.date,
        description: e.description,
        totalAmount: e.amount,
        yourShare: aShare, // A's share in B's payment
        whoPaid: payerName,
        effectAmount: -aShare, // A owes B -aShare
      });
    }
  });

  // Format settlements
  settlements.forEach((s) => {
    const isAPayer = s.payerId === userAId;
    
    if (isAPayer) {
      // A paid B. This reduces A's debt to B, or increases what B owes A. Effect: +amount
      netBalance += s.amount;
      chain.push({
        id: s.id,
        type: "SETTLEMENT",
        date: s.date,
        description: `Settlement: ${userA.name} paid ${userB.name}`,
        totalAmount: s.amount,
        yourShare: 0,
        whoPaid: userA.name,
        effectAmount: s.amount,
      });
    } else {
      // B paid A. This reduces B's debt to A. Effect: -amount
      netBalance -= s.amount;
      chain.push({
        id: s.id,
        type: "SETTLEMENT",
        date: s.date,
        description: `Settlement: ${userB.name} paid ${userA.name}`,
        totalAmount: s.amount,
        yourShare: 0,
        whoPaid: userB.name,
        effectAmount: -s.amount,
      });
    }
  });

  // Sort chain chronologically
  chain.sort((a, b) => a.date.getTime() - b.date.getTime());

  return {
    userA: { id: userAId, name: userA.name },
    userB: { id: userBId, name: userB.name },
    netPairwiseBalance: parseFloat(netBalance.toFixed(2)),
    chain,
  };
}
