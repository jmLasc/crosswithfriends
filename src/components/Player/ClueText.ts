import {createElement, Fragment, ReactNode} from 'react';
import type {JSX} from 'react';

type Tree = {name?: string; children: Tree[]} | {name: 'text'; value: string};

// Convert Markdown-style emphasis markers to <strong> so the existing HTML
// parser can render them. Both `**text**` and `*text*` become bold — this
// matches NYT-style clue rendering (e.g. "Put all the b*o*l*d* letters"
// highlighting o, d, o, r in bold) rather than CommonMark, where `*` would
// be italic. The character adjacent to each marker must be non-whitespace,
// mirroring CommonMark's flanking rule so stray asterisks (e.g. "5 * 6")
// aren't treated as emphasis.
const applyMarkdown = (text: string): string =>
  text
    .replace(/\*\*([^*\s](?:[^*]*?[^*\s])?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\s](?:[^*]*?[^*\s])?)\*/g, '<strong>$1</strong>');

// parse HTML by creating a template element and walking its tree
// keep only elements and their contents (i.e. no attributes)
const simpleParse = (clue: string): Tree => {
  const template = document.createElement('template');
  template.innerHTML = clue;

  const tree: Tree = {children: []};
  const stack: [Tree, Node][] = [[tree, template.content]];

  while (stack.length) {
    const [parent, node] = stack.pop()!;

    // we never push text nodes onto the stack, so this should not happen
    if (!('children' in parent)) throw new Error('tree invariant broken');

    if (!node.hasChildNodes()) continue;

    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      if (child.nodeType === Node.TEXT_NODE) {
        parent.children.push({
          name: 'text',
          value: child.nodeValue!,
        });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const {tagName} = child as Element;
        const treeChild: Tree = {
          name: tagName.toLowerCase(),
          children: [],
        };
        parent.children.push(treeChild);
        stack.push([treeChild, child]);
      }
    }
  }

  template.remove();

  return tree;
};

// render allowed elements into React elements
const simpleRender = (tree: Tree, allowed: string[]): ReactNode => {
  if (tree.name === 'text') return 'value' in tree ? tree.value : '';

  // if the name is not 'text' then it is guaranteed that `children` exists
  if (!('children' in tree)) throw new Error('unreachable');

  const children = tree.children.map((child) => simpleRender(child, allowed));
  if (tree.name !== undefined && allowed.includes(tree.name)) {
    return createElement(tree.name, {}, ...children);
  }
  return createElement(Fragment, {}, ...children);
};

export default function ClueText({text = ''}): JSX.Element {
  // case where we should italicize the whole clue
  if (text.startsWith('""') && text.endsWith('""')) {
    return createElement('i', {}, text.slice(1, -1));
  }

  // expand Markdown emphasis (**bold**, *italic*) into HTML so the rest of
  // this component can treat it uniformly with HTML clues
  const processed = text.includes('*') ? applyMarkdown(text) : text;

  // fast path for text with no HTML and no entities
  if (!processed.match(/[<>]|&[^;]+;/)) return createElement('span', {}, processed);

  // otherwise, parse HTML and render allowed elements
  const allowed = ['em', 'strong', 'u', 'i', 'b', 'sup', 'sub'];
  const tree = simpleParse(processed);
  return createElement('span', {}, simpleRender(tree, allowed));
}
