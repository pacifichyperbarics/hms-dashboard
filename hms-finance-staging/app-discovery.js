(() => {
  const API = window.HMSFinanceAPI;
  if (!API?.endpoints?.discovery || !API?.requestForm) return;
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
  const formatDate = (value) => {
    if (!value) return 'Never';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  };

  function addStyles() {
    if ($('hmsDiscoveryStyles')) return;
    const style = document.createElement('style');
    style.id = 'hmsDiscoveryStyles';
    style.textContent = `
      .discovery-panel{margin:12px 0 16px;padding:13px 15px;border:1px solid var(--line);border-radius:12px;background:#fff}
      .discovery-head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
      .discovery-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:10px}
      .discovery-source{border:1px solid #e3e8ed;border-radius:9px;padding:10px;background:#f9fbfc}
      .discovery-source strong{display:block;color:var(--navy)}
      .discovery-source span{display:block;color:var(--muted);font-size:12px;margin-top:3px}
      .discovery-file-note{font-size:11px;color:var(--muted);margin-top:4px}
      .evidence-modal{position:fixed;inset:0;background:rgba(13,27,42,.45);display:flex;align-items:center;justify-content:center;padding:16px;z-index:1000}
      .evidence-card{width:min(620px,100%);max-height:80vh;overflow:auto;background:#fff;border-radius:12px;padding:17px;box-shadow:0 18px 60px rgba(0,0,0,.25)}
      .evidence-row{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid #edf0f3}
      .evidence-row:last-child{border-bottom:0}
      .evidence-name{font-weight:700;overflow-wrap:anywhere}
      @media(max-width:720px){.discovery-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function injectSourcePanel() {
    if ($('discoveryPanel')) return;
    const tab = $('tab-inbox');
    const cards = tab?.querySelector('.cards');
    if (!tab || !cards) return;
    const panel = document.createElement('section');
    panel.id = 'discoveryPanel';
    panel.className = 'discovery-panel';
    panel.innerHTML = `
      <div class="discovery-head">
        <div><h2 style="margin:0">How bills enter the Inbox</h2><div class="meta">Files and email are evidence only. They never authorize or pay a bill.</div></div>
        <button class="btn" id="discoveryRefresh" type="button">Refresh sources</button>
      </div>
      <div class="discovery-grid">
        <div class="discovery-source"><strong>File upload</strong><span id="uploadSourceState">Checking…</span></div>
        <div class="discovery-source"><strong>Email discovery</strong><span id="emailSourceState">Checking…</span></div>
        <div class="discovery-source"><strong>Evidence retained</strong><span id="evidenceSourceState">Checking…</span></div>
      </div>
    `;
    cards.before(panel);
    $('discoveryRefresh')?.addEventListener('click', loadDiscoveryStatus);
  }

  function injectFileField() {
    const form = $('inboxAddForm');
    if (!form || $('inboxFile')) return;
    const submit = form.querySelector('button[type="submit"]');
    if (!submit) return;
    const field = document.createElement('div');
    field.className = 'field discovery-file-field';
    field.innerHTML = `
      <label for="inboxFile">Invoice or supporting file (optional)</label>
      <input id="inboxFile" name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,text/plain,text/csv,.xls,.xlsx">
      <div class="discovery-file-note">Private evidence storage. PDF, image, text, CSV or Excel; maximum 15 MB.</div>
    `;
    submit.before(field);
    form.addEventListener('submit', handleUploadSubmit, true);
  }

  async function loadDiscoveryStatus() {
    try {
      const result = await API.request(API.endpoints.discovery, 'GET', undefined, { timeoutMs: 20000 });
      const sources = result.sources || [];
      const upload = sources.find((source) => source.source_type === 'upload');
      const gmail = sources.find((source) => source.source_type === 'gmail' && source.account_identifier === 'hms@healtho2.com')
        || sources.find((source) => source.source_type === 'gmail');
      const recent = (result.runs || [])[0];
      if ($('uploadSourceState')) $('uploadSourceState').textContent = upload?.status === 'connected' ? 'Ready — upload invoices directly below.' : 'Temporarily unavailable.';
      if ($('emailSourceState')) {
        if (!gmail || gmail.status === 'not_connected') $('emailSourceState').textContent = 'Not yet connected for unattended scanning. Secure email import is being added.';
        else if (gmail.status === 'paused') $('emailSourceState').textContent = 'Paused.';
        else if (gmail.status === 'error') $('emailSourceState').textContent = `Needs attention${gmail.last_error ? `: ${gmail.last_error}` : '.'}`;
        else {
          const mode = gmail.config?.connection_mode;
          $('emailSourceState').textContent = mode === 'google_oauth'
            ? `Connected${gmail.last_success_at ? `; last scan ${formatDate(gmail.last_success_at)}` : ''}.`
            : 'Secure imports are supported; unattended Gmail scanning is not yet enabled.';
        }
      }
      if ($('evidenceSourceState')) $('evidenceSourceState').textContent = `${Number(result.evidenceCount || 0)} file/email evidence item(s).${recent ? ` Last activity ${formatDate(recent.completed_at || recent.started_at)}.` : ''}`;
    } catch (error) {
      if ($('uploadSourceState')) $('uploadSourceState').textContent = 'Source status unavailable; manual entry still works.';
      if ($('emailSourceState')) $('emailSourceState').textContent = 'Status unavailable.';
      if ($('evidenceSourceState')) $('evidenceSourceState').textContent = error.code === 'request_timeout' ? 'Status check timed out.' : 'Status unavailable.';
    }
  }

  async function handleUploadSubmit(event) {
    const fileInput = $('inboxFile');
    const file = fileInput?.files?.[0];
    if (!file) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    const status = $('inboxAddStatus');
    submit.disabled = true;
    if (status) status.textContent = 'Uploading evidence and adding it to the Inbox…';
    const payload = new FormData();
    payload.append('file', file);
    payload.append('payee', $('inboxPayee')?.value || '');
    payload.append('amount', $('inboxAmount')?.value || '');
    payload.append('dueDate', $('inboxDue')?.value || '');
    payload.append('invoiceNumber', $('inboxInvoice')?.value || '');
    payload.append('note', $('inboxNote')?.value || '');
    try {
      const result = await API.requestForm(API.endpoints.discovery, payload, { timeoutMs: 60000 });
      form.reset();
      if (status) status.textContent = result.duplicate ? 'This file was already in the Inbox; no duplicate was added.' : 'File stored privately and added to the Inbox for review.';
      $('inboxRefresh')?.click();
      await loadDiscoveryStatus();
    } catch (error) {
      if (status) {
        status.textContent = error.code === 'file_size_not_allowed'
          ? 'The file is larger than 15 MB.'
          : error.code === 'file_type_not_allowed'
            ? 'That file type is not accepted.'
            : error.code === 'request_timeout'
              ? 'The upload timed out. Check the Inbox before trying again; duplicates are blocked.'
              : `Upload failed${error.detail ? `: ${error.detail}` : '.'}`;
      }
    } finally { submit.disabled = false; }
  }

  function addEvidenceButtons() {
    const body = $('inboxRows');
    if (!body) return;
    body.querySelectorAll('tr[data-id]').forEach((row) => {
      if (row.dataset.evidenceButton === '1') return;
      row.dataset.evidenceButton = '1';
      const cell = row.lastElementChild;
      if (!cell) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'smallbtn inbox-evidence';
      button.textContent = 'Source';
      button.addEventListener('click', () => showEvidence(row.dataset.id));
      (cell.querySelector('.actions') || cell).appendChild(button);
    });
  }

  async function showEvidence(intakeId) {
    const status = $('inboxStatus');
    try {
      const result = await API.request(`${API.endpoints.discovery}?intakeId=${encodeURIComponent(intakeId)}`);
      const evidence = result.evidence || [];
      if (!evidence.length) {
        if (status) status.textContent = 'No retained file or email evidence is attached to this item.';
        return;
      }
      const modal = document.createElement('div');
      modal.className = 'evidence-modal';
      modal.innerHTML = `
        <div class="evidence-card" role="dialog" aria-modal="true" aria-label="Source evidence">
          <div class="section-head"><div><h2>Source evidence</h2><div class="meta">Private files open through a short-lived link.</div></div><button class="btn evidence-close" type="button">Close</button></div>
          <div>${evidence.map((item) => `
            <div class="evidence-row">
              <div><div class="evidence-name">${escapeHtml(item.original_filename || item.evidence_type || 'Evidence')}</div><div class="meta">${escapeHtml(item.mime_type || item.evidence_type || '')}${item.byte_size ? ` · ${Math.ceil(Number(item.byte_size) / 1024)} KB` : ''}</div></div>
              <button class="smallbtn evidence-open" type="button" data-evidence-id="${escapeHtml(item.id)}">Open</button>
            </div>`).join('')}</div>
        </div>`;
      modal.addEventListener('click', async (event) => {
        if (event.target === modal || event.target.closest('.evidence-close')) { modal.remove(); return; }
        const button = event.target.closest('.evidence-open');
        if (!button) return;
        button.disabled = true;
        try {
          const opened = await API.request(API.endpoints.discovery, 'POST', { action: 'signed-evidence-url', evidenceId: button.dataset.evidenceId });
          if (opened.url) window.open(opened.url, '_blank', 'noopener,noreferrer');
          else if (status) status.textContent = 'The email reference is retained, but its attachment has not been downloaded yet.';
        } catch { if (status) status.textContent = 'Could not open the retained evidence.'; }
        finally { button.disabled = false; }
      });
      document.body.appendChild(modal);
    } catch { if (status) status.textContent = 'Could not retrieve source evidence.'; }
  }

  function observeInbox() {
    const body = $('inboxRows');
    if (!body) return;
    const observer = new MutationObserver(addEvidenceButtons);
    observer.observe(body, { childList: true, subtree: true });
    addEvidenceButtons();
  }

  function init() {
    addStyles();
    injectSourcePanel();
    injectFileField();
    observeInbox();
    loadDiscoveryStatus();
    window.addEventListener('hashchange', () => { if (location.hash === '#inbox') loadDiscoveryStatus(); });
  }
  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init, { once: true });
})();
