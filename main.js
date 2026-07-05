'use strict';
const obsidian = require('obsidian');

const DEFAULT_SETTINGS = {
    persistUntilDismissed: false,
    minDurationMs: 8000
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
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

        this.addSettingTab(new ToastmasterSettingTab(this.app, this));

        this.patchNotices();

        console.log('Toastmaster: loaded');
    }

    patchNotices() {
        const plugin = this;

        // Notice's constructor always calls this.setAutoHide(timeout) internally
        // (with timeout defaulting to 4000ms if the calling code didn't pass one),
        // so this single interception point catches every toast from every
        // plugin and from Obsidian core, regardless of what duration (or none)
        // was originally requested.
        const remove = around(obsidian.Notice.prototype, {
            setAutoHide(next) {
                return function (timeout) {
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
                    await this.plugin.saveData(this.plugin.settings);
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
                        await this.plugin.saveData(this.plugin.settings);
                    }
                }));

        if (this.plugin.settings.persistUntilDismissed) {
            minDurationSetting.setDisabled(true);
        }

        containerEl.createEl('p', {
            text: 'Tip: clicking anywhere on a toast already dismisses it immediately, and hovering your mouse over one already pauses its auto-hide timer while you read it.',
            cls: 'setting-item-description'
        });
    }
}

module.exports = Toastmaster;
