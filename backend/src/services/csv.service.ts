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
  rawLine: string;
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
      // Skip empty lines
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
 * Normalizes keys to standard headers.
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
