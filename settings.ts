export interface ZettelSettings {
    idFormat: 'folgezettel' | 'timestamp' | 'custom';
    customRegex: string;
    enableIndentation: boolean;
}

export const DEFAULT_SETTINGS: ZettelSettings = {
    idFormat: 'folgezettel',
    customRegex: '([0-9]+[a-z0-9-]*)',
    enableIndentation: true
};