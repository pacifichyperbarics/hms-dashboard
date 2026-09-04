export function byId(id) {
  return document.getElementById(id);
}

export function clear(element) {
  while (element?.firstChild) element.removeChild(element.firstChild);
}

export function node(tag, options = {}, children = []) {
  const element = document.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = String(options.text);
  if (options.id) element.id = options.id;
  if (options.type) element.type = options.type;
  if (options.href) element.href = options.href;
  if (options.target) element.target = options.target;
  if (options.rel) element.rel = options.rel;
  if (options.value !== undefined) element.value = options.value;
  if (options.checked !== undefined) element.checked = Boolean(options.checked);
  if (options.disabled !== undefined) element.disabled = Boolean(options.disabled);
  if (options.placeholder) element.placeholder = options.placeholder;
  if (options.name) element.name = options.name;
  if (options.maxLength) element.maxLength = options.maxLength;
  if (options.min !== undefined) element.min = options.min;
  if (options.step !== undefined) element.step = options.step;
  if (options.dataset) Object.assign(element.dataset, options.dataset);
  if (options.attributes) {
    for (const [name, value] of Object.entries(options.attributes)) {
      if (value !== null && value !== undefined) element.setAttribute(name, String(value));
    }
  }
  if (options.onClick) element.addEventListener('click', options.onClick);
  if (options.onChange) element.addEventListener('change', options.onChange);
  if (options.onInput) element.addEventListener('input', options.onInput);
  if (options.onSubmit) element.addEventListener('submit', options.onSubmit);
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}

export function money(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
    .format((Number(cents) || 0) / 100);
}

export function formatDate(value, fallback = 'Not provided') {
  if (!value) return fallback;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

export function statusPill(label, kind = 'neutral') {
  return node('span', { className: `pill ${kind}`, text: label });
}

export function card(label, value, detail = '', kind = '') {
  return node('div', { className: `metric-card ${kind}`.trim() }, [
    node('span', { className: 'metric-label', text: label }),
    node('strong', { className: 'metric-value', text: value }),
    detail ? node('small', { text: detail }) : null,
  ]);
}

export function panel(title, body, options = {}) {
  const headerChildren = [node('div', {}, [
    node('h2', { text: title }),
    options.subtitle ? node('p', { className: 'subtle', text: options.subtitle }) : null,
  ])];
  if (options.action) headerChildren.push(options.action);
  return node('section', { className: 'panel' }, [
    node('div', { className: 'panel-head' }, headerChildren),
    body,
  ]);
}

export function setGlobalStatus(message = '', kind = 'info') {
  const element = byId('globalStatus');
  if (!element) return;
  element.textContent = message;
  element.className = message ? `global-status ${kind}` : 'global-status';
  element.hidden = !message;
}

export function button(label, onClick, options = {}) {
  return node('button', {
    type: 'button',
    className: options.className || 'button',
    text: label,
    disabled: options.disabled,
    onClick,
  });
}

export function table(headers, rows) {
  const head = node('thead', {}, node('tr', {}, headers.map((header) => node('th', {
    text: header.label || header,
    className: header.className || '',
  }))));
  const body = node('tbody');
  for (const cells of rows) body.append(node('tr', {}, cells.map((cell) => node('td', {
    className: cell.className || '',
  }, cell.content))));
  return node('div', { className: 'table-wrap' }, node('table', {}, [head, body]));
}
