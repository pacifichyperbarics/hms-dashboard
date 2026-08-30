(() => {
  function createClient(config) {
    if (!config?.supabaseUrl || !config?.publishableKey || !window.supabase) return null;
    return window.supabase.createClient(config.supabaseUrl, config.publishableKey);
  }

  function requestStatus(error) {
    if (!error) return '';
    if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
      return 'Too many codes were requested. Please wait before requesting another.';
    }
    return 'The code could not be sent. Please verify the address or try again later.';
  }

  function verificationStatus(error) {
    if (error?.status === 429) return 'Too many attempts. Please wait and request a new code.';
    return 'That code is invalid or expired. Please check the newest email and try again.';
  }

  function addStatus(form) {
    const status = document.createElement('p');
    status.className = 'muted';
    status.setAttribute('aria-live', 'polite');
    form.appendChild(status);
    return status;
  }

  function showCodeEntry({ client, container, sessionState, email, reset }) {
    container.innerHTML = '';

    const heading = document.createElement('h2');
    heading.textContent = 'Enter email code';
    const explanation = document.createElement('p');
    explanation.textContent = `Enter the six-digit code sent to ${email}.`;
    const form = document.createElement('form');
    form.className = 'login-form';
    const label = document.createElement('label');
    label.htmlFor = 'login-code';
    label.textContent = 'Six-digit code';
    const row = document.createElement('div');
    row.className = 'login-row';
    const input = document.createElement('input');
    input.id = 'login-code';
    input.name = 'code';
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'one-time-code';
    input.pattern = '[0-9]{6}';
    input.maxLength = 6;
    input.required = true;
    input.placeholder = '000000';
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Continue';
    const status = addStatus(form);
    const changeEmail = document.createElement('button');
    changeEmail.type = 'button';
    changeEmail.className = 'link-button';
    changeEmail.textContent = 'Use another email';

    row.append(input, submit);
    form.insertBefore(label, status);
    form.insertBefore(row, status);
    container.append(heading, explanation, form, changeEmail);
    input.focus();

    changeEmail.addEventListener('click', reset);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const token = input.value.replace(/\D/g, '');
      if (token.length !== 6) {
        status.textContent = 'Enter the complete six-digit code.';
        return;
      }
      submit.disabled = true;
      status.textContent = 'Checking code…';
      const { error } = await client.auth.verifyOtp({ email, token, type: 'email' });
      submit.disabled = false;
      if (error) {
        status.textContent = verificationStatus(error);
        input.select();
        return;
      }
      sessionState.textContent = 'Signed in';
      status.textContent = 'Signed in. Loading…';
    });
  }

  function showSignIn({ client, container, sessionState, message = 'Sign-in required', hide = [] }) {
    sessionState.textContent = message;
    for (const element of hide) element.hidden = true;
    container.hidden = false;
    container.innerHTML = '';

    const renderEmailForm = () => {
      container.innerHTML = '';
      const heading = document.createElement('h2');
      heading.textContent = 'HMS sign-in';
      const explanation = document.createElement('p');
      explanation.textContent = 'Enter your HMS email address.';
      const form = document.createElement('form');
      form.className = 'login-form';
      const label = document.createElement('label');
      label.htmlFor = 'login-email';
      label.textContent = 'Email';
      const row = document.createElement('div');
      row.className = 'login-row';
      const input = document.createElement('input');
      input.id = 'login-email';
      input.name = 'email';
      input.type = 'email';
      input.autocomplete = 'email';
      input.required = true;
      input.placeholder = 'hms@healtho2.com';
      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.textContent = 'Send code';
      const status = addStatus(form);

      row.append(input, submit);
      form.insertBefore(label, status);
      form.insertBefore(row, status);
      container.append(heading, explanation, form);

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = input.value.trim().toLowerCase();
        if (!email || !client) return;
        submit.disabled = true;
        status.textContent = 'Sending code…';
        const { error } = await client.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false },
        });
        submit.disabled = false;
        if (error) {
          status.textContent = requestStatus(error);
          return;
        }
        showCodeEntry({ client, container, sessionState, email, reset: renderEmailForm });
      });
    };

    renderEmailForm();
  }

  window.HMSAuth = { createClient, showSignIn };
})();
