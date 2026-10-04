/**
 * Shared worker types and utilities.
 * Used by both api and decision packages to avoid circular dependencies.
 */

export type StageName =
  | 'INTELLIGENCE'
  | 'DECISION'
  | 'CONTENT'
  | 'SALES'
  | 'APPROVAL_SNAPSHOT'
  | 'EXECUTION'
  | 'OBSERVE_LEARN'
  | 'DIGEST';

export const STAGE_ORDER: StageName[] = [
  'INTELLIGENCE',
  'DECISION',
  'CONTENT',
  'SALES',
  'APPROVAL_SNAPSHOT',
  'EXECUTION',
  'OBSERVE_LEARN',
  'DIGEST',
];

export interface StageContext {
  workspaceId: string;
  runDate: string;
  budget: RunBudget;
}

export interface StageResult {
  status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  counts?: Record<string, number>;
  note?: string;
  error?: string;
}

export type StageFn = (ctx: StageContext) => Promise<StageResult>;

export interface BudgetCaps {
  llmCalls: number;
  fetches: number;
  preparations: number;
  executions?: number;
}

export type BudgetCategory = 'llmCalls' | 'fetches' | 'preparations' | 'executions';

export class RunBudget {
  private caps: Required<BudgetCaps>;
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