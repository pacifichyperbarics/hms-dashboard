import {
  API, $, esc, formatDate, navigate, setText,
} from './app-core.js';

let gmail = {
  configuration: null,
  connections: [],
  runs: [],
  evidenceCounts: {},
};
let bound = false;

function ensureUi() {
  if (!document.getElementById('gmailDiscoveryStyles')) {
    const stylesheet = document.createElement('link');
    stylesheet.id = 'gmailDiscoveryStyles';
    stylesheet.rel = 'stylesheet';
    stylesheet.href = './gmail.css';
    document.head.appendChild(stylesheet);
  }

  const inboxRefresh = $('inboxRefresh');
  if (inboxRefresh && !$('gmailScanInbox')) {
    const button = document.createElement('button');
    button.className = 'btn';
    button.type = 'button';
    button.id = 'gmailScanInbox';
    button.textContent = 'Scan email';
    button.disabled = true;
    inboxRefresh.parentElement?.insertBefore(button, inboxRefresh);
  }

  const settings = $('tab-settings');
  if (settings && !$('gmailSettingsPanel')) {
    const panel = document.createElement('section');
    panel.className = 'panel gmail-panel';
    panel.id = 'gmailSettingsPanel';
    panel.innerHTML = `
      <div class="section-head">
        <div>
          <h2>Email bill discovery</h2>
          <div class="meta">Checks connected Gmail for invoices, statements, past-due notices, autopays, receipts, and changed payment instructions.</div>
        </div>
        <div class="actions">
          <button class="btn" id="gmailConnect" type="button">Connect Gmail</button>
          <button class="btn primary" id="gmailScan" type="button" disabled>Scan now</button>
        </div>
      </div>
      <div id="gmailStatus" class="connection-status warn">Checking email discovery…</div>
      <div id="gmailDetail" class="status"></div>
      <div class="cards gmail-cards">
        <div class="card warn"><span>Needs review</span><strong id="gmailCandidates">0</strong></div>
        <div class="card"><span>Automatic charges</span><strong id="gmailAutomatic">0</strong></div>
        <div class="card positive"><span>Already paid evidence</span><strong id="gmailPaid">0</strong></div>
        <div class="card"><span>Excluded</span><strong id="gmailExcluded">0</strong></div>
      </div>
      <div id="gmailConnections" class="connection-list"></div>
      <div id="gmailRunSummary" class="notice">No email scan has been recorded yet.</div>
      <details class="spaced">
        <summary>Connection details</summary>
        <div id="gmailTechnical" class="meta spaced"></div>
      </details>`;
    settings.insertBefore(panel, settings.firstElementChild);
  }
}

function connectionStatusClass(connection) {
  if (connection?.status === 'active') return 'good';
  if (connection?.status === 'error') return 'bad';
  return 'warn';
}

function renderConnections() {
  const container = $('gmailConnections');
  if (!container) return;
  if (!gmail.connections.length) {
    container.innerHTML = '<div class="empty compact-empty">No Gmail account is connected.</div>';
    return;
  }
  container.innerHTML = gmail.connections.map((connection) => `
    <div class="connection-row" data-id="${esc(connection.id)}">
      <div>
        <strong>${esc(connection.source_account)}</strong>
        <div class="meta">${connection.last_success_at ? `Last successful scan ${esc(formatDate(connection.last_success_at))}` : 'Not scanned yet'}${connection.error_text ? ` · ${esc(connection.error_text)}` : ''}</div>
      </div>
      <span class="pill ${connectionStatusClass(connection)}">${esc(connection.status)}</span>
      <div class="actions">
        ${connection.status === 'active' ? '<button class="smallbtn gmail-connection-action" data-action="pause" type="button">Pause</button>' : connection.status !== 'disconnected' ? '<button class="smallbtn gmail-connection-action" data-action="resume" type="button">Resume</button>' : ''}
        ${connection.status !== 'disconnected' ? '<button class="smallbtn gmail-connection-action danger-text" data-action="disconnect" type="button">Disconnect</button>' : ''}
      </div>
    </div>`).join('');
}

function renderGmail() {
  ensureUi();
  const configuration = gmail.configuration || { configured: false, missing: [] };
  const active = gmail.connections.find((connection) => connection.status === 'active');
  const latest = gmail.runs[0] || null;
  const counts = gmail.evidenceCounts || {};
  const candidates = Number(counts.payment_needed || 0) + Number(counts.review || 0) + Number(counts.entity_hold || 0);

  setText('gmailCandidates', candidates);
  setText('gmailAutomatic', Number(counts.scheduled_auto || 0));
  setText('gmailPaid', Number(counts.already_paid || 0));
  setText('gmailExcluded', Number(counts.not_payable || 0));

  const status = $('gmailStatus');
  if (!configuration.configured) {
    status.textContent = 'Email discovery is installed; Google connection setup is incomplete';
    status.className = 'connection-status warn';
    setText('gmailDetail', 'The app cannot scan Gmail until the one-time Google OAuth client is configured. Existing Payables and manual Inbox entry continue to work.');
  } else if (active) {
    status.textContent = `Connected to ${active.source_account}`;
    status.className = 'connection-status good';
    setText('gmailDetail', 'New bill-like messages are checked hourly. A scan creates review items only; it never authorizes or pays them.');
  } else if (gmail.connections.some((connection) => connection.status === 'error')) {
    status.textContent = 'Gmail connection needs attention';
    status.className = 'connection-status bad';
    setText('gmailDetail', 'Resume or reconnect the account, then run a scan. Existing Payables data is unaffected.');
  } else if (gmail.connections.some((connection) => connection.status === 'paused')) {
    status.textContent = 'Gmail scanning is paused';
    status.className = 'connection-status warn';
    setText('gmailDetail', 'Resume the connection when email discovery should continue.');
  } else {
    status.textContent = 'Ready to connect Gmail';
    status.className = 'connection-status warn';
    setText('gmailDetail', 'Connect the HMS Gmail account once. The browser password and Gmail authorization remain separate.');
  }

  $('gmailConnect').disabled = !configuration.configured;
  $('gmailScan').disabled = !active;
  if ($('gmailScanInbox')) {
    $('gmailScanInbox').disabled = !active;
    $('gmailScanInbox').title = active ? `Scan ${active.source_account}` : 'Connect Gmail in Settings first';
  }

  renderConnections();
  if (latest) {
    const completed = latest.completed_at ? formatDate(latest.completed_at) : 'in progress';
    const details = [
      `${latest.messages_scanned || 0} messages checked`,
      `${latest.candidates_created || 0} new review items`,
      `${latest.candidates_updated || 0} updated`,
      `${latest.receipts_skipped || 0} already-paid confirmations`,
      `${latest.irrelevant_skipped || 0} excluded`,
      `${latest.entity_holds || 0} entity holds`,
    ];
    setText('gmailRunSummary', `Last scan ${completed}: ${details.join(' · ')}.`);
  } else {
    setText('gmailRunSummary', 'No email scan has been recorded yet.');
  }
  setText('gmailTechnical', `OAuth redirect: ${configuration.redirectUri || 'not available'}. Missing setup: ${(configuration.missing || []).join(', ') || 'none'}. Stored email evidence: ${counts.total || 0}.`);
}

function callbackMessage() {
  const url = new URL(location.href);
  const result = url.searchParams.get('gmail');
  if (!result) return;
  if (result === 'connected') {
    setText('gmailDetail', 'Gmail was connected. Run the first scan to populate the Inbox.');
  } else {
    setText('gmailDetail', `Gmail connection was not completed: ${result.replaceAll('_', ' ')}.`);
  }
  url.searchParams.delete('gmail');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

export async function loadGmail({ quiet = false } = {}) {
  ensureUi();
  if (!quiet) setText('gmailDetail', 'Checking Gmail connection…');
  try {
    const response = await API.request(API.endpoints.gmail);
    gmail = {
      configuration: response.configuration || null,
      connections: response.connections || [],
      runs: response.runs || [],
      evidenceCounts: response.evidenceCounts || {},
    };
    renderGmail();
    callbackMessage();
    return gmail;
  } catch (error) {
    const status = $('gmailStatus');
    if (status) {
      status.textContent = 'Email discovery status unavailable';
      status.className = 'connection-status bad';
    }
    setText('gmailDetail', `The Gmail status service could not be reached: ${error.detail || error.code || 'connection error'}. Manual Inbox entry still works.`);
    if ($('gmailScan')) $('gmailScan').disabled = true;
    if ($('gmailScanInbox')) $('gmailScanInbox').disabled = true;
    return null;
  }
}

async function scanNow(button) {
  const active = gmail.connections.find((connection) => connection.status === 'active');
  if (!active) {
    navigate('settings');
    setText('gmailDetail', 'Connect or resume Gmail before scanning.');
    return;
  }
  button.disabled = true;
  const previous = button.textContent;
  button.textContent = 'Scanning…';
  setText('gmailDetail', 'Checking recent email. This may take several seconds. No item will be authorized or paid.');
  try {
    const response = await API.request(API.endpoints.gmail, 'POST', {
      action: 'scan', connectionId: active.id, maxMessages: 75,
    }, 60000);
    gmail = {
      configuration: response.configuration || gmail.configuration,
      connections: response.connections || gmail.connections,
      runs: response.runs || gmail.runs,
      evidenceCounts: response.evidenceCounts || gmail.evidenceCounts,
    };
    renderGmail();
    window.dispatchEvent(new CustomEvent('hms-gmail-scan-completed', { detail: response.scan || {} }));
    if (button.id === 'gmailScanInbox') navigate('inbox');
  } catch (error) {
    setText('gmailDetail', `Email scan failed: ${error.detail || error.code || 'connection error'}. No payable was authorized or paid.`);
  } finally {
    button.textContent = previous;
    button.disabled = !gmail.connections.some((connection) => connection.status === 'active');
  }
}

export function bindGmail() {
  if (bound) return;
  bound = true;
  ensureUi();

  $('gmailConnect')?.addEventListener('click', async () => {
    const button = $('gmailConnect');
    button.disabled = true;
    setText('gmailDetail', 'Starting the Google connection…');
    try {
      const response = await API.request(API.endpoints.gmail, 'POST', { action: 'start-connect' });
      location.assign(response.authorizationUrl);
    } catch (error) {
      setText('gmailDetail', `Gmail connection cannot start: ${error.detail || error.code || 'connection error'}.`);
      button.disabled = false;
    }
  });

  $('gmailScan')?.addEventListener('click', () => scanNow($('gmailScan')));
  $('gmailScanInbox')?.addEventListener('click', () => scanNow($('gmailScanInbox')));

  $('gmailConnections')?.addEventListener('click', async (event) => {
    const button = event.target.closest('.gmail-connection-action');
    if (!button) return;
    const row = button.closest('.connection-row');
    const action = button.dataset.action;
    if (!row?.dataset.id || !action) return;
    if (action === 'disconnect' && !window.confirm('Disconnect this Gmail account from bill discovery? Existing evidence and Inbox items will remain.')) return;
    button.disabled = true;
    try {
      await API.request(API.endpoints.gmail, 'POST', { action, connectionId: row.dataset.id });
      await loadGmail();
    } catch (error) {
      setText('gmailDetail', `Connection update failed: ${error.detail || error.code || 'connection error'}.`);
    } finally {
      button.disabled = false;
    }
  });
}
