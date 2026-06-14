import prisma from "../lib/prisma.js";

export interface ParsedCsvRow {
  date: string;
  description: string;
  amount: string;
  payer: string;
  participants: string;
  splitType: string;
  splitValues: string;
  currency: string;
}

/**
 * Parses a CSV string into rows, handling quotes and commas.
 */
export function parseCSV(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let currentField = "";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentField);
      currentField = "";
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      row.push(currentField);
      if (row.some(f => f.trim() !== "")) {
        lines.push(row);
      }
      row = [];
      currentField = "";
    } else {
      currentField += char;
    }
  }

  if (currentField || row.length > 0) {
    row.push(currentField);
    if (row.some(f => f.trim() !== "")) {
      lines.push(row);
    }
  }

  return lines;
}

/**
 * Maps header names to their zero-based column index.
 */
export function mapCsvHeaders(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  headers.forEach((h, idx) => {
    const clean = h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (clean.includes("date")) mapping.date = idx;
    else if (clean.includes("description") || clean.includes("desc")) mapping.description = idx;
    else if (clean.includes("amount")) mapping.amount = idx;
    else if (clean.includes("payer")) mapping.payer = idx;
    else if (clean.includes("participant")) mapping.participants = idx;
    else if (clean.includes("splittype") || clean.includes("splitmethod")) mapping.splitType = idx;
    else if (clean.includes("splitvalue") || clean.includes("shares")) mapping.splitValues = idx;
    else if (clean.includes("currency")) mapping.currency = idx;
  });
  return mapping;
}

/**
 * Anomaly Detection Engine
 * Evaluates import records in a session and stores detected anomalies in DB.
 */
export async function detectAnomaliesForSession(sessionId: string, groupId: string) {
  // Fetch group details and active members list
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      memberships: {
        where: { deletedAt: null },
        include: { user: true },
      },
      expenses: {
        where: { deletedAt: null },
      },
    },
  });

  if (!group) throw new Error("Group not found");

  const members = group.memberships;
  const dbExpenses = group.expenses;

  // Fetch all import records
  const records = await prisma.importRecord.findMany({
    where: { sessionId },
  });

  const detectedAnomalies: any[] = [];

  for (const record of records) {
    const data: ParsedCsvRow = JSON.parse(record.rawContent);
    const anomaliesList: {
      type: string;
      severity: "LOW" | "MEDIUM" | "HIGH";
      description: string;
      recommendedAction: string;
    }[] = [];

    const rawDate = data.date;
    const rawDesc = data.description;
    const rawAmount = data.amount;
    const rawPayer = data.payer;
    const rawParticipants = data.participants;
    const rawSplitType = data.splitType;
    const rawSplitValues = data.splitValues;
    const rawCurrency = data.currency;

    // Helper to check for spaces
    const hasLeadingTrailingSpace = (str: string) => str !== str.trim();

    // 1. Blank values check
    if (!rawDate || !rawDesc || !rawAmount || !rawPayer || !rawParticipants) {
      anomaliesList.push({
        type: "BLANK_VALUES",
        severity: "HIGH",
        description: "One or more required fields (Date, Description, Amount, Payer, Participants) are empty.",
        recommendedAction: "Provide missing field values manually.",
      });
    }

    // 2. Extra whitespace check
    if (
      hasLeadingTrailingSpace(rawDate) ||
      hasLeadingTrailingSpace(rawDesc) ||
      hasLeadingTrailingSpace(rawAmount) ||
      hasLeadingTrailingSpace(rawPayer) ||
      hasLeadingTrailingSpace(rawParticipants)
    ) {
      anomaliesList.push({
        type: "EXTRA_WHITESPACE",
        severity: "LOW",
        description: "Fields contain leading or trailing whitespaces.",
        recommendedAction: "Trim all whitespace.",
      });
    }

    // Parse values safely
    const cleanPayer = rawPayer.trim();
    const cleanDesc = rawDesc.trim();
    const cleanDate = rawDate.trim();
    const parsedAmount = parseFloat(rawAmount.replace(/[^\d.-]/g, ""));
    const cleanCurrency = rawCurrency ? rawCurrency.trim().toUpperCase() : "INR";
    const cleanSplitType = rawSplitType ? rawSplitType.trim().toUpperCase() : "EQUAL";

    // 3. Negative amount check
    if (!isNaN(parsedAmount) && parsedAmount < 0) {
      anomaliesList.push({
        type: "NEGATIVE_AMOUNTS",
        severity: "HIGH",
        description: `Amount is negative (${parsedAmount}). Expenses should be positive.`,
        recommendedAction: "Convert amount to positive value.",
      });
    }

    // 4. Refunds check
    const isRefundWord = cleanDesc.toLowerCase().includes("refund");
    const isRefundAmount = !isNaN(parsedAmount) && parsedAmount < 0;
    if (isRefundWord || isRefundAmount) {
      anomaliesList.push({
        type: "REFUNDS",
        severity: "MEDIUM",
        description: "Transaction looks like a refund (description contains 'refund' or negative amount).",
        recommendedAction: "Log as a refund credit/adjustment.",
      });
    }

    // 5. Settlement logged as expense check
    const settlementWords = ["settle", "settled", "payment", "paid to", "received from"];
    const isSettlementDesc = settlementWords.some(w => cleanDesc.toLowerCase().includes(w));
    if (isSettlementDesc) {
      anomaliesList.push({
        type: "SETTLEMENT_LOGGED_AS_EXPENSE",
        severity: "HIGH",
        description: `Transaction description '${cleanDesc}' indicates a settlement payment.`,
        recommendedAction: "Convert expense to a Settlement record.",
      });
    }

    // 6. Currency / USD check
    if (cleanCurrency !== "INR") {
      anomaliesList.push({
        type: "CURRENCY_MISMATCH",
        severity: "MEDIUM",
        description: `Transaction is in currency '${cleanCurrency}' (INR expected).`,
        recommendedAction: `Convert amount from ${cleanCurrency} to INR.`,
      });
    }
    if (cleanCurrency === "USD") {
      anomaliesList.push({
        type: "USD_TRANSACTIONS",
        severity: "MEDIUM",
        description: "Transaction is explicitly marked in USD.",
        recommendedAction: "Convert USD transaction to INR using reference exchange rate (e.g. 83.5 INR/USD).",
      });
    }

    // 7. Date validations
    let txDate: Date | null = null;
    const parsedDateMs = Date.parse(cleanDate);
    if (isNaN(parsedDateMs)) {
      anomaliesList.push({
        type: "INVALID_DATES",
        severity: "HIGH",
        description: `Date '${cleanDate}' is not a valid calendar date.`,
        recommendedAction: "Correct date to valid format (YYYY-MM-DD).",
      });
    } else {
      txDate = new Date(parsedDateMs);

      // Check different date formats (if not YYYY-MM-DD, e.g. contains slashes or 12/25/2023)
      if (cleanDate.includes("/") || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
        anomaliesList.push({
          type: "DIFFERENT_DATE_FORMATS",
          severity: "MEDIUM",
          description: `Date format is non-standard: '${cleanDate}'. Expected YYYY-MM-DD.`,
          recommendedAction: "Normalize date format to YYYY-MM-DD.",
        });
      }

      // Future date check
      if (txDate > new Date()) {
        anomaliesList.push({
          type: "FUTURE_DATES",
          severity: "HIGH",
          description: `Transaction date '${cleanDate}' is in the future.`,
          recommendedAction: "Change date to transaction date (no future dates allowed).",
        });
      }
    }

    // 8. Member matching & timeline checks
    let matchedPayerUser: any = null;
    if (cleanPayer) {
      matchedPayerUser = members.find(
        (m) =>
          m.user.email.toLowerCase() === cleanPayer.toLowerCase() ||
          m.user.name.toLowerCase() === cleanPayer.toLowerCase()
      );

      if (!matchedPayerUser) {
        anomaliesList.push({
          type: "UNKNOWN_MEMBER",
          severity: "HIGH",
          description: `Payer '${cleanPayer}' is not a recognized member of the group.`,
          recommendedAction: `Map payer '${cleanPayer}' to an existing group member or add them.`,
        });
      } else if (txDate) {
        // Timeline check for payer
        const joined = new Date(matchedPayerUser.joinedAt);
        const left = matchedPayerUser.leftAt ? new Date(matchedPayerUser.leftAt) : null;
        const isActive = txDate >= joined && (left === null || txDate <= left);
        if (!isActive) {
          anomaliesList.push({
            type: "MEMBER_NOT_ACTIVE",
            severity: "HIGH",
            description: `Payer '${matchedPayerUser.user.name}' was not an active member on expense date (${cleanDate}). Joined: ${joined.toISOString().split("T")[0]}, Left: ${left ? left.toISOString().split("T")[0] : "N/A"}`,
            recommendedAction: "Adjust expense date or verify payer membership range.",
          });
        }
      }

      // Check case inconsistencies in Payer
      if (matchedPayerUser && cleanPayer !== matchedPayerUser.user.name && cleanPayer !== matchedPayerUser.user.email) {
        anomaliesList.push({
          type: "CASE_INCONSISTENCIES",
          severity: "LOW",
          description: `Payer name case mismatch: '${cleanPayer}' vs DB record '${matchedPayerUser.user.name}'.`,
          recommendedAction: "Normalize case spelling.",
        });
      }
    } else {
      anomaliesList.push({
        type: "MISSING_PAYER",
        severity: "HIGH",
        description: "Payer is missing.",
        recommendedAction: "Select a valid group member as payer.",
      });
    }

    // Participants parsing and checks
    const rawPartList = rawParticipants
      ? rawParticipants.split(";").map((p) => p.trim()).filter((p) => p !== "")
      : [];

    if (rawPartList.length === 0) {
      anomaliesList.push({
        type: "MISSING_PARTICIPANTS",
        severity: "HIGH",
        description: "No participants listed for the expense.",
        recommendedAction: "Select participants to participate in this split.",
      });
    } else {
      for (const pStr of rawPartList) {
        const matchedPart = members.find(
          (m) =>
            m.user.email.toLowerCase() === pStr.toLowerCase() ||
            m.user.name.toLowerCase() === pStr.toLowerCase()
        );

        if (!matchedPart) {
          anomaliesList.push({
            type: "UNKNOWN_MEMBER",
            severity: "HIGH",
            description: `Participant '${pStr}' is not a recognized member of the group.`,
            recommendedAction: `Map participant '${pStr}' to an existing member.`,
          });
        } else if (txDate) {
          // Timeline check for participant
          const joined = new Date(matchedPart.joinedAt);
          const left = matchedPart.leftAt ? new Date(matchedPart.leftAt) : null;
          const isActive = txDate >= joined && (left === null || txDate <= left);
          if (!isActive) {
            anomaliesList.push({
              type: "MEMBER_NOT_ACTIVE",
              severity: "HIGH",
              description: `Participant '${matchedPart.user.name}' was not active on expense date (${cleanDate}). Joined: ${joined.toISOString().split("T")[0]}, Left: ${left ? left.toISOString().split("T")[0] : "N/A"}`,
              recommendedAction: `Exclude '${matchedPart.user.name}' from splits on this date.`,
            });
          }
        }
      }
    }

    // Split Engine Check
    const rawValList = rawSplitValues
      ? rawSplitValues.split(";").map((v) => parseFloat(v.trim())).filter((v) => !isNaN(v))
      : [];

    if (cleanSplitType !== "EQUAL" && rawValList.length !== rawPartList.length) {
      anomaliesList.push({
        type: "SPLIT_TOTALS_MISMATCH",
        severity: "HIGH",
        description: `Split type is ${cleanSplitType}, but number of split values (${rawValList.length}) doesn't match number of participants (${rawPartList.length}).`,
        recommendedAction: "Supply corresponding split values for each participant.",
      });
    } else if (!isNaN(parsedAmount)) {
      if (cleanSplitType === "EXACT") {
        const sumVals = rawValList.reduce((s, v) => s + v, 0);
        if (Math.abs(sumVals - parsedAmount) > 0.01) {
          anomaliesList.push({
            type: "SPLIT_TOTALS_MISMATCH",
            severity: "HIGH",
            description: `Exact split values sum to ${sumVals}, but expense amount is ${parsedAmount}.`,
            recommendedAction: "Adjust split values to sum exactly to the expense amount.",
          });
        }
      } else if (cleanSplitType === "PERCENTAGE") {
        const sumVals = rawValList.reduce((s, v) => s + v, 0);
        if (Math.abs(sumVals - 100) > 0.01) {
          anomaliesList.push({
            type: "SPLIT_TOTALS_MISMATCH",
            severity: "HIGH",
            description: `Split percentages sum to ${sumVals}%, but must sum to exactly 100%.`,
            recommendedAction: "Adjust percentages to sum to 100%.",
          });
        }
      } else if (cleanSplitType === "WEIGHTED") {
        const sumVals = rawValList.reduce((s, v) => s + v, 0);
        if (sumVals <= 0) {
          anomaliesList.push({
            type: "SPLIT_TOTALS_MISMATCH",
            severity: "HIGH",
            description: "Weighted split sum of weights is zero or negative.",
            recommendedAction: "Provide positive weights.",
          });
        }
      }

      // 9. Rounding inconsistencies check
      if (cleanSplitType === "EQUAL" && rawPartList.length > 0) {
        const share = parsedAmount / rawPartList.length;
        const roundedShare = parseFloat(share.toFixed(2));
        const totalSum = roundedShare * rawPartList.length;
        if (Math.abs(totalSum - parsedAmount) > 0.001) {
          anomaliesList.push({
            type: "ROUNDING_INCONSISTENCIES",
            severity: "LOW",
            description: `Equal division results in minor remainder: ${parsedAmount} / ${rawPartList.length} = ${share.toFixed(4)} (diff of ${(parsedAmount - totalSum).toFixed(4)}).`,
            recommendedAction: "Auto-adjust remainder on the first participant.",
          });
        }
      }
    }

    // 10. Duplicate / Potential Duplicate check
    if (txDate && !isNaN(parsedAmount)) {
      // Check in DB expenses
      const isExactDbDuplicate = dbExpenses.find(
        (e) =>
          e.date.toISOString().split("T")[0] === cleanDate &&
          Math.abs(e.amount - parsedAmount) < 0.01 &&
          e.description.toLowerCase().trim() === cleanDesc.toLowerCase()
      );

      if (isExactDbDuplicate) {
        anomaliesList.push({
          type: "DUPLICATE_EXPENSES",
          severity: "HIGH",
          description: `Identical expense (Date: ${cleanDate}, Amount: ${parsedAmount}, Description: "${cleanDesc}") already exists in group database.`,
          recommendedAction: "Reject/skip this record to prevent duplicate liabilities.",
        });
      } else {
        const isPotentialDbDuplicate = dbExpenses.find(
          (e) =>
            e.date.toISOString().split("T")[0] === cleanDate &&
            Math.abs(e.amount - parsedAmount) < 0.01 &&
            (e.description.toLowerCase().trim().includes(cleanDesc.toLowerCase()) ||
              cleanDesc.toLowerCase().includes(e.description.toLowerCase().trim()))
        );

        if (isPotentialDbDuplicate) {
          anomaliesList.push({
            type: "POTENTIAL_DUPLICATES",
            severity: "MEDIUM",
            description: `Potential duplicate expense found in database (Same date & amount, similar description: "${isPotentialDbDuplicate.description}").`,
            recommendedAction: "Verify if this represents a distinct transaction.",
          });
        }
      }
    }

    // 11. Orphan settlements (settlement but no valid payer/payee or match)
    if (isSettlementDesc && rawPartList.length !== 1) {
      anomaliesList.push({
        type: "ORPHAN_SETTLEMENTS",
        severity: "HIGH",
        description: "Settlements must have exactly one payer and one payee (recipient).",
        recommendedAction: "Specify exactly one participant as payee.",
      });
    }

    // 12. Conflicting records check (within same CSV file)
    const otherConflictingRecord = records.find(
      (r) =>
        r.id !== record.id &&
        JSON.parse(r.rawContent).date === rawDate &&
        parseFloat(JSON.parse(r.rawContent).amount) === parsedAmount &&
        JSON.parse(r.rawContent).description === rawDesc &&
        (JSON.parse(r.rawContent).participants !== rawParticipants ||
          JSON.parse(r.rawContent).splitType !== rawSplitType)
    );

    if (otherConflictingRecord) {
      anomaliesList.push({
        type: "CONFLICTING_RECORDS",
        severity: "HIGH",
        description: `Another line in the CSV (Row ${otherConflictingRecord.rowIndex}) has the same date, amount, and description but conflicting split details.`,
        recommendedAction: "Verify which split configuration is correct.",
      });
    }

    // Save anomalies in database if any found
    if (anomaliesList.length > 0) {
      // Mark record status
      await prisma.importRecord.update({
        where: { id: record.id },
        data: { status: "ANOMALOUS" },
      });

      for (const a of anomaliesList) {
        detectedAnomalies.push({
          sessionId,
          recordId: record.id,
          type: a.type,
          severity: a.severity,
          description: a.description,
          recommendedAction: a.recommendedAction,
          userDecision: "PENDING",
        });
      }
    } else {
      // Record is valid
      await prisma.importRecord.update({
        where: { id: record.id },
        data: { status: "VALID" },
      });
    }
  }

  // Batch insert anomalies
  if (detectedAnomalies.length > 0) {
    await prisma.importAnomaly.createMany({
      data: detectedAnomalies,
    });
  }

  // Update session status based on anomalies
  const totalAnomalies = await prisma.importAnomaly.count({
    where: { sessionId },
  });

  const sessionStatus = totalAnomalies > 0 ? "REQUIRES_REVIEW" : "PROCESSED";
  
  const updatedSession = await prisma.importSession.update({
    where: { id: sessionId },
    data: {
      status: sessionStatus,
      skippedRows: totalAnomalies > 0 ? 0 : 0, // will change on approval decisions
      completedAt: totalAnomalies > 0 ? null : new Date(),
    },
  });

  return updatedSession;
}
