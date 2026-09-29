/**
 * Step C: per-run budget guard. Caps come from WorkspaceSettings; the budget
 * is in-memory per run (a process restart starts a fresh run, which re-reads
 * caps — never silently unlimited). spend*() returns false when exhausted so
 * stages degrade gracefully (skip lower-priority items) instead of inventing
 * output. Exhaustion is recorded on the RunStage row by the caller.
 */
// Batch 2 (E): execution is a distinct budget category. Research (LLM),
// preparation (internal artifacts), and execution (external consequential
// actions) never share a budget: preparation spend must not consume
// execution budget and vice versa. No LinkedIn execution integration
// exists, so the execution cap defaults to 0 (unavailable).
export interface BudgetCaps {
  llmCalls: number;
  fetches: number;
  preparations: number;
  // Optional for backward compatibility: omitted means 0 (execution
  // unavailable). Callers with an execution integration pass it explicitly.
  executions?: number;
}

export type BudgetCategory = 'llmCalls' | 'fetches' | 'preparations' | 'executions';

export class RunBudget {
  private readonly caps: Required<BudgetCaps>;
  private usedLlm = 0;
  private usedFetch = 0;
  private usedPreparation = 0;
  private usedExecution = 0;

  constructor(caps: BudgetCaps) {
    this.caps = { executions: 0, ...caps };
  }

  spendLlm(calls = 1): boolean {
    if (this.usedLlm + calls > this.caps.llmCalls) return false;
    this.usedLlm += calls;
    return true;
  }

  spendFetch(fetches = 1): boolean {
    if (this.usedFetch + fetches > this.caps.fetches) return false;
    this.usedFetch += fetches;
    return true;
  }

  spendPreparation(items = 1): boolean {
    if (this.usedPreparation + items > this.caps.preparations) return false;
    this.usedPreparation += items;
    return true;
  }

  /**
   * External consequential actions draw ONLY from the execution budget.
   * With no execution integration the cap is 0, so this always returns
   * false and execution stays unavailable — by budget, not just by flag.
   */
  spendExecution(items = 1): boolean {
    if (this.usedExecution + items > this.caps.executions) return false;
    this.usedExecution += items;
    return true;
  }

  remaining(): Required<BudgetCaps> & { exhausted: Array<BudgetCategory> } {
    const exhausted: Array<BudgetCategory> = [];
    if (this.usedLlm >= this.caps.llmCalls) exhausted.push('llmCalls');
    if (this.usedFetch >= this.caps.fetches) exhausted.push('fetches');
    if (this.usedPreparation >= this.caps.preparations) exhausted.push('preparations');
    if (this.usedExecution >= this.caps.executions) exhausted.push('executions');
    return {
      llmCalls: Math.max(0, this.caps.llmCalls - this.usedLlm),
      fetches: Math.max(0, this.caps.fetches - this.usedFetch),
      preparations: Math.max(0, this.caps.preparations - this.usedPreparation),
      executions: Math.max(0, this.caps.executions - this.usedExecution),
      exhausted,
    };
  }
}
