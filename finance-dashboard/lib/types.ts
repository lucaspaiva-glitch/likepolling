export type AccountType = "cash" | "investment" | "credit" | "loan" | "other";

export interface Account {
  id: string;
  name: string;
  type: AccountType | string;
  institution: string | null;
  balance: number;
  currency: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  account_id: string | null;
  date: string;
  payee: string | null;
  amount: number;
  category: string | null;
  type: string | null;
}

export interface ImportRow {
  date: string;
  payee: string;
  amount: number;
  category: string;
  type: "income" | "expense";
  raw: Record<string, string>;
}
