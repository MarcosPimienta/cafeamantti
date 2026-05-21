export interface DailyCashflow {
  id: string;
  date: string;
  initial_balance: number;
  daily_income: number;
  final_balance: number;
  observations: string | null;
  created_at: string;
}

export interface CashflowExpense {
  id: string;
  cashflow_id: string;
  concept: string;
  category: string;
  amount: number;
  created_at: string;
}

export interface CashflowWithExpenses extends DailyCashflow {
  expenses: CashflowExpense[];
}
