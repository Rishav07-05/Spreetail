import { useState, useEffect } from "react";
import { useAuth, MOCK_USERS } from "./context/AuthContext";
import { api } from "./lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  DollarSign,
  FileSpreadsheet,
  History,
  Plus,
  Trash2,
  Check,
  X,
  FileDown,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  UserCheck,
  Calendar,
  LogOut,
  HelpCircle
} from "lucide-react";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

function App() {
  const { user, signOut, signInAs, getToken } = useAuth();
  const queryClient = useQueryClient();

  // Navigation & Selection States
  const [activeTab, setActiveTab] = useState<"dashboard" | "groups" | "expenses" | "imports" | "audit">("dashboard");
  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => {
    return localStorage.getItem("selected_group_id") || "";
  });
  const [activeDate, setActiveDate] = useState<string>(() => new Date().toISOString().split("T")[0]);

  // Modal / Form States
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isLeaveOpen, setIsLeaveOpen] = useState(false);
  const [isSettlementOpen, setIsSettlementOpen] = useState(false);
  const [isExpenseOpen, setIsExpenseOpen] = useState(false);
  const [traceUsers, setTraceUsers] = useState<{ userAId: string; userBId: string; userAName: string; userBName: string } | null>(null);

  // CSV Session Details state
  const [selectedImportSessionId, setSelectedImportSessionId] = useState<string | null>(null);

  // Form Field States
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberJoinedAt, setMemberJoinedAt] = useState(() => new Date().toISOString().split("T")[0]);
  const [leaveMemberId, setLeaveMemberId] = useState("");
  const [leaveDate, setLeaveDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Settlement Form State
  const [settlePayerId, setSettlePayerId] = useState("");
  const [settlePayeeId, setSettlePayeeId] = useState("");
  const [settleAmount, setSettleAmount] = useState("");
  const [settleDate, setSettleDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Expense Form State
  const [expDesc, setExpDesc] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expDate, setExpDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [expPayerId, setExpPayerId] = useState("");
  const [expSplitType, setExpSplitType] = useState<"EQUAL" | "EXACT" | "PERCENTAGE" | "WEIGHTED">("EQUAL");
  const [expParticipants, setExpParticipants] = useState<Record<string, { selected: boolean; value: string }>>({});

  // Anomaly Correction States (stores inline corrections before saving)
  const [anomalyCorrections, setAnomalyCorrections] = useState<Record<string, {
    date: string;
    description: string;
    amount: string;
    payer: string;
    participants: string;
    splitType: string;
    splitValues: string;
    currency: string;
  }>>({});

  // Feedback State (toasts/banners)
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showNotification = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Sync user details on load
  useEffect(() => {
    if (user) {
      api.syncUser(getToken, { name: user.name, email: user.email }).catch(err => {
        console.error("Failed to sync user context with database:", err);
      });
    }
  }, [user]);

  // Persistent Selected Group
  useEffect(() => {
    if (selectedGroupId) {
      localStorage.setItem("selected_group_id", selectedGroupId);
    } else {
      localStorage.removeItem("selected_group_id");
    }
  }, [selectedGroupId]);

  // Queries
  const { data: groups = [], isLoading: isGroupsLoading } = useQuery({
    queryKey: ["groups"],
    queryFn: () => api.getGroups(getToken),
    enabled: !!user,
  });

  const { data: members = [], isLoading: isMembersLoading } = useQuery({
    queryKey: ["members", selectedGroupId],
    queryFn: () => api.getGroupMembers(getToken, selectedGroupId),
    enabled: !!user && !!selectedGroupId,
  });

  const { data: activeMembers = [] } = useQuery({
    queryKey: ["activeMembers", selectedGroupId, activeDate],
    queryFn: () => api.getActiveMembers(getToken, selectedGroupId, activeDate),
    enabled: !!user && !!selectedGroupId && !!activeDate,
  });

  const { data: expenses = [], isLoading: isExpensesLoading } = useQuery({
    queryKey: ["expenses", selectedGroupId],
    queryFn: () => api.getExpenses(getToken, selectedGroupId),
    enabled: !!user && !!selectedGroupId,
  });

  const { data: settlements = [] } = useQuery({
    queryKey: ["settlements", selectedGroupId],
    queryFn: () => api.getSettlements(getToken, selectedGroupId),
    enabled: !!user && !!selectedGroupId,
  });

  const { data: balanceData = { balances: [], transfers: [] }, isLoading: isBalancesLoading } = useQuery({
    queryKey: ["balances", selectedGroupId],
    queryFn: () => api.getGroupBalances(getToken, selectedGroupId),
    enabled: !!user && !!selectedGroupId,
  });

  const { data: pairwiseTrace } = useQuery({
    queryKey: ["pairwiseTrace", selectedGroupId, traceUsers?.userAId, traceUsers?.userBId],
    queryFn: () => api.getPairwiseTrace(getToken, selectedGroupId, traceUsers!.userAId, traceUsers!.userBId),
    enabled: !!user && !!selectedGroupId && !!traceUsers,
  });

  const { data: importSessions = [], isLoading: isImportSessionsLoading } = useQuery({
    queryKey: ["importSessions"],
    queryFn: () => api.getImportSessions(getToken),
    enabled: !!user && activeTab === "imports",
  });

  const { data: importSessionDetails } = useQuery({
    queryKey: ["importSessionDetails", selectedImportSessionId],
    queryFn: () => api.getSessionDetails(getToken, selectedImportSessionId!),
    enabled: !!user && !!selectedImportSessionId,
  });

  const { data: auditLogs = [] } = useQuery({
    queryKey: ["auditLogs", selectedGroupId],
    queryFn: () => api.getGroupAuditLogs(getToken, selectedGroupId),
    enabled: !!user && !!selectedGroupId && activeTab === "audit",
  });

  // Default Form Value Helpers
  useEffect(() => {
    if (members.length > 0) {
      const initialParts: Record<string, { selected: boolean; value: string }> = {};
      members.forEach((m) => {
        initialParts[m.userId] = { selected: true, value: "" };
      });
      setExpParticipants(initialParts);
      
      // Default payers
      if (!expPayerId) setExpPayerId(members[0].userId);
      if (!settlePayerId) setSettlePayerId(members[0].userId);
      if (!settlePayeeId && members.length > 1) setSettlePayeeId(members[1].userId);
    }
  }, [members]);

  // Mutations
  const createGroupMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) => api.createGroup(getToken, data),
    onSuccess: (newGroup) => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      setSelectedGroupId(newGroup.id);
      setIsCreateGroupOpen(false);
      setGroupName("");
      setGroupDesc("");
      showNotification(`Group "${newGroup.name}" created successfully!`);
    },
    onError: (err: any) => showNotification(err.message, "error"),
  });

  const inviteMemberMutation = useMutation({
    mutationFn: (data: { name: string; email: string; joinedAt: string }) =>
      api.inviteMember(getToken, selectedGroupId, data),
    onSuccess: (newMember) => {
      queryClient.invalidateQueries({ queryKey: ["members", selectedGroupId] });
      setIsInviteOpen(false);
      setMemberName("");
      setMemberEmail("");
      showNotification(`Invited ${newMember.user.name} successfully!`);
    },
    onError: (err: any) => showNotification(err.message, "error"),
  });

  const leaveGroupMutation = useMutation({
    mutationFn: (data: { leftAt: string }) => api.leaveGroup(getToken, selectedGroupId, data.leftAt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", selectedGroupId] });
      setIsLeaveOpen(false);
      showNotification(`Member marked as left starting from the specified date.`);
    },
    onError: (err: any) => showNotification(err.message, "error"),
  });

  const createExpenseMutation = useMutation({
    mutationFn: (data: any) => api.createExpense(getToken, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", selectedGroupId] });
      queryClient.invalidateQueries({ queryKey: ["balances", selectedGroupId] });
      setIsExpenseOpen(false);
      setExpDesc("");
      setExpAmount("");
      showNotification("Expense created successfully!");
    },
    onError: (err: any) => showNotification(err.message, "error"),
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (id: string) => api.deleteExpense(getToken, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", selectedGroupId] });
      queryClient.invalidateQueries({ queryKey: ["balances", selectedGroupId] });
      showNotification("Expense deleted.");
    },
    onError: (err: any) => showNotification(err.message, "error"),
  });

  const createSettlementMutation = useMutation({
    mutationFn: (data: any) => api.createSettlement(getToken, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settlements", selectedGroupId] });
      queryClient.invalidateQueries({ queryKey: ["balances", selectedGroupId] });
      setIsSettlementOpen(false);
      setSettleAmount("");
      showNotification("Settlement recorded successfully!");
    },
    onError: (err: any) => showNotification(err.message, "error"),
  });

  const deleteSettlementMutation = useMutation({
    mutationFn: (id: string) => api.deleteSettlement(getToken, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settlements", selectedGroupId] });
      queryClient.invalidateQueries({ queryKey: ["balances", selectedGroupId] });
      showNotification("Settlement deleted.");
    },
    onError: (err: any) => showNotification(err.message, "error"),
  });

  const uploadCsvMutation = useMutation({
    mutationFn: (data: { fileName: string; csvContent: string }) =>
      api.uploadCsv(getToken, selectedGroupId, data.fileName, data.csvContent),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["importSessions"] });
      setSelectedImportSessionId(res.session.id);
      showNotification(`CSV uploaded. Found ${res.anomalyCount} anomalies to review.`);
    },
    onError: (err: any) => showNotification(err.message, "error"),
  });

  const resolveAnomalyMutation = useMutation({
    mutationFn: (data: { anomalyId: string; decision: "APPROVED" | "REJECTED"; correction?: any }) =>
      api.resolveAnomaly(getToken, data.anomalyId, { decision: data.decision, correction: data.correction }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["importSessionDetails", selectedImportSessionId] });
      showNotification("Anomaly resolution saved.");
    },
    onError: (err: any) => showNotification(err.message, "error"),
  });

  const finalizeSessionMutation = useMutation({
    mutationFn: (sessionId: string) => api.finalizeSession(getToken, sessionId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["importSessions"] });
      queryClient.invalidateQueries({ queryKey: ["importSessionDetails", selectedImportSessionId] });
      queryClient.invalidateQueries({ queryKey: ["expenses", selectedGroupId] });
      queryClient.invalidateQueries({ queryKey: ["balances", selectedGroupId] });
      showNotification(res.message);
    },
    onError: (err: any) => showNotification(err.message, "error"),
  });

  // CSV Drag and Drop Handler
  const handleCsvFile = (file: File) => {
    if (!selectedGroupId) {
      showNotification("Please select a group first before uploading CSV", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      uploadCsvMutation.mutate({ fileName: file.name, csvContent: content });
    };
    reader.readAsText(file);
  };

  // Math Helper for Splits
  const getPayerName = (payerId: string) => {
    return members.find((m) => m.userId === payerId)?.user.name || payerId;
  };

  const getParticipantsSummary = (parts: any[]) => {
    return parts.map((p) => {
      const u = members.find((m) => m.userId === p.userId)?.user.name || p.userId;
      return `${u}: ₹${p.shareAmount.toFixed(2)}`;
    }).join(", ");
  };

  // PDF Download Report Generator
  const downloadReport = async (sessionId: string) => {
    try {
      const report = await api.getImportReport(getToken, sessionId);
      const doc = new jsPDF();
      
      // Document Header styling
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(220, 20, 60); // Crimson
      doc.text("Spreetail Shared Expense Manager", 14, 20);
      
      doc.setFontSize(14);
      doc.setTextColor(80, 80, 80);
      doc.text("CSV Import Report Summary", 14, 28);
      doc.line(14, 32, 196, 32);

      // Report Table
      doc.setFontSize(11);
      (doc as any).autoTable({
        startY: 38,
        theme: "striped",
        headStyles: { fillColor: [220, 20, 60], textColor: [255, 255, 255] },
        head: [["Metric", "Count / Detail"]],
        body: [
          ["File Name", report.fileName],
          ["Status", report.status],
          ["Total CSV Rows", report.totalRows],
          ["Successfully Imported Rows", report.importedRows],
          ["Skipped / Inactive Rows", report.skippedRows],
          ["Total Anomalies Flagged", report.anomaliesFound],
          ["Anomalies Manually Corrected", report.anomaliesFixed],
          ["Manually Rejected Entries", report.rejectedRecords],
          ["Parsing & Validation Duration", `${report.importDurationSec} seconds`],
          ["Completed Timestamp", new Date(report.timestamp).toLocaleString()],
        ],
      });

      doc.setFont("Helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text("This report was compiled and verified dynamically via the client anomaly processor.", 14, doc.internal.pageSize.getHeight() - 15);

      doc.save(`CSV-Import-Report-${report.fileName}.pdf`);
      showNotification("PDF downloaded successfully!");
    } catch (error) {
      console.error(error);
      showNotification("Failed to generate PDF", "error");
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-[#FEFDDF] flex flex-col md:flex-row">
      
      {/* 1. LEFT SIDEBAR */}
      <aside className="w-full md:w-80 bg-[#141414] border-b md:border-b-0 md:border-r border-[#222222] p-6 flex flex-col justify-between">
        <div>
          {/* Logo & Platform Name */}
          <div className="mb-8 flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#DC143C] flex items-center justify-center font-bold text-[#FEFDDF]">
              S
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-[#FEFDDF] leading-none">Spreetail</h1>
              <span className="text-[10px] text-gray-500 uppercase tracking-widest">Expense Platform</span>
            </div>
          </div>

          {/* Group Selector */}
          <div className="mb-6">
            <label className="block text-xs uppercase tracking-wider text-gray-500 mb-2 font-medium">Selected Group</label>
            {isGroupsLoading ? (
              <div className="h-10 bg-[#222222] rounded animate-pulse" />
            ) : (
              <div className="flex gap-2">
                <select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className="flex-1 bg-[#0B0B0B] border border-[#222222] rounded px-3 py-2 text-sm text-[#FEFDDF] focus:outline-none focus:border-[#DC143C]"
                >
                  <option value="">-- Choose Group --</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setIsCreateGroupOpen(true)}
                  className="bg-[#DC143C] hover:bg-[#c81035] p-2.5 rounded text-[#FEFDDF] flex items-center justify-center transition-colors"
                  title="Create Group"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-all ${
                activeTab === "dashboard" ? "bg-[#DC143C] text-[#FEFDDF] font-medium" : "text-gray-400 hover:bg-[#1c1c1c] hover:text-[#FEFDDF]"
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              Overview Dashboard
            </button>
            <button
              onClick={() => setActiveTab("groups")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-all ${
                activeTab === "groups" ? "bg-[#DC143C] text-[#FEFDDF] font-medium" : "text-gray-400 hover:bg-[#1c1c1c] hover:text-[#FEFDDF]"
              }`}
            >
              <Users className="w-4 h-4" />
              Groups & Members
            </button>
            <button
              onClick={() => setActiveTab("expenses")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-all ${
                activeTab === "expenses" ? "bg-[#DC143C] text-[#FEFDDF] font-medium" : "text-gray-400 hover:bg-[#1c1c1c] hover:text-[#FEFDDF]"
              }`}
            >
              <DollarSign className="w-4 h-4" />
              Expenses & Payments
            </button>
            <button
              onClick={() => setActiveTab("imports")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-all ${
                activeTab === "imports" ? "bg-[#DC143C] text-[#FEFDDF] font-medium" : "text-gray-400 hover:bg-[#1c1c1c] hover:text-[#FEFDDF]"
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              CSV Import Center
            </button>
            <button
              onClick={() => setActiveTab("audit")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-all ${
                activeTab === "audit" ? "bg-[#DC143C] text-[#FEFDDF] font-medium" : "text-gray-400 hover:bg-[#1c1c1c] hover:text-[#FEFDDF]"
              }`}
            >
              <History className="w-4 h-4" />
              Audit Logs
            </button>
          </nav>
        </div>

        {/* User Block & Switcher */}
        <div className="pt-6 border-t border-[#222222]">
          <div className="mb-4">
            <span className="block text-[10px] text-gray-500 uppercase tracking-widest font-medium mb-1.5">Switch Mock Profile</span>
            <select
              value={user?.id || ""}
              onChange={(e) => signInAs(e.target.value)}
              className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-3 py-1.5 text-xs text-[#FEFDDF] focus:outline-none focus:border-[#DC143C]"
            >
              {MOCK_USERS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <img
                src={user?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${user?.name || "Demo"}`}
                className="w-9 h-9 rounded-full bg-[#222222] border border-[#222222]"
                alt=""
              />
              <div className="leading-tight">
                <span className="block text-xs font-semibold text-[#FEFDDF]">{user?.name}</span>
                <span className="block text-[10px] text-gray-500">{user?.email}</span>
              </div>
            </div>
            <button
              onClick={() => signOut()}
              className="text-gray-500 hover:text-[#DC143C] transition-colors p-1"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* 2. MAIN CONTENT AREA */}
      <main className="flex-1 p-6 md:p-10 max-h-screen overflow-y-auto">
        {/* Banner notification */}
        {notification && (
          <div
            className={`fixed top-6 right-6 z-50 px-4 py-3 rounded border text-sm flex items-center gap-3 shadow-lg ${
              notification.type === "success"
                ? "bg-[#141414] border-[#DC143C] text-[#FEFDDF]"
                : "bg-red-950 border-red-800 text-red-100"
            }`}
          >
            {notification.type === "success" ? <Check className="w-4 h-4 text-[#DC143C]" /> : <AlertTriangle className="w-4 h-4 text-red-500" />}
            {notification.message}
          </div>
        )}

        {/* Global check: Selected Group Warning */}
        {!selectedGroupId && activeTab !== "groups" && (
          <div className="h-[60vh] flex flex-col items-center justify-center text-center p-8 bg-[#141414] border border-[#222222] rounded">
            <HelpCircle className="w-12 h-12 text-[#DC143C] mb-4" />
            <h2 className="text-xl font-bold mb-2">No Group Selected</h2>
            <p className="text-gray-400 text-sm max-w-md mb-6">
              To view balances, compute splits, and audit historical logs, you must first create or select a group from the list.
            </p>
            <button
              onClick={() => setActiveTab("groups")}
              className="bg-[#DC143C] hover:bg-[#c81035] text-[#FEFDDF] text-xs font-semibold px-4 py-2.5 rounded transition-all flex items-center gap-2"
            >
              Go to Groups & Members <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {selectedGroupId && activeTab === "dashboard" && (
          <div className="space-y-8">
            {/* Header Title */}
            <div>
              <span className="text-[10px] text-[#DC143C] uppercase tracking-widest font-semibold">Overview Dashboard</span>
              <h2 className="text-3xl font-extrabold tracking-tight mt-1 text-[#FEFDDF]">
                {groups.find((g) => g.id === selectedGroupId)?.name}
              </h2>
              <p className="text-gray-400 text-sm mt-1">
                {groups.find((g) => g.id === selectedGroupId)?.description || "Historical timeline expenses and balance trail."}
              </p>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#141414] border border-[#222222] p-6 rounded flex items-center justify-between">
                <div>
                  <span className="block text-xs text-gray-500 uppercase tracking-wider font-semibold">Total Expenses</span>
                  <span className="block text-3xl font-bold mt-1.5 text-[#FEFDDF]">
                    ₹{expenses.reduce((acc, curr) => acc + curr.amount, 0).toLocaleString()}
                  </span>
                </div>
                <div className="p-3 bg-[#DC143C]/10 rounded border border-[#DC143C]/20 text-[#DC143C]">
                  <DollarSign className="w-6 h-6" />
                </div>
              </div>
              <div className="bg-[#141414] border border-[#222222] p-6 rounded flex items-center justify-between">
                <div>
                  <span className="block text-xs text-gray-500 uppercase tracking-wider font-semibold">Total Settlements</span>
                  <span className="block text-3xl font-bold mt-1.5 text-[#FEFDDF]">
                    ₹{settlements.reduce((acc, curr) => acc + curr.amount, 0).toLocaleString()}
                  </span>
                </div>
                <div className="p-3 bg-green-500/10 rounded border border-green-500/20 text-green-400">
                  <Check className="w-6 h-6" />
                </div>
              </div>
              {/* Active Members on Date Selector */}
              <div className="bg-[#141414] border border-[#222222] p-6 rounded">
                <span className="block text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Timeline Active Members</span>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={activeDate}
                    onChange={(e) => setActiveDate(e.target.value)}
                    className="flex-1 bg-[#0B0B0B] border border-[#222222] rounded px-3 py-1.5 text-xs text-[#FEFDDF] focus:outline-none focus:border-[#DC143C]"
                  />
                </div>
                <span className="block text-[10px] text-gray-500 mt-2 font-medium">
                  {activeMembers.length} active member{activeMembers.length === 1 ? "" : "s"} on selected date.
                </span>
              </div>
            </div>

            {/* Balances Section & simplified transactions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Group Balances */}
              <div className="bg-[#141414] border border-[#222222] p-6 rounded">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-sm uppercase tracking-wider text-gray-400">Net Balances</h3>
                  <span className="text-[10px] text-[#DC143C] font-semibold">Click to Trace Expense Chain</span>
                </div>
                {isBalancesLoading ? (
                  <div className="space-y-2">
                    <div className="h-12 bg-[#222222] rounded animate-pulse" />
                    <div className="h-12 bg-[#222222] rounded animate-pulse" />
                  </div>
                ) : balanceData.balances.length === 0 ? (
                  <div className="text-gray-500 text-xs py-4">No balances recorded yet. Add some expenses!</div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {balanceData.balances.map((b) => (
                      <div key={b.userId} className="bg-[#0B0B0B] border border-[#222222] p-3.5 rounded flex items-center justify-between">
                        <div className="leading-tight">
                          <span className="block text-sm font-semibold text-[#FEFDDF]">{b.name}</span>
                          <span className="block text-[10px] text-gray-500">{b.email}</span>
                        </div>
                        <div className="text-right">
                          <span className={`block font-bold text-sm ${b.netBalance >= 0 ? "text-green-400" : "text-[#DC143C]"}`}>
                            {b.netBalance >= 0 ? "+" : ""}₹{b.netBalance.toFixed(2)}
                          </span>
                          <span className="block text-[10px] text-gray-500">
                            {b.netBalance > 0 ? "owed" : b.netBalance < 0 ? "owes" : "settled"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Simplified Debts */}
              <div className="bg-[#141414] border border-[#222222] p-6 rounded">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-sm uppercase tracking-wider text-gray-400">Simplified Debts</h3>
                  <span className="text-[10px] text-gray-500 uppercase font-semibold">Minimization Engine</span>
                </div>
                {isBalancesLoading ? (
                  <div className="space-y-2">
                    <div className="h-12 bg-[#222222] rounded animate-pulse" />
                  </div>
                ) : balanceData.transfers.length === 0 ? (
                  <div className="text-green-400 text-xs py-6 flex items-center gap-2">
                    <UserCheck className="w-4 h-4" /> All balances settled up!
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-96 overflow-y-auto">
                    {balanceData.transfers.map((t, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          setTraceUsers({
                            userAId: t.from,
                            userBId: t.to,
                            userAName: t.fromName,
                            userBName: t.toName,
                          });
                        }}
                        className="bg-[#0B0B0B] border border-[#222222] hover:border-[#DC143C] p-3 rounded flex items-center justify-between cursor-pointer transition-colors"
                        title="Click to audit ledger trace"
                      >
                        <div className="flex items-center gap-3 text-xs">
                          <span className="font-semibold text-gray-300">{t.fromName}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-[#DC143C]" />
                          <span className="font-semibold text-gray-300">{t.toName}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-[#DC143C]">₹{t.amount.toFixed(2)}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSettlePayerId(t.from);
                              setSettlePayeeId(t.to);
                              setSettleAmount(t.amount.toString());
                              setIsSettlementOpen(true);
                            }}
                            className="bg-[#DC143C] hover:bg-[#c81035] text-[10px] font-bold px-2 py-1.5 rounded text-[#FEFDDF] transition-colors"
                          >
                            Settle
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Timeline warning indicator */}
            <div className="bg-[#141414] border border-[#222222] p-4 rounded flex items-start gap-3 text-xs text-gray-400">
              <Calendar className="w-4 h-4 text-[#DC143C] shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-[#FEFDDF] block mb-0.5">Note on Timeline Engine:</span>
                Expenses are only assigned to participants active in the group on the expense date. Exited members remain historically in past calculations.
              </div>
            </div>
          </div>
        )}

        {/* 3. INTERACTIVE PAIRWISE TRACEABILITY OVERLAY */}
        {traceUsers && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-[#141414] border border-[#222222] w-full max-w-2xl rounded p-6 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-[#222222] pb-4 mb-6">
                <div>
                  <h3 className="font-bold text-lg text-[#FEFDDF]">
                    Ledger Trace: {traceUsers.userAName} &amp; {traceUsers.userBName}
                  </h3>
                  <span className="text-xs text-gray-500">Pairwise audit trail of transactions</span>
                </div>
                <button
                  onClick={() => setTraceUsers(null)}
                  className="text-gray-400 hover:text-[#FEFDDF]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {!pairwiseTrace ? (
                <div className="space-y-2 py-8">
                  <div className="h-10 bg-[#222222] rounded animate-pulse" />
                  <div className="h-10 bg-[#222222] rounded animate-pulse" />
                </div>
              ) : (
                <div>
                  {/* Balance Summary Header */}
                  <div className="bg-[#0B0B0B] border border-[#222222] p-4 rounded mb-6 flex justify-between items-center text-sm">
                    <span className="text-gray-400 font-medium">Net Pairwise Balance:</span>
                    <span className={`font-bold text-base ${pairwiseTrace.netPairwiseBalance >= 0 ? "text-green-400" : "text-[#DC143C]"}`}>
                      {pairwiseTrace.netPairwiseBalance >= 0 
                        ? `${pairwiseTrace.userB.name} owes ${pairwiseTrace.userA.name} ₹${pairwiseTrace.netPairwiseBalance.toFixed(2)}`
                        : `${pairwiseTrace.userA.name} owes ${pairwiseTrace.userB.name} ₹${Math.abs(pairwiseTrace.netPairwiseBalance).toFixed(2)}`
                      }
                    </span>
                  </div>

                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Chronological Chain</h4>
                  
                  {pairwiseTrace.chain.length === 0 ? (
                    <div className="text-center py-6 text-xs text-gray-500">No direct transactions logged.</div>
                  ) : (
                    <div className="relative border-l border-[#222222] ml-2.5 pl-6 space-y-6">
                      {pairwiseTrace.chain.map((item) => (
                        <div key={item.id} className="relative">
                          {/* Timeline dot */}
                          <div className={`absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full border border-[#141414] ${
                            item.type === "EXPENSE" ? "bg-[#DC143C]" : "bg-green-400"
                          }`} />
                          
                          <div className="bg-[#0B0B0B] border border-[#222222] p-3.5 rounded">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                  item.type === "EXPENSE" ? "bg-[#DC143C]/10 text-[#DC143C]" : "bg-green-500/10 text-green-400"
                                }`}>
                                  {item.type}
                                </span>
                                <h5 className="font-semibold text-sm text-[#FEFDDF] mt-1.5">{item.description}</h5>
                                <span className="text-[10px] text-gray-500 block mt-0.5">
                                  Date: {new Date(item.date).toLocaleDateString()} | Paid by: {item.whoPaid}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="block text-xs text-gray-400">Total: ₹{item.totalAmount.toFixed(2)}</span>
                                <span className={`block text-xs font-bold mt-1 ${item.effectAmount >= 0 ? "text-green-400" : "text-[#DC143C]"}`}>
                                  {item.effectAmount >= 0 ? "+" : ""}₹{item.effectAmount.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 4. GROUPS TAB */}
        {activeTab === "groups" && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] text-[#DC143C] uppercase tracking-widest font-semibold">Admin Panel</span>
                <h2 className="text-3xl font-extrabold text-[#FEFDDF]">Groups &amp; Members</h2>
                <p className="text-gray-400 text-sm mt-1">Manage shared accounts and timeline memberships.</p>
              </div>
              <button
                onClick={() => setIsCreateGroupOpen(true)}
                className="bg-[#DC143C] hover:bg-[#c81035] text-xs font-semibold px-4 py-2.5 rounded text-[#FEFDDF] flex items-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" /> Create Group
              </button>
            </div>

            {/* Groups list */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {groups.map((g) => (
                <div
                  key={g.id}
                  className={`bg-[#141414] border p-6 rounded flex flex-col justify-between transition-all cursor-pointer ${
                    selectedGroupId === g.id ? "border-[#DC143C]" : "border-[#222222] hover:border-gray-700"
                  }`}
                  onClick={() => setSelectedGroupId(g.id)}
                >
                  <div>
                    <h3 className="font-bold text-lg text-[#FEFDDF]">{g.name}</h3>
                    <p className="text-gray-400 text-xs mt-1.5 min-h-[32px]">{g.description || "No description provided."}</p>
                    <span className="block text-[10px] text-gray-500 mt-4">
                      Created: {new Date(g.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {selectedGroupId === g.id && (
                    <div className="mt-4 flex items-center gap-2 text-[10px] text-[#DC143C] font-bold uppercase tracking-wider">
                      <Check className="w-3.5 h-3.5" /> Active Workspace Group
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Selected Group details */}
            {selectedGroupId && (
              <div className="bg-[#141414] border border-[#222222] p-6 rounded">
                <div className="flex items-center justify-between border-b border-[#222222] pb-4 mb-6">
                  <div>
                    <h3 className="font-bold text-lg text-[#FEFDDF]">Members List</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Timeline of historical group participants</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsInviteOpen(true)}
                      className="bg-[#0B0B0B] border border-[#222222] hover:border-gray-700 text-xs font-semibold px-3.5 py-2 rounded text-[#FEFDDF] flex items-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#DC143C]" /> Add Member
                    </button>
                    <button
                      onClick={() => setIsLeaveOpen(true)}
                      className="bg-[#0B0B0B] border border-red-950 hover:bg-red-950/20 text-xs font-semibold px-3.5 py-2 rounded text-red-400 flex items-center gap-1.5 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" /> Record Exit
                    </button>
                  </div>
                </div>

                {isMembersLoading ? (
                  <div className="space-y-2">
                    <div className="h-10 bg-[#222222] rounded animate-pulse" />
                    <div className="h-10 bg-[#222222] rounded animate-pulse" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {members.map((m) => (
                      <div key={m.id} className="bg-[#0B0B0B] border border-[#222222] p-4 rounded flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <img
                            src={m.user.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${m.user.name}`}
                            className="w-8 h-8 rounded-full bg-[#141414] border border-[#222222]"
                            alt=""
                          />
                          <div>
                            <span className="block text-sm font-semibold text-[#FEFDDF]">{m.user.name}</span>
                            <span className="block text-[10px] text-gray-500">{m.user.email}</span>
                          </div>
                        </div>
                        <div className="text-right text-[10px]">
                          <span className="block text-green-400 font-medium">Joined: {new Date(m.joinedAt).toLocaleDateString()}</span>
                          {m.leftAt ? (
                            <span className="block text-[#DC143C] font-semibold mt-0.5">Exited: {new Date(m.leftAt).toLocaleDateString()}</span>
                          ) : (
                            <span className="block text-gray-500 mt-0.5">Status: Active</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 5. EXPENSES & SETTLEMENTS TAB */}
        {selectedGroupId && activeTab === "expenses" && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] text-[#DC143C] uppercase tracking-widest font-semibold font-medium">Ledger Books</span>
                <h2 className="text-3xl font-extrabold text-[#FEFDDF]">Expenses &amp; Payments</h2>
                <p className="text-gray-400 text-sm mt-1">Audit logs of all logged group charges and settlements.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsSettlementOpen(true)}
                  className="bg-[#0B0B0B] border border-[#222222] hover:border-gray-700 text-xs font-semibold px-4 py-2.5 rounded text-[#FEFDDF] flex items-center gap-2 transition-colors"
                >
                  Record Payment
                </button>
                <button
                  onClick={() => setIsExpenseOpen(true)}
                  className="bg-[#DC143C] hover:bg-[#c81035] text-xs font-semibold px-4 py-2.5 rounded text-[#FEFDDF] flex items-center gap-2 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add Expense
                </button>
              </div>
            </div>

            {/* Tab layout: Expenses vs Settlements list */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Expenses List */}
              <div className="lg:col-span-2 space-y-4">
                <h3 className="font-bold text-sm uppercase tracking-wider text-gray-500 mb-2">Logged Expenses</h3>
                
                {isExpensesLoading ? (
                  <div className="space-y-2">
                    <div className="h-20 bg-[#141414] rounded animate-pulse" />
                    <div className="h-20 bg-[#141414] rounded animate-pulse" />
                  </div>
                ) : expenses.length === 0 ? (
                  <div className="text-center py-10 bg-[#141414] border border-[#222222] rounded text-gray-500 text-xs">
                    No active expenses recorded. Click "Add Expense" to get started.
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[70vh] overflow-y-auto">
                    {expenses.map((e) => (
                      <div key={e.id} className="bg-[#141414] border border-[#222222] p-5 rounded relative group">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-[#DC143C] bg-[#DC143C]/10 px-1.5 py-0.5 rounded">
                              {e.splitType} SPLIT
                            </span>
                            <h4 className="font-bold text-base text-[#FEFDDF] mt-1.5">{e.description}</h4>
                          </div>
                          <div className="text-right">
                            <span className="block font-bold text-lg text-[#FEFDDF]">₹{e.amount.toFixed(2)}</span>
                            <span className="block text-[10px] text-gray-500 mt-0.5">
                              {new Date(e.date).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <div className="text-xs text-gray-400 mt-3 pt-3 border-t border-[#222222]/40 flex justify-between items-center">
                          <div>
                            <span className="text-gray-500">Paid by: </span>
                            <span className="font-semibold text-gray-300">{getPayerName(e.payerId)}</span>
                          </div>
                          <button
                            onClick={() => deleteExpenseMutation.mutate(e.id)}
                            className="text-gray-500 hover:text-[#DC143C] transition-colors p-1"
                            title="Soft delete expense"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="text-[10px] text-gray-500 mt-2">
                          <span className="font-medium text-gray-400">Shares:</span> {getParticipantsSummary(e.participants)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Settlements List */}
              <div className="space-y-4">
                <h3 className="font-bold text-sm uppercase tracking-wider text-gray-500 mb-2">Settlements Log</h3>
                
                {settlements.length === 0 ? (
                  <div className="text-center py-10 bg-[#141414] border border-[#222222] rounded text-gray-500 text-xs">
                    No settlements recorded yet.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[70vh] overflow-y-auto">
                    {settlements.map((s) => (
                      <div key={s.id} className="bg-[#141414] border border-[#222222] p-4 rounded flex justify-between items-center relative group">
                        <div className="leading-tight">
                          <div className="flex items-center gap-1.5 text-xs text-[#FEFDDF] font-semibold">
                            <span>{getPayerName(s.payerId)}</span>
                            <ArrowRight className="w-3 h-3 text-green-400" />
                            <span>{getPayerName(s.payeeId)}</span>
                          </div>
                          <span className="block text-[9px] text-gray-500 mt-1">
                            {new Date(s.date).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-green-400">₹{s.amount.toFixed(2)}</span>
                          <button
                            onClick={() => deleteSettlementMutation.mutate(s.id)}
                            className="text-gray-500 hover:text-[#DC143C] transition-colors p-1"
                            title="Soft delete settlement"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* 6. CSV IMPORT TAB */}
        {activeTab === "imports" && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] text-[#DC143C] uppercase tracking-widest font-semibold font-medium">CSV Import Pipeline</span>
                <h2 className="text-3xl font-extrabold text-[#FEFDDF]">Data Quality Import Center</h2>
                <p className="text-gray-400 text-sm mt-1">RFC-4180 parsing, anomaly checking, and approved manual corrections.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Left Column: Drag & Drop CSV + Sessions history */}
              <div className="space-y-6">
                
                {/* Drag & Drop Card */}
                <div
                  className="bg-[#141414] border-2 border-dashed border-[#222222] hover:border-[#DC143C] p-8 rounded text-center cursor-pointer transition-colors"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files.length > 0) {
                      handleCsvFile(e.dataTransfer.files[0]);
                    }
                  }}
                >
                  <FileSpreadsheet className="w-10 h-10 text-[#DC143C] mx-auto mb-3" />
                  <h3 className="font-bold text-sm text-[#FEFDDF]">Upload Expense CSV</h3>
                  <p className="text-[10px] text-gray-500 mt-1 max-w-xs mx-auto">
                    Drag and drop your spreadsheet here, or click to browse. Format headers: Date, Description, Amount, Payer, Participants, SplitType, SplitValues.
                  </p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleCsvFile(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                    id="csv-file-picker"
                  />
                  <label
                    htmlFor="csv-file-picker"
                    className="mt-4 inline-block bg-[#0B0B0B] border border-[#222222] hover:border-gray-700 text-[10px] font-bold px-3 py-1.5 rounded text-[#FEFDDF] cursor-pointer"
                  >
                    Select File
                  </label>
                </div>

                {/* Import Sessions History */}
                <div className="bg-[#141414] border border-[#222222] p-5 rounded">
                  <h3 className="font-bold text-sm uppercase tracking-wider text-gray-500 mb-3">Sessions History</h3>
                  
                  {isImportSessionsLoading ? (
                    <div className="h-10 bg-[#222222] rounded animate-pulse" />
                  ) : importSessions.length === 0 ? (
                    <div className="text-gray-500 text-xs py-4">No import sessions recorded yet.</div>
                  ) : (
                    <div className="space-y-2.5 max-h-96 overflow-y-auto">
                      {importSessions.map((session) => (
                        <div
                          key={session.id}
                          onClick={() => setSelectedImportSessionId(session.id)}
                          className={`bg-[#0B0B0B] border p-3 rounded cursor-pointer transition-colors ${
                            selectedImportSessionId === session.id ? "border-[#DC143C]" : "border-[#222222] hover:border-gray-700"
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-semibold text-xs text-[#FEFDDF] truncate max-w-[150px]">{session.fileName}</h4>
                              <span className="text-[9px] text-gray-500 block mt-0.5">
                                {new Date(session.startedAt).toLocaleDateString()}
                              </span>
                            </div>
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                              session.status === "FINALIZED" ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"
                            }`}>
                              {session.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              {/* Right Column: Staging Anomaly review */}
              <div className="lg:col-span-2 space-y-6">
                
                {selectedImportSessionId && importSessionDetails ? (
                  <div className="bg-[#141414] border border-[#222222] p-6 rounded">
                    
                    {/* Session overview panel */}
                    <div className="flex justify-between items-center border-b border-[#222222] pb-4 mb-6">
                      <div>
                        <h3 className="font-bold text-lg text-[#FEFDDF]">
                          Review: {importSessionDetails.session.fileName}
                        </h3>
                        <div className="flex gap-4 text-[10px] text-gray-500 mt-1">
                          <span>Total: {importSessionDetails.session.totalRows} rows</span>
                          <span>Imported: {importSessionDetails.session.importedRows}</span>
                          <span>Skipped: {importSessionDetails.session.skippedRows}</span>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        {importSessionDetails.session.status === "FINALIZED" && (
                          <button
                            onClick={() => downloadReport(importSessionDetails.session.id)}
                            className="bg-[#0B0B0B] border border-[#222222] hover:border-gray-700 text-xs font-semibold px-3.5 py-2 rounded text-[#FEFDDF] flex items-center gap-1.5"
                          >
                            <FileDown className="w-4 h-4 text-[#DC143C]" /> Download PDF Report
                          </button>
                        )}
                        {importSessionDetails.session.status === "DRAFT" && (
                          <button
                            onClick={() => finalizeSessionMutation.mutate(importSessionDetails.session.id)}
                            className="bg-[#DC143C] hover:bg-[#c81035] text-xs font-semibold px-4 py-2.5 rounded text-[#FEFDDF]"
                          >
                            Commit &amp; Finalize Staging
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Anomalies Queue */}
                    <h4 className="font-bold text-xs uppercase tracking-wider text-gray-500 mb-3">Anomaly Detection Queue</h4>
                    
                    {importSessionDetails.anomalies.length === 0 ? (
                      <div className="text-center py-6 text-green-400 text-xs">
                        ✔ No anomalies found! You can finalize the import session.
                      </div>
                    ) : (
                      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                        {importSessionDetails.anomalies.map((anomaly) => {
                          const isPending = anomaly.userDecision === "PENDING";
                          const correction = anomalyCorrections[anomaly.id] || {
                            date: anomaly.record?.rawContent ? JSON.parse(anomaly.record.rawContent)[0] || "" : "",
                            description: anomaly.record?.rawContent ? JSON.parse(anomaly.record.rawContent)[1] || "" : "",
                            amount: anomaly.record?.rawContent ? JSON.parse(anomaly.record.rawContent)[2] || "" : "",
                            payer: anomaly.record?.rawContent ? JSON.parse(anomaly.record.rawContent)[3] || "" : "",
                            participants: anomaly.record?.rawContent ? JSON.parse(anomaly.record.rawContent)[4] || "" : "",
                            splitType: anomaly.record?.rawContent ? JSON.parse(anomaly.record.rawContent)[5] || "" : "",
                            splitValues: anomaly.record?.rawContent ? JSON.parse(anomaly.record.rawContent)[6] || "" : "",
                            currency: anomaly.record?.rawContent ? JSON.parse(anomaly.record.rawContent)[7] || "" : "",
                          };

                          const updateCorrectionField = (field: string, val: string) => {
                            setAnomalyCorrections((prev) => ({
                              ...prev,
                              [anomaly.id]: {
                                ...correction,
                                [field]: val,
                              },
                            }));
                          };

                          return (
                            <div key={anomaly.id} className="bg-[#0B0B0B] border border-[#222222] p-4 rounded space-y-4">
                              <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                      anomaly.severity === "HIGH" ? "bg-red-950 text-red-500 border border-red-900" :
                                      anomaly.severity === "MEDIUM" ? "bg-yellow-950 text-yellow-500 border border-yellow-900" :
                                      "bg-blue-950 text-blue-400 border border-blue-900"
                                    }`}>
                                      {anomaly.severity} SEVERITY
                                    </span>
                                    <span className="text-[10px] text-gray-500">Row {anomaly.record?.rowIndex}</span>
                                  </div>
                                  <h5 className="font-semibold text-sm text-[#FEFDDF]">{anomaly.description}</h5>
                                  <p className="text-[10px] text-gray-400">
                                    <span className="text-[#DC143C] font-semibold">Fix:</span> {anomaly.recommendedAction}
                                  </p>
                                </div>
                                <div className="text-[10px] text-gray-500">
                                  Status: <span className="font-semibold text-gray-300">{anomaly.userDecision}</span>
                                </div>
                              </div>

                              {/* Interactive Inline Correction Fields */}
                              {isPending && importSessionDetails.session.status === "DRAFT" && (
                                <div className="bg-[#141414] border border-[#222222] p-3 rounded space-y-2">
                                  <span className="block text-[9px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
                                    Inline Editor
                                  </span>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                    <div>
                                      <label className="block text-[8px] text-gray-500 uppercase">Date</label>
                                      <input
                                        type="text"
                                        value={correction.date}
                                        onChange={(e) => updateCorrectionField("date", e.target.value)}
                                        className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-2 py-1 text-xs text-[#FEFDDF]"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[8px] text-gray-500 uppercase">Description</label>
                                      <input
                                        type="text"
                                        value={correction.description}
                                        onChange={(e) => updateCorrectionField("description", e.target.value)}
                                        className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-2 py-1 text-xs text-[#FEFDDF]"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[8px] text-gray-500 uppercase">Amount</label>
                                      <input
                                        type="text"
                                        value={correction.amount}
                                        onChange={(e) => updateCorrectionField("amount", e.target.value)}
                                        className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-2 py-1 text-xs text-[#FEFDDF]"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[8px] text-gray-500 uppercase">Payer</label>
                                      <input
                                        type="text"
                                        value={correction.payer}
                                        onChange={(e) => updateCorrectionField("payer", e.target.value)}
                                        className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-2 py-1 text-xs text-[#FEFDDF]"
                                      />
                                    </div>
                                    <div className="col-span-2">
                                      <label className="block text-[8px] text-gray-500 uppercase">Participants</label>
                                      <input
                                        type="text"
                                        value={correction.participants}
                                        onChange={(e) => updateCorrectionField("participants", e.target.value)}
                                        className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-2 py-1 text-xs text-[#FEFDDF]"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[8px] text-gray-500 uppercase">Split Type</label>
                                      <input
                                        type="text"
                                        value={correction.splitType}
                                        onChange={(e) => updateCorrectionField("splitType", e.target.value)}
                                        className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-2 py-1 text-xs text-[#FEFDDF]"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[8px] text-gray-500 uppercase">Values</label>
                                      <input
                                        type="text"
                                        value={correction.splitValues}
                                        onChange={(e) => updateCorrectionField("splitValues", e.target.value)}
                                        className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-2 py-1 text-xs text-[#FEFDDF]"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex gap-2 justify-end pt-2">
                                    <button
                                      onClick={() => resolveAnomalyMutation.mutate({
                                        anomalyId: anomaly.id,
                                        decision: "REJECTED",
                                      })}
                                      className="border border-red-950 hover:bg-red-950/20 text-red-400 text-[10px] font-bold px-3 py-1.5 rounded flex items-center gap-1 transition-colors"
                                    >
                                      <X className="w-3.5 h-3.5" /> Reject Row
                                    </button>
                                    <button
                                      onClick={() => resolveAnomalyMutation.mutate({
                                        anomalyId: anomaly.id,
                                        decision: "APPROVED",
                                        correction,
                                      })}
                                      className="bg-[#DC143C] hover:bg-[#c81035] text-[10px] font-bold px-3.5 py-1.5 rounded text-[#FEFDDF] flex items-center gap-1 transition-colors"
                                    >
                                      <Check className="w-3.5 h-3.5" /> Save Correction
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-[50vh] flex flex-col items-center justify-center text-center p-8 bg-[#141414] border border-[#222222] rounded text-gray-500">
                    <FileSpreadsheet className="w-12 h-12 text-[#222222] mb-3" />
                    <h3 className="font-bold text-sm text-gray-400">No Session Selected</h3>
                    <p className="text-xs max-w-xs mt-1">Select an import session from the history panel or upload a new CSV file.</p>
                  </div>
                )}

              </div>

            </div>
          </div>
        )}

        {/* 7. AUDIT LOG TAB */}
        {selectedGroupId && activeTab === "audit" && (
          <div className="space-y-8">
            <div>
              <span className="text-[10px] text-[#DC143C] uppercase tracking-widest font-semibold font-medium">Compliance Trail</span>
              <h2 className="text-3xl font-extrabold text-[#FEFDDF]">Activity Audit Logs</h2>
              <p className="text-gray-400 text-sm mt-1">Immutable transaction-level changes audit tracking.</p>
            </div>

            {auditLogs.length === 0 ? (
              <div className="text-center py-12 bg-[#141414] border border-[#222222] rounded text-gray-500 text-xs">
                No audited operations recorded yet for this workspace.
              </div>
            ) : (
              <div className="bg-[#141414] border border-[#222222] rounded overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#0B0B0B] border-b border-[#222222] text-gray-400 uppercase tracking-wider text-[9px] font-bold">
                      <th className="p-4">Action</th>
                      <th className="p-4">Modified Entity</th>
                      <th className="p-4">User</th>
                      <th className="p-4">Timestamp</th>
                      <th className="p-4">Diff Snapshot</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#222222]/50">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-[#181818]">
                        <td className="p-4 font-semibold text-[#FEFDDF]">{log.action}</td>
                        <td className="p-4 text-gray-400">
                          {log.entityType} ({log.entityId.substring(0, 8)}...)
                        </td>
                        <td className="p-4 leading-tight">
                          <span className="block font-medium">{log.user?.name || "System"}</span>
                          <span className="block text-[9px] text-gray-500">{log.user?.email || ""}</span>
                        </td>
                        <td className="p-4 text-gray-500">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="p-4">
                          <details className="text-[10px] text-gray-400 cursor-pointer">
                            <summary className="text-[#DC143C] hover:underline">View JSON States</summary>
                            <pre className="mt-2 bg-[#0B0B0B] p-3 rounded border border-[#222222] overflow-x-auto text-[9px] font-mono leading-relaxed max-w-sm">
                              {JSON.stringify(
                                {
                                  before: log.oldValues ? JSON.parse(log.oldValues) : null,
                                  after: log.newValues ? JSON.parse(log.newValues) : null,
                                },
                                null,
                                2
                              )}
                            </pre>
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </main>

      {/* 3. MODALS (CREATE GROUP, INVITE, LEAVE, RECORD SETTLEMENT, ADD EXPENSE) */}
      
      {/* Create Group Modal */}
      {isCreateGroupOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-[#222222] w-full max-w-md rounded p-6">
            <h3 className="font-bold text-lg text-[#FEFDDF] mb-4">Create Workspace Group</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Group Name</label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g. Shared House"
                  className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-3 py-2 text-sm text-[#FEFDDF]"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Description (Optional)</label>
                <textarea
                  value={groupDesc}
                  onChange={(e) => setGroupDesc(e.target.value)}
                  placeholder="e.g. Sharing utility bills and rents"
                  className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-3 py-2 text-sm text-[#FEFDDF] h-20"
                />
              </div>
              <div className="flex gap-2 justify-end pt-4">
                <button
                  onClick={() => setIsCreateGroupOpen(false)}
                  className="border border-[#222222] hover:border-gray-700 text-xs font-semibold px-4 py-2.5 rounded text-[#FEFDDF]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => createGroupMutation.mutate({ name: groupName, description: groupDesc })}
                  disabled={!groupName.trim()}
                  className="bg-[#DC143C] hover:bg-[#c81035] disabled:opacity-50 text-xs font-semibold px-4 py-2.5 rounded text-[#FEFDDF]"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invite/Add Member Modal */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-[#222222] w-full max-w-md rounded p-6">
            <h3 className="font-bold text-lg text-[#FEFDDF] mb-4">Add Group Member</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Member Name</label>
                <input
                  type="text"
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  placeholder="e.g. Alice"
                  className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-3 py-2 text-sm text-[#FEFDDF]"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Email Address</label>
                <input
                  type="email"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  placeholder="e.g. alice@example.com"
                  className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-3 py-2 text-sm text-[#FEFDDF]"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Joining Date (JoinedAt)</label>
                <input
                  type="date"
                  value={memberJoinedAt}
                  onChange={(e) => setMemberJoinedAt(e.target.value)}
                  className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-3 py-2 text-sm text-[#FEFDDF]"
                />
              </div>
              <div className="flex gap-2 justify-end pt-4">
                <button
                  onClick={() => setIsInviteOpen(false)}
                  className="border border-[#222222] hover:border-gray-700 text-xs font-semibold px-4 py-2.5 rounded text-[#FEFDDF]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => inviteMemberMutation.mutate({ name: memberName, email: memberEmail, joinedAt: memberJoinedAt })}
                  disabled={!memberName.trim() || !memberEmail.trim()}
                  className="bg-[#DC143C] hover:bg-[#c81035] disabled:opacity-50 text-xs font-semibold px-4 py-2.5 rounded text-[#FEFDDF]"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Record Exit (Leave) Modal */}
      {isLeaveOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-[#222222] w-full max-w-md rounded p-6">
            <h3 className="font-bold text-lg text-[#FEFDDF] mb-4">Record Member Exit</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Select Member</label>
                <select
                  value={leaveMemberId}
                  onChange={(e) => setLeaveMemberId(e.target.value)}
                  className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-3 py-2 text-sm text-[#FEFDDF]"
                >
                  <option value="">-- Choose Member --</option>
                  {members.filter((m) => !m.leftAt).map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.user.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Exit Date (LeftAt)</label>
                <input
                  type="date"
                  value={leaveDate}
                  onChange={(e) => setLeaveDate(e.target.value)}
                  className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-3 py-2 text-sm text-[#FEFDDF]"
                />
              </div>
              <div className="flex gap-2 justify-end pt-4">
                <button
                  onClick={() => setIsLeaveOpen(false)}
                  className="border border-[#222222] hover:border-gray-700 text-xs font-semibold px-4 py-2.5 rounded text-[#FEFDDF]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => leaveGroupMutation.mutate({ leftAt: leaveDate })}
                  disabled={!selectedGroupId}
                  className="bg-[#DC143C] hover:bg-[#c81035] disabled:opacity-50 text-xs font-semibold px-4 py-2.5 rounded text-[#FEFDDF]"
                >
                  Save Exit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Record Settlement Modal */}
      {isSettlementOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-[#222222] w-full max-w-md rounded p-6">
            <h3 className="font-bold text-lg text-[#FEFDDF] mb-4">Record Payment Settlement</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Who Paid (Payer)</label>
                <select
                  value={settlePayerId}
                  onChange={(e) => setSettlePayerId(e.target.value)}
                  className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-3 py-2 text-sm text-[#FEFDDF]"
                >
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.user.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Who was Paid (Payee)</label>
                <select
                  value={settlePayeeId}
                  onChange={(e) => setSettlePayeeId(e.target.value)}
                  className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-3 py-2 text-sm text-[#FEFDDF]"
                >
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.user.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Amount (INR)</label>
                <input
                  type="number"
                  step="0.01"
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-3 py-2 text-sm text-[#FEFDDF]"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Payment Date</label>
                <input
                  type="date"
                  value={settleDate}
                  onChange={(e) => setSettleDate(e.target.value)}
                  className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-3 py-2 text-sm text-[#FEFDDF]"
                />
              </div>
              <div className="flex gap-2 justify-end pt-4">
                <button
                  onClick={() => setIsSettlementOpen(false)}
                  className="border border-[#222222] hover:border-gray-700 text-xs font-semibold px-4 py-2.5 rounded text-[#FEFDDF]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => createSettlementMutation.mutate({
                    groupId: selectedGroupId,
                    payerId: settlePayerId,
                    payeeId: settlePayeeId,
                    amount: parseFloat(settleAmount),
                    date: settleDate,
                  })}
                  disabled={!settleAmount || settlePayerId === settlePayeeId}
                  className="bg-[#DC143C] hover:bg-[#c81035] disabled:opacity-50 text-xs font-semibold px-4 py-2.5 rounded text-[#FEFDDF]"
                >
                  Record Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Record Expense Modal */}
      {isExpenseOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-[#222222] w-full max-w-lg rounded p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg text-[#FEFDDF] mb-4">Add Shared Expense</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Description</label>
                <input
                  type="text"
                  value={expDesc}
                  onChange={(e) => setExpDesc(e.target.value)}
                  placeholder="e.g. Electric Bill"
                  className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-3 py-2 text-sm text-[#FEFDDF]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Amount (INR)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-3 py-2 text-sm text-[#FEFDDF]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Expense Date</label>
                  <input
                    type="date"
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-3 py-2 text-sm text-[#FEFDDF]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Paid By (Payer)</label>
                  <select
                    value={expPayerId}
                    onChange={(e) => setExpPayerId(e.target.value)}
                    className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-3 py-2 text-sm text-[#FEFDDF]"
                  >
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.user.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Split Strategy</label>
                  <select
                    value={expSplitType}
                    onChange={(e) => setExpSplitType(e.target.value as any)}
                    className="w-full bg-[#0B0B0B] border border-[#222222] rounded px-3 py-2 text-sm text-[#FEFDDF]"
                  >
                    <option value="EQUAL">Split Equally</option>
                    <option value="EXACT">Exact Amounts</option>
                    <option value="PERCENTAGE">Percentages</option>
                    <option value="WEIGHTED">Weighted Shares</option>
                  </select>
                </div>
              </div>

              {/* Split Participants Checklist */}
              <div>
                <label className="block text-xs text-gray-400 mb-2">Split Participants &amp; Shares</label>
                <div className="space-y-2.5 max-h-48 overflow-y-auto bg-[#0B0B0B] p-3 rounded border border-[#222222]">
                  {members.map((m) => {
                    const state = expParticipants[m.userId] || { selected: false, value: "" };
                    const toggleSelect = () => {
                      setExpParticipants((prev) => ({
                        ...prev,
                        [m.userId]: {
                          ...state,
                          selected: !state.selected,
                        },
                      }));
                    };

                    const updateVal = (v: string) => {
                      setExpParticipants((prev) => ({
                        ...prev,
                        [m.userId]: {
                          ...state,
                          value: v,
                        },
                      }));
                    };

                    return (
                      <div key={m.userId} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={state.selected}
                            onChange={toggleSelect}
                            className="rounded border-[#222222] text-[#DC143C]"
                          />
                          <span className="text-gray-300">{m.user.name}</span>
                        </div>
                        {state.selected && expSplitType !== "EQUAL" && (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step="0.01"
                              value={state.value}
                              onChange={(e) => updateVal(e.target.value)}
                              placeholder={
                                expSplitType === "EXACT" ? "INR 0.00" :
                                expSplitType === "PERCENTAGE" ? "%" : "weight"
                              }
                              className="w-20 bg-[#141414] border border-[#222222] rounded px-2 py-0.5 text-right text-xs text-[#FEFDDF]"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <button
                  onClick={() => setIsExpenseOpen(false)}
                  className="border border-[#222222] hover:border-gray-700 text-xs font-semibold px-4 py-2.5 rounded text-[#FEFDDF]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const list = Object.entries(expParticipants)
                      .filter(([_, val]) => val.selected)
                      .map(([userId, val]) => ({
                        userId,
                        shareValue: expSplitType === "EQUAL" ? 0 : parseFloat(val.value || "0"),
                      }));

                    createExpenseMutation.mutate({
                      groupId: selectedGroupId,
                      payerId: expPayerId,
                      amount: parseFloat(expAmount),
                      description: expDesc,
                      date: expDate,
                      splitType: expSplitType,
                      participants: list,
                    });
                  }}
                  disabled={!expDesc || !expAmount || Object.values(expParticipants).filter((p) => p.selected).length === 0}
                  className="bg-[#DC143C] hover:bg-[#c81035] disabled:opacity-50 text-xs font-semibold px-4 py-2.5 rounded text-[#FEFDDF]"
                >
                  Add Expense
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
