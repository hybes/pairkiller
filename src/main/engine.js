'use strict';

const { EventEmitter } = require('events');
const { displayName, normalizeName } = require('./processes/names');

// A rule only switches off once its triggers have been gone this long, so a client that
// restarts itself (patching, crash recovery) doesn't bounce the companion apps.
const OFF_DELAY_MS = 4000;
// How long a freshly opened app has to show up in the process list before we flag it.
const LAUNCH_CONFIRM_MS = 20000;
const STOP_RETRY_BASE_MS = 2000;
const STOP_RETRY_MAX_MS = 60000;
const STOP_ATTEMPTS_BEFORE_WARNING = 4;
const FOLLOW_UP_MS = 500;
const ACTIVITY_LIMIT = 200;

function isUsable(rule) {
    return rule.enabled && rule.monitoredApps.length > 0 && rule.controlledApps.length > 0;
}

function appKey(app) {
    return `${app.path || normalizeName(app.name)}|${app.action}`;
}

// What a controlled app's action asks for, given whether its rule is active.
//   up    open it once, when the rule gets here
//   down  keep it closed for as long as the rule stays here
//   yield like down, unless another rule currently wants the same app open
function intent(action, active) {
    switch (action) {
        case 'sync': return active ? 'up' : 'yield';
        case 'start': return active ? 'up' : 'none';
        case 'stop': return active ? 'down' : 'none';
        case 'opposite': return active ? 'down' : 'up';
        default: return 'none';
    }
}

class Engine extends EventEmitter {
    constructor({ host, log, now = Date.now, offDelay = OFF_DELAY_MS }) {
        super();
        this.host = host;
        this.log = log;
        this.now = now;
        this.offDelay = offDelay;
        this.rules = [];
        this.states = new Map();
        this.interval = 2000;
        this.running = false;
        this.timer = null;
        this.ticking = null;
        this.looping = false;
        this.dirty = false;
        this.failures = 0;
        this.activity = [];
        this.activitySeq = 0;
        this.published = '';
    }

    configure({ rules, interval }) {
        this.rules = rules;
        this.interval = Math.max(interval, this.host.minInterval || 0);
        const ids = new Set(rules.map((rule) => rule.id));
        for (const id of this.states.keys()) {
            if (!ids.has(id)) this.states.delete(id);
        }
        if (this.running) this.poke();
        else this.publish();
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.failures = 0;
        this.poke();
    }

    stop() {
        this.running = false;
        clearTimeout(this.timer);
        this.timer = null;
        // Forget what was active so resuming re-evaluates every rule from scratch.
        this.states.clear();
        this.publish();
    }

    // Run a check now instead of waiting out the interval (config changed, system woke up).
    poke() {
        if (!this.running) return;
        this.dirty = true;
        // A loop that is mid-cycle picks `dirty` up itself as soon as that cycle ends.
        if (this.looping) return;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.loop(), 0);
    }

    async loop() {
        this.looping = true;
        let acted = false;
        try {
            do {
                this.dirty = false;
                acted = await this.tick();
            } while (this.dirty && this.running);
        } finally {
            this.looping = false;
        }
        if (!this.running) return;
        clearTimeout(this.timer);
        // After acting, look again quickly so the result is confirmed without a full wait.
        this.timer = setTimeout(() => this.loop(), acted ? FOLLOW_UP_MS : this.interval);
    }

    // One full cycle: read the process list, decide, act. Never overlaps with itself.
    tick() {
        if (!this.ticking) {
            this.ticking = this.cycle().finally(() => {
                this.ticking = null;
            });
        }
        return this.ticking;
    }

    async cycle() {
        let snapshot;
        try {
            snapshot = await this.host.snapshot();
        } catch (error) {
            // No data is not the same as "nothing is running": skip the cycle rather than act on it.
            this.failures += 1;
            if (this.failures === 1 || this.failures % 60 === 0) {
                this.log.warn(`Could not read the process list (attempt ${this.failures})`, error);
            }
            this.publish();
            return false;
        }
        this.failures = 0;
        const actions = this.evaluate(snapshot, this.now());
        await Promise.all(actions.map((action) => action().catch((error) => {
            this.log.error('Action failed', error);
        })));
        this.publish();
        return actions.length > 0;
    }

    stateFor(rule) {
        let state = this.states.get(rule.id);
        if (!state) {
            state = { active: null, absentSince: null, triggers: [], seen: [], apps: new Map() };
            this.states.set(rule.id, state);
        }
        return state;
    }

    evaluate(snapshot, now) {
        const plans = [];
        const wanted = new Set();
        const held = new Set();

        for (const rule of this.rules) {
            const state = this.stateFor(rule);
            state.triggers = rule.monitoredApps.map((app) => snapshot.has(app.name));

            const keys = new Set(rule.controlledApps.map(appKey));
            for (const key of state.apps.keys()) {
                if (!keys.has(key)) state.apps.delete(key);
            }

            if (!isUsable(rule)) {
                // Switched off or incomplete: report what is running, but hold no intentions,
                // so turning the rule back on starts from a clean slate.
                state.active = null;
                state.absentSince = null;
                for (const app of rule.controlledApps) {
                    Object.assign(this.appStateFor(state, app), {
                        running: snapshot.has(app.name), edge: true, launch: null, stop: null, status: null, detail: '',
                    });
                }
                continue;
            }

            const satisfied = rule.condition === 'all'
                ? state.triggers.every(Boolean)
                : state.triggers.some(Boolean);
            const previous = state.active;
            let active = satisfied;
            if (satisfied) {
                state.absentSince = null;
                state.seen = rule.monitoredApps.filter((_, index) => state.triggers[index]).map((app) => app.name);
            } else if (previous === true) {
                if (state.absentSince === null) state.absentSince = now;
                active = now - state.absentSince < this.offDelay;
            }
            state.active = active;
            const changed = active !== previous;
            if (changed) this.announce(rule, state, previous);

            for (const app of rule.controlledApps) {
                const appState = this.appStateFor(state, app);
                if (changed) appState.edge = true;
                const want = intent(app.action, active);
                const name = normalizeName(app.name);
                if (want === 'up') wanted.add(name);
                if (want === 'down') held.add(name);
                plans.push({ rule, app, appState, want, name });
            }
        }

        const actions = [];
        for (const plan of plans) {
            const { app, appState, name } = plan;
            const running = snapshot.has(app.name);
            appState.running = running;

            let want = plan.want;
            if (want === 'yield') want = wanted.has(name) ? 'none' : 'down';
            if (want === 'up' && held.has(name)) want = 'none';

            const edge = appState.edge;
            appState.edge = false;

            if (want === 'down') {
                appState.launch = null;
                if (running) {
                    const action = this.planStop(plan, snapshot, now);
                    if (action) actions.push(action);
                } else {
                    this.settleStop(plan);
                }
                continue;
            }

            this.settleStop(plan, running);
            if (want !== 'up') {
                appState.launch = null;
                this.clearStatus(appState, ['launching']);
                continue;
            }

            if (running) {
                if (appState.launch) this.record(plan.rule, 'success', `Opened ${displayName(app.name)}`);
                appState.launch = null;
                this.clearStatus(appState);
            } else if (edge) {
                actions.push(this.planLaunch(plan, now));
            } else if (appState.launch && now - appState.launch.at > LAUNCH_CONFIRM_MS) {
                appState.launch = null;
                this.setStatus(appState, 'warning', `Opened, but nothing named “${app.name}” appeared. Check the process name.`);
                this.record(plan.rule, 'warning', `Opened ${displayName(app.name)}, but couldn’t see it running as “${app.name}”`);
            }
        }
        return actions;
    }

    appStateFor(state, app) {
        const key = appKey(app);
        let appState = state.apps.get(key);
        if (!appState) {
            // A newly added app is treated like a rule change, so it is brought in line straight away.
            appState = { running: false, edge: true, launch: null, stop: null, status: null, detail: '' };
            state.apps.set(key, appState);
        }
        return appState;
    }

    planLaunch(plan, now) {
        const { rule, app, appState } = plan;
        appState.launch = { at: now };
        this.setStatus(appState, 'launching', '');
        return async () => {
            const result = await this.host.launch(app.path);
            if (result.ok) return;
            appState.launch = null;
            this.setStatus(appState, 'error', `Couldn’t open: ${result.error}`);
            this.record(rule, 'error', `Couldn’t open ${displayName(app.name)}: ${result.error}`);
        };
    }

    planStop(plan, snapshot, now) {
        const { rule, app, appState } = plan;
        const stop = appState.stop || (appState.stop = { attempts: 0, nextAt: 0, warned: false });
        if (now < stop.nextAt) return null;
        stop.attempts += 1;
        stop.nextAt = now + Math.min(STOP_RETRY_MAX_MS, STOP_RETRY_BASE_MS * 2 ** (stop.attempts - 1));
        if (stop.attempts >= STOP_ATTEMPTS_BEFORE_WARNING && !stop.warned) {
            stop.warned = true;
            this.setStatus(appState, 'error', 'Couldn’t close it. It may be running as administrator.');
            this.record(rule, 'error', `Couldn’t close ${displayName(app.name)}. It may be running as administrator.`);
        } else if (!stop.warned) {
            this.setStatus(appState, 'stopping', '');
        }
        const force = stop.attempts > 1;
        return async () => {
            const result = await this.host.stop(app.name, snapshot, { force });
            if (!result.ok) this.log.warn(`Closing ${app.name} failed: ${result.error}`);
        };
    }

    // The app is no longer running: if that was our doing, say so and reset the retry state.
    settleStop(plan, running = false) {
        const { rule, app, appState } = plan;
        if (!appState.stop) return;
        if (!running) this.record(rule, 'success', `Closed ${displayName(app.name)}`);
        appState.stop = null;
        this.clearStatus(appState, ['stopping', 'error']);
    }

    setStatus(appState, status, detail) {
        appState.status = status;
        appState.detail = detail;
    }

    clearStatus(appState, only) {
        if (only && !only.includes(appState.status)) return;
        appState.status = null;
        appState.detail = '';
    }

    announce(rule, state, previous) {
        if (state.active) {
            const names = state.seen.map(displayName);
            const subject = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
            const verb = previous === null ? (names.length > 1 ? 'are running' : 'is running') : 'started';
            this.record(rule, 'info', `${subject} ${verb}`);
        } else if (previous === true) {
            const gone = rule.monitoredApps.find((app, index) => !state.triggers[index] && state.seen.includes(app.name));
            this.record(rule, 'info', `${displayName(gone ? gone.name : state.seen[0] || rule.name)} closed`);
        }
    }

    record(rule, level, message) {
        const entry = { id: ++this.activitySeq, at: this.now(), level, ruleId: rule.id, rule: rule.name, message };
        this.activity.push(entry);
        if (this.activity.length > ACTIVITY_LIMIT) this.activity.shift();
        this.log.info(`[${rule.name || 'Untitled rule'}] ${message}`);
        this.emit('activity', entry);
    }

    getState() {
        const rules = {};
        for (const rule of this.rules) {
            const state = this.states.get(rule.id);
            rules[rule.id] = {
                active: Boolean(state && state.active),
                triggers: rule.monitoredApps.map((_, index) => Boolean(state && state.triggers[index])),
                apps: rule.controlledApps.map((app) => {
                    const appState = state && state.apps.get(appKey(app));
                    return appState
                        ? { running: appState.running, status: appState.status, detail: appState.detail }
                        : { running: false, status: null, detail: '' };
                }),
            };
        }
        return {
            monitoring: this.running,
            healthy: this.failures < 3,
            backend: this.host.backend,
            rules,
        };
    }

    publish() {
        const state = this.getState();
        const serialized = JSON.stringify(state);
        if (serialized === this.published) return;
        this.published = serialized;
        this.emit('state', state);
    }
}

module.exports = { Engine, isUsable, intent };
