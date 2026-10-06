// Spec §7.5 + §7.7 — envelopes, goals, debt and insights in one tab.

import { useState } from 'preact/hooks';
import { getPref, setPref } from '../lib/prefs';
import { Segmented } from '../ui/fields';
import { dismissToast } from '../ui/Toast';
import { DebtPlan } from './plan/Debt';
import { Envelopes } from './plan/Envelopes';
import { Goals } from './plan/Goals';
import { Insights } from './plan/Insights';

type PlanTab = 'envelopes' | 'goals' | 'debt' | 'insights';

export function Plan() {
  const [tab, setTab] = useState<PlanTab>(() => getPref<PlanTab>('planTab', 'envelopes'));
  const go = (t: PlanTab) => {
    setTab(t);
    setPref('planTab', t);
    dismissToast();
  };
  return (
    <>
      <h1 class="screen-title">Plan</h1>
      <Segmented
        label="Plan section"
        value={tab}
        onChange={go}
        options={[
          { value: 'envelopes', label: 'Envelopes' },
          { value: 'goals', label: 'Goals' },
          { value: 'debt', label: 'Debt' },
          { value: 'insights', label: 'Insights' },
        ]}
      />
      {tab === 'envelopes' && <Envelopes />}
      {tab === 'goals' && <Goals />}
      {tab === 'debt' && <DebtPlan />}
      {tab === 'insights' && <Insights />}
    </>
  );
}
