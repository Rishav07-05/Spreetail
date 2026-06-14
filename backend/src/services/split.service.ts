/**
 * Split Calculation Engine
 * 
 * Computes individual share amounts for a given total, split type, and participant list.
 * Adjusts for potential IEEE-754 floating point and decimal rounding discrepancies (up to 0.01 threshold)
 * by applying the remainder to the first participant.
 */

export interface SplitInputParticipant {
  userId: string;
  shareValue: number; // For EQUAL: ignored or 1, For EXACT: direct amount, For PERCENTAGE: %, For WEIGHTED: weight
}

export interface ComputedSplitParticipant {
  userId: string;
  shareValue: number;
  shareAmount: number;
}

export function calculateSplit(
  amount: number,
  splitType: "EQUAL" | "EXACT" | "PERCENTAGE" | "WEIGHTED",
  participants: SplitInputParticipant[]
): ComputedSplitParticipant[] {
  if (participants.length === 0) {
    throw new Error("Cannot split expense with zero participants");
  }
  if (amount <= 0) {
    throw new Error("Expense amount must be positive");
  }

  let results: ComputedSplitParticipant[] = [];

  switch (splitType) {
    case "EQUAL": {
      const share = amount / participants.length;
      results = participants.map((p) => ({
        userId: p.userId,
        shareValue: 1,
        shareAmount: parseFloat(share.toFixed(2)),
      }));
      break;
    }

    case "EXACT": {
      const sum = participants.reduce((acc, p) => acc + p.shareValue, 0);
      if (Math.abs(sum - amount) > 0.011) {
        throw new Error(`Split sum (${sum}) does not equal total amount (${amount})`);
      }
      results = participants.map((p) => ({
        userId: p.userId,
        shareValue: p.shareValue,
        shareAmount: p.shareValue,
      }));
      break;
    }

    case "PERCENTAGE": {
      const sum = participants.reduce((acc, p) => acc + p.shareValue, 0);
      if (Math.abs(sum - 100) > 0.011) {
        throw new Error(`Percentages sum to ${sum}%, but must equal exactly 100%`);
      }
      results = participants.map((p) => ({
        userId: p.userId,
        shareValue: p.shareValue,
        shareAmount: parseFloat(((p.shareValue / 100) * amount).toFixed(2)),
      }));
      break;
    }

    case "WEIGHTED": {
      const totalWeight = participants.reduce((acc, p) => acc + p.shareValue, 0);
      if (totalWeight <= 0) {
        throw new Error("Total weights must be greater than zero");
      }
      results = participants.map((p) => ({
        userId: p.userId,
        shareValue: p.shareValue,
        shareAmount: parseFloat(((p.shareValue / totalWeight) * amount).toFixed(2)),
      }));
      break;
    }

    default:
      throw new Error(`Unsupported split type: ${splitType}`);
  }

  // Rounding adjustment: sum all shareAmounts and verify if it equals the total amount.
  // Apply any fraction offset (e.g. 0.01 or -0.02) to the first participant's share.
  const totalComputed = results.reduce((acc, r) => acc + r.shareAmount, 0);
  const diff = parseFloat((amount - totalComputed).toFixed(2));
  
  if (diff !== 0 && results[0]) {
    results[0].shareAmount = parseFloat((results[0].shareAmount + diff).toFixed(2));
  }

  return results;
}
