(() => {
  const API = window.HMSConnectivityAPI;
  const state = {
    device: null,
    accounts: [],
    revealed: new Map(),
    revealTimers: new Map(),
  };

  const $ = (id) => document.getElementById(id);
  const categoryLabels = {
    email: 'Email',
    text: 'Text',
    whatsapp: 'WhatsApp',
    ai: 'AI platform',
    saas: 'SaaS app',
    other: 'Other',
  };
  const statusLabels = {
    connected: 'Connected',
    needs_details: 'Needs details',
    needs_verification: 'Needs verification',
    disabled: 'Disabled',
  };
  const authLabels = {
    password: 'Password',
    google_sso: 'Google sign-in',
    microsoft_sso: 'Microsoft sign-in',
    apple_sso: 'Apple sign-in',
    phone_code: 'Phone code',
    oauth: 'OAuth',
    api_key: 'API key',
    passkey: 'Passkey',
    none: 'No password',
    unknown: 'Access not recorded',
  };

  function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
  }

  function formatDate(value) {
    if (!value) return 'Not verified';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not verified';
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function showLogin(message = '') {
    $('workspace').hidden = true;
    $('logout').hidden = true;
    $('loginPanel').hidden = false;
    setText('deviceState', 'Access required');
    setText('loginStatus', message);
  }

  function showWorkspace() {
    $('loginPanel').hidden = true;
    $('workspace').hidden = false;
    $('logout').hidden = false;
    setText('deviceState', `${state.device?.displayName || 'Authorized browser'}${state.device?.isAdmin ? ' · Administrator' : ' · View only'}`);
    $('addAccount').hidden = !state.device?.isAdmin;
  }

  function visibleAccounts() {
    const query = $('search').value.trim().toLowerCase();
    const category = $('categoryFilter').value;
    const status = $('statusFilter').value;
    return state.accounts.filter((account) => {
      if (category !== 'all' && account.category !== category) return false;
      if (status !== 'all' && account.status !== status) return false;
      if (!query) return true;
      return [account.serviceName, account.loginId, account.ownerLabel, account.notes, categoryLabels[account.category]]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }

  function button(label, className, handler) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.className = className;
    element.addEventListener('click', handler);
    return element;
  }

  function renderSecret(account, container) {
    const value = document.createElement('span');
    value.className = 'secret-value';
    const revealed = state.revealed.get(account.id);
    if (revealed !== undefined) value.textContent = revealed;
    else if (account.secretPresent) value.textContent = '********';
    else value.textContent = authLabels[account.authMethod] || 'Not stored';
    container.appendChild(value);

    if (!state.device?.isAdmin || !account.secretPresent) return;
    const revealButton = button(revealed !== undefined ? 'Hide' : 'Reveal', 'mini-button', async () => {
      if (state.revealed.has(account.id)) {
        hideSecret(account.id);
        render();
        return;
      }
      revealButton.disabled = true;
      revealButton.textContent = 'Opening';
      try {
        const result = await API.reveal(account.id);
        state.revealed.set(account.id, result.secret);
        clearTimeout(state.revealTimers.get(account.id));
        state.revealTimers.set(account.id, setTimeout(() => {
          hideSecret(account.id);
          render();
        }, 30000));
        render();
      } catch (error) {
        alert(error.code === 'credential_not_stored' ? 'No password is stored for this account.' : 'The password could not be revealed.');
        revealButton.disabled = false;
        revealButton.textContent = 'Reveal';
      }
    });
    container.appendChild(revealButton);

    if (revealed !== undefined && navigator.clipboard) {
      container.appendChild(button('Copy', 'mini-button', async () => {
        await navigator.clipboard.writeText(revealed);
      }));
    }
  }

  function hideSecret(id) {
    state.revealed.delete(id);
    clearTimeout(state.revealTimers.get(id));
    state.revealTimers.delete(id);
  }

  function renderMetrics() {
    setText('metricTotal', state.accounts.length);
    setText('metricConnected', state.accounts.filter((item) => item.status === 'connected').length);
    setText('metricSecrets', state.accounts.filter((item) => item.secretPresent).length);
    setText('metricIncomplete', state.accounts.filter((item) => ['needs_details', 'needs_verification'].includes(item.status)).length);
  }

  function render() {
    renderMetrics();
    const rows = $('accountRows');
    rows.innerHTML = '';
    const accounts = visibleAccounts();
    $('emptyState').hidden = accounts.length > 0;

    for (const account of accounts) {
      const tr = document.createElement('tr');

      const service = document.createElement('td');
      service.className = 'service-cell';
      const serviceName = document.createElement('strong');
      serviceName.textContent = account.serviceName;
      service.appendChild(serviceName);
      if (account.loginUrl) {
        const link = document.createElement('a');
        link.href = account.loginUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Open login';
        service.appendChild(link);
      }

      const category = document.createElement('td');
      const categoryPill = document.createElement('span');
      categoryPill.className = 'category-pill';
      categoryPill.textContent = categoryLabels[account.category] || account.category;
      category.appendChild(categoryPill);

      const login = document.createElement('td');
      login.className = 'login-value';
      login.textContent = account.loginId || 'Not recorded';
      if (!account.loginId) login.classList.add('muted');

      const secret = document.createElement('td');
      const secretLine = document.createElement('div');
      secretLine.className = 'secret-line';
      renderSecret(account, secretLine);
      secret.appendChild(secretLine);
      if (account.passwordHint) {
        const hint = document.createElement('div');
        hint.className = 'muted';
        hint.textContent = account.passwordHint;
        secret.appendChild(hint);
      }

      const status = document.createElement('td');
      const statusPill = document.createElement('span');
      statusPill.className = `status-pill status-${account.status}`;
      statusPill.textContent = statusLabels[account.status] || account.status;
      status.appendChild(statusPill);

      const verified = document.createElement('td');
      verified.textContent = formatDate(account.lastVerifiedAt);
      if (!account.lastVerifiedAt) verified.className = 'muted';

      const actions = document.createElement('td');
      actions.className = 'actions';
      if (state.device?.isAdmin) {
        actions.appendChild(button('Verify', 'mini-button', async () => {
          try {
            const result = await API.verify(account.id);
            replaceAccount(result.account);
            render();
          } catch {
            alert('The account could not be marked verified.');
          }
        }));
        actions.appendChild(button('Edit', 'mini-button', () => openDialog(account)));
      }

      tr.append(service, category, login, secret, status, verified, actions);
      rows.appendChild(tr);
    }
  }

  function replaceAccount(account) {
    const index = state.accounts.findIndex((item) => item.id === account.id);
    if (index >= 0) state.accounts[index] = account;
    else state.accounts.push(account);
    state.accounts.sort((left, right) => left.category.localeCompare(right.category) || left.sortOrder - right.sortOrder || left.serviceName.localeCompare(right.serviceName));
  }

  function resetForm() {
    $('accountForm').reset();
    $('accountId').value = '';
    $('category').value = 'saas';
    $('status').value = 'needs_details';
    $('authMethod').value = 'unknown';
    $('archiveAccount').hidden = true;
    $('secret').placeholder = 'Enter a password or leave blank';
    setText('formStatus', '');
  }

  function openDialog(account = null) {
    resetForm();
    setText('dialogTitle', account ? 'Edit account' : 'Add account');
    if (account) {
      $('accountId').value = account.id;
      $('serviceName').value = account.serviceName || '';
      $('category').value = account.category || 'saas';
      $('status').value = account.status || 'needs_details';
      $('loginId').value = account.loginId || '';
      $('ownerLabel').value = account.ownerLabel || '';
      $('loginUrl').value = account.loginUrl || '';
      $('authMethod').value = account.authMethod || 'unknown';
      $('passwordHint').value = account.passwordHint || '';
      $('notes').value = account.notes || '';
      $('secret').placeholder = account.secretPresent ? 'Leave blank to keep stored password' : 'Enter password or secret';
      $('archiveAccount').hidden = false;
    }
    $('accountDialog').showModal();
    $('serviceName').focus();
  }

  function closeDialog() {
    $('accountDialog').close();
  }

  async function loadAccounts() {
    const result = await API.list();
    state.device = result.device;
    state.accounts = result.accounts || [];
    showWorkspace();
    setText('lastChecked', `Updated ${new Date(result.checkedAt).toLocaleString()}`);
    render();
  }

  function bind() {
    $('loginForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = event.target.querySelector('button[type="submit"]');
      submit.disabled = true;
      setText('loginStatus', 'Checking access');
      try {
        state.device = await API.login($('password').value);
        $('password').value = '';
        setText('loginStatus', '');
        await loadAccounts();
      } catch (error) {
        setText('loginStatus', error.code === 'invalid_password' ? 'Incorrect password.' : error.code === 'device_blocked' ? 'This browser has been blocked.' : 'Access is unavailable.');
      } finally {
        submit.disabled = false;
      }
    });

    $('logout').addEventListener('click', async () => {
      await API.logout();
      location.reload();
    });

    $('search').addEventListener('input', render);
    $('categoryFilter').addEventListener('change', render);
    $('statusFilter').addEventListener('change', render);
    $('addAccount').addEventListener('click', () => openDialog());
    $('closeDialog').addEventListener('click', closeDialog);
    $('cancelDialog').addEventListener('click', closeDialog);

    $('accountForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const save = $('saveAccount');
      save.disabled = true;
      setText('formStatus', 'Saving');
      try {
        const result = await API.save({
          id: $('accountId').value || undefined,
          serviceName: $('serviceName').value,
          category: $('category').value,
          status: $('status').value,
          loginId: $('loginId').value,
          ownerLabel: $('ownerLabel').value,
          loginUrl: $('loginUrl').value,
          authMethod: $('authMethod').value,
          secret: $('secret').value,
          passwordHint: $('passwordHint').value,
          notes: $('notes').value,
          markVerified: $('markVerified').checked,
          clearSecret: $('clearSecret').checked,
        });
        replaceAccount(result.account);
        closeDialog();
        render();
      } catch (error) {
        const messages = {
          duplicate_account: 'That service and login ID already exist.',
          invalid_login_url: 'Enter a complete web address beginning with http or https.',
          service_name_required: 'Service name is required.',
        };
        setText('formStatus', messages[error.code] || 'The account could not be saved.');
      } finally {
        save.disabled = false;
      }
    });

    $('archiveAccount').addEventListener('click', async () => {
      const id = $('accountId').value;
      const account = state.accounts.find((item) => item.id === id);
      if (!id || !account) return;
      if (!confirm(`Remove ${account.serviceName} from the directory?`)) return;
      $('archiveAccount').disabled = true;
      try {
        await API.archive(id);
        hideSecret(id);
        state.accounts = state.accounts.filter((item) => item.id !== id);
        closeDialog();
        render();
      } catch {
        setText('formStatus', 'The account could not be removed.');
      } finally {
        $('archiveAccount').disabled = false;
      }
    });
  }

  async function init() {
    bind();
    state.device = await API.validate();
    if (!state.device) {
      showLogin();
      return;
    }
    try {
      await loadAccounts();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        API.clearSession();
        showLogin(error.code === 'admin_device_required' ? 'This browser needs administrator approval before it can open the credential directory.' : 'Please enter the HMS access password again.');
      } else {
        showLogin('The account directory is temporarily unavailable.');
      }
    }
  }

  init().catch((error) => {
    console.error('Connectivity tool failed to initialize', error);
    showLogin('The tool could not initialize. Refresh to retry.');
  });
})();
