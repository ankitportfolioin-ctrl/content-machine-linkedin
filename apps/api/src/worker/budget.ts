/**
 * Step C: per-run budget guard. Caps come from WorkspaceSettings; the budget
 * is in-memory per run (a process restart starts a fresh run, which re-reads
 * caps — never silently unlimited). spend*() returns false when exhausted so
 * stages degrade gracefully (skip lower-priority items) instead of inventing
 * output. Exhaustion is recorded on the RunStage row by the caller.
 */
export interface BudgetCaps {
  llmCalls: number;
  fetches: number;
  preparations: number;
}

export class RunBudget {
  private readonly caps: BudgetCaps;
  private usedLlm = 0;
  private usedFetch = 0;
  private usedPreparation = 0;

  constructor(caps: BudgetCaps) {
    this.caps = { ...caps };
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

  remaining(): BudgetCaps & { exhausted: Array<'llmCalls' | 'fetches' | 'preparations'> } {
    const exhausted: Array<'llmCalls' | 'fetches' | 'preparations'> = [];
    if (this.usedLlm >= this.caps.llmCalls) exhausted.push('llmCalls');
    if (this.usedFetch >= this.caps.fetches) exhausted.push('fetches');
    if (this.usedPreparation >= this.caps.preparations) exhausted.push('preparations');
    return {
      llmCalls: Math.max(0, this.caps.llmCalls - this.usedLlm),
      fetches: Math.max(0, this.caps.fetches - this.usedFetch),
      preparations: Math.max(0, this.caps.preparations - this.usedPreparation),
      exhausted,
    };
  }
}
