import { refreshPayables } from '../data.js';
import { cashGroups, summarizePayables } from '../domain.js';
import { store } from '../store.js';
import { button, card, clear, formatDate, money, node, panel, setGlobalStatus, statusPill, table } from '../ui.js';

function render(root) {
  const state = store.getState();
  const summary = summarizePayables(state.payables);
  const groups = cashGroups(state.payables);
  clear(root);

  root.append(
    node('div', { className: 'screen-heading' }, [
      node('div', {}, [node('h1', { text: 'Cash Plan' }), node('p', { text: 'Expected obligations, separated from authorization and payment.' })]),
      button('Refresh', async () => {
        try { await refreshPayables(state.month); render(root); } catch (error) { setGlobalStatus(error.message, 'danger'); }
      }),
    ]),
    node('div', { className: 'notice' }, [
      node('strong', { text: 'Cash on hand is not connected yet. ' }),
      node('span', { text: 'This view currently shows required outflows only.' }),
    ]),
    node('div', { className: 'metric-grid' }, [
      card('Needs review', money(summary.reviewCents), `${summary.reviewCount} item(s)`, summary.reviewCount ? 'warning' : ''),
      card('Ready, not authorized', money(summary.readyCents), `${summary.readyCount} item(s)`),
      card('Authorized', money(summary.authorizedCents), `${summary.authorizedCount} item(s)`, 'success'),
      card('Total expected', money(summary.totalCents), `${summary.openCount} open item(s)`),
    ]),
    node('div', { className: 'two-column balanced' }, [
      panel('By obligation type', groups.length
        ? table([{ label: 'Type' }, { label: 'Items' }, { label: 'Amount', className: 'number' }], groups.map((group) => [
            { content: String(group.kind).replaceAll('_', ' ') },
            { content: String(group.count) },
            { className: 'number', content: money(group.amountCents) },
          ]))
        : node('div', { className: 'empty-state', text: 'No open obligations.' })),
      panel('Open obligations', state.payables.length
        ? table([{ label: 'Timing' }, { label: 'Payee' }, { label: 'Clinic' }, { label: 'State' }, { label: 'Amount', className: 'number' }], state.payables.map((item) => [
            { content: item.dueDate ? formatDate(item.dueDate) : state.month },
            { content: item.name },
            { content: item.clinic },
            { content: statusPill(item.approved ? 'Authorized' : item.reviewRequired ? 'Needs review' : 'Ready', item.approved ? 'success' : item.reviewRequired ? 'warning' : 'neutral') },
            { className: 'number', content: money(item.amountCents) },
          ]))
        : node('div', { className: 'empty-state', text: 'No open obligations.' }), {
          subtitle: 'Items without due dates are shown in the selected month.',
        }),
    ]),
  );
}

export async function mountCash(root) {
  clear(root);
  root.append(node('div', { className: 'loading', text: 'Loading cash requirements...' }));
  try {
    await refreshPayables(store.getState().month);
    render(root);
  } catch (error) {
    render(root);
    setGlobalStatus(error.message || 'Cash requirements are unavailable.', 'danger');
  }
}
