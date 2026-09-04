import { api } from '../api.js';
import { refreshInbox, refreshPayables } from '../data.js';
import { inboxSummary } from '../domain.js';
import { store } from '../store.js';
import { button, card, clear, formatDate, money, node, panel, setGlobalStatus, statusPill, table } from '../ui.js';

function field(label, input) {
  return node('label', { className: 'field' }, [node('span', { text: label }), input]);
}

function kindForStatus(status) {
  if (status === 'promoted') return 'success';
  if (status === 'duplicate' || status === 'rejected') return 'danger';
  return 'warning';
}

async function act(action, item, root) {
  try {
    setGlobalStatus('Updating Inbox...', 'info');
    if (action === 'promote') await api.promoteInbox(item.id);
    if (action === 'reject') await api.rejectInbox(item.id);
    if (action === 'resolve') {
      const confirmed = window.confirm(`Confirm that HMS is responsible for ${item.candidate_payee || item.subject || 'this item'}? This does not authorize or pay it.`);
      if (!confirmed) return;
      await api.resolveInboxHold(item.id);
    }
    await Promise.allSettled([refreshInbox(), refreshPayables(store.getState().month)]);
    render(root);
    setGlobalStatus('Inbox updated. Nothing was paid.', 'success');
  } catch (error) {
    setGlobalStatus(error.detail || error.message || 'Inbox action failed.', 'danger');
  }
}

function render(root) {
  const state = store.getState();
  const summary = inboxSummary(state.inbox);
  const isAdmin = Boolean(state.device?.isAdmin);
  clear(root);

  const payee = node('input', { name: 'payee', placeholder: 'Vendor or payee', maxLength: 300, attributes: { required: '' } });
  const amount = node('input', { name: 'amount', type: 'number', min: '0', step: '0.01', placeholder: '0.00' });
  const dueDate = node('input', { name: 'dueDate', type: 'date' });
  const invoice = node('input', { name: 'invoiceNumber', placeholder: 'Invoice or reference', maxLength: 160 });
  const note = node('textarea', { name: 'note', placeholder: 'What is this for, and where did it come from?', maxLength: 2000 });
  const submit = node('button', { type: 'submit', className: 'button primary', text: 'Add to Inbox' });

  const form = node('form', {
    className: 'form-grid',
    onSubmit: async (event) => {
      event.preventDefault();
      submit.disabled = true;
      setGlobalStatus('Adding the bill to the review Inbox...', 'info');
      try {
        await api.addInbox({
          payee: payee.value,
          amount: amount.value,
          dueDate: dueDate.value,
          invoiceNumber: invoice.value,
          note: note.value,
        });
        event.currentTarget.reset();
        await refreshInbox();
        render(root);
        setGlobalStatus('Added to Inbox. It is not authorized or paid.', 'success');
      } catch (error) {
        setGlobalStatus(error.detail || error.message || 'Could not add the Inbox item.', 'danger');
        submit.disabled = false;
      }
    },
  }, [
    field('Payee', payee),
    node('div', { className: 'field-row' }, [field('Amount', amount), field('Due date', dueDate)]),
    field('Invoice or reference', invoice),
    field('Description or source note', note),
    node('div', { className: 'form-actions' }, [submit, node('span', { className: 'subtle', text: 'Creates a review item only.' })]),
  ]);

  const rows = state.inbox.map((item) => {
    const actions = node('div', { className: 'row-actions' });
    if (['needs_review', 'ready'].includes(item.review_status)) {
      actions.append(
        button('Move to Payables', () => act('promote', item, root), { className: 'button small primary' }),
        button('Reject', () => act('reject', item, root), { className: 'button small' }),
      );
    } else if (item.review_status === 'held') {
      actions.append(
        button('Confirm HMS', () => act('resolve', item, root), { className: 'button small primary', disabled: !isAdmin }),
        button('Reject', () => act('reject', item, root), { className: 'button small' }),
      );
    }
    if (item.source_url) {
      actions.append(node('a', {
        className: 'button small link-button',
        text: item.source_type === 'gmail' ? 'Open email' : 'Open source',
        href: item.source_url,
        target: '_blank',
        rel: 'noopener noreferrer',
      }));
    }
    if (!actions.childNodes.length) actions.append(node('span', { className: 'subtle', text: 'No action' }));

    return [
      { content: node('div', {}, [
        node('strong', { text: item.candidate_payee || item.subject || 'Unidentified item' }),
        node('div', { className: 'subtle', text: [item.source_type, item.candidate_invoice_number].filter(Boolean).join(' / ') }),
      ]) },
      { content: formatDate(item.candidate_due_date) },
      { className: 'number', content: item.candidate_amount_cents == null ? 'Missing' : money(item.candidate_amount_cents) },
      { content: statusPill(item.review_status.replaceAll('_', ' '), kindForStatus(item.review_status)) },
      { content: actions },
    ];
  });

  root.append(
    node('div', { className: 'screen-heading' }, [
      node('div', {}, [node('h1', { text: 'Inbox' }), node('p', { text: 'Possible bills enter here before they become payables.' })]),
      button('Refresh', async () => {
        try { await refreshInbox(); render(root); } catch (error) { setGlobalStatus(error.message, 'danger'); }
      }),
    ]),
    node('div', { className: 'metric-grid' }, [
      card('Needs review', String(summary.review)),
      card('Entity holds', String(summary.held), 'Confirm the responsible company', summary.held ? 'warning' : ''),
      card('Possible duplicates', String(summary.duplicate)),
      card('Moved to Payables', String(summary.promoted), '', 'success'),
    ]),
    node('div', { className: 'two-column' }, [
      panel('Add a bill', form, { subtitle: 'Manual entry remains available even when email discovery is offline.' }),
      panel('Review queue', rows.length
        ? table([
            { label: 'Payee or source' }, { label: 'Due' }, { label: 'Amount', className: 'number' }, { label: 'State' }, { label: 'Action' },
          ], rows)
        : node('div', { className: 'empty-state', text: 'No Inbox items.' }), {
          subtitle: state.sourceStatus.inbox === 'ok' ? `${state.inbox.length} item(s) loaded.` : state.sourceErrors.inbox || 'Inbox unavailable.',
        }),
    ]),
  );
}

export async function mountInbox(root) {
  clear(root);
  root.append(node('div', { className: 'loading', text: 'Loading Inbox...' }));
  try {
    await refreshInbox();
    render(root);
  } catch (error) {
    render(root);
    setGlobalStatus(error.detail || error.message || 'Inbox unavailable.', 'danger');
  }
}
