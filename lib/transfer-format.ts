export const collectionColumns = ['id', 'releaseId', 'name', 'ownership', 'condition', 'completeness', 'packaging', 'sealed', 'reviewedRevision', 'notes', 'location', 'acquiredAt', 'purchasePriceCents', 'purchaseCurrency', 'purchaseSource', 'parts', 'unidentifiedParts'];
export const catalogColumns = ['id', 'expectedRevision', 'name', 'kind', 'character', 'year', 'line', 'series', 'subSeries', 'wave', 'scale', 'faction', 'market', 'manufacturer', 'productCode', 'upc', 'retailPriceCents', 'retailCurrency', 'retired', 'parts', 'fileCards', 'taxonomyIds', 'related'];
const structured = new Set(['parts', 'unidentifiedParts', 'fileCards', 'taxonomyIds', 'related']);
const numeric = new Set(['expectedRevision', 'year', 'retailPriceCents', 'purchasePriceCents', 'reviewedRevision']);
export function csvEncode(rows: Record<string, any>[], kind: string) {
    const columns = ['schemaVersion', 'transferKind', ...(kind === 'catalog' ? catalogColumns : collectionColumns)];
    function cell(value: any) { let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value); if (/^[=+\-@\t\r]/.test(text))
        text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; }
    return [columns.map(cell).join(','), ...rows.map(row => columns.map(k => cell(k === 'schemaVersion' ? 1 : k === 'transferKind' ? kind : row[k])).join(','))].join('\r\n');
}
export function csvParse(text: string) {
    const rows: string[][] = [];
    let row: string[] = [], value = '', quoted = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') {
                value += '"';
                i++;
            }
            else if (c === '"')
                quoted = false;
            else
                value += c;
        }
        else if (c === '"') {
            if (value)
                throw Error('Invalid CSV quoting.');
            quoted = true;
        }
        else if (c === ',') {
            row.push(value);
            value = '';
        }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n')
                i++;
            row.push(value);
            if (row.some(v => v !== ''))
                rows.push(row);
            row = [];
            value = '';
        }
        else
            value += c;
    }
    if (quoted)
        throw Error('Unclosed CSV quote.');
    row.push(value);
    if (row.some(v => v !== ''))
        rows.push(row);
    return rows;
}
export function parseTransfer(text: string, format: string, kind: string) {
    if (format === 'json') {
        const document = JSON.parse(text);
        if (document.version !== 1 || document.kind !== kind || !Array.isArray(document.items))
            throw Error('Use a version 1 ' + kind + ' template.');
        return document.items;
    }
    const [headers, ...rows] = csvParse(text);
    if (!headers || new Set(headers).size !== headers.length)
        throw Error('Missing or duplicate CSV columns.');
    const allowed = ['schemaVersion', 'transferKind', ...(kind === 'catalog' ? catalogColumns : collectionColumns)];
    if (headers.some(h => !allowed.includes(h)))
        throw Error('Unknown CSV column.');
    if (!headers.includes('schemaVersion') || !headers.includes('transferKind'))
        throw Error('Missing schemaVersion or transferKind.');
    return rows.map((values, index) => {
        if (values.length !== headers.length)
            throw Error('CSV row ' + (index + 2) + ' has the wrong number of cells.');
        const row: Record<string, any> = {};
        headers.forEach((key, i) => {
            let value = values[i];
            if (/^'[=+\-@\t\r]/.test(value))
                value = value.slice(1);
            if (key === 'schemaVersion') {
                if (value !== '1')
                    throw Error('Unsupported schema version.');
                return;
            }
            if (key === 'transferKind') {
                if (value !== kind)
                    throw Error('Wrong transfer kind.');
                return;
            }
            if (!value) {
                if (['id', 'expectedRevision', 'ownership', 'condition', 'completeness', 'packaging', 'retired'].includes(key))
                    return;
                row[key] = structured.has(key) ? [] : ['notes'].includes(key) ? '' : null;
                return;
            }
            if (structured.has(key))
                row[key] = JSON.parse(value);
            else if (numeric.has(key))
                row[key] = Number(value);
            else if (key === 'sealed' || key === 'retired') {
                if (!['true', 'false'].includes(value))
                    throw Error('Use true, false or blank for ' + key);
                row[key] = value === 'true';
            }
            else
                row[key] = value;
        });
        return row;
    });
}
