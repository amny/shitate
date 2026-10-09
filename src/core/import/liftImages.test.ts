import specFullJson from '../../../fixtures/spec-full.json?raw';
import { createExtensions } from '../../editor/createEditor';
import type { DocNode, DocRoot } from '../model';
import { jsonToDoc } from './json';
import { liftImagesFromParagraphs } from './liftImages';

const image = (src: string): DocNode => ({ type: 'image', attrs: { src } });
const text = (value: string): DocNode => ({ type: 'text', text: value });
const paragraph = (...content: DocNode[]): DocNode =>
  content.length === 0 ? { type: 'paragraph' } : { type: 'paragraph', content };
const root = (...content: DocNode[]): DocRoot => ({ type: 'doc', content });

describe('liftImagesFromParagraphs', () => {
  it('replaces a paragraph holding only an image with the image', () => {
    expect(liftImagesFromParagraphs(root(paragraph(image('a'))))).toEqual(root(image('a')));
  });

  it('keeps text around images as separate paragraphs with the same attributes', () => {
    const source: DocNode = {
      type: 'paragraph',
      attrs: { textAlign: 'center' },
      content: [text('前'), image('a'), text('間'), image('b'), text('後')],
    };
    const part = (value: string): DocNode => ({ ...source, content: [text(value)] });
    expect(liftImagesFromParagraphs(root(source))).toEqual(
      root(part('前'), image('a'), part('間'), image('b'), part('後')),
    );
  });

  it('drops hard breaks left at the edges of a split', () => {
    const hardBreak: DocNode = { type: 'hardBreak' };
    expect(
      liftImagesFromParagraphs(
        root(paragraph(text('a'), hardBreak, hardBreak, image('x'), hardBreak, text('b'))),
      ),
    ).toEqual(root(paragraph(text('a')), image('x'), paragraph(text('b'))));
  });

  it('lifts images in nested paragraphs (list items, table cells, blockquotes)', () => {
    const cell: DocNode = { type: 'tableCell', content: [paragraph(text('a'), image('x'))] };
    const quote: DocNode = { type: 'blockquote', content: [paragraph(image('y'))] };
    expect(liftImagesFromParagraphs(root(cell, quote))).toEqual(
      root(
        { type: 'tableCell', content: [paragraph(text('a')), image('x')] },
        { type: 'blockquote', content: [image('y')] },
      ),
    );
  });

  it('keeps a leading paragraph in a list item whose first paragraph is only an image', () => {
    const item: DocNode = { type: 'listItem', content: [paragraph(image('x'), text('a'))] };
    expect(liftImagesFromParagraphs(root(item))).toEqual(
      root({ type: 'listItem', content: [paragraph(), image('x'), paragraph(text('a'))] }),
    );
  });

  it('returns documents without images in paragraphs unchanged', () => {
    const doc = root(paragraph(text('a')), image('x'));
    expect(liftImagesFromParagraphs(doc)).toEqual(doc);
    const fixture = JSON.parse(specFullJson) as DocRoot;
    expect(liftImagesFromParagraphs(fixture)).toEqual(fixture);
  });
});

describe('jsonToDoc with images in paragraphs', () => {
  const extensions = createExtensions();
  const src = 'data:image/png;base64,AA';
  const read = (doc: DocRoot): DocNode[] => {
    const result = jsonToDoc(JSON.stringify(doc), extensions);
    if (!result.ok) {
      throw new Error(result.error);
    }
    return result.doc.content ?? [];
  };

  it('reads a paragraph with an image', () => {
    expect(
      read(root(paragraph(text('前'), image(src), text('後')))).map((node) => node.type),
    ).toEqual(['paragraph', 'image', 'paragraph']);
  });

  it('reads images in paragraphs of list items and table cells', () => {
    const list: DocNode = {
      type: 'bulletList',
      content: [{ type: 'listItem', content: [paragraph(image(src))] }],
    };
    const table: DocNode = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [{ type: 'tableCell', content: [paragraph(text('a'), image(src))] }],
        },
      ],
    };
    expect(read(root(list, table)).map((node) => node.type)).toEqual(['bulletList', 'table']);
  });
});
