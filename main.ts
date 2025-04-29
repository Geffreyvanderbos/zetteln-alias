import { Plugin, Editor, PluginSettingTab, Setting, App, TFile } from 'obsidian';
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

        // Register file explorer modification
        this.registerEvent(
            this.app.workspace.on('file-open', (file: TFile) => {
                if (this.settings.enableIndentation) {
                    this.updateFileExplorerIndentation();
                }
            })
        );

        // Initial update of file explorer
        if (this.settings.enableIndentation) {
            this.updateFileExplorerIndentation();
        }
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

    private getFolgezettelLevel(filename: string): number {
        // Extract the folgezettel part (e.g., 1-1a, 1-4a1, etc.)
        const match = filename.match(/^(\d+(?:-[\da-zA-Z]+)*)/);
        if (!match) return 0;
        const id = match[1];
        if (!id) return 0;

        // Split by dashes, each dash increases the level
        const parts = id.split('-');
        let level = parts.length - 1;

        // For each part after the first, count digit/letter transitions
        for (let i = 1; i < parts.length; i++) {
            const part = parts[i];
            // Count transitions between digit and letter
            let lastType = /\d/.test(part[0]) ? 'digit' : 'letter';
            for (let j = 1; j < part.length; j++) {
                const type = /\d/.test(part[j]) ? 'digit' : 'letter';
                if (type !== lastType) {
                    level++;
                    lastType = type;
                }
            }
        }
        return level;
    }

    public updateFileExplorerIndentation() {
        const fileExplorer = document.querySelector('.nav-files-container');
        if (!fileExplorer) return;

        // Handle both files and folders
        const items = fileExplorer.querySelectorAll('.nav-file-title, .nav-folder-title');
        items.forEach((item) => {
            const titleContent = item.querySelector('.nav-file-title-content, .nav-folder-title-content');
            if (!titleContent) return;

            const filename = titleContent.textContent || '';
            const level = this.getFolgezettelLevel(filename);
            
            // Remove existing indentation classes
            item.classList.remove('folgezettel-indent');
            for (let i = 1; i <= 10; i++) {
                item.classList.remove(`folgezettel-level-${i}`);
            }

            // Add appropriate indentation class
            if (level > 0) {
                item.classList.add(`folgezettel-level-${Math.min(level, 10)}`);
            }
        });
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

        new Setting(containerEl)
            .setName('Enable Folgezettel Indentation')
            .setDesc('Indent files in the file explorer based on their Folgezettel number')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableIndentation)
                .onChange(async (value) => {
                    this.plugin.settings.enableIndentation = value;
                    await this.plugin.saveSettings();
                    if (value) {
                        this.plugin.updateFileExplorerIndentation();
                    } else {
                        // Remove all indentation classes
                        const fileExplorer = document.querySelector('.nav-files-container');
                        if (fileExplorer) {
                            const fileItems = fileExplorer.querySelectorAll('.nav-file-title');
                            fileItems.forEach((item) => {
                                item.classList.remove('folgezettel-indent');
                                for (let i = 1; i <= 10; i++) {
                                    item.classList.remove(`folgezettel-level-${i}`);
                                }
                            });
                        }
                    }
                }));
    }
}
