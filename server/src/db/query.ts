import type { DocData, Filter, QueryDoc, QueryOptions } from './types';

// Filtering/sorting shared by every Db adapter, so queries behave identically in tests and production.

export function readField(data: DocData, field: string): unknown {
  return field.split('.').reduce<unknown>((o, k) => (o as DocData | undefined)?.[k], data);
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  return (a as number) < (b as number) ? -1 : 1;
}

export function matchFilter(data: DocData, [field, op, value]: Filter): boolean {
  const v = readField(data, field);
  const present = v !== undefined && v !== null;
  switch (op) {
    case '==':
      return v === value;
    case '!=':
      return v !== value && v !== undefined;
    case '<':
      return present && (v as number) < (value as number);
    case '<=':
      return present && (v as number) <= (value as number);
    case '>':
      return present && (v as number) > (value as number);
    case '>=':
      return present && (v as number) >= (value as number);
    case 'array-contains':
      return Array.isArray(v) && v.includes(value);
    case 'in':
      return Array.isArray(value) && value.includes(v);
  }
}

export function applyQuery<T>(entries: [string, DocData][], filters: Filter[], options?: QueryOptions): QueryDoc<T>[] {
  let rows = entries.filter(([, data]) => filters.every((f) => matchFilter(data, f)));
  const ob = options?.orderBy;
  if (ob) {
    const sign = ob.direction === 'asc' ? 1 : -1;
    rows = rows.sort(([, a], [, b]) => sign * compare(readField(a, ob.field), readField(b, ob.field)));
    if (options?.startAfter !== undefined && options.startAfter !== null) {
      rows = rows.filter(([, d]) => sign * compare(readField(d, ob.field), options.startAfter) > 0);
    }
  }
  if (options?.limit) rows = rows.slice(0, options.limit);
  return rows.map(([path, data]) => ({ path, id: path.split('/').pop()!, data: structuredClone(data) as T }));
}

/** True when `path` is a document directly inside a collection named `collectionId` (at any depth). */
export function inCollectionGroup(path: string, collectionId: string): boolean {
  const parts = path.split('/');
  return parts.length % 2 === 0 && parts[parts.length - 2] === collectionId;
}
