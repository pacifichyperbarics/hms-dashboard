import {
  API, $, esc, formatDate, loadPayableSources, money,
  pretty, request, setText, state,
} from './app-core.js';

export async function loadPayments() {
  const [payablesResult, paymentsResult] = await Promise.allSettled([
    loadPayableSources({ force: true }),
    request(API.endpoints.payments),
  ]);

  if (paymentsResult.status === 'fulfilled') {
    const response = paymentsResult.value;
    state.payments = response.payments || [];
    state.matches = response.matches || [];
    state.adapters = response.adapters || [];
    state.bankTransactions = response.bankTransactions || [];
  }

  const ready = state.payables.filter((item) => item.source === 'finance' && item.approved && item.status === 'authorized');
  setText('paymentReadyCount', ready.length);
  setText('paymentCount', state.payments.length);
  setText('bankUnmatched', state.bankTransactions.filter((item) => item.match_status === 'unmatched').length);
  setText('matchSuggested', state.matches.filter((item) => item.status === 'suggested').length);

  $('paymentReadyRows').innerHTML = ready.map((item) => `
    <tr data-id="${esc(item.id)}"><td>${esc(item.name)}</td><td>${esc(formatDate(item.dueDate))}</td><td class="num">${money(item.approvedAmountCents)}</td><td><select class="payment-adapter">${state.adapters.map((adapter) => `<option value="${esc(adapter.adapter_key)}">${esc(adapter.label)}</option>`).join('')}</select></td><td><button class="smallbtn payment-intent" type="button">Prepare record</button></td></tr>`).join('');
  $('paymentReadyEmpty').hidden = ready.length > 0;

  $('paymentRows').innerHTML = state.payments.map((payment) => {
    const payable = Array.isArray(payment.hms_finance_payables) ? payment.hms_finance_payables[0] : payment.hms_finance_payables;
    return `<tr data-id="${esc(payment.id)}"><td>${esc(payable?.payee_name || '—')}</td><td><span class="pill ${payment.status === 'succeeded' ? 'good' : payment.status === 'failed' ? 'bad' : 'warn'}">${esc(pretty(payment.status))}</span></td><td>${esc(pretty(payment.method))}</td><td class="num">${money(payment.amount_cents)}</td><td>${['queued', 'scheduled', 'initiated'].includes(payment.status) ? '<button class="smallbtn confirm-external" type="button">Confirm paid externally</button>' : '—'}</td></tr>`;
  }).join('');

  $('matchRows').innerHTML = state.matches.map((match) => {
    const bank = Array.isArray(match.hms_finance_bank_transactions) ? match.hms_finance_bank_transactions[0] : match.hms_finance_bank_transactions;
    const payable = Array.isArray(match.hms_finance_payables) ? match.hms_finance_payables[0] : match.hms_finance_payables;
    return `<tr data-id="${esc(match.id)}"><td><div>${esc(bank?.description || 'Bank transaction')}</div><div class="meta">${esc(formatDate(bank?.posted_date || bank?.transaction_date))} · ${bank ? money(Math.abs(bank.amount_cents)) : ''}</div></td><td>${esc(payable?.payee_name || '—')}</td><td>${Math.round(Number(match.confidence || 0) * 100)}%</td><td>${match.status === 'suggested' ? '<button class="smallbtn match-confirm" type="button">Confirm</button> <button class="smallbtn match-reject" type="button">Reject</button>' : 'Confirmed'}</td></tr>`;
  }).join('');

  if (paymentsResult.status === 'rejected') setText('paymentCount', '—');
  if (payablesResult.status === 'rejected' && paymentsResult.status === 'rejected') setText('paymentReadyCount', '—');
}

export async function loadSavings() {
  setText('savingsStatus', 'Loading…');
  try {
    const response = await request(API.endpoints.optimization);
    state.subscriptions = response.subscriptions || [];
    state.opportunities = response.opportunities || [];
    state.optimizationRuns = response.runs || [];
    const open = state.opportunities.filter((item) => ['proposed', 'accepted', 'in_progress'].includes(item.status));
    setText('subscriptionCount', state.subscriptions.length);
    setText('opportunityCount', open.length);
    setText('potentialSavings', money(response.activeEstimatedAnnualSavingsCents));
    setText('lastScan', state.optimizationRuns[0]?.completed_at ? formatDate(state.optimizationRuns[0].completed_at) : 'Never');
    $('opportunityCards').innerHTML = open.length ? open.map((item) => `
      <div class="rule-card" data-id="${esc(item.id)}"><div class="rule-head"><div><strong>${esc(item.title)}</strong><div class="meta">${esc(item.rationale || '')}</div></div><div class="savings-amount">${money(item.estimated_annual_savings_cents)}/yr</div></div><div class="meta spaced">Confidence: ${esc(item.confidence)} · status: ${esc(pretty(item.status))}</div><div class="actions spaced">${item.status === 'proposed' ? '<button class="smallbtn opp-accept" type="button">Accept for action</button>' : ''}<button class="smallbtn opp-dismiss" type="button">Dismiss</button>${['accepted', 'in_progress'].includes(item.status) ? '<button class="smallbtn opp-realized" type="button">Mark realized</button>' : ''}</div></div>`).join('') : '<div class="empty">No open savings opportunities. Add subscriptions or run a scan.</div>';
    setText('savingsStatus', `${state.subscriptions.length} subscription(s) tracked.`);
  } catch (error) {
    setText('savingsStatus', `Savings review unavailable: ${error.detail || error.code || 'connection error'}.`);
  }
}

export async function loadReports() {
  const month = $('pnlMonth').value;
  setText('pnlStatus', 'Loading…');
  try {
    const response = await request(`${API.endpoints.reporting}?report=pnl&month=${encodeURIComponent(month)}`);
    const accounts = Object.entries(response.byAccount || {});
    const clinics = Object.entries(response.byClinic || {});
    setText('pnlLineCount', (response.lines || []).length);
    setText('pnlAccountCount', accounts.length);
    setText('pnlClinicCount', clinics.length);
    setText('pnlTotal', money(response.totalPnlCents));
    $('pnlAccountRows').innerHTML = accounts.map(([name, amount]) => `<tr><td>${esc(name)}</td><td class="num">${money(amount)}</td></tr>`).join('');
    $('pnlClinicRows').innerHTML = clinics.map(([name, amount]) => `<tr><td>${esc(name)}</td><td class="num">${money(amount)}</td></tr>`).join('');
    setText('pnlStatus', (response.lines || []).length ? 'Posted journal activity loaded.' : 'No posted journal activity for this month yet.');
  } catch (error) {
    setText('pnlStatus', `P&L unavailable: ${error.detail || error.code || 'connection error'}.`);
  }
}

function renderRules() {
  $('ruleCards').innerHTML = state.rules.length ? state.rules.map((rule) => {
    const vendorRecipes = state.recipes.filter((recipe) => recipe.vendor_id === rule.vendor_id);
    const selectedRecipe = state.recipes.find((recipe) => recipe.id === rule.payment_recipe_id);
    return `<div class="rule-card" data-id="${esc(rule.id)}"><div class="rule-head"><div><strong>${esc(rule.name)}</strong><div class="meta">${esc(pretty(rule.payable_kind))} · expected ${money(rule.expected_amount_cents)}</div></div><span class="pill ${rule.authorization_mode === 'automatic' ? 'good' : 'blue'}">${esc(rule.authorization_mode)}</span></div><div class="row3 spaced"><div class="field"><label>Authorization</label><select class="rule-mode"><option value="manual" ${rule.authorization_mode === 'manual' ? 'selected' : ''}>Manual</option><option value="automatic" ${rule.authorization_mode === 'automatic' ? 'selected' : ''}>Automatic</option></select></div><div class="field"><label>Maximum automatic amount</label><input class="rule-max" type="number" min="0" step="0.01" value="${rule.max_auto_amount_cents == null ? '' : Number(rule.max_auto_amount_cents) / 100}"></div><div class="field"><label>Amount tolerance %</label><input class="rule-tol" type="number" min="0" step="0.1" value="${Number(rule.tolerance_percent) || 0}"></div></div><div class="field"><label>Verified payment recipe</label><select class="rule-recipe"><option value="">None</option>${vendorRecipes.map((recipe) => `<option value="${esc(recipe.id)}" ${recipe.id === rule.payment_recipe_id ? 'selected' : ''}>${esc(recipe.label)} (${esc(recipe.status)})</option>`).join('')}</select></div><div class="actions"><button class="smallbtn rule-save" type="button">Save rule</button>${selectedRecipe?.status === 'review' ? `<button class="smallbtn recipe-activate" type="button" data-recipe="${esc(selectedRecipe.id)}">Verify and activate recipe</button>` : ''}</div></div>`;
  }).join('') : '<div class="empty">No recurring Finance rules yet. Current monthly-list rules will appear here after the controlled data copy.</div>';

  $('recipeRule').innerHTML = '<option value="">Choose recurring payable</option>' + state.rules
    .filter((rule) => rule.vendor_id)
    .map((rule) => `<option value="${esc(rule.id)}">${esc(rule.name)}</option>`).join('');
}

export async function loadSettings() {
  try {
    await loadPayableSources({ force: true });
    renderRules();
  } catch {
    $('ruleCards').innerHTML = '<div class="empty error-text">Payment rules could not be loaded.</div>';
  }
}

export function bindSecondary() {
  $('pnlRefresh').addEventListener('click', loadReports);
  $('pnlMonth').addEventListener('change', loadReports);
  $('runSavingsScan').addEventListener('click', async () => {
    const button = $('runSavingsScan');
    button.disabled = true;
    setText('savingsStatus', 'Scanning recurring costs…');
    try {
      await request(API.endpoints.optimization, 'POST', { action: 'scan' });
      await loadSavings();
    } catch (error) {
      setText('savingsStatus', `Scan failed: ${error.detail || error.code || 'connection error'}.`);
    } finally {
      button.disabled = false;
    }
  });

  $('subscriptionForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button');
    button.disabled = true;
    try {
      await request(API.endpoints.optimization, 'POST', {
        action: 'add-subscription',
        subscription: {
          serviceName: $('subName').value,
          amount: $('subAmount').value,
          frequency: $('subFrequency').value,
          renewalDate: $('subRenewal').value,
          seatsPurchased: $('subSeats').value,
          seatsUsed: $('subUsed').value,
          annualPrice: $('subAnnual').value,
        },
      });
      event.target.reset();
      setText('subscriptionStatus', 'Subscription saved.');
      await loadSavings();
    } catch (error) {
      setText('subscriptionStatus', `Could not save subscription: ${error.detail || error.code || 'connection error'}.`);
    } finally {
      button.disabled = false;
    }
  });

  $('opportunityCards').addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const id = button.closest('.rule-card')?.dataset.id;
    if (!id) return;
    const status = button.classList.contains('opp-accept') ? 'accepted' : button.classList.contains('opp-realized') ? 'realized' : 'dismissed';
    button.disabled = true;
    try {
      await request(API.endpoints.optimization, 'POST', { action: 'set-opportunity-status', id, status });
      await loadSavings();
    } finally {
      button.disabled = false;
    }
  });

  $('paymentReadyRows').addEventListener('click', async (event) => {
    const button = event.target.closest('.payment-intent');
    if (!button) return;
    const row = button.closest('tr');
    const adapterKey = row.querySelector('.payment-adapter')?.value;
    button.disabled = true;
    try {
      await request(API.endpoints.payments, 'POST', { action: 'create-payment-intent', payableId: row.dataset.id, adapterKey });
      await loadPayments();
    } catch (error) {
      button.textContent = error.code === 'active_authorization_required' ? 'Authorization required' : 'Could not prepare';
    } finally {
      button.disabled = false;
    }
  });

  $('paymentRows').addEventListener('click', async (event) => {
    const button = event.target.closest('.confirm-external');
    if (!button) return;
    const reference = window.prompt('Optional external confirmation or reference number:', '') ?? '';
    button.disabled = true;
    try {
      await request(API.endpoints.payments, 'POST', { action: 'confirm-external-payment', paymentId: button.closest('tr').dataset.id, externalReference: reference });
      await loadPayments();
    } finally {
      button.disabled = false;
    }
  });

  $('matchRows').addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const id = button.closest('tr')?.dataset.id;
    if (!id) return;
    button.disabled = true;
    try {
      if (button.classList.contains('match-confirm')) await request(API.endpoints.payments, 'POST', { action: 'confirm-reconciliation', matchId: id });
      if (button.classList.contains('match-reject')) await request(API.endpoints.payments, 'POST', { action: 'reject-reconciliation', matchId: id });
      await loadPayments();
    } finally {
      button.disabled = false;
    }
  });

  $('ruleCards').addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.classList.contains('recipe-activate')) {
      button.disabled = true;
      try {
        await request(API.endpoints.payables, 'POST', { action: 'activate-recipe', id: button.dataset.recipe });
        await loadSettings();
      } finally {
        button.disabled = false;
      }
      return;
    }
    if (!button.classList.contains('rule-save')) return;
    const card = button.closest('.rule-card');
    button.disabled = true;
    try {
      await request(API.endpoints.payables, 'POST', {
        action: 'set-rule', id: card.dataset.id,
        fields: {
          authorizationMode: card.querySelector('.rule-mode').value,
          maxAutoAmount: card.querySelector('.rule-max').value || null,
          tolerancePercent: card.querySelector('.rule-tol').value,
          paymentRecipeId: card.querySelector('.rule-recipe').value || null,
          requireSameDestination: true,
        },
      });
      await loadSettings();
    } catch (error) {
      button.textContent = error.code === 'automatic_rule_requires_active_recipe_and_limit' ? 'Recipe and limit required' : 'Save failed';
    } finally {
      button.disabled = false;
    }
  });

  $('recipeForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button');
    const rule = state.rules.find((item) => item.id === $('recipeRule').value);
    if (!rule?.vendor_id) {
      setText('recipeStatus', 'Choose a recurring vendor payable.');
      return;
    }
    button.disabled = true;
    const destination = $('recipeDestination').value.trim();
    try {
      await request(API.endpoints.payables, 'POST', {
        action: 'add-recipe',
        recipe: {
          vendorId: rule.vendor_id,
          label: $('recipeLabel').value,
          method: $('recipeMethod').value,
          maskedDestination: destination,
          destinationFingerprint: destination.toLowerCase() || null,
          instructions: $('recipeInstructions').value,
        },
      });
      event.target.reset();
      setText('recipeStatus', 'Recipe saved for verification.');
      await loadSettings();
    } catch (error) {
      setText('recipeStatus', `Could not save recipe: ${error.detail || error.code || 'connection error'}.`);
    } finally {
      button.disabled = false;
    }
  });
}
