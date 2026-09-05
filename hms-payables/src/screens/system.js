import { APP_CONFIG } from '../config.js';
import { systemChecks } from '../data.js';
import { store } from '../store.js';
import { button, card, clear, node, panel, setGlobalStatus, statusPill, table } from '../ui.js';

function gmailDescription(check) {
  if (!check.ok) return check.error;
  const configuration = check.value?.configuration || {};
  const active = (check.value?.connections || []).find((connection) => connection.status === 'active');
  if (active) return `Connected to ${active.source_account}`;
  if (configuration.configured) return 'Configured; no active mailbox connection';
  const missing = configuration.missing || [];
  return missing.length ? `One-time Google setup missing: ${missing.join(', ')}` : 'Not connected';
}

function render(root, checks = null) {
  const state = store.getState();
  clear(root);

  const sourceRows = checks ? checks.map((check) => [
    { content: node('strong', { text: check.name }) },
    { content: statusPill(check.ok ? 'Available' : 'Unavailable', check.ok ? 'success' : 'danger') },
    { content: `${check.durationMs} ms` },
    { content: check.name === 'Gmail discovery status' ? gmailDescription(check) : check.ok ? 'Responded normally' : `${check.code}: ${check.error}` },
  ]) : [];

  root.append(
    node('div', { className: 'screen-heading' }, [
      node('div', {}, [node('h1', { text: 'System' }), node('p', { text: 'A plain status page for the Payables application.' })]),
      button('Run checks', async (event) => {
        event.currentTarget.disabled = true;
        setGlobalStatus('Checking Payables services...', 'info');
        const result = await systemChecks();
        render(root, result);
        const failed = result.filter((check) => !check.ok).length;
        setGlobalStatus(failed ? `${failed} service check(s) failed. Details are shown below.` : 'All checked services responded.', failed ? 'warning' : 'success');
      }),
    ]),
    node('div', { className: 'metric-grid' }, [
      card('Build', APP_CONFIG.version),
      card('Browser role', state.device?.isAdmin ? 'Administrator' : 'Read only'),
      card('Monthly-list authority', 'Legacy Blob', 'Until controlled cutover'),
      card('Money movement', 'Disabled', 'Record-only workflows', 'success'),
    ]),
    panel('Service checks', checks
      ? table([{ label: 'Service' }, { label: 'Status' }, { label: 'Response' }, { label: 'Detail' }], sourceRows)
      : node('div', { className: 'empty-state', text: 'Run checks to see exactly which service is available or failing.' }), {
      subtitle: 'A single failed optional service should not prevent the rest of the app from loading.',
    }),
    panel('Architecture boundary', node('div', { className: 'architecture' }, [
      node('div', { className: 'architecture-row' }, [node('span', { text: 'Browser app' }), node('span', { text: 'one API client' }), node('span', { text: 'stable service contracts' })]),
      node('div', { className: 'architecture-arrow', text: 'down' }),
      node('div', { className: 'architecture-row' }, [node('span', { text: 'Monthly list adapter' }), node('span', { text: 'Finance Inbox and AP' }), node('span', { text: 'Accounting ledger' })]),
      node('div', { className: 'architecture-arrow', text: 'down' }),
      node('div', { className: 'architecture-row' }, [node('span', { text: 'Legacy Blob during transition' }), node('span', { text: 'HMS PostgreSQL' }), node('span', { text: 'Posted journals feed P&L' })]),
    ]), {
      subtitle: 'The old browser implementation remains available as rollback, but it is not part of this shell.',
    }),
    panel('Administrative links', node('div', { className: 'link-grid' }, [
      node('a', { className: 'settings-link', href: '/payables/', target: '_blank', rel: 'noopener noreferrer' }, [node('strong', { text: 'Legacy Monthly Payables' }), node('span', { text: 'Current source of truth for the preexisting list.' })]),
      node('a', { className: 'settings-link', href: '/hms-device-access-test/', target: '_blank', rel: 'noopener noreferrer' }, [node('strong', { text: 'Browser access' }), node('span', { text: 'Name, allow, or block enrolled browsers.' })]),
      node('a', { className: 'settings-link', href: '/hms-finance-staging/', target: '_blank', rel: 'noopener noreferrer' }, [node('strong', { text: 'Previous app shell' }), node('span', { text: 'Rollback reference during the refactor.' })]),
    ])),
  );
}

export async function mountSystem(root) {
  render(root);
}
