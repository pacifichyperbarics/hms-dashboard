import { refreshAll } from '../data.js';
import { inboxSummary, summarizePayables } from '../domain.js';
import { router } from '../router.js';
import { store } from '../store.js';
import { button, card, clear, money, node, panel, setGlobalStatus, statusPill, table } from '../ui.js';

function sourceText(state) {
  const label = (value) => value === 'ok' ? 'connected' : value === 'error' ? 'unavailable' : 'not checked';
  return `Monthly list ${label(state.sourceStatus.current)}. Finance database ${label(state.sourceStatus.finance)}. Inbox ${label(state.sourceStatus.inbox)}.`;
}

function actionRows(state) {
  const inboxRows = state.inbox
    .filter((item) => ['needs_review', 'ready', 'held', 'duplicate'].includes(item.review_status))
    .map((item) => ({
      source: 'Inbox',
      name: item.candidate_payee || item.subject || 'Unidentified email or invoice',
      clinic: 'Not coded',
      state: item.review_status,
      amountCents: Number(item.candidate_amount_cents) || 0,
      destination: 'inbox',
    }));
  const payableRows = state.payables
    .filter((item) => item.reviewRequired || item.approved)
    .map((item) => ({
      source: item.source === 'current' ? 'Monthly list' : 'Finance',
      name: item.name,
      clinic: item.clinic,
      state: item.approved ? 'authorized' : 'needs_review',
      amountCents: item.amountCents,
      destination: item.approved ? 'cash' : 'payables',
    }));

  return [...inboxRows, ...payableRows]
    .sort((left, right) => {
      const rank = (item) => item.state === 'held' ? 0 : item.state === 'needs_review' ? 1 : item.state === 'duplicate' ? 2 : 3;
      return rank(left) - rank(right) || right.amountCents - left.amountCents;
    })
    .slice(0, 15);
}

function render(root) {
  const state = store.getState();
  const payables = summarizePayables(state.payables);
  const inbox = inboxSummary(state.inbox);
  const actions = actionRows(state);

  clear(root);
  root.append(
    node('div', { className: 'screen-heading' }, [
      node('div', {}, [node('h1', { text: 'Overview' }), node('p', { text: 'What needs attention and how much cash is expected.' })]),
      button('Refresh', async (event) => {
        event.currentTarget.disabled = true;
        setGlobalStatus('Refreshing all Payables sources...', 'info');
        try {
          await refreshAll();
          render(root);
          setGlobalStatus('Payables refreshed.', 'success');
        } catch (error) {
          render(root);
          setGlobalStatus(error.message || 'Some sources could not be refreshed.', 'warning');
        }
      }),
    ]),
    node('div', { className: 'metric-grid' }, [
      card('Needs review', String(payables.reviewCount + inbox.review + inbox.held), 'Bills and held items', 'warning'),
      card('Authorized', money(payables.authorizedCents), `${payables.authorizedCount} item(s)`, 'success'),
      card('Expected obligations', money(payables.totalCents), `${payables.openCount} open item(s)`),
      card('Inbox items', String(inbox.total), `${inbox.duplicate} possible duplicate(s)`),
    ]),
    panel('What needs action', actions.length
      ? table([
          { label: 'Item' }, { label: 'Source' }, { label: 'Clinic' }, { label: 'State' }, { label: 'Amount', className: 'number' }, { label: '' },
        ], actions.map((item) => [
          { content: node('strong', { text: item.name }) },
          { content: item.source },
          { content: item.clinic },
          { content: statusPill(item.state.replaceAll('_', ' '), item.state === 'authorized' ? 'success' : item.state === 'duplicate' ? 'danger' : 'warning') },
          { className: 'number', content: item.amountCents ? money(item.amountCents) : 'Amount missing' },
          { content: button('Open', () => router.go(item.destination), { className: 'button small' }) },
        ]))
      : node('div', { className: 'empty-state', text: 'No items currently require attention.' }), {
      subtitle: sourceText(state),
    }),
    node('div', { className: 'quick-grid' }, [
      button('Add or review a bill', () => router.go('inbox'), { className: 'quick-link' }),
      button('Review monthly payables', () => router.go('payables'), { className: 'quick-link' }),
      button('View cash requirements', () => router.go('cash'), { className: 'quick-link' }),
      button('Check system status', () => router.go('system'), { className: 'quick-link' }),
    ]),
  );
}

export async function mountOverview(root) {
  clear(root);
  root.append(node('div', { className: 'loading', text: 'Loading current Payables data...' }));
  try {
    await refreshAll();
    render(root);
  } catch (error) {
    render(root);
    setGlobalStatus(error.message || 'Some Payables sources are unavailable.', 'warning');
  }
}
