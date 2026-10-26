import {
  acceptCompletion,
  autocompletion,
  completionKeymap,
  completionStatus,
  type Completion,
  type CompletionSource
} from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, insertNewline } from '@codemirror/commands'
import { EditorSelection, EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap, placeholder, tooltips } from '@codemirror/view'
import { getCurrentInstance, h, render, shallowRef, type ShallowRef } from 'vue'

import { useCodeMirror } from '@/components/code-editor/useCodeMirror'
import { chatComposerTheme } from '@/theme/chat/composer'

import { completionIcon } from './complete'
import { composerAppContext, referenceChips } from './references'

/** Each row's glyph, as the layers panel draws it. */
function renderCompletionIcon(completion: Completion): Node | null {
  const icon = completionIcon(completion)
  if (!icon) return null
  const host = document.createElement('span')
  host.className = 'cm-composer-icon'
  render(h(icon, { 'aria-hidden': 'true' }), host)
  return host
}

interface ChatEditorOptions {
  /** The text the field opens with. */
  initial?: string
  label: () => string
  placeholder: () => string
  editable: () => boolean
  /** Attributes for the editable element, such as its test ID. */
  attributes: Record<string, string>
  completions: CompletionSource[]
  onSubmit: () => void
  /** Escape, when no completion is open; leaves Escape to the window otherwise. */
  onCancel?: () => void
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
  const text = shallowRef(options.initial ?? '')
  const appContext = getCurrentInstance()?.appContext ?? null
  const view = useCodeMirror(host, {
    doc: () => text.value,
    label: options.label,
    theme: chatComposerTheme,
    extensions: [
      history(),
      composerAppContext.of(appContext),
      referenceChips,
      autocompletion({
        override: options.completions,
        icons: false,
        activateOnTyping: true,
        addToOptions: [{ render: renderCompletionIcon, position: 20 }]
      }),
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
          { key: 'Shift-Enter', run: insertNewline },
          {
            key: 'Escape',
            run: (editor) => {
              const cancel = options.onCancel
              if (!cancel || completionStatus(editor.state) === 'active') return false
              cancel()
              return true
            }
          }
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

  /** Focuses the field with the caret at the end of the message. */
  function focusEnd() {
    const editor = view.value
    if (!editor) return
    editor.dispatch({ selection: EditorSelection.cursor(editor.state.doc.length) })
    editor.focus()
  }

  return { text, setText, insert, focus: () => view.value?.focus(), focusEnd }
}
