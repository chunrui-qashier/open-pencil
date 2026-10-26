import {
  acceptCompletion,
  autocompletion,
  completionKeymap,
  completionStatus,
  type CompletionSource
} from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, insertNewline } from '@codemirror/commands'
import { EditorSelection, EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap, placeholder, tooltips } from '@codemirror/view'
import { getCurrentInstance, shallowRef, type ShallowRef } from 'vue'

import { useCodeMirror } from '@/components/code-editor/useCodeMirror'
import { chatComposerTheme } from '@/theme/chat/composer'

import { composerAppContext, referenceChips } from './references'

interface ChatEditorOptions {
  label: () => string
  placeholder: () => string
  editable: () => boolean
  /** Attributes for the editable element, such as its test ID. */
  attributes: Record<string, string>
  completions: CompletionSource[]
  onSubmit: () => void
}

/**
 * The chat's message field: CodeMirror owns typing, composition, history, and completions,
 * and references in the text show as chips that edit as one unit. Enter sends unless a
 * completion is open, and Shift+Enter starts a new line.
 */
export function useChatEditor(
  host: Readonly<ShallowRef<HTMLDivElement | null>>,
  options: ChatEditorOptions
) {
  const text = shallowRef('')
  const appContext = getCurrentInstance()?.appContext ?? null
  const view = useCodeMirror(host, {
    doc: () => text.value,
    label: options.label,
    theme: chatComposerTheme,
    extensions: [
      history(),
      composerAppContext.of(appContext),
      referenceChips,
      autocompletion({ override: options.completions, icons: false, activateOnTyping: true }),
      // The list opens above the field and may be wider than the panel, which clips its content.
      tooltips({ parent: document.body }),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of(options.attributes),
      Prec.highest(
        keymap.of([
          {
            key: 'Enter',
            run: (editor) => {
              if (completionStatus(editor.state) === 'active') return acceptCompletion(editor)
              options.onSubmit()
              return true
            }
          },
          { key: 'Shift-Enter', run: insertNewline }
        ])
      ),
      keymap.of([...completionKeymap, ...historyKeymap, ...defaultKeymap]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) text.value = update.state.doc.toString()
      })
    ],
    reactive: [
      () => placeholder(options.placeholder()),
      // Read-only rather than not editable: the field stays focusable and reports itself
      // disabled, as the textarea it replaced did, until the chat is ready again.
      () => EditorState.readOnly.of(!options.editable()),
      () => EditorView.contentAttributes.of(options.editable() ? {} : { 'aria-disabled': 'true' })
    ]
  })

  /** Replaces the whole message, leaving the caret at its end. */
  function setText(value: string) {
    const editor = view.value
    text.value = value
    if (!editor) return
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: value },
      selection: EditorSelection.cursor(value.length)
    })
  }

  /** Inserts text at the caret, such as references to the selected layers. */
  function insert(value: string) {
    const editor = view.value
    if (!editor) return
    editor.dispatch(editor.state.replaceSelection(value))
    editor.focus()
  }

  return { text, setText, insert, focus: () => view.value?.focus() }
}
