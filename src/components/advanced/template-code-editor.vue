<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import { Prec, RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { basicSetup } from 'codemirror';

interface Props {
  modelValue: string;
  /** Blocks Enter from inserting a newline — for single-line fields like a template title. */
  singleLine?: boolean;
  /** Ghost text shown when the editor is empty. */
  placeholderText?: string;
  /** CSS min-height for the editor's scroll area (ignored when singleLine). */
  minHeight?: string;
}

const props = withDefaults(defineProps<Props>(), {
  singleLine: false,
  placeholderText: '',
  minHeight: '140px'
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const containerRef = shallowRef<HTMLDivElement | null>(null);
let view: EditorView | null = null;

const tplKeywordDeco = Decoration.mark({ class: 'cm-gotpl-keyword' });
const tplVarDeco = Decoration.mark({ class: 'cm-gotpl-var' });
const htmlTagDeco = Decoration.mark({ class: 'cm-html-tag' });
const phDeco = Decoration.mark({ class: 'cm-placeholder-token' });

function buildDecorations(v: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of v.visibleRanges) {
    const text = v.state.doc.sliceString(from, to);
    // Linear scan for non-overlapping tokens:
    // 1. Go template blocks: {{ ... }}
    // 2. Telegram HTML tags: <...>
    // 3. Legacy placeholders: {var}
    const tokenRegex = /(\{\{[\s\S]*?\}\})|(<\/?[a-zA-Z][^>]*>)|(\{([a-zA-Z_][a-zA-Z0-9_]*)\})/g;
    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(text)) !== null) {
      const start = from + match.index;
      const end = start + match[0].length;
      const matchText = match[0];
      if (matchText.startsWith('{{')) {
        if (/^\{\{\s*(if|else|end|range|with|printf|lower|upper|trim|title|default)\b/.test(matchText)) {
          builder.add(start, end, tplKeywordDeco);
        } else {
          builder.add(start, end, tplVarDeco);
        }
      } else if (matchText.startsWith('<')) {
        builder.add(start, end, htmlTagDeco);
      } else if (matchText.startsWith('{')) {
        builder.add(start, end, phDeco);
      }
    }
  }
  return builder.finish();
}

const syntaxHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(v: EditorView) {
      this.decorations = buildDecorations(v);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  {
    decorations: instance => instance.decorations
  }
);

function buildExtensions() {
  const extensions = [
    basicSetup,
    EditorView.lineWrapping,
    syntaxHighlighter,
    EditorView.theme({
      '&': { fontSize: '13px' },
      '.cm-content': { fontFamily: 'var(--n-font-family-mono, monospace)' },
      '.cm-scroller': props.singleLine ? {} : { minHeight: props.minHeight },
      '.cm-placeholder-token': {
        color: '#2080f0',
        fontWeight: '600',
        backgroundColor: 'rgba(32, 128, 240, 0.08)',
        borderRadius: '3px',
        padding: '1px 3px'
      },
      '.cm-gotpl-var': {
        color: '#18a058',
        fontWeight: '600',
        backgroundColor: 'rgba(24, 160, 88, 0.1)',
        borderRadius: '3px',
        padding: '1px 4px'
      },
      '.cm-gotpl-keyword': {
        color: '#8a2be2',
        fontWeight: '600',
        backgroundColor: 'rgba(138, 43, 226, 0.08)',
        borderRadius: '3px',
        padding: '1px 4px'
      },
      '.cm-html-tag': {
        color: '#f0a020',
        fontWeight: '500'
      }
    }),
    EditorView.updateListener.of(u => {
      if (!u.docChanged) return;
      const next = u.state.doc.toString();
      if (next !== props.modelValue) emit('update:modelValue', next);
    })
  ];
  if (props.placeholderText) extensions.push(cmPlaceholder(props.placeholderText));
  if (props.singleLine) {
    extensions.push(
      Prec.highest(
        keymap.of([
          { key: 'Enter', run: () => true },
          { key: 'Mod-Enter', run: () => true }
        ])
      )
    );
  }
  return extensions;
}

onMounted(() => {
  if (!containerRef.value) return;
  view = new EditorView({
    doc: props.modelValue ?? '',
    extensions: buildExtensions(),
    parent: containerRef.value
  });
});

watch(
  () => props.modelValue,
  next => {
    if (!view) return;
    const current = view.state.doc.toString();
    if (next === current) return;
    view.dispatch({ changes: { from: 0, to: current.length, insert: next ?? '' } });
  }
);

onBeforeUnmount(() => {
  view?.destroy();
  view = null;
});

function insertText(text: string) {
  if (!view) return;
  const { state } = view;
  const mainSel = state.selection.main;
  view.dispatch({
    changes: { from: mainSel.from, to: mainSel.to, insert: text },
    selection: { anchor: mainSel.from + text.length },
    scrollIntoView: true
  });
  view.focus();
}

function focus() {
  view?.focus();
}

function getValue(): string {
  return view ? view.state.doc.toString() : (props.modelValue ?? '');
}

defineExpose({
  insertText,
  focus,
  getValue
});
</script>

<template>
  <div ref="containerRef" class="template-code-editor" :class="{ 'template-code-editor--single-line': singleLine }" />
</template>

<style scoped>
.template-code-editor {
  border: 1px solid var(--n-border-color, #e0e0e6);
  border-radius: 6px;
  overflow: hidden;
  transition: border-color 0.2s ease;
  background-color: #fff;
  min-height: 180px;
  display: flex;
  flex-direction: column;
}

.template-code-editor--single-line {
  min-height: 34px;
}

.template-code-editor:focus-within {
  border-color: var(--primary-color, #2080f0);
}

.template-code-editor :deep(.cm-editor) {
  outline: none;
  flex: 1;
  min-height: inherit;
}

.template-code-editor :deep(.cm-scroller) {
  min-height: inherit;
  font-family: var(--n-font-family-mono, monospace);
  font-size: 13px;
  line-height: 1.6;
}

.template-code-editor--single-line :deep(.cm-scroller) {
  overflow-x: auto;
}

.template-code-editor--single-line :deep(.cm-gutters) {
  display: none;
}

/*
 * :global(html.dark) .foo { ... } is invalid Vue SFC scoped-CSS syntax —
 * :global() must wrap the entire selector, not just a leading part of it.
 * Vue's scoped-CSS compiler silently drops any rule shaped that way (no
 * warning, no error — it just never reaches the page), which is why dark
 * mode previously did nothing here. Wrapping the whole compound selector
 * in one :global(...) is the form Vue actually supports.
 */
:global(html.dark .template-code-editor) {
  border-color: var(--n-border-color, #2d2d30);
  background-color: #18181c;
}

:global(html.dark .template-code-editor .cm-editor) {
  background: #18181c;
  color: #e5e7eb;
}

:global(html.dark .template-code-editor .cm-gutters) {
  background: #1f1f23;
  color: #6b7280;
  border-right-color: #2d2d30;
}

:global(html.dark .template-code-editor .cm-activeLine) {
  background: rgba(255, 255, 255, 0.04);
}

:global(html.dark .template-code-editor .cm-activeLineGutter) {
  background: rgba(255, 255, 255, 0.06);
}

:global(html.dark .template-code-editor .cm-placeholder-token) {
  background-color: rgba(32, 128, 240, 0.18);
  color: #70aaff;
}

:global(html.dark .template-code-editor .cm-gotpl-var) {
  background-color: rgba(24, 160, 88, 0.2);
  color: #63e2b7;
}

:global(html.dark .template-code-editor .cm-gotpl-keyword) {
  background-color: rgba(138, 43, 226, 0.2);
  color: #c084fc;
}

:global(html.dark .template-code-editor .cm-html-tag) {
  color: #f59e0b;
}
</style>
