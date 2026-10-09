import { customAlphabet } from 'nanoid';

/** Node types that carry a stable id (design.md §5.3), with their id prefixes. */
export const STABLE_ID_PREFIXES: Readonly<Record<string, string>> = {
  heading: 'h',
  figure: 'f',
  tableFigure: 't',
};

const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const ID_LENGTH = 8;
const randomPart = customAlphabet(ID_ALPHABET, ID_LENGTH);

/** True when `id` has the form `<prefix>-xxxxxxxx` for the node type. */
export function isValidStableId(nodeType: string, id: unknown): id is string {
  const prefix = STABLE_ID_PREFIXES[nodeType];
  return (
    prefix !== undefined &&
    typeof id === 'string' &&
    new RegExp(`^${prefix}-[${ID_ALPHABET}]{${String(ID_LENGTH)}}$`).test(id)
  );
}

/** Generates a new id for the node type that is not in `taken`. */
export function generateStableId(nodeType: string, taken: ReadonlySet<string>): string {
  const prefix = STABLE_ID_PREFIXES[nodeType];
  if (prefix === undefined) {
    throw new Error(`Node type "${nodeType}" does not carry a stable id`);
  }
  for (;;) {
    const id = `${prefix}-${randomPart()}`;
    if (!taken.has(id)) {
      return id;
    }
  }
}
