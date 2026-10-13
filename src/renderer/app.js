'use strict';

(async () => {
    const { h, icon, button, toggle, select, textField, list, row, dialog } = window.ui;
    const bridge = window.pairkiller;
    const mac = bridge.ui === 'darwin';
    // macOS titles buttons and menu items in Title Case; Windows uses sentence case.
    const word = (macText, otherText) => (mac ? macText : otherText);
    const ICON_SRC = '../../icon.png';

    const root = document.documentElement;
    root.dataset.ui = mac ? 'darwin' : 'win32';
    root.classList.toggle('mica', bridge.mica);
    root.classList.toggle('preview', bridge.preview);
    root.classList.toggle('native-frame', bridge.ui === 'linux');

    const boot = await bridge.bootstrap();
    const store = {
        app: boot.app,
        rules: boot.rules,
        settings: boot.settings,
        state: boot.state,
        activity: boot.activity.slice(),
        templates: boot.templates,
        update: boot.update,
    };
    let route = { page: boot.route || 'rules' };

    const ACTIONS = [
        { value: 'sync', label: word('Open and Close with It', 'Open and close with it') },
        { value: 'start', label: word('Open with It', 'Open with it') },
        { value: 'stop', label: word('Close While It Runs', 'Close while it runs') },
        { value: 'opposite', label: word('Close While It Runs, Reopen After', 'Close while it runs, reopen after') },
    ];
    const INTERVALS = [
        { value: '1000', label: word('Every Second', 'Every second') },
        { value: '2000', label: word('Every 2 Seconds', 'Every 2 seconds') },
        { value: '5000', label: word('Every 5 Seconds', 'Every 5 seconds') },
        { value: '10000', label: word('Every 10 Seconds', 'Every 10 seconds') },
    ];

    // ---------- Theme ----------

    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    let accentHex = boot.theme.accent;

    function applyAccent() {
        if (!accentHex) {
            root.style.removeProperty('--accent');
            root.style.removeProperty('--on-accent');
            return;
        }
        let rgb = [1, 3, 5].map((index) => Number.parseInt(accentHex.slice(index, index + 2), 16));
        if (!mac) {
            // Windows pairs a lighter accent with dark surfaces and a darker one with light surfaces.
            const target = darkQuery.matches ? 255 : 0;
            const amount = darkQuery.matches ? 0.42 : 0.14;
            rgb = rgb.map((channel) => Math.round(channel + (target - channel) * amount));
        }
        const [r, g, b] = rgb.map((channel) => {
            const value = channel / 255;
            return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        root.style.setProperty('--accent', `rgb(${rgb.join(' ')})`);
        root.style.setProperty('--on-accent', luminance > 0.4 ? '#000000' : '#ffffff');
    }
    applyAccent();
    darkQuery.addEventListener('change', applyAccent);
    bridge.on('theme', (theme) => {
        accentHex = theme.accent;
        applyAccent();
    });

    // ---------- Saving ----------

    // Edits apply as they are made, the way system settings do; there is no Save button.
    let saveTimer = null;
    function flush() {
        if (saveTimer === null) return;
        clearTimeout(saveTimer);
        saveTimer = null;
        bridge.saveRules(store.rules).catch((error) => console.error('Could not save rules', error));
    }
    function commit() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flush, 250);
    }
    window.addEventListener('beforeunload', flush);

    // ---------- Helpers ----------

    const bareName = (name) => name.replace(/\.(exe|app)$/i, '');
    const nameKey = (name) => bareName(String(name).trim()).toLowerCase();
    const ruleTitle = (rule) => rule.name || word('Untitled Rule', 'Untitled rule');

    function joinNames(names, conjunction) {
        if (names.length <= 1) return names[0] || '';
        return `${names.slice(0, -1).join(', ')} ${conjunction} ${names[names.length - 1]}`;
    }

    function summarize(rule) {
        const triggers = rule.monitoredApps.map((app) => bareName(app.name));
        const apps = rule.controlledApps;
        if (triggers.length === 0 && apps.length === 0) return 'Choose an app to watch and an app to control.';
        if (triggers.length === 0) return 'Choose an app to watch.';
        const all = rule.condition === 'all' && triggers.length > 1;
        const when = joinNames(triggers, all ? 'and' : 'or');
        if (apps.length === 0) return `Watching ${when}. Choose an app to control.`;
        const names = joinNames(apps.map((app) => bareName(app.name)), 'and');
        const verb = all ? 'are' : 'is';
        if (new Set(apps.map((app) => app.action)).size > 1) return `Controls ${names} alongside ${when}`;
        switch (apps[0].action) {
            case 'start': return `Opens ${names} when ${when} ${all ? 'start' : 'starts'}`;
            case 'stop': return `Closes ${names} while ${when} ${verb} running`;
            case 'opposite': return `Closes ${names} while ${when} ${verb} running, then reopens ${apps.length > 1 ? 'them' : 'it'}`;
            default: return `Opens and closes ${names} with ${when}`;
        }
    }

    function ruleStatus(rule) {
        const live = store.state.rules[rule.id];
        if (!rule.enabled) return { tone: 'off', text: 'Off' };
        if (rule.monitoredApps.length === 0 || rule.controlledApps.length === 0) return { tone: 'warning', text: 'Needs setup' };
        if (store.settings.paused) return { tone: 'off', text: 'Paused' };
        if (live && live.apps.some((app) => app.status === 'error')) return { tone: 'danger', text: 'Needs attention' };
        if (live && live.active) return { tone: 'active', text: 'Active' };
        return { tone: 'idle', text: 'Waiting' };
    }

    // Parts of a view that follow the live process state register here and are refreshed in
    // place, so a status change never rebuilds the page under the user's cursor.
    let bindings = [];
    function live(update) {
        bindings.push(update);
        update();
    }
    function refreshLive() {
        for (const update of bindings) update();
    }

    // ---------- App icons ----------

    const iconRequests = new Map();
    function appInfo(file) {
        if (!iconRequests.has(file)) iconRequests.set(file, bridge.appIcon(file));
        return iconRequests.get(file);
    }

    let runningRequest = null;
    let runningAt = 0;
    function runningApps() {
        if (!runningRequest || Date.now() - runningAt > 10000) {
            runningAt = Date.now();
            runningRequest = bridge.runningApps();
        }
        return runningRequest;
    }

    function appIcon(app) {
        const holder = h('span', { class: 'app-icon' }, icon('app'));
        const show = (file) => appInfo(file).then((info) => {
            if (info.icon) holder.replaceChildren(h('img', { src: info.icon, alt: '' }));
        });
        if (app.path) {
            show(app.path);
        } else {
            // A rule that only knows a process name borrows the icon of the running app, if there is one.
            runningApps().then((apps) => {
                const match = apps.find((candidate) => candidate.path && nameKey(candidate.name) === nameKey(app.name));
                if (match) show(match.path);
            });
        }
        return holder;
    }

    // ---------- Shell ----------

    const NAV = [
        { page: 'rules', label: 'Rules', glyph: 'rules' },
        { page: 'activity', label: 'Activity', glyph: 'activity' },
        { page: 'settings', label: 'Settings', glyph: 'settings' },
    ];
    const navButtons = NAV.map((item) => h('button', {
        type: 'button',
        class: 'nav-item',
        'data-page': item.page,
        onClick: () => navigate({ page: item.page }),
    }, icon(item.glyph), h('span', null, item.label)));

    const monitorDot = h('span', { class: 'status-dot' });
    const monitorText = h('span', { class: 'monitor-text' });
    const monitorStatus = h('span', { class: 'status' }, monitorDot);
    const monitorButton = button({ glyph: 'pause', title: 'Pause monitoring', onClick: () => setPaused(!store.settings.paused) });
    const banner = h('div', { class: 'banner' });
    const view = h('div', { class: 'view' });

    document.getElementById('app').append(
        h('div', { class: 'titlebar' },
            h('img', { class: 'titlebar-icon', src: ICON_SRC, alt: '' }),
            h('span', { class: 'titlebar-title' }, 'Pairkiller'),
            h('div', { class: 'traffic' }, h('span'), h('span'), h('span'))),
        h('aside', { class: 'sidebar' },
            h('nav', { class: 'nav' }, navButtons),
            h('div', { class: 'sidebar-spacer' }),
            h('div', { class: 'monitor' }, monitorStatus, monitorText, monitorButton)),
        h('main', { class: 'content' }, banner, view),
    );

    function refreshShell() {
        const { paused } = store.settings;
        const healthy = store.state.healthy;
        const activeCount = store.rules.filter((rule) => rule.enabled && store.state.rules[rule.id] && store.state.rules[rule.id].active).length;
        monitorStatus.dataset.tone = paused ? 'off' : !healthy ? 'warning' : activeCount > 0 ? 'active' : 'idle';
        monitorText.textContent = paused
            ? 'Paused'
            : !healthy ? 'Can’t read running apps'
                : activeCount > 0 ? `${activeCount} active` : 'Monitoring';
        const label = paused ? word('Resume Monitoring', 'Resume monitoring') : word('Pause Monitoring', 'Pause monitoring');
        monitorButton.title = label;
        monitorButton.setAttribute('aria-label', label);
        monitorButton.replaceChildren(icon(paused ? 'play' : 'pause'));

        for (const navButton of navButtons) {
            const current = navButton.dataset.page === (route.page === 'rule' ? 'rules' : route.page);
            if (current) navButton.setAttribute('aria-current', 'page');
            else navButton.removeAttribute('aria-current');
        }

        const update = store.update;
        if (update.status === 'ready') {
            banner.replaceChildren(h('div', { class: 'infobar infobar-accent' },
                icon('arrowDown'),
                h('div', { class: 'infobar-text' }, `Pairkiller ${update.version} is ready to install.`),
                button({ label: word('Restart to Update', 'Restart to update'), kind: 'accent', onClick: () => bridge.installUpdate() })));
        } else {
            banner.replaceChildren();
        }
    }

    async function setPaused(paused) {
        store.settings = await bridge.setSetting('paused', paused);
        refreshShell();
        refreshLive();
    }

    function page({ title, back, actions, body }) {
        const titleNode = typeof title === 'string' ? h('span', { class: 'page-title-text' }, title) : title;
        let heading;
        if (!back) {
            heading = h('h1', { class: 'page-title' }, titleNode);
        } else if (mac) {
            heading = [
                h('button', { type: 'button', class: 'back-button', title: back.label, 'aria-label': `Back to ${back.label}`, onClick: back.onClick }, icon('chevronLeft')),
                h('h1', { class: 'page-title' }, titleNode),
            ];
        } else {
            heading = h('h1', { class: 'page-title' },
                h('button', { type: 'button', class: 'crumb', onClick: back.onClick }, back.label),
                icon('chevronRight', 'crumb-separator'),
                titleNode);
        }
        return h('div', { class: 'page' },
            h('header', { class: 'page-header' }, heading, h('div', { class: 'page-actions' }, actions)),
            h('div', { class: 'page-body' }, h('div', { class: 'page-inner' }, body)));
    }

    function render({ keepScroll = false } = {}) {
        const scroller = view.querySelector('.page-body');
        const scrollTop = keepScroll && scroller ? scroller.scrollTop : 0;
        bindings = [];
        const next = PAGES[route.page]();
        if (keepScroll) next.style.animation = 'none';
        view.replaceChildren(next);
        if (scrollTop) view.querySelector('.page-body').scrollTop = scrollTop;
        refreshShell();
    }

    function navigate(next) {
        route = next;
        render();
    }

    // ---------- Rules ----------

    function createRule(template) {
        const copy = (apps) => apps.map((app) => ({ ...app }));
        const rule = {
            id: crypto.randomUUID(),
            name: template ? template.name : '',
            enabled: true,
            condition: 'any',
            monitoredApps: template ? copy(template.monitoredApps) : [],
            controlledApps: template ? copy(template.controlledApps) : [],
        };
        store.rules.push(rule);
        commit();
        navigate({ page: 'rule', id: rule.id, focusName: !template });
    }

    async function newRuleMenu(anchor) {
        const rect = anchor.getBoundingClientRect();
        const choice = await bridge.popupMenu({
            x: rect.left,
            y: rect.bottom + 4,
            items: [
                { id: 'blank', label: word('Blank Rule', 'Blank rule') },
                { type: 'separator' },
                ...store.templates.map((template) => ({ id: template.id, label: template.name })),
            ],
        });
        if (choice === 'blank') createRule(null);
        else if (choice) createRule(store.templates.find((template) => template.id === choice));
    }

    function duplicateRule(rule) {
        const copy = JSON.parse(JSON.stringify(rule));
        copy.id = crypto.randomUUID();
        copy.name = `${ruleTitle(rule)} copy`;
        store.rules.splice(store.rules.indexOf(rule) + 1, 0, copy);
        commit();
        navigate({ page: 'rule', id: copy.id });
    }

    async function deleteRule(rule) {
        const confirmed = await bridge.confirm({
            message: `Delete “${ruleTitle(rule)}”?`,
            detail: 'The rule stops applying straight away. Apps it controls are left as they are.',
            confirmLabel: 'Delete',
        });
        if (!confirmed) return;
        store.rules = store.rules.filter((candidate) => candidate !== rule);
        commit();
        navigate({ page: 'rules' });
    }

    async function ruleMenu(rule, x, y) {
        const choice = await bridge.popupMenu({
            x,
            y,
            items: [
                { id: 'open', label: word('Edit Rule', 'Edit rule') },
                { id: 'toggle', label: rule.enabled ? word('Turn Off', 'Turn off') : word('Turn On', 'Turn on') },
                { id: 'duplicate', label: 'Duplicate' },
                { type: 'separator' },
                { id: 'delete', label: word('Delete…', 'Delete') },
            ],
        });
        if (choice === 'open') navigate({ page: 'rule', id: rule.id });
        if (choice === 'toggle') {
            rule.enabled = !rule.enabled;
            commit();
            refreshLive();
        }
        if (choice === 'duplicate') duplicateRule(rule);
        if (choice === 'delete') deleteRule(rule);
    }

    function statusBadge(read) {
        const text = h('span');
        const badge = h('span', { class: 'status' }, h('span', { class: 'status-dot' }), text);
        live(() => {
            const status = read();
            badge.dataset.tone = status.tone;
            text.textContent = status.text;
        });
        return badge;
    }

    function ruleRow(rule) {
        const lead = h('span', { class: 'pair-icons' },
            rule.monitoredApps[0] && appIcon(rule.monitoredApps[0]),
            rule.controlledApps[0] && appIcon(rule.controlledApps[0]),
            rule.monitoredApps.length + rule.controlledApps.length === 0 && h('span', { class: 'app-icon' }, icon('app')));
        const enabled = toggle({
            checked: rule.enabled,
            label: `${ruleTitle(rule)} enabled`,
            onChange(value) {
                rule.enabled = value;
                commit();
                refreshLive();
            },
        });
        const element = row({
            className: 'rule-row',
            lead,
            title: ruleTitle(rule),
            subtitle: summarize(rule),
            trailing: [statusBadge(() => ruleStatus(rule)), enabled, icon('chevronRight', 'row-chevron')],
            onClick: () => navigate({ page: 'rule', id: rule.id }),
        });
        element.dataset.rule = rule.id;
        element.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            ruleMenu(rule, event.clientX, event.clientY);
        });
        live(() => enabled.set(rule.enabled));
        return element;
    }

    function pausedNotice() {
        const holder = h('div');
        live(() => {
            holder.hidden = !store.settings.paused;
            if (holder.hidden || holder.childElementCount) return;
            holder.append(h('div', { class: 'infobar' },
                icon('pause'),
                h('div', { class: 'infobar-text' }, 'Monitoring is paused. Rules won’t open or close anything until it is resumed.'),
                button({ label: 'Resume', onClick: () => setPaused(false) })));
        });
        return holder;
    }

    function rulesPage() {
        // A macOS toolbar carries a plain "+" pull-down; Windows puts a labelled accent button by the title.
        const newRule = button({
            label: mac ? undefined : 'New rule',
            title: mac ? 'New Rule' : undefined,
            glyph: 'plus',
            kind: mac ? 'icon' : 'accent',
            onClick: (event) => newRuleMenu(event.currentTarget),
        });
        newRule.dataset.action = 'new-rule';

        if (store.rules.length === 0) {
            const blank = button({ label: word('New Blank Rule', 'New blank rule'), onClick: () => createRule(null) });
            const starter = store.templates[0];
            return page({
                title: 'Rules',
                actions: [newRule],
                body: h('div', { class: 'empty' },
                    h('img', { class: 'empty-art', src: ICON_SRC, alt: '' }),
                    h('h2', { class: 'empty-title' }, 'No rules yet'),
                    h('p', { class: 'empty-text' }, 'A rule opens and closes a companion app alongside the app it belongs with, so Blitz only runs while League of Legends does.'),
                    h('div', { class: 'empty-actions' },
                        starter && button({ label: `Add ${starter.name}`, kind: 'accent', onClick: () => createRule(starter) }),
                        blank)),
            });
        }

        return page({
            title: 'Rules',
            actions: [newRule],
            body: [pausedNotice(), h('div', { class: 'list' }, store.rules.map(ruleRow))],
        });
    }

    // ---------- Rule editor ----------

    function removeButton(label, onClick) {
        return button({ glyph: 'close', title: label, onClick });
    }

    function triggerRow(rule, app, index) {
        const subtitle = h('span');
        const element = row({
            className: 'row-compact',
            lead: appIcon(app),
            title: app.name,
            subtitle,
            trailing: removeButton(`Remove ${app.name}`, () => {
                rule.monitoredApps.splice(index, 1);
                commit();
                render({ keepScroll: true });
            }),
        });
        live(() => {
            const state = store.state.rules[rule.id];
            const isRunning = Boolean(state && state.triggers[index]);
            subtitle.textContent = store.settings.paused ? '' : isRunning ? 'Running' : 'Not running';
            subtitle.className = isRunning ? 'tone-success' : '';
        });
        return element;
    }

    function controlledRow(rule, app, index) {
        const subtitle = h('span');
        let located = true;
        const describe = () => {
            const state = store.state.rules[rule.id];
            const appState = state && state.apps[index];
            if (appState && appState.detail) return { text: appState.detail, tone: appState.status === 'error' ? 'tone-danger' : 'tone-warning' };
            if (!app.path && app.action !== 'stop') return { text: 'No location set, so it can’t be opened. Choose where it is.', tone: 'tone-warning' };
            if (!located) return { text: 'Not found at its saved location. Choose where it is.', tone: 'tone-warning' };
            const isRunning = Boolean(appState && appState.running);
            if (isRunning && !store.settings.paused) return { text: `Running · ${app.path || app.name}`, tone: '' };
            return { text: app.path || app.name, tone: '' };
        };
        const update = () => {
            const { text, tone } = describe();
            subtitle.textContent = text;
            subtitle.className = tone;
            subtitle.title = text;
        };
        if (app.path) {
            appInfo(app.path).then((info) => {
                located = info.exists;
                update();
            });
        }

        const action = select({
            value: app.action,
            options: ACTIONS,
            label: `What to do with ${bareName(app.name)}`,
            onChange(value) {
                app.action = value;
                commit();
                update();
            },
        });
        const more = button({
            glyph: 'more',
            title: word('More Options', 'More options'),
            async onClick(event) {
                const rect = event.currentTarget.getBoundingClientRect();
                const choice = await bridge.popupMenu({
                    x: rect.left,
                    y: rect.bottom + 4,
                    items: [
                        { id: 'locate', label: word('Choose Location…', 'Choose location') },
                        { id: 'rename', label: word('Change Process Name…', 'Change process name') },
                        { type: 'separator' },
                        { id: 'remove', label: 'Remove' },
                    ],
                });
                if (choice === 'locate') {
                    const picked = await bridge.browseForApp(app.path);
                    if (!picked) return;
                    app.path = picked.path;
                    app.name = picked.name;
                }
                if (choice === 'rename') {
                    const name = await promptProcessName(app.name);
                    if (!name) return;
                    app.name = name;
                }
                if (choice === 'remove') rule.controlledApps.splice(index, 1);
                if (choice) {
                    commit();
                    render({ keepScroll: true });
                }
            },
        });

        const element = row({
            className: 'row-compact',
            lead: appIcon(app),
            title: bareName(app.name),
            subtitle,
            trailing: [action, more],
        });
        live(update);
        return element;
    }

    function addRow(label, action, onClick) {
        const add = button({ label, glyph: 'plus', onClick });
        add.dataset.action = action;
        return row({ className: 'row-compact row-add', title: '', trailing: add });
    }

    function rulePage() {
        const rule = store.rules.find((candidate) => candidate.id === route.id);
        if (!rule) {
            route = { page: 'rules' };
            return rulesPage();
        }

        const title = h('span', { class: 'page-title-text' }, ruleTitle(rule));
        const name = textField({
            value: rule.name,
            placeholder: word('Untitled Rule', 'Untitled rule'),
            label: 'Rule name',
            onInput(value) {
                rule.name = value;
                title.textContent = ruleTitle(rule);
                commit();
            },
        });
        if (route.focusName) {
            route.focusName = false;
            // Deferred until the page has been attached; a frame callback would not run while the window is hidden.
            setTimeout(() => name.focus(), 0);
        }
        const enabled = toggle({
            checked: rule.enabled,
            label: 'Rule enabled',
            onChange(value) {
                rule.enabled = value;
                commit();
                refreshLive();
            },
        });
        live(() => enabled.set(rule.enabled));

        const general = list(null, [
            row({ className: 'row-compact row-field', title: 'Name', trailing: name }),
            row({ className: 'row-compact', title: 'Enabled', trailing: [statusBadge(() => ruleStatus(rule)), enabled] }),
        ]);

        const triggerRows = rule.monitoredApps.map((app, index) => triggerRow(rule, app, index));
        if (rule.monitoredApps.length > 1) {
            triggerRows.unshift(row({
                className: 'row-compact',
                title: 'The rule is active when',
                trailing: select({
                    value: rule.condition,
                    label: 'Condition',
                    options: [
                        { value: 'any', label: word('Any of These Is Running', 'Any of these is running') },
                        { value: 'all', label: word('All of These Are Running', 'All of these are running') },
                    ],
                    onChange(value) {
                        rule.condition = value;
                        commit();
                    },
                }),
            }));
        }
        triggerRows.push(addRow(word('Add App…', 'Add app'), 'add-trigger', async () => {
            const picked = await pickApp({ controlled: false });
            if (!picked) return;
            rule.monitoredApps.push(picked);
            if (!rule.name) rule.name = bareName(picked.name);
            commit();
            render({ keepScroll: true });
        }));

        const controlledRows = rule.controlledApps.map((app, index) => controlledRow(rule, app, index));
        controlledRows.push(addRow(word('Add App…', 'Add app'), 'add-controlled', async () => {
            const picked = await pickApp({ controlled: true });
            if (!picked) return;
            rule.controlledApps.push({ ...picked, action: 'sync' });
            commit();
            render({ keepScroll: true });
        }));

        return page({
            title,
            back: { label: 'Rules', onClick: () => navigate({ page: 'rules' }) },
            body: [
                general,
                list(word('When These Are Running', 'When these are running'), triggerRows),
                list(word('Control These Apps', 'Control these apps'), controlledRows, {
                    note: 'Apps set to open and close are also closed if they start while the rule isn’t active.',
                }),
                h('div', { class: 'page-footer' },
                    button({ label: 'Duplicate', onClick: () => duplicateRule(rule) }),
                    button({ label: word('Delete Rule…', 'Delete rule'), kind: 'danger', onClick: () => deleteRule(rule) })),
            ],
        });
    }

    // ---------- Dialogs ----------

    function pickApp({ controlled }) {
        return new Promise((resolve) => {
            let apps = null;
            let current = 0;
            let entries = [];
            const results = h('div', { class: 'picker-list', role: 'listbox' });
            const search = textField({
                placeholder: word('Search or Type a Process Name', 'Search or type a process name'),
                label: 'Search running apps',
                onInput: () => draw(),
                onCommit: () => entries[current] && finish(entries[current].app),
            });
            search.setAttribute('autofocus', '');

            function finish(app) {
                handle.close(app);
            }

            function draw(keepCurrent = false) {
                const query = search.value.trim();
                const needle = nameKey(query);
                const matches = (apps || []).filter((app) => !needle || app.name.toLowerCase().includes(needle));
                entries = matches.slice(0, 200).map((app) => ({ app, subtitle: app.path }));
                if (query && !matches.some((app) => nameKey(app.name) === needle)) {
                    entries.push({ app: { name: query }, title: `Use “${query}”`, subtitle: 'Add by process name, even if it isn’t running now' });
                }
                if (!keepCurrent) current = 0;
                current = Math.min(current, Math.max(0, entries.length - 1));

                if (entries.length === 0) {
                    results.replaceChildren(h('div', { class: 'picker-empty' }, apps ? 'No running apps to show.' : 'Looking for running apps…'));
                    return;
                }
                results.replaceChildren(...entries.map((entry, index) => {
                    const element = h('button', {
                        type: 'button',
                        class: `picker-row${index === current ? ' is-current' : ''}`,
                        role: 'option',
                        tabindex: '-1',
                        onClick: () => finish(entry.app),
                    }, entry.app.path ? appIcon(entry.app) : h('span', { class: 'app-icon' }, icon(entry.title ? 'plus' : 'app')),
                    h('span', { class: 'row-text' },
                        h('span', { class: 'row-title' }, entry.title || entry.app.name),
                        entry.subtitle && h('div', { class: 'row-subtitle' }, entry.subtitle)));
                    return element;
                }));
                const selected = results.children[current];
                if (selected && keepCurrent) selected.scrollIntoView({ block: 'nearest' });
            }

            search.addEventListener('keydown', (event) => {
                if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                event.preventDefault();
                current = Math.min(entries.length - 1, Math.max(0, current + (event.key === 'ArrowDown' ? 1 : -1)));
                draw(true);
            });

            const browse = button({
                label: 'Browse…',
                async onClick() {
                    const picked = await bridge.browseForApp();
                    if (picked) finish(picked);
                },
            });
            const handle = dialog({
                title: controlled ? word('Add an App to Control', 'Add an app to control') : word('Add an App to Watch', 'Add an app to watch'),
                className: 'picker',
                body: [
                    h('p', { class: 'dialog-text' }, controlled
                        ? 'Pick the companion app from what’s running now, or browse for it.'
                        : 'Pick the app from what’s running now, or browse for it.'),
                    h('div', { class: 'picker-search' }, icon('search'), search),
                    results,
                ],
                footer: [browse, h('span', { class: 'spacer' }), button({ label: 'Cancel', onClick: () => handle.close(null) })],
                onClose: (result) => resolve(result ? { name: result.name, ...(result.path ? { path: result.path } : {}) } : null),
            });

            draw();
            runningRequest = null;
            runningApps().then((found) => {
                apps = found;
                draw();
            });
        });
    }

    function promptProcessName(currentName) {
        return new Promise((resolve) => {
            const field = textField({ value: currentName, label: 'Process name', onCommit: (value) => handle.close(value.trim()) });
            field.setAttribute('autofocus', '');
            const handle = dialog({
                title: word('Change Process Name', 'Change process name'),
                body: [
                    h('p', { class: 'dialog-text' }, 'The name Pairkiller looks for among running apps. Change it if the app runs under a different name from the file that starts it.'),
                    field,
                ],
                footer: [
                    h('span', { class: 'spacer' }),
                    button({ label: 'Cancel', onClick: () => handle.close(null) }),
                    button({ label: 'Save', kind: 'accent', onClick: () => handle.close(field.value.trim()) }),
                ],
                onClose: (result) => resolve(result || null),
            });
            field.select();
        });
    }

    // ---------- Activity ----------

    const MARKS = { success: ['check', 'tone-success'], warning: ['warning', 'tone-warning'], error: ['warning', 'tone-danger'], info: ['info', ''] };

    function formatTime(at) {
        const date = new Date(at);
        const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (date.toDateString() === new Date().toDateString()) return time;
        return `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
    }

    function activityPage() {
        const holder = h('div');
        const draw = () => {
            if (store.activity.length === 0) {
                holder.replaceChildren(h('div', { class: 'empty' },
                    icon('activity', 'empty-glyph'),
                    h('h2', { class: 'empty-title' }, 'Nothing yet'),
                    h('p', { class: 'empty-text' }, 'When a rule opens or closes an app, it shows up here.')));
                return;
            }
            holder.replaceChildren(h('div', { class: 'list' }, store.activity.slice().sort((a, b) => b.at - a.at || b.id - a.id).map((entry) => {
                const [glyph, tone] = MARKS[entry.level] || MARKS.info;
                return row({
                    className: 'row-compact',
                    lead: h('span', { class: `activity-mark ${tone}` }, icon(glyph)),
                    title: entry.message,
                    subtitle: entry.rule || word('Untitled Rule', 'Untitled rule'),
                    trailing: h('span', { class: 'activity-time' }, formatTime(entry.at)),
                });
            })));
        };
        draw();
        activityPage.redraw = draw;
        return page({ title: 'Activity', body: holder });
    }

    // ---------- Settings ----------

    function settingRow({ title, subtitle, key, disabled }) {
        const control = toggle({
            checked: store.settings[key],
            label: title,
            disabled,
            async onChange(value) {
                store.settings = await bridge.setSetting(key, value);
                control.set(store.settings[key]);
                refreshShell();
            },
        });
        live(() => control.set(store.settings[key]));
        return row({ title, subtitle, trailing: control });
    }

    function updateRow() {
        const subtitle = h('span');
        const action = h('span');
        live(() => {
            const update = store.update;
            const check = (label = word('Check for Updates', 'Check for updates')) => button({ label, onClick: () => bridge.checkForUpdates() });
            const states = {
                idle: ['', check()],
                checking: ['Checking for updates…', button({ label: word('Check for Updates', 'Check for updates'), disabled: true })],
                downloading: [`Downloading version ${update.version}… ${update.percent}%`, null],
                ready: [`Version ${update.version} is ready to install.`, button({ label: word('Restart to Update', 'Restart to update'), kind: 'accent', onClick: () => bridge.installUpdate() })],
                current: ['Pairkiller is up to date.', check()],
                manual: [update.message, button({ label: word('Open Downloads', 'Open downloads'), onClick: () => bridge.openExternal(store.app.releasesUrl) })],
                error: [update.message, check(word('Try Again', 'Try again'))],
                unsupported: [update.message, null],
            };
            const [text, control] = states[update.status] || states.idle;
            subtitle.textContent = text || `Version ${store.app.version}`;
            action.replaceChildren(...(control ? [control] : []));
        });
        return row({ title: 'Pairkiller', subtitle, trailing: action });
    }

    function settingsPage() {
        const interval = select({
            value: String(store.settings.interval),
            label: 'How often to check',
            options: INTERVALS.filter((option) => Number(option.value) >= store.settings.minInterval)
                .concat(INTERVALS.some((option) => option.value === String(store.settings.interval))
                    ? []
                    : [{ value: String(store.settings.interval), label: `Every ${store.settings.interval / 1000} seconds` }]),
            async onChange(value) {
                store.settings = await bridge.setSetting('interval', Number(value));
            },
        });
        const monitoring = toggle({
            checked: !store.settings.paused,
            label: 'Monitoring',
            onChange: (value) => setPaused(!value),
        });
        live(() => monitoring.set(!store.settings.paused));

        const link = (label, url) => h('button', { type: 'button', class: 'link', onClick: () => bridge.openExternal(url) }, label);
        const fileManager = mac ? 'Finder' : bridge.ui === 'win32' ? 'File Explorer' : 'Files';

        return page({
            title: 'Settings',
            body: [
                list('General', [
                    settingRow({
                        key: 'autoStart',
                        title: mac ? 'Open at Login' : bridge.ui === 'win32' ? 'Start with Windows' : 'Start at login',
                        subtitle: 'Pairkiller starts quietly in the background when you sign in.',
                    }),
                    mac && settingRow({
                        key: 'showInDock',
                        title: word('Show in Dock', 'Show in Dock'),
                        subtitle: 'When off, Pairkiller stays in the menu bar and only appears in the Dock while this window is open.',
                    }),
                    settingRow({
                        key: 'notifications',
                        title: 'Notifications',
                        subtitle: 'Show a notification when a rule opens or closes an app.',
                    }),
                ]),
                list('Monitoring', [
                    row({ title: 'Monitoring', subtitle: 'Turn off to stop every rule without changing them.', trailing: monitoring }),
                    row({ title: word('Check for Changes', 'Check for changes'), subtitle: 'How often Pairkiller looks at what’s running.', trailing: interval }),
                ]),
                list('Updates', [updateRow()]),
                list(word('Privacy and Troubleshooting', 'Privacy and troubleshooting'), [
                    settingRow({
                        key: 'crashReports',
                        title: word('Send Error Reports', 'Send error reports'),
                        subtitle: 'Anonymous reports when something goes wrong. Takes full effect after a restart.',
                    }),
                    row({
                        title: word('Activity Log', 'Activity log'),
                        subtitle: 'A record of what Pairkiller did and why, for when something looks wrong.',
                        trailing: button({ label: `Show in ${fileManager}`, onClick: () => bridge.reveal('log') }),
                    }),
                ]),
                h('section', { class: 'about' },
                    h('img', { class: 'about-icon', src: ICON_SRC, alt: '' }),
                    h('div', null,
                        h('div', { class: 'about-name' }, `Pairkiller ${store.app.version}`),
                        h('p', { class: 'about-quote' }, 'Built because Fraser wanted Blitz to only run with League of Legends, not other games.'),
                        h('div', { class: 'about-links' },
                            link('Made by Ben Hybert', 'https://github.com/Hybes'),
                            link('GitHub', store.app.repoUrl),
                            link(word('Release Notes', 'Release notes'), `${store.app.repoUrl}/releases`),
                            link(word('Report a Problem', 'Report a problem'), `${store.app.repoUrl}/issues`)))),
            ],
        });
    }

    const PAGES = { rules: rulesPage, rule: rulePage, activity: activityPage, settings: settingsPage };

    // ---------- Events ----------

    bridge.on('state', (state) => {
        store.state = state;
        refreshShell();
        refreshLive();
    });
    bridge.on('activity', (entry) => {
        store.activity.push(entry);
        if (store.activity.length > 200) store.activity.shift();
        if (route.page === 'activity' && activityPage.redraw) activityPage.redraw();
    });
    bridge.on('settings', (settings) => {
        store.settings = settings;
        refreshShell();
        refreshLive();
    });
    bridge.on('update', (update) => {
        store.update = update;
        refreshShell();
        refreshLive();
    });
    bridge.on('navigate', (target) => navigate({ page: target }));
    bridge.on('command', (command) => {
        if (command === 'new-rule') createRule(null);
    });
    // Rules were changed from outside the window (the tray menu).
    bridge.on('config', (rules) => {
        if (saveTimer !== null) return;
        const sameRules = rules.length === store.rules.length && rules.every((rule, index) => rule.id === store.rules[index].id);
        if (sameRules) {
            rules.forEach((rule, index) => {
                store.rules[index].enabled = rule.enabled;
            });
            refreshLive();
        } else {
            store.rules = rules;
            render();
        }
    });

    document.addEventListener('keydown', (event) => {
        // On macOS these shortcuts belong to the menu bar, which sends them back as commands.
        const modifier = !mac && event.ctrlKey && !event.altKey && !event.shiftKey;
        if (modifier && event.key.toLowerCase() === 'n') {
            event.preventDefault();
            createRule(null);
        } else if (modifier && event.key === ',') {
            event.preventDefault();
            navigate({ page: 'settings' });
        } else if (event.key === 'Escape' && route.page === 'rule') {
            if (document.activeElement && document.activeElement.matches('input')) document.activeElement.blur();
            else navigate({ page: 'rules' });
        }
    });

    render();
})();
