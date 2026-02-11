/**
 * Usage table renderer for dashboard (compact version)
 */

import type { DailyStats } from "../types.js";

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toString();
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

function padRight(str: string, len: number): string {
  return str.padEnd(len);
}

function padLeft(str: string, len: number): string {
  return str.padStart(len);
}

export type TableWidthTier = "narrow" | "medium" | "wide";

export function getTableWidthTier(width: number): TableWidthTier {
  if (width < 105) return "narrow";
  if (width < 140) return "medium";
  return "wide";
}

export function renderUsageTable(
  dailyStats: Map<string, DailyStats>,
  width?: number
): string {
  const sortedDates = Array.from(dailyStats.keys()).sort((a, b) =>
    a.localeCompare(b)
  );

  if (sortedDates.length === 0) {
    return "No usage data";
  }

  const tier = width ? getTableWidthTier(width) : "wide";

  // Column widths based on tier
  const colDate = 12;
  const colModels = tier === "wide" ? 30 : 0;
  const colTotal = tier !== "narrow" ? 12 : 0;
  const colCost = 10;

  // Border characters
  const h = "─";
  const v = "│";
  const tl = "┌";
  const tr = "┐";
  const bl = "└";
  const br = "┘";
  const ml = "├";
  const mr = "┤";
  const mt = "┬";
  const mb = "┴";
  const mm = "┼";

  let output = "";

  // Build borders
  let topLine = tl + h.repeat(colDate);
  let midLine = ml + h.repeat(colDate);
  let bottomLine = bl + h.repeat(colDate);

  if (tier === "wide") {
    topLine += mt + h.repeat(colModels);
    midLine += mm + h.repeat(colModels);
    bottomLine += mb + h.repeat(colModels);
  }

  if (tier !== "narrow") {
    topLine += mt + h.repeat(colTotal);
    midLine += mm + h.repeat(colTotal);
    bottomLine += mb + h.repeat(colTotal);
  }

  topLine += mt + h.repeat(colCost) + tr;
  midLine += mm + h.repeat(colCost) + mr;
  bottomLine += mb + h.repeat(colCost) + br;

  // Build header
  let header = v + padRight(" Date", colDate);
  if (tier === "wide") {
    header += v + padRight(" Models", colModels);
  }
  if (tier !== "narrow") {
    header += v + padLeft("Tokens ", colTotal);
  }
  header += v + padLeft("Cost ", colCost) + v;

  output += topLine + "\n";
  output += header + "\n";
  output += midLine + "\n";

  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;

  for (const date of sortedDates) {
    const stats = dailyStats.get(date)!;
    const combinedInput = stats.input + stats.cacheRead + stats.cacheWrite;
    const totalTokens = combinedInput + stats.output;

    totalInput += combinedInput;
    totalOutput += stats.output;
    totalCost += stats.cost;

    let row = v + padRight(` ${date}`, colDate);

    if (tier === "wide") {
      const models = Array.from(stats.models).sort();
      const firstModel = models[0] ? models[0].substring(0, 28) : "";
      row += v + padRight(` ${firstModel}`, colModels);
    }

    if (tier !== "narrow") {
      row += v + padLeft(`${formatNumber(totalTokens)} `, colTotal);
    }

    row += v + padLeft(`${formatCost(stats.cost)} `, colCost) + v;

    output += row + "\n";
  }

  output += midLine + "\n";

  const grandTotal = totalInput + totalOutput;
  let totalRow = v + padRight(" Total", colDate);

  if (tier === "wide") {
    totalRow += v + " ".repeat(colModels);
  }

  if (tier !== "narrow") {
    totalRow += v + padLeft(`${formatNumber(grandTotal)} `, colTotal);
  }

  totalRow += v + padLeft(`${formatCost(totalCost)} `, colCost) + v;

  output += totalRow + "\n";
  output += bottomLine;

  return output;
}
