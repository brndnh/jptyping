export const SETS = {
    mainSet: require('./N5Set.json'),
};

export const DEFAULT_SET_ID = 'mainSet';

export function listSets() {
    return Object.values(SETS).map(s => ({
        id: s.id,
        label: s.label ?? s.id,
        description: s.description ?? '',
        size: Array.isArray(s.items) ? s.items.length : 0,
    }));
}

export function getSet(id) {
    const set = SETS[id] || SETS[DEFAULT_SET_ID];
    // Very light validation/normalization
    const items = Array.isArray(set.items) ? set.items : [];
    return {
        id: set.id || id,
        label: set.label || set.id || id,
        description: set.description || '',
        items: items.map(it => ({
            surface: String(it.surface ?? ''),
            reading: String(it.reading ?? ''),
            romaji: it.romaji ? String(it.romaji) : '',
        })),
    };
}
