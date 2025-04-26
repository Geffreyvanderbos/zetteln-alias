import { Plugin, Editor } from 'obsidian';

export default class FolgezettelPlugin extends Plugin {
    private isFormatting = false;

    async onload() {
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
                // Only format the current line's wikilink if it doesn't already have an alias
                const wikilink = line.slice(startBrackets, cursor.ch);
                if (!wikilink.includes('|')) {
                    this.formatSingleWikilink(editor, cursor.line, startBrackets, cursor.ch);
                }
            }
        }
    }

    private formatSingleWikilink(editor: Editor, line: number, start: number, end: number) {
        const currentLine = editor.getLine(line);
        const wikilink = currentLine.slice(start, end);
        
        // Check if it matches our ID pattern and doesn't already have an alias
        const match = wikilink.match(/\[\[([0-9]+[a-z0-9-]*)\s+([^\]|]+)\]\]/);
        if (!match || wikilink.includes('|')) return;

        this.isFormatting = true;
        try {
            const [full, id, title] = match;
            const formattedLink = `[[${id} ${title}|${id}]]`;
            const newLine = currentLine.slice(0, start) + formattedLink + currentLine.slice(end);
            
            editor.setLine(line, newLine);
        } finally {
            this.isFormatting = false;
        }
    }
}
