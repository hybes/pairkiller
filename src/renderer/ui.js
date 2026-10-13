'use strict';

// Small DOM toolkit shared by the views: element builder, icons and the handful of controls
// the app needs. Controls carry no platform logic; app.css gives them their macOS or Windows form.
window.ui = (() => {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const dot = (cx, cy, r = 0.7) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`;

    const ICONS = {
        rules: '<path d="M6.6 9.4 9.4 6.6"/><path d="M7.2 4.6 8.3 3.5a3 3 0 0 1 4.2 4.2L11.4 8.8"/><path d="M8.8 11.4 7.7 12.5a3 3 0 0 1-4.2-4.2L4.6 7.2"/>',
        activity: '<path d="M1.5 8.5h2.7l2-5 3.2 9 2-4h3.1"/>',
        settings: '<path d="M2 4.5h5.5M11.5 4.5H14M2 11.5h2.5M8.5 11.5H14"/><circle cx="9.5" cy="4.5" r="1.7"/><circle cx="6.5" cy="11.5" r="1.7"/>',
        plus: '<path d="M8 3v10M3 8h10"/>',
        chevronRight: '<path d="m6 3.5 4.5 4.5L6 12.5"/>',
        chevronLeft: '<path d="M10 3.5 5.5 8l4.5 4.5"/>',
        close: '<path d="m4 4 8 8M12 4l-8 8"/>',
        more: dot(3.5, 8, 1.1) + dot(8, 8, 1.1) + dot(12.5, 8, 1.1),
        pause: '<path d="M5.5 3.5v9M10.5 3.5v9"/>',
        play: '<path d="M5.2 3.4v9.2l7.3-4.6z"/>',
        search: '<circle cx="7" cy="7" r="4.3"/><path d="m10.3 10.3 3.2 3.2"/>',
        warning: `<path d="M8 2.3 14.2 13H1.8z"/><path d="M8 6.4v3.3"/>${dot(8, 11.3)}`,
        app: '<rect x="2.5" y="2.5" width="11" height="11" rx="2.8"/><path d="M2.5 6.2h11"/>' + dot(4.6, 4.4, 0.55) + dot(6.4, 4.4, 0.55),
        check: '<path d="m3.3 8.4 3.1 3.1 6.3-7"/>',
        info: `<circle cx="8" cy="8" r="5.7"/><path d="M8 7.3v3.6"/>${dot(8, 5.2)}`,
        arrowUp: '<path d="M8 13V3.5M4 7.2l4-3.9 4 3.9"/>',
        arrowDown: '<path d="M8 3v9.5M4 8.8l4 3.9 4-3.9"/>',
    };

    function append(parent, children) {
        for (const child of children.flat(Infinity)) {
            if (child === null || child === undefined || child === false) continue;
            parent.append(child.nodeType ? child : document.createTextNode(String(child)));
        }
        return parent;
    }

    function h(tag, props, ...children) {
        const element = document.createElement(tag);
        for (const [key, value] of Object.entries(props || {})) {
            if (value === undefined || value === null || value === false) continue;
            if (key === 'class') element.className = value;
            else if (key.startsWith('on')) element.addEventListener(key.slice(2).toLowerCase(), value);
            else if (value === true) element.setAttribute(key, '');
            else element.setAttribute(key, value);
        }
        return append(element, children);
    }

    function icon(name, className = '') {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 16 16');
        svg.setAttribute('class', `icon ${className}`.trim());
        svg.setAttribute('aria-hidden', 'true');
        svg.innerHTML = ICONS[name] || '';
        return svg;
    }

    function button({ label, glyph, kind = 'default', title, onClick, disabled }) {
        return h('button', {
            type: 'button',
            class: `button button-${kind}${label ? '' : ' button-icon'}`,
            title: title || undefined,
            'aria-label': label ? undefined : title,
            disabled: Boolean(disabled),
            onClick,
        }, glyph && icon(glyph), label && h('span', null, label));
    }

    function toggle({ checked, label, disabled, onChange }) {
        const element = h('button', {
            type: 'button',
            class: 'switch',
            role: 'switch',
            'aria-checked': String(Boolean(checked)),
            'aria-label': label,
            disabled: Boolean(disabled),
        }, h('span', { class: 'switch-thumb' }));
        element.addEventListener('click', (event) => {
            event.stopPropagation();
            const next = element.getAttribute('aria-checked') !== 'true';
            element.setAttribute('aria-checked', String(next));
            onChange(next, element);
        });
        element.set = (value) => element.setAttribute('aria-checked', String(Boolean(value)));
        return element;
    }

    function select({ value, options, label, onChange }) {
        const element = h('select', { class: 'select', 'aria-label': label },
            options.map((option) => h('option', { value: option.value, selected: option.value === value }, option.label)));
        element.value = value;
        element.addEventListener('click', (event) => event.stopPropagation());
        element.addEventListener('change', () => onChange(element.value));
        return element;
    }

    function textField({ value, placeholder, label, onInput, onCommit }) {
        const element = h('input', {
            class: 'field',
            type: 'text',
            spellcheck: 'false',
            autocomplete: 'off',
            placeholder,
            'aria-label': label,
        });
        element.value = value || '';
        if (onInput) element.addEventListener('input', () => onInput(element.value));
        element.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                if (onCommit) onCommit(element.value);
                else element.blur();
            }
        });
        return element;
    }

    // A titled block of rows: one bordered box with dividers on macOS, a stack of cards on Windows.
    function list(title, rows, { note } = {}) {
        return h('section', { class: 'section' },
            title && h('h2', { class: 'section-title' }, title),
            h('div', { class: 'list' }, rows),
            note && h('p', { class: 'section-note' }, note));
    }

    function row({ lead, title, subtitle, trailing, onClick, className = '' }) {
        const element = h('div', { class: `row ${className}`.trim() },
            lead && h('div', { class: 'row-lead' }, lead),
            h('div', { class: 'row-text' },
                h('div', { class: 'row-title' }, title),
                subtitle && h('div', { class: 'row-subtitle' }, subtitle)),
            trailing && h('div', { class: 'row-trailing' }, trailing));
        if (onClick) {
            element.classList.add('row-clickable');
            element.tabIndex = 0;
            element.setAttribute('role', 'button');
            element.addEventListener('click', onClick);
            element.addEventListener('keydown', (event) => {
                if (event.target === element && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    onClick(event);
                }
            });
        }
        return element;
    }

    // A modal sheet. Returns a handle with close(); Escape and a click outside both dismiss it.
    function dialog({ title, body, footer, className = '', onClose }) {
        const overlay = document.getElementById('overlay');
        const previousFocus = document.activeElement;
        const panel = h('div', { class: `dialog ${className}`.trim(), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
            h('div', { class: 'dialog-main' }, h('h2', { class: 'dialog-title' }, title), body),
            footer && h('div', { class: 'dialog-footer' }, footer));
        const backdrop = h('div', { class: 'backdrop' }, panel);

        function close(result) {
            document.removeEventListener('keydown', onKey, true);
            backdrop.remove();
            if (previousFocus && previousFocus.isConnected) previousFocus.focus();
            if (onClose) onClose(result);
        }
        function onKey(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                event.preventDefault();
                close(null);
            } else if (event.key === 'Tab') {
                // Keep keyboard focus inside the sheet.
                const focusable = [...panel.querySelectorAll('button:not(:disabled), input, select, [tabindex="0"]')];
                if (focusable.length === 0) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        }
        backdrop.addEventListener('mousedown', (event) => {
            if (event.target === backdrop) close(null);
        });
        document.addEventListener('keydown', onKey, true);
        overlay.append(backdrop);
        const initial = panel.querySelector('[autofocus]') || panel.querySelector('input, button');
        if (initial) initial.focus();
        return { close, panel };
    }

    return { h, append, icon, button, toggle, select, textField, list, row, dialog };
})();
