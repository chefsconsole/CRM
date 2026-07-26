import { env } from "../config/env.js";

const SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  AED: "AED ",
};

/** Format an integer/number amount as a currency string for quotes and messages. */
export function formatMoney(amount: number, currency = env.company.currency): string {
  const symbol = SYMBOLS[currency] ?? `${currency} `;
  const rounded = Math.round(amount);
  // Indian grouping for INR, standard grouping otherwise.
  const locale = currency === "INR" ? "en-IN" : "en-US";
  return `${symbol}${rounded.toLocaleString(locale)}`;
}
