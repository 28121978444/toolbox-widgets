import { DEFAULT_REGISTRY_URL, MARKETPLACE_FORMAT, MARKETPLACE_FORMAT_VERSION } from './types.js';
function parseModule(value) {
    if (!value || typeof value !== 'object')
        throw new Error('Registry module is not an object.');
    const entry = value;
    for (const field of ['id', 'name', 'description', 'version', 'author']) {
        if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
            throw new Error(`Registry module is missing a valid "${field}".`);
        }
    }
    if (entry.type !== 'widget' && entry.type !== 'feature') {
        throw new Error(`Registry module "${String(entry.id)}" has an unknown type.`);
    }
    return {
        id: entry.id,
        type: entry.type,
        name: entry.name,
        description: entry.description,
        version: entry.version,
        author: entry.author,
        icon: typeof entry.icon === 'string' ? entry.icon : '▣',
        categories: Array.isArray(entry.categories) ? entry.categories.filter((c) => typeof c === 'string') : [],
        tags: Array.isArray(entry.tags) ? entry.tags.filter((t) => typeof t === 'string') : [],
        homepage: typeof entry.homepage === 'string' ? entry.homepage : '',
        ...(entry.bundle && typeof entry.bundle === 'object' ? { bundle: entry.bundle } : {}),
        ...(entry.credentialsRequired === true ? { credentialsRequired: true } : {}),
        ...(entry.builtIn === true ? { builtIn: true } : {})
    };
}
/** Validate a registry document. Throws with a friendly message when invalid. */
export function parseRegistry(value) {
    if (!value || typeof value !== 'object')
        throw new Error('The registry is not an object.');
    const registry = value;
    if (registry.format !== MARKETPLACE_FORMAT) {
        throw new Error(`This is not a Toolbox marketplace registry (format: ${String(registry.format)}).`);
    }
    if (registry.formatVersion !== MARKETPLACE_FORMAT_VERSION) {
        throw new Error(`Unsupported registry version ${String(registry.formatVersion)}. This app understands version ${MARKETPLACE_FORMAT_VERSION}.`);
    }
    if (!Array.isArray(registry.modules))
        throw new Error('The registry has no module list.');
    const modules = registry.modules.map(parseModule);
    const ids = new Set(modules.map((m) => m.id));
    if (ids.size !== modules.length)
        throw new Error('The registry contains duplicate module ids.');
    return {
        format: MARKETPLACE_FORMAT,
        formatVersion: MARKETPLACE_FORMAT_VERSION,
        updated: typeof registry.updated === 'string' ? registry.updated : '',
        modules
    };
}
/** Fetch and validate the live registry. */
export async function fetchRegistry(options = {}) {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const url = options.registryUrl ?? DEFAULT_REGISTRY_URL;
    const timeoutMs = options.timeoutMs ?? 15000;
    const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/json' }
    });
    if (!response.ok)
        throw new Error(`Marketplace registry returned HTTP ${response.status}.`);
    return parseRegistry(await response.json());
}
/** Live search over a fetched registry: substring query + exact category. */
export function searchModules(modules, filter = {}) {
    const query = filter.query?.trim().toLowerCase() ?? '';
    const category = filter.category?.trim().toLowerCase() ?? '';
    return modules.filter((module) => {
        if (category && !module.categories.some((c) => c.toLowerCase() === category))
            return false;
        if (!query)
            return true;
        const haystack = [module.id, module.name, module.description, module.author, ...module.tags]
            .join(' ')
            .toLowerCase();
        return haystack.includes(query);
    });
}
//# sourceMappingURL=registry.js.map