import { Plugin, Editor, PluginSettingTab, Setting, App } from 'obsidian';
import { ZettelSettings, DEFAULT_SETTINGS } from './settings';

export default class FolgezettelPlugin extends Plugin {
    settings: ZettelSettings;
    private isFormatting = false;

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new FolgezettelSettingTab(this.app, this));

        this.registerEvent(
            this.app.workspace.on('editor-paste', (evt: ClipboardEvent, editor: Editor) => {
                this.handlePaste(evt, editor);
            })
        );

        this.registerEvent(
            this.app.workspace.on('editor-change', (editor: Editor) => {
                if (!this.isFormatting) {
                    this.handleWikilinkCreation(editor);
                }
            })
        );
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    private getIdPattern(): RegExp {
        switch (this.settings.idFormat) {
            case 'timestamp':
                return /\[\[(\d{12})[^\]|]+\]\]/;
            case 'custom':
                try {
                    // Ensure the regex only matches within wikilink bounds
                    const userRegex = this.settings.customRegex;
                    return new RegExp(`\\[\\[${userRegex}[^\\]|]+\\]\\]`);
                } catch (e) {
                    console.error('Invalid custom regex:', e);
                    return /\[\[([0-9]+[a-z0-9-]*)[^\]|]+\]\]/;
                }
            default: // folgezettel
                return /\[\[([0-9]+[a-z0-9-]*)[^\]|]+\]\]/;
        }
    }

    private handlePaste(evt: ClipboardEvent, editor: Editor) {
        const text = evt.clipboardData?.getData('text');
        if (text?.includes('[[')) {
            const cursor = editor.getCursor();
            const line = editor.getLine(cursor.line);
            const startBrackets = line.lastIndexOf('[[', cursor.ch);
            if (startBrackets !== -1) {
                this.formatSingleWikilink(editor, cursor.line, startBrackets, cursor.ch);
            }
        }
    }

    private handleWikilinkCreation(editor: Editor) {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        
        // Check if we just completed a wikilink
        if (line.slice(0, cursor.ch).endsWith(']]')) {
            const startBrackets = line.lastIndexOf('[[', cursor.ch);
            if (startBrackets !== -1) {
                // Only format the current line's wikilink if it doesn't already have an alias or block reference
                const wikilink = line.slice(startBrackets, cursor.ch);
                if (!wikilink.includes('|') && !wikilink.includes('#') && !wikilink.includes('^')) {
                    this.formatSingleWikilink(editor, cursor.line, startBrackets, cursor.ch);
                }
            }
        }
    }

    private formatSingleWikilink(editor: Editor, line: number, start: number, end: number) {
        const currentLine = editor.getLine(line);
        const wikilink = currentLine.slice(start, end);
        
        if (wikilink.includes('|')) return;

        const pattern = this.getIdPattern();
        const fullContent = wikilink.match(/\[\[(.*?)\]\]/)?.[1];
        if (!fullContent) return;

        const idMatch = fullContent.match(this.settings.idFormat === 'timestamp' ? 
            /^(\d{12})/ : 
            this.settings.idFormat === 'custom' ? 
                new RegExp(`^${this.settings.customRegex}`) :
                /^([0-9]+[a-z0-9-]*)/
        );
        
        if (!idMatch) return;

        this.isFormatting = true;
        try {
            const id = idMatch[1];
            const formattedLink = `[[${fullContent}|${id}]]`;
            const newLine = currentLine.slice(0, start) + formattedLink + currentLine.slice(end);
            editor.setLine(line, newLine);
        } finally {
            this.isFormatting = false;
        }
    }
}

class FolgezettelSettingTab extends PluginSettingTab {
    plugin: FolgezettelPlugin;

    constructor(app: App, plugin: FolgezettelPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('ID Format')
            .setDesc('Choose the format for note IDs')
            .addDropdown(dropdown => 
                dropdown
                    .addOption('folgezettel', 'Folgezettel (1a2b)')
                    .addOption('timestamp', 'Timestamp (YYYYMMDDHHmm)')
                    .addOption('custom', 'Custom Regex')
                    .setValue(this.plugin.settings.idFormat)
                    .onChange(async (value: ZettelSettings['idFormat']) => {
                        this.plugin.settings.idFormat = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Custom Regex')
            .setDesc('Enter a custom regex pattern for ID detection (capture group required)')
            .addText(text => text
                .setPlaceholder('([0-9]+[a-z0-9-]*)')
                .setValue(this.plugin.settings.customRegex)
                .onChange(async (value) => {
                    this.plugin.settings.customRegex = value;
                    await this.plugin.saveSettings();
                }));
    }
}
