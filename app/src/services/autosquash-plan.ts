import type { RebaseStep } from '../interfaces/rebase-step';

export function autosquashPlan(plan: readonly RebaseStep[]) {
  const result: RebaseStep[] = [];
  const groups = new Map<string, RebaseStep[]>();
  for (const step of plan) {
    const prefix = /^(fixup|squash)! (.+)$/.exec(step.subject);
    const matches = prefix ? result.filter(item => item.subject === prefix[2] || item.hash.startsWith(prefix[2])) : [];
    if (prefix && matches.length === 1) {
      const target = matches[0];
      const group = groups.get(target.hash) ?? [];
      group.push({ ...step, action: prefix[1] as 'fixup' | 'squash' });
      groups.set(target.hash, group);
    } else {
      result.push({ ...step });
    }
  }
  return result.flatMap(step => [step, ...(groups.get(step.hash) ?? [])]);
}
