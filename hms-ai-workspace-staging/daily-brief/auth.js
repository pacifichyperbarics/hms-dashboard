(() => {
  function createClient(config) {
    if (!config?.supabaseUrl || !config?.publishableKey || !window.supabase) return null;
    return window.supabase.createClient(config.supabaseUrl, config.publishableKey);
  }

  function signInStatus(error) {
    if (!error) return 'Sign-in link sent. Open the email on this device to continue.';
    if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
      return 'Too many sign-in links were requested. Please wait before requesting another.';
    }
    return 'Sign-in could not be sent. Please verify the address or try again later.';
  }

  function showSignIn({ client, container, sessionState, message = 'Sign-in required', hide = [] }) {
    sessionState.textContent = message;
    for (const element of hide) element.hidden = true;
    container.hidden = false;
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
    submit.textContent = 'Email sign-in link';
    const status = document.createElement('p');
    status.className = 'muted';
    status.setAttribute('aria-live', 'polite');

    row.append(input, submit);
    form.append(label, row, status);
    container.append(heading, explanation, form);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = input.value.trim().toLowerCase();
      if (!email || !client) return;
      submit.disabled = true;
      status.textContent = 'Requesting sign-in link…';
      const { error } = await client.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: window.location.href.split('#')[0],
        },
      });
      submit.disabled = false;
      status.textContent = signInStatus(error);
    });
  }

  window.HMSAuth = { createClient, showSignIn };
})();
