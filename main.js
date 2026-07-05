'use strict';
const obsidian = require('obsidian');

const DEFAULT_SETTINGS = {
    persistUntilDismissed: false,
    minDurationMs: 8000,
    keepLog: true,
    logSize: 50
};

// Minimal, dependency-free equivalent of the standard "monkey-around" pattern
// used across the Obsidian plugin ecosystem for non-destructive prototype
// patching. Each call returns a function that restores the original method.
function around(obj, factories) {
    const removers = Object.keys(factories).map((key) => aroundOne(obj, key, factories[key]));
    return removers.length === 1 ? removers[0] : function remove() {
        removers.forEach((r) => r());
    };
}

function aroundOne(obj, method, createWrapper) {
    const original = obj[method];
    const hadOwn = Object.prototype.hasOwnProperty.call(obj, method);
    const wrapped = createWrapper(original);
    obj[method] = wrapped;
    return function remove() {
        if (obj[method] === wrapped) {
            if (hadOwn) obj[method] = original;
            else delete obj[method];
        }
    };
}

class Toastmaster extends obsidian.Plugin {

    async onload() {
        const data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data && data.settings);
        this.log = (data && data.log) || [];
        this.loggedNotices = new WeakSet();

        this.addSettingTab(new ToastmasterSettingTab(this.app, this));

        this.addCommand({
            id: 'show-toast-log',
            name: 'Show recent toasts',
            callback: () => new ToastLogModal(this.app, this).open()
        });

        this.patchNotices();

        console.log('Toastmaster: loaded');
    }

    async persist() {
        await this.saveData({ settings: this.settings, log: this.log });
    }

    recordToast(noticeInstance, messageText) {
        if (!this.settings.keepLog) return;
        if (this.loggedNotices.has(noticeInstance)) return;
        this.loggedNotices.add(noticeInstance);

        this.log.push({ message: messageText, time: Date.now() });
        if (this.log.length > this.settings.logSize) {
            this.log.splice(0, this.log.length - this.settings.logSize);
        }
        this.persist().catch((e) => console.error('Toastmaster: failed to persist log', e));
    }

    patchNotices() {
        const plugin = this;

        // Notice's constructor always calls this.setAutoHide(timeout) internally
        // (with timeout defaulting to 4000ms if the calling code didn't pass one),
        // and by that point this.messageEl already has the toast's text - so this
        // single interception point catches every toast from every plugin and
        // from Obsidian core, both for duration control and for logging.
        const remove = around(obsidian.Notice.prototype, {
            setAutoHide(next) {
                return function (timeout) {
                    const text = (this.messageEl && this.messageEl.textContent) || '';
                    plugin.recordToast(this, text);

                    if (plugin.settings.persistUntilDismissed) {
                        return next.call(this, 0);
                    }
                    if (timeout) {
                        // Only extend toasts that were going to auto-hide.
                        // A falsy timeout means the original caller wanted the
                        // toast to persist until dismissed already - leave
                        // that intent alone instead of forcing a duration.
                        return next.call(this, Math.max(timeout, plugin.settings.minDurationMs));
                    }
                    return next.call(this, timeout);
                };
            }
        });

        // Plugin.register runs its callback on unload, which is exactly when
        // this patch should be reverted.
        this.register(remove);
    }

    onunload() {
        console.log('Toastmaster: unloaded');
    }
}

class ToastLogModal extends obsidian.Modal {
    constructor(app, plugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        this.render();
    }

    render() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Recent toasts' });

        if (this.plugin.log.length === 0) {
            contentEl.createEl('p', { text: 'No toasts logged yet.' });
        } else {
            const list = contentEl.createDiv();
            list.style.maxHeight = '60vh';
            list.style.overflowY = 'auto';

            [...this.plugin.log].reverse().forEach((entry) => {
                const item = list.createDiv();
                item.style.display = 'flex';
                item.style.gap = '0.75em';
                item.style.padding = '0.35em 0';
                item.style.borderBottom = '1px solid var(--background-modifier-border)';

                const time = item.createEl('span', { text: new Date(entry.time).toLocaleTimeString() });
                time.style.color = 'var(--text-muted)';
                time.style.whiteSpace = 'nowrap';
                time.style.fontFamily = 'var(--font-monospace)';

                item.createEl('span', { text: entry.message });
            });
        }

        const buttons = new obsidian.Setting(contentEl);
        buttons.addButton((btn) => btn
            .setButtonText('Clear log')
            .onClick(async () => {
                this.plugin.log = [];
                await this.plugin.persist();
                this.render();
            }));
        buttons.addButton((btn) => btn
            .setButtonText('Close')
            .setCta()
            .onClick(() => this.close()));
    }

    onClose() {
        this.contentEl.empty();
    }
}

class ToastmasterSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Toastmaster' });
        containerEl.createEl('p', {
            text: 'Controls how long toast notifications (from any plugin, or Obsidian core) stay on screen before disappearing.'
        });

        new obsidian.Setting(containerEl)
            .setName('Persist all toasts until dismissed')
            .setDesc('Toasts stay on screen until you click them, ignoring whatever duration any plugin requested.')
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.persistUntilDismissed)
                .onChange(async (value) => {
                    this.plugin.settings.persistUntilDismissed = value;
                    await this.plugin.persist();
                    this.display();
                }));

        const minDurationSetting = new obsidian.Setting(containerEl)
            .setName('Minimum toast duration (ms)')
            .setDesc('Toasts that would have disappeared sooner than this are extended to last at least this long. Does not shorten toasts a plugin intentionally set longer, and has no effect while "persist until dismissed" is on.')
            .addText((text) => text
                .setPlaceholder(String(DEFAULT_SETTINGS.minDurationMs))
                .setValue(String(this.plugin.settings.minDurationMs))
                .onChange(async (value) => {
                    const parsed = parseInt(value, 10);
                    if (!Number.isNaN(parsed) && parsed >= 0) {
                        this.plugin.settings.minDurationMs = parsed;
                        await this.plugin.persist();
                    }
                }));

        if (this.plugin.settings.persistUntilDismissed) {
            minDurationSetting.setDisabled(true);
        }

        containerEl.createEl('h3', { text: 'Toast log' });

        new obsidian.Setting(containerEl)
            .setName('Keep a log of recent toasts')
            .setDesc('Lets you review toasts you missed via the "Show recent toasts" command.')
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.keepLog)
                .onChange(async (value) => {
                    this.plugin.settings.keepLog = value;
                    await this.plugin.persist();
                    this.display();
                }));

        const logSizeSetting = new obsidian.Setting(containerEl)
            .setName('Log size')
            .setDesc('How many recent toasts to keep. Oldest entries are dropped once this limit is passed.')
            .addText((text) => text
                .setPlaceholder(String(DEFAULT_SETTINGS.logSize))
                .setValue(String(this.plugin.settings.logSize))
                .onChange(async (value) => {
                    const parsed = parseInt(value, 10);
                    if (!Number.isNaN(parsed) && parsed >= 0) {
                        this.plugin.settings.logSize = parsed;
                        if (this.plugin.log.length > parsed) {
                            this.plugin.log.splice(0, this.plugin.log.length - parsed);
                        }
                        await this.plugin.persist();
                    }
                }));

        if (!this.plugin.settings.keepLog) {
            logSizeSetting.setDisabled(true);
        }

        new obsidian.Setting(containerEl)
            .setName('View log')
            .setDesc('Same as running the "Show recent toasts" command.')
            .addButton((btn) => btn
                .setButtonText('Open')
                .onClick(() => new ToastLogModal(this.app, this.plugin).open()));

        containerEl.createEl('p', {
            text: 'Tip: clicking anywhere on a toast already dismisses it immediately, and hovering your mouse over one already pauses its auto-hide timer while you read it.',
            cls: 'setting-item-description'
        });
    }
}

module.exports = Toastmaster;
