export const DEFAULT_CATEGORIES = [
  "Income",
  "Investments",
  "Trades",
  "Transfer",
  "Own accounts",
  "Housing",
  "Utilities",
  "Groceries",
  "Dining",
  "Transportation",
  "Travel",
  "Vacation",
  "Shopping",
  "Entertainment",
  "Health",
  "Insurance",
  "Subscriptions",
  "Fees",
  "Taxes",
  "Uncategorized",
];

const INVESTMENT_INFLOW = /merrill|\bbrk\b|brk[.\-/ ]?[ab]\b|berkshire/i;

export function isInvestmentInflow(payee: string, amount: number): boolean {
  return amount > 0 && INVESTMENT_INFLOW.test(payee);
}

export function txType(amount: number): "income" | "expense" {
  return amount >= 0 ? "income" : "expense";
}

const KEYWORDS: Array<[RegExp, string]> = [
  [/payroll|direct dep|salary|paycheck/i, "Income"],
  [/transfer|zelle|venmo|online banking transfer/i, "Transfer"],
  [/rent|mortgage|hoa\b/i, "Housing"],
  [/electric|water|gas co|comcast|xfinity|verizon|at&t|t-mobile|internet/i, "Utilities"],
  [/whole foods|trader joe|safeway|kroger|publix|grocery|costco/i, "Groceries"],
  [/restaurant|cafe|coffee|starbucks|doordash|uber eats|grubhub|chipotle/i, "Dining"],
  [/uber|lyft|shell|chevron|exxon|parking|toll|metro/i, "Transportation"],
  [/airline|delta|united|american air|hotel|airbnb|marriott|hilton/i, "Travel"],
  [/amazon|target|walmart|best buy|apple\.com/i, "Shopping"],
  [/netflix|spotify|hulu|disney|youtube|icloud|subscription/i, "Subscriptions"],
  [/pharmacy|cvs|walgreens|medical|dental|doctor|hospital/i, "Health"],
  [/insurance|geico|state farm|progressive/i, "Insurance"],
  [/\bfee\b|interest charge|overdraft/i, "Fees"],
  [/irs|tax/i, "Taxes"],
  [/dividend|interest paid|reinvest/i, "Investments"],
];

export function categorize(payee: string, amount: number, fallback?: string | null): string {
  if (isInvestmentInflow(payee, amount)) return "Investments";
  if (fallback) return fallback;
  for (const [re, cat] of KEYWORDS) if (re.test(payee)) return cat;
  return amount > 0 ? "Income" : "Uncategorized";
}

export function prettyPlaidCategory(primary?: string | null): string | null {
  if (!primary) return null;
  const map: Record<string, string> = {
    INCOME: "Income",
    TRANSFER_IN: "Transfer",
    TRANSFER_OUT: "Transfer",
    LOAN_PAYMENTS: "Loan payments",
    BANK_FEES: "Fees",
    ENTERTAINMENT: "Entertainment",
    FOOD_AND_DRINK: "Dining",
    GENERAL_MERCHANDISE: "Shopping",
    HOME_IMPROVEMENT: "Housing",
    MEDICAL: "Health",
    PERSONAL_CARE: "Personal care",
    GENERAL_SERVICES: "Services",
    GOVERNMENT_AND_NON_PROFIT: "Taxes",
    TRANSPORTATION: "Transportation",
    TRAVEL: "Travel",
    RENT_AND_UTILITIES: "Utilities",
  };
  return map[primary] ?? primary.charAt(0) + primary.slice(1).toLowerCase().replace(/_/g, " ");
}

export function plaidAccountType(type: string): string {
  switch (type) {
    case "depository":
      return "cash";
    case "investment":
    case "brokerage":
      return "investment";
    case "credit":
      return "credit";
    case "loan":
      return "loan";
    default:
      return "other";
  }
}

export function isLiability(type: string): boolean {
  return type === "credit" || type === "loan";
}
