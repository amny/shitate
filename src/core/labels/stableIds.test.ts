import { generateStableId, isValidStableId } from './stableIds';

describe('stable ids', () => {
  it.each([
    ['heading', 'h-abc12345', true],
    ['figure', 'f-00000000', true],
    ['tableFigure', 't-zzzzzzzz', true],
    ['heading', 'f-abc12345', false],
    ['heading', 'h-ABC12345', false],
    ['heading', 'h-abc1234', false],
    ['heading', 'intro', false],
    ['heading', null, false],
    ['paragraph', 'h-abc12345', false],
  ])('isValidStableId(%s, %o) = %s', (type, id, expected) => {
    expect(isValidStableId(type, id)).toBe(expected);
  });

  it('generates valid ids that avoid taken ones', () => {
    const taken = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = generateStableId('heading', taken);
      expect(isValidStableId('heading', id)).toBe(true);
      expect(taken.has(id)).toBe(false);
      taken.add(id);
    }
    expect(generateStableId('tableFigure', taken)).toMatch(/^t-/);
  });

  it('rejects node types without stable ids', () => {
    expect(() => generateStableId('paragraph', new Set())).toThrow('does not carry a stable id');
  });
});
