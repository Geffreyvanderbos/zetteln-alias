export interface ZettelSettings {
    idFormat: 'folgezettel' | 'timestamp' | 'custom';
    customRegex: string;
}

export const DEFAULT_SETTINGS: ZettelSettings = {
    idFormat: 'folgezettel',
    customRegex: '([0-9]+[a-z0-9-]*)'
};