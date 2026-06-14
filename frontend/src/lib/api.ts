// API client wrapper for the Shared Expense Platform backend

export interface User {
  id: string;
  email: string;
  name: string;
  imageUrl?: string;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  createdById: string;
  createdAt: string;
}

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  joinedAt: string;
  leftAt?: string;
  user: User;
}

export interface ExpenseParticipant {
  id: string;
  expenseId: string;
  userId: string;
  shareAmount: number;
  shareValue: number;
}

export interface Expense {
  id: string;
  groupId: string;
  payerId: string;
  amount: number;
  description: string;
  date: string;
  splitType: "EQUAL" | "EXACT" | "PERCENTAGE" | "WEIGHTED";
  createdAt: string;
  participants: ExpenseParticipant[];
}

export interface Settlement {
  id: string;
  groupId: string;
  payerId: string;
  payeeId: string;
  amount: number;
  date: string;
  createdAt: string;
}

export interface UserBalance {
  userId: string;
  name: string;
  email: string;
  netBalance: number;
}

export interface DebtTransfer {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
}

export interface TraceabilityItem {
  id: string;
  type: "EXPENSE" | "SETTLEMENT";
  date: string;
  description: string;
  totalAmount: number;
  yourShare: number;
  whoPaid: string;
  effectAmount: number;
}

export interface PairwiseTrace {
  userA: { id: string; name: string };
  userB: { id: string; name: string };
  netPairwiseBalance: number;
  chain: TraceabilityItem[];
}

export interface ImportSession {
  id: string;
  groupId: string;
  uploadedById: string;
  status: "DRAFT" | "FINALIZED";
  fileName: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
}

export interface ImportAnomaly {
  id: string;
  sessionId: string;
  recordId?: string;
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  description: string;
  detectedAt: string;
  recommendedAction: string;
  userDecision: "PENDING" | "APPROVED" | "REJECTED";
  resolvedById?: string;
  resolvedAt?: string;
  record?: {
    rowIndex: number;
    rawContent: string;
  };
}

export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: string;
  newValues?: string;
  timestamp: string;
  user?: {
    name: string;
    email: string;
  };
}

export interface ImportReportSummary {
  fileName: string;
  status: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  anomaliesFound: number;
  anomaliesFixed: number;
  rejectedRecords: number;
  importDurationSec: string;
  timestamp: string;
}

const API_BASE = "https://spreetail-okwr.onrender.com/api";

async function getHeaders(getToken: () => Promise<string | null>) {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export const api = {
  // Sync current user details
  syncUser: async (getToken: () => Promise<string | null>, userDetails: { name: string; email: string }) => {
    const headers = await getHeaders(getToken);
    const res = await fetch(`${API_BASE}/users/sync`, {
      method: "POST",
      headers,
      body: JSON.stringify(userDetails),
    });
    if (!res.ok) throw new Error("Failed to sync user");
    return res.json() as Promise<User>;
  },

  // Groups
  getGroups: async (getToken: () => Promise<string | null>) => {
    const headers = await getHeaders(getToken);
    const res = await fetch(`${API_BASE}/groups`, { headers });
    if (!res.ok) throw new Error("Failed to fetch groups");
    return res.json() as Promise<Group[]>;
  },

  createGroup: async (getToken: () => Promise<string | null>, data: { name: string; description?: string }) => {
    const headers = await getHeaders(getToken);
    const res = await fetch(`${API_BASE}/groups`, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to create group");
    return res.json() as Promise<Group>;
  },

  getGroupMembers: async (getToken: () => Promise<string | null>, groupId: string) => {
    const headers = await getHeaders(getToken);
    const res = await fetch(`${API_BASE}/groups/${groupId}/members`, { headers });
    if (!res.ok) throw new Error("Failed to fetch members");
    return res.json() as Promise<GroupMember[]>;
  },

  inviteMember: async (getToken: () => Promise<string | null>, groupId: string, data: { name: string; email: string; joinedAt?: string }) => {
    const headers = await getHeaders(getToken);
    const res = await fetch(`${API_BASE}/groups/${groupId}/invite`, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to invite member" }));
      throw new Error(err.error || "Failed to invite member");
    }
    return res.json() as Promise<GroupMember>;
  },

  leaveGroup: async (getToken: () => Promise<string | null>, groupId: string, leftAt: string) => {
    const headers = await getHeaders(getToken);
    const res = await fetch(`${API_BASE}/groups/${groupId}/leave`, {
      method: "POST",
      headers,
      body: JSON.stringify({ leftAt }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to leave group" }));
      throw new Error(err.error || "Failed to leave group");
    }
    return res.json() as Promise<{ success: boolean; membership: any }>;
  },

  getActiveMembers: async (getToken: () => Promise<string | null>, groupId: string, date: string) => {
    const headers = await getHeaders(getToken);
    const res = await fetch(`${API_BASE}/groups/${groupId}/active-members?date=${date}`, { headers });
    if (!res.ok) throw new Error("Failed to fetch active members for date");
    return res.json() as Promise<User[]>;
  },

  // Expenses
  getExpenses: async (getToken: () => Promise<string | null>, groupId: string) => {
    const headers = await getHeaders(getToken);
    const res = await fetch(`${API_BASE}/expenses/group/${groupId}`, { headers });
    if (!res.ok) throw new Error("Failed to fetch expenses");
    return res.json() as Promise<Expense[]>;
  },

  createExpense: async (
    getToken: () => Promise<string | null>,
    data: {
      groupId: string;
      payerId: string;
      amount: number;
      description: string;
      date: string;
      splitType: string;
      participants: { userId: string; shareValue: number }[];
    }
  ) => {
    const headers = await getHeaders(getToken);
    const res = await fetch(`${API_BASE}/expenses`, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to create expense" }));
      throw new Error(err.error || "Failed to create expense");
    }
    return res.json() as Promise<Expense>;
  },

  deleteExpense: async (getToken: () => Promise<string | null>, id: string) => {
    const headers = await getHeaders(getToken);
    const res = await fetch(`${API_BASE}/expenses/${id}`, {
      method: "DELETE",
      headers,
    });
    if (!res.ok) throw new Error("Failed to delete expense");
    return res.json();
  },

  // Settlements
  getSettlements: async (getToken: () => Promise<string | null>, groupId: string) => {
    const headers = await getHeaders(getToken);
    const res = await fetch(`${API_BASE}/settlements/group/${groupId}`, { headers });
    if (!res.ok) throw new Error("Failed to fetch settlements");
    return res.json() as Promise<Settlement[]>;
  },

  createSettlement: async (
    getToken: () => Promise<string | null>,
    data: {
      groupId: string;
      payerId: string;
      payeeId: string;
      amount: number;
      date: string;
    }
  ) => {
    const headers = await getHeaders(getToken);
    const res = await fetch(`${API_BASE}/settlements`, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to record settlement" }));
      throw new Error(err.error || "Failed to record settlement");
    }
    return res.json() as Promise<Settlement>;
  },

  deleteSettlement: async (getToken: () => Promise<string | null>, id: string) => {
    const headers = await getHeaders(getToken);
    const res = await fetch(`${API_BASE}/settlements/${id}`, {
      method: "DELETE",
      headers,
    });
    if (!res.ok) throw new Error("Failed to delete settlement");
    return res.json();
  },

  // Balances
  getGroupBalances: async (getToken: () => Promise<string | null>, groupId: string) => {
    const headers = await getHeaders(getToken);
    const res = await fetch(`${API_BASE}/balances/group/${groupId}`, { headers });
    if (!res.ok) throw new Error("Failed to fetch balances");
    return res.json() as Promise<{ balances: UserBalance[]; transfers: DebtTransfer[] }>;
  },

  getPairwiseTrace: async (getToken: () => Promise<string | null>, groupId: string, userA: string, userB: string) => {
    const headers = await getHeaders(getToken);
    const res = await fetch(`${API_BASE}/balances/group/${groupId}/trace?userA=${userA}&userB=${userB}`, { headers });
    if (!res.ok) throw new Error("Failed to fetch pairwise traceability chain");
    return res.json() as Promise<PairwiseTrace>;
  },

  // CSV Import Center
  getImportSessions: async (getToken: () => Promise<string | null>, groupId: string) => {
    const headers = await getHeaders(getToken);
    const res = await fetch(`${API_BASE}/import/group/${groupId}/sessions`, { headers });
    if (!res.ok) throw new Error("Failed to fetch import sessions");
    return res.json() as Promise<ImportSession[]>;
  },

  uploadCsv: async (getToken: () => Promise<string | null>, groupId: string, fileName: string, csvContent: string) => {
    const headers = await getHeaders(getToken);
    const res = await fetch(`${API_BASE}/import/group/${groupId}/import`, {
      method: "POST",
      headers,
      body: JSON.stringify({ fileName, csvContent }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to upload CSV" }));
      throw new Error(err.error || "Failed to upload CSV");
    }
    return res.json() as Promise<{ message: string; session: ImportSession; anomalyCount: number }>;
  },

  getSessionDetails: async (getToken: () => Promise<string | null>, sessionId: string) => {
    const headers = await getHeaders(getToken);
    const res = await fetch(`${API_BASE}/import/session/${sessionId}`, { headers });
    if (!res.ok) throw new Error("Failed to fetch session details");
    const data = await res.json();
    return { session: data, anomalies: data.anomalies || [] } as unknown as { session: ImportSession; anomalies: ImportAnomaly[] };
  },

  resolveAnomaly: async (
    getToken: () => Promise<string | null>,
    anomalyId: string,
    data: { decision: "APPROVED" | "REJECTED"; correction?: any }
  ) => {
    const headers = await getHeaders(getToken);
    const res = await fetch(`${API_BASE}/import/anomaly/${anomalyId}/resolve`, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to resolve anomaly" }));
      throw new Error(err.error || "Failed to resolve anomaly");
    }
    return res.json();
  },

  finalizeSession: async (getToken: () => Promise<string | null>, sessionId: string) => {
    const headers = await getHeaders(getToken);
    const res = await fetch(`${API_BASE}/import/session/${sessionId}/finalize`, {
      method: "POST",
      headers,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to finalize session" }));
      throw new Error(err.error || "Failed to finalize session");
    }
    return res.json() as Promise<{ success: boolean; message: string }>;
  },

  getImportReport: async (getToken: () => Promise<string | null>, sessionId: string) => {
    const headers = await getHeaders(getToken);
    const res = await fetch(`${API_BASE}/import/session/${sessionId}/report`, { headers });
    if (!res.ok) throw new Error("Failed to fetch report summary");
    return res.json() as Promise<ImportReportSummary>;
  },

  // Audit Logs
  getGroupAuditLogs: async (getToken: () => Promise<string | null>, groupId: string) => {
    const headers = await getHeaders(getToken);
    const res = await fetch(`${API_BASE}/audit-logs/group/${groupId}`, { headers });
    if (!res.ok) throw new Error("Failed to fetch audit logs");
    return res.json() as Promise<AuditLog[]>;
  },
};
