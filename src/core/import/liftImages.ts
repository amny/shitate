import type { DocNode, DocRoot } from '../model';

/** Nodes whose first child must be a paragraph (`paragraph block*`). */
const PARAGRAPH_FIRST_TYPES: ReadonlySet<string> = new Set(['listItem', 'taskItem']);

function trimHardBreaks(nodes: readonly DocNode[]): DocNode[] {
  const start = nodes.findIndex((node) => node.type !== 'hardBreak');
  if (start === -1) {
    return [];
  }
  const end = nodes.findLastIndex((node) => node.type !== 'hardBreak');
  return nodes.slice(start, end + 1);
}

function paragraphWith(source: DocNode, content: readonly DocNode[]): DocNode {
  const { content: _omitted, ...rest } = source;
  return content.length === 0 ? rest : { ...rest, content: [...content] };
}

/** Splits a paragraph at its images: text before / after each image stays as its own paragraph. */
function splitParagraph(paragraph: DocNode, children: readonly DocNode[]): DocNode[] {
  const { blocks, inline } = children.reduce<{ blocks: DocNode[]; inline: DocNode[] }>(
    (acc, child) => {
      if (child.type !== 'image') {
        return { blocks: acc.blocks, inline: [...acc.inline, child] };
      }
      const text = trimHardBreaks(acc.inline);
      const before = text.length === 0 ? [] : [paragraphWith(paragraph, text)];
      return { blocks: [...acc.blocks, ...before, child], inline: [] };
    },
    { blocks: [], inline: [] },
  );
  const rest = trimHardBreaks(inline);
  return rest.length === 0 ? blocks : [...blocks, paragraphWith(paragraph, rest)];
}

function liftInChildren(children: readonly DocNode[], parentType: string): DocNode[] {
  return children.flatMap((child, index) => {
    const node = liftInNode(child);
    const content = node.content;
    if (node.type !== 'paragraph' || !content?.some((inner) => inner.type === 'image')) {
      return [node];
    }
    const blocks = splitParagraph(node, content);
    const needsLeadingParagraph =
      index === 0 && PARAGRAPH_FIRST_TYPES.has(parentType) && blocks[0]?.type !== 'paragraph';
    return needsLeadingParagraph ? [paragraphWith(node, []), ...blocks] : blocks;
  });
}

function liftInNode(node: DocNode): DocNode {
  return node.content === undefined
    ? node
    : { ...node, content: liftInChildren(node.content, node.type) };
}

/**
 * Moves images out of paragraphs (design.md §6). Images are block nodes (§5.1), but TipTap JSON
 * written by AI or other editors often has them inline in a paragraph, which fails the schema.
 */
export function liftImagesFromParagraphs(doc: DocRoot): DocRoot {
  return doc.content === undefined
    ? doc
    : { ...doc, content: liftInChildren(doc.content, doc.type) };
}
