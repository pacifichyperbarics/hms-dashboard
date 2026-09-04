import {
  API, $, esc, formatDate, loadPayableSources, money, monthLabel, navigate,
  payableSummary, pretty, request, setText, sourceSummaryText, state,
} from './app-core.js';

function pillClass(item) {
  if (item.approved) return 'good';
  if (item.reviewRequired || item.status === 'review') return 'warn';
  if (item.status === 'held' || item.status === 'duplicate') return 'bad';
  return 'blue';
}

function stateLabel(item) {
  if (item.approved) return 'Authorized';
  if (item.reviewRequired || item.status === 'review') return 'Needs review';
  return pretty(item.status || 'ready');
}

async function fetchInbox() {
  const response = await request(`${API.endpoints.intake}?status=all&limit=200`);
  state.inbox = response.items || [];
  return state.inbox;
}

export async function loadOverview() {
  setText('overviewStatus', 'Loading current obligations…');
  const [payablesResult, inboxResult, savingsResult] = await Promise.allSettled([
    loadPayableSources({ force: true }),
    fetchInbox(),
    request(API.endpoints.optimization),
  ]);

  if (savingsResult.status === 'fulfilled') {
    state.subscriptions = savingsResult.value.subscriptions || [];
    state.opportunities = savingsResult.value.opportunities || [];
    state.optimizationRuns = savingsResult.value.runs || [];
  }

  const summary = payableSummary();
  const inboxNeeds = state.inbox.filter((item) => item.review_status === 'needs_review').length;
  const openSavings = state.opportunities.filter((item) => ['proposed', 'accepted', 'in_progress'].includes(item.status));
  const annualSavings = openSavings.reduce((sum, item) => sum + (Number(item.estimated_annual_savings_cents) || 0), 0);

  setText('overviewAttention', String(summary.reviewCount + inboxNeeds));
  setText('overviewAuthorized', money(summary.authorizedCents));
  setText('overviewExpected', money(summary.totalCents));
  setText('overviewSavings', money(annualSavings));
  setText('overviewSources', sourceSummaryText());

  const priorityRows = [
    ...state.inbox
      .filter((item) => item.review_status === 'needs_review')
      .map((item) => ({
        key: `inbox:${item.id}`,
        source: 'inbox',
        name: item.candidate_payee || item.subject || 'Unidentified Inbox item',
        clinic: 'Not coded',
        category: 'Inbox',
        status: 'review',
        reviewRequired: true,
        approved: false,
        amountCents: Number(item.candidate_amount_cents) || 0,
      })),
    ...state.payables.filter((item) => item.reviewRequired || item.approved),
  ].sort((left, right) => {
    const score = (item) => item.source === 'inbox' ? 0 : item.reviewRequired && !item.approved ? 1 : item.approved ? 2 : 3;
    return score(left) - score(right) || right.amountCents - left.amountCents;
  }).slice(0, 12);

  $('overviewRows').innerHTML = priorityRows.map((item) => `
    <tr>
      <td><div class="payee">${esc(item.name)}</div><div class="source-label">${item.source === 'inbox' ? 'Inbox' : item.source === 'current_payables' ? 'Current monthly list' : 'Finance'}</div></td>
      <td><div>${esc(item.clinic || 'Unassigned')}</div><div class="meta">${esc(item.category || 'Unclassified')}</div></td>
      <td><span class="pill ${pillClass(item)}">${esc(stateLabel(item))}</span></td>
      <td class="num">${money(item.amountCents)}</td>
      <td><button class="smallbtn overview-open" type="button" data-go="${item.source === 'inbox' ? 'inbox' : item.approved ? 'payments' : 'payables'}">Open</button></td>
    </tr>`).join('');
  $('overviewEmpty').hidden = priorityRows.length > 0;

  const unavailable = [
    payablesResult.status === 'rejected' ? 'payable sources' : null,
    inboxResult.status === 'rejected' ? 'Inbox' : null,
    savingsResult.status === 'rejected' ? 'savings review' : null,
  ].filter(Boolean);
  setText('overviewStatus', unavailable.length ? `Loaded with ${unavailable.join(', ')} temporarily unavailable.` : `Current through ${monthLabel(state.month)}.`);
}

export async function loadInbox() {
  setText('inboxStatus', 'Loading…');
  try {
    await fetchInbox();
    setText('inboxNeeds', state.inbox.filter((item) => item.review_status === 'needs_review').length);
    setText('inboxDup', state.inbox.filter((item) => item.review_status === 'duplicate').length);
    setText('inboxPromoted', state.inbox.filter((item) => item.review_status === 'promoted').length);
    setText('inboxTotal', state.inbox.length);
    $('inboxRows').innerHTML = state.inbox.map((item) => `
      <tr data-id="${esc(item.id)}">
        <td><div class="payee">${esc(item.candidate_payee || item.subject || 'Unidentified item')}</div><div class="meta">${esc(pretty(item.source_type))}${item.candidate_invoice_number ? ` · ${esc(item.candidate_invoice_number)}` : ''}</div></td>
        <td>${esc(formatDate(item.candidate_due_date))}</td>
        <td class="num">${item.candidate_amount_cents == null ? '—' : money(item.candidate_amount_cents)}</td>
        <td><span class="pill ${item.review_status === 'duplicate' ? 'bad' : item.review_status === 'promoted' ? 'good' : 'warn'}">${esc(pretty(item.review_status))}</span></td>
        <td><div class="actions">${['needs_review', 'ready'].includes(item.review_status) ? '<button class="smallbtn inbox-promote" type="button">Move to Payables</button><button class="smallbtn inbox-reject" type="button">Reject</button>' : item.review_status === 'duplicate' ? '<span class="meta">Review duplicate source</span>' : '—'}</div></td>
      </tr>`).join('');
    $('inboxEmpty').hidden = state.inbox.length > 0;
    setText('inboxStatus', `${state.inbox.length} item(s).`);
  } catch (error) {
    setText('inboxStatus', `Inbox unavailable: ${error.detail || error.code || 'connection error'}.`);
  }
}

function filteredPayables() {
  const query = String($('payablesSearch').value || '').trim().toLowerCase();
  const filter = $('payablesFilter').value;
  return state.payables.filter((item) => {
    const textMatch = !query || `${item.name} ${item.clinic} ${item.category}`.toLowerCase().includes(query);
    if (!textMatch) return false;
    if (filter === 'all') return true;
    if (filter === 'review') return item.reviewRequired && !item.approved;
    if (filter === 'authorized') return item.approved;
    if (filter === 'ready') return !item.approved && !item.reviewRequired;
    return item.kind === filter;
  });
}

export function renderPayables() {
  const rows = filteredPayables();
  const summary = payableSummary();
  setText('payableCount', summary.count);
  setText('payableReview', summary.reviewCount);
  setText('payableAuthorized', money(summary.authorizedCents));
  setText('payableTotal', money(summary.totalCents));

  $('payableRows').innerHTML = rows.map((item) => `
    <tr data-key="${esc(item.key)}" data-source="${esc(item.source)}" data-id="${esc(item.id)}">
      <td><input class="checkbox payable-check" type="checkbox" ${item.approved ? 'checked' : ''} aria-label="Authorize ${esc(item.name)}"></td>
      <td><div class="payee">${esc(item.name)}</div><div class="meta">${esc(item.invoiceNumber || item.description || item.sourceDescription || '')}</div></td>
      <td><div>${esc(item.clinic || 'Unassigned')}</div><div class="meta">${esc(item.category || 'Unclassified')}</div></td>
      <td>${esc(pretty(item.kind))}</td>
      <td class="num">${money(item.amountCents)}</td>
      <td><span class="pill ${pillClass(item)}">${esc(stateLabel(item))}</span></td>
      <td><div>${esc(item.howPaid || 'Not recorded')}</div><div class="source-label">${item.source === 'current_payables' ? 'Current list' : 'Finance'}</div></td>
    </tr>`).join('');
  $('payablesEmpty').hidden = rows.length > 0;
  setText('payablesStatus', `${rows.length} shown. ${sourceSummaryText()}`);
}

export async function loadPayables() {
  setText('payablesStatus', 'Loading…');
  state.month = $('payablesMonth').value || state.month;
  try {
    await loadPayableSources({ force: true });
    renderPayables();
  } catch (error) {
    setText('payablesStatus', `Could not load payable sources: ${error.detail || error.code || 'connection error'}.`);
  }
}

function withinHorizon(item, days) {
  if (!item.dueDate) return true;
  const due = new Date(`${item.dueDate}T12:00:00`);
  const end = new Date();
  end.setDate(end.getDate() + days);
  return due <= end;
}

export async function loadCash() {
  setText('cashStatus', 'Loading…');
  const days = Number($('cashDays').value) || 30;
  const [payablesResult, reportingResult] = await Promise.allSettled([
    loadPayableSources({ force: true }),
    request(`${API.endpoints.reporting}?report=cash&days=${days}`),
  ]);

  if (reportingResult.status === 'fulfilled') state.cash = reportingResult.value;
  const rows = state.payables.filter((item) => withinHorizon(item, days));
  const summary = payableSummary(rows);
  const cashLinked = Boolean(state.cash?.cashAccounts?.length);
  setText('cashOnHand', cashLinked ? money(state.cash.cashOnHandCents) : 'Not linked');
  setText('cashReview', money(summary.reviewCents));
  setText('cashAuthorized', money(summary.authorizedCents));
  setText('cashRequired', money(summary.totalCents));

  $('cashRows').innerHTML = rows.map((item) => `
    <tr><td>${esc(item.dueDate ? formatDate(item.dueDate) : monthLabel(state.month))}</td><td>${esc(item.name)}</td><td>${esc(item.clinic || 'Unassigned')}</td><td><span class="pill ${pillClass(item)}">${esc(stateLabel(item))}</span></td><td class="num">${money(item.amountCents)}</td></tr>`).join('');
  $('forecastRows').innerHTML = (state.cash?.forecastItems || []).map((item) => `
    <tr><td>${esc(formatDate(item.forecast_date))}</td><td>${esc(item.label)}</td><td class="num">${item.direction === 'inflow' ? '+' : '−'}${money(item.amount_cents)}</td></tr>`).join('');

  const unavailable = [
    payablesResult.status === 'rejected' ? 'payables' : null,
    reportingResult.status === 'rejected' ? 'cash assumptions' : null,
  ].filter(Boolean);
  setText('cashStatus', unavailable.length ? `Loaded with ${unavailable.join(' and ')} temporarily unavailable.` : `Showing ${days}-day planning view. Cash balance ${cashLinked ? 'connected' : 'not yet connected'}.`);
}

export function bindPrimary() {
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-go]');
    if (target) navigate(target.dataset.go);
  });

  $('overviewRefresh').addEventListener('click', loadOverview);
  $('inboxRefresh').addEventListener('click', loadInbox);
  $('payablesRefresh').addEventListener('click', loadPayables);
  $('payablesMonth').addEventListener('change', loadPayables);
  $('payablesSearch').addEventListener('input', renderPayables);
  $('payablesFilter').addEventListener('change', renderPayables);
  $('cashDays').addEventListener('change', loadCash);
  $('cashRefresh').addEventListener('click', loadCash);

  $('inboxAddForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button');
    button.disabled = true;
    setText('inboxAddStatus', 'Adding…');
    try {
      await request(API.endpoints.intake, 'POST', {
        action: 'add',
        item: {
          sourceType: 'manual', payee: $('inboxPayee').value, amount: $('inboxAmount').value,
          dueDate: $('inboxDue').value, invoiceNumber: $('inboxInvoice').value,
          note: $('inboxNote').value,
        },
      });
      event.target.reset();
      setText('inboxAddStatus', 'Added to Inbox.');
      await loadInbox();
    } catch (error) {
      setText('inboxAddStatus', `Could not add item: ${error.detail || error.code || 'connection error'}.`);
    } finally {
      button.disabled = false;
    }
  });

  $('inboxRows').addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const id = button.closest('tr')?.dataset.id;
    if (!id) return;
    button.disabled = true;
    try {
      if (button.classList.contains('inbox-promote')) await request(API.endpoints.intake, 'POST', { action: 'promote', id, fields: {} });
      if (button.classList.contains('inbox-reject')) await request(API.endpoints.intake, 'POST', { action: 'reject', id });
      await Promise.all([loadInbox(), loadPayables()]);
    } catch (error) {
      setText('inboxStatus', error.code === 'duplicate_requires_resolution' ? 'Resolve the duplicate before moving it to Payables.' : `Action failed: ${error.detail || error.code || 'connection error'}.`);
    } finally {
      button.disabled = false;
    }
  });

  $('payableRows').addEventListener('change', async (event) => {
    const checkbox = event.target.closest('.payable-check');
    if (!checkbox) return;
    const row = checkbox.closest('tr');
    const item = state.payables.find((candidate) => candidate.key === row.dataset.key);
    if (!item) return;
    checkbox.disabled = true;
    try {
      if (item.source === 'current_payables') {
        await request(API.endpoints.currentPayables, 'POST', {
          action: 'set-authorization', id: item.id, month: state.month,
          authorized: checkbox.checked, amount: item.amountCents / 100,
        });
      } else if (checkbox.checked) {
        await request(API.endpoints.payables, 'POST', { action: 'authorize', id: item.id, amount: item.amountCents / 100 });
      } else {
        await request(API.endpoints.payables, 'POST', { action: 'revoke-authorization', id: item.id });
      }
      await loadPayables();
    } catch (error) {
      checkbox.checked = !checkbox.checked;
      setText('payablesStatus', `Authorization was not changed: ${error.detail || error.code || 'connection error'}.`);
    } finally {
      checkbox.disabled = false;
    }
  });

  $('forecastForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button');
    button.disabled = true;
    try {
      await request(API.endpoints.reporting, 'POST', {
        action: 'add-forecast',
        item: { direction: $('forecastDirection').value, date: $('forecastDate').value, amount: $('forecastAmount').value, label: $('forecastLabel').value },
      });
      event.target.reset();
      setText('forecastStatus', 'Planning assumption added.');
      await loadCash();
    } catch (error) {
      setText('forecastStatus', `Could not add assumption: ${error.detail || error.code || 'connection error'}.`);
    } finally {
      button.disabled = false;
    }
  });
}
