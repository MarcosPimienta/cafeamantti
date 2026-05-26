export interface DailyCashflow {
  id: string;
  date: string;
  initial_balance: number;
  daily_income: number;
  final_balance: number;
  observations: string | null;
  created_at: string;
  created_by?: string;
}

export interface CashflowExpense {
  id: string;
  cashflow_id: string;
  concept: string;
  category: string;
  amount: number;
  image_url?: string | null;
  created_at: string;
  created_by?: string;
  cashflow?: DailyCashflow;
}

export interface CashflowIncome {
  id: string;
  cashflow_id: string;
  concept: string;
  category: string;
  amount: number;
  image_url?: string | null;
  created_at: string;
  created_by?: string;
  cashflow?: DailyCashflow;
}

export interface CashflowWithExpenses extends DailyCashflow {
  expenses: CashflowExpense[];
  incomes: CashflowIncome[];
}

export interface CashflowAuditLog {
  id: string;
  created_at: string;
  admin_id: string;
  action_type: string;
  expense_id?: string;
  income_id?: string;
  cashflow_id?: string;
  details: any;
  profiles?: {
    full_name: string;
    email: string;
  };
  cashflow?: DailyCashflow;
}

