import { api } from '../api.js';
import { refreshPayables } from '../data.js';
import { summarizePayables } from '../domain.js';
import { store } from '../store.js';
import { button, card, clear, money, node, panel, setGlobalStatus, statusPill, table } from '../ui.js';

function stateLabel(item) {
  if (item.approved) return 'Authorized';
  if (item.reviewRequired || item.status === 'review') return 'Needs review';
  return String(item.status || 'ready').replaceAll('_', ' ');
}

function stateKind(item) {
  if (item.approved) return 'success';
  if (item.reviewRequired || item.status === 'review') return 'warning';
  if (item.status === 'held' || item.status === 'duplicate') return 'danger';
  return 'neutral';
}

function filtered(rows, query, filter) {
  const text = query.trim().toLowerCase();
  return rows.filter((item) => {
    const matchesText = !text || `${item.name} ${item.clinic} ${item.category} ${item.description}`.toLowerCase().includes(text);
    if (!matchesText) return false;
    if (filter === 'all') return true;
    if (filter === 'review') return item.reviewRequired && !item.approved;
    if (filter === 'authorized') return item.approved;
    if (filter === 'ready') return !item.reviewRequired && !item.approved;
    return item.kind === filter;
  });
}

async function changeAuthorization(item, checked, checkbox, root, query, filter) {
  checkbox.disabled = true;
  try {
    if (item.source === 'current') {
      await api.setCurrentAuthorization({
        id: item.id,
        month: store.getState().month,
        authorized: checked,
        amount: item.amountCents / 100,
      });
    } else {
      await api.setFinanceAuthorization({
        id: item.id,
        authorized: checked,
        amount: item.amountCents / 100,
      });
    }
    await refreshPayables(store.getState().month);
    render(root, query, filter);
    setGlobalStatus(checked ? 'Authorized. No payment was sent.' : 'Authorization removed.', 'success');
  } catch (error) {
    checkbox.checked = !checked;
    checkbox.disabled = false;
    setGlobalStatus(error.detail || error.message || 'Authorization was not changed.', 'danger');
  }
}

function render(root, existingQuery = '', existingFilter = 'all') {
  const state = store.getState();
  const summary = summarizePayables(state.payables);
  const isAdmin = Boolean(state.device?.isAdmin);
  clear(root);

  const month = node('input', { type: 'month', value: state.month });
  const search = node('input', { type: 'search', value: existingQuery, placeholder: 'Vendor, clinic, category' });
  const filter = node('select');
  const options = [
    ['all', 'All open'], ['review', 'Needs review'], ['authorized', 'Authorized'], ['ready', 'Ready'],
    ['vendor_bill', 'Vendor bills'], ['capex_commitment', 'CAPEX'], ['intercompany_transfer', 'Transfers'],
  ];
  for (const [value, label] of options) {
    const option = node('option', { value, text: label });
    if (value === existingFilter) option.selected = true;
    filter.append(option);
  }

  const renderRows = () => {
    const rows = filtered(store.getState().payables, search.value, filter.value);
    const tableHost = document.getElementById('payablesTableHost');
    if (!tableHost) return;
    clear(tableHost);
    if (!rows.length) {
      tableHost.append(node('div', { className: 'empty-state', text: 'No items match this view.' }));
      return;
    }
    tableHost.append(table([
      { label: 'Authorize' }, { label: 'Payee' }, { label: 'Clinic and category' }, { label: 'Type' },
      { label: 'Amount', className: 'number' }, { label: 'State' }, { label: 'How paid' },
    ], rows.map((item) => {
      const checkbox = node('input', {
        type: 'checkbox',
        checked: item.approved,
        disabled: !isAdmin,
        attributes: { 'aria-label': `Authorize ${item.name}` },
      });
      checkbox.addEventListener('change', () => changeAuthorization(item, checkbox.checked, checkbox, root, search.value, filter.value));
      return [
        { content: checkbox },
        { content: node('div', {}, [node('strong', { text: item.name }), item.description ? node('div', { className: 'subtle', text: item.description }) : null]) },
        { content: node('div', {}, [node('div', { text: item.clinic }), node('div', { className: 'subtle', text: item.category })]) },
        { content: String(item.kind).replaceAll('_', ' ') },
        { className: 'number', content: money(item.amountCents) },
        { content: statusPill(stateLabel(item), stateKind(item)) },
        { content: node('div', {}, [node('div', { text: item.howPaid }), node('div', { className: 'subtle', text: item.source === 'current' ? 'Monthly list' : 'Finance database' })]) },
      ];
    })));
  };

  month.addEventListener('change', async () => {
    try {
      setGlobalStatus('Loading selected month...', 'info');
      await refreshPayables(month.value);
      render(root, search.value, filter.value);
      setGlobalStatus('', 'info');
    } catch (error) {
      setGlobalStatus(error.message || 'Could not load the selected month.', 'danger');
    }
  });
  search.addEventListener('input', renderRows);
  filter.addEventListener('change', renderRows);

  const toolbar = node('div', { className: 'toolbar' }, [
    node('label', { className: 'field compact' }, [node('span', { text: 'Month' }), month]),
    node('label', { className: 'field compact grow' }, [node('span', { text: 'Search' }), search]),
    node('label', { className: 'field compact' }, [node('span', { text: 'Show' }), filter]),
    button('Refresh', async () => {
      try { await refreshPayables(month.value); render(root, search.value, filter.value); } catch (error) { setGlobalStatus(error.message, 'danger'); }
    }),
  ]);

  const sourceDetail = [
    state.sourceStatus.current === 'ok' ? 'Monthly list connected' : `Monthly list unavailable: ${state.sourceErrors.current || 'unknown error'}`,
    state.sourceStatus.finance === 'ok' ? 'Finance database connected' : `Finance database unavailable: ${state.sourceErrors.finance || 'unknown error'}`,
  ].join('. ');

  root.append(
    node('div', { className: 'screen-heading' }, [
      node('div', {}, [node('h1', { text: 'Payables' }), node('p', { text: 'Review amounts and authorize the full item with one checkbox.' })]),
    ]),
    toolbar,
    !isAdmin ? node('div', { className: 'notice warning', text: 'This browser is read-only. An administrator browser is required to change authorization.' }) : null,
    node('div', { className: 'metric-grid' }, [
      card('Open items', String(summary.openCount)),
      card('Needs review', String(summary.reviewCount), money(summary.reviewCents), summary.reviewCount ? 'warning' : ''),
      card('Authorized', money(summary.authorizedCents), `${summary.authorizedCount} item(s)`, 'success'),
      card('Expected total', money(summary.totalCents)),
    ]),
    panel('Payables queue', node('div', { id: 'payablesTableHost' }), {
      subtitle: `${sourceDetail}. A checked box authorizes; it does not send payment.`,
    }),
  );
  renderRows();
}

export async function mountPayables(root) {
  clear(root);
  root.append(node('div', { className: 'loading', text: 'Loading Payables...' }));
  try {
    await refreshPayables(store.getState().month);
    render(root);
  } catch (error) {
    render(root);
    setGlobalStatus(error.message || 'Payables are unavailable.', 'danger');
  }
}
