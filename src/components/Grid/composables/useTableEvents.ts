import type { Ref } from 'vue'
import type { CellEditEvent } from '../types'
import { ZOOM_STEP } from '../utils/constants'

// Keyboard, clipboard, and zoom event handlers shared across UiTable.

interface NextCellPayload {
  rowIndex: number
  key: string
  colIndex?: number
  shift?: boolean
  handled?: boolean
  direction?: 'up' | 'down'
}

interface UseTableEventsOptions {
  isEditingCell: Ref<boolean>
  focusContainer: () => void
  selection: {
    moveSelection: (rowDelta: number, colDelta: number, options?: { extend?: boolean }) => void
    moveByTab: (forward: boolean) => boolean
    moveByPage: (direction: number, options?: { extend?: boolean }) => boolean
    triggerEditForSelection: () => { rowIndex: number; columnKey: string } | null
    clearSelectionValues: () => void
    selectCell: (
      rowIndex: number,
      columnKey: string,
      focus?: boolean,
      options?: { colIndex?: number },
    ) => void
    scheduleOverlayUpdate: () => void
    goToRowEdge: (edge: 'start' | 'end', options?: { extend?: boolean }) => boolean
    goToColumnEdge: (edge: 'start' | 'end', options?: { extend?: boolean }) => boolean
    goToGridEdge: (edge: 'start' | 'end', options?: { extend?: boolean }) => boolean
  }
  clipboard: {
    copySelectionToClipboard: () => Promise<void> | void
    pasteClipboardData: () => Promise<void> | void
    copySelectionToClipboardWithFlash?: () => Promise<void> | void
    pasteClipboardDataWithFlash?: () => Promise<void> | void
  }
  history: {
    undo: () => CellEditEvent[]
    redo: () => CellEditEvent[]
  }
  zoom: {
    handleZoomWheel: (event: WheelEvent) => void
    adjustZoom: (delta: number) => void
    setZoom: (value: number) => void
  }
  requestEdit: (rowIndex: number, columnKey: string) => void
}

/**
 * Provides shared keyboard and wheel event handlers for UiTable interactions.
 */
export function useTableEvents({
  isEditingCell,
  focusContainer,
  selection,
  clipboard,
  history,
  zoom,
  requestEdit,
}: UseTableEventsOptions) {
  /**
   * Handles keyboard navigation, clipboard shortcuts, history, and zoom commands.
   */
  async function handleKeydown(event: KeyboardEvent) {
    const zoomModifier = event.ctrlKey || event.metaKey
    if (zoomModifier && !isEditingCell.value) {
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        zoom.adjustZoom(ZOOM_STEP)
        focusContainer()
        return
      }
      if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        zoom.adjustZoom(-ZOOM_STEP)
        focusContainer()
        return
      }
      if (event.key === '0') {
        event.preventDefault()
        zoom.setZoom(1)
        focusContainer()
        return
      }
    }

    if (isEditingCell.value) return

    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase()
      if (!isEditingCell.value) {
        if (key === 'z') {
          event.preventDefault()
          if (event.shiftKey) {
            history.redo()
          } else {
            history.undo()
          }
          selection.scheduleOverlayUpdate()
          return
        }
        if (key === 'y') {
          event.preventDefault()
          history.redo()
          selection.scheduleOverlayUpdate()
          return
        }
      }
      if (key === 'c') {
        event.preventDefault()
        if (clipboard.copySelectionToClipboardWithFlash) {
          await clipboard.copySelectionToClipboardWithFlash()
        } else {
          await clipboard.copySelectionToClipboard()
        }
        return
      }
      if (key === 'v') {
        event.preventDefault()
        if (clipboard.pasteClipboardDataWithFlash) {
          await clipboard.pasteClipboardDataWithFlash()
        } else {
          await clipboard.pasteClipboardData()
        }
        return
      }
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      selection.clearSelectionValues()
      return
    }

    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault()
        if (event.ctrlKey || event.metaKey) {
          selection.goToColumnEdge('start', { extend: event.shiftKey })
        } else {
          selection.moveSelection(-1, 0, { extend: event.shiftKey })
        }
        break
      case 'ArrowDown':
        event.preventDefault()
        if (event.ctrlKey || event.metaKey) {
          selection.goToColumnEdge('end', { extend: event.shiftKey })
        } else {
          selection.moveSelection(1, 0, { extend: event.shiftKey })
        }
        break
      case 'ArrowLeft':
        event.preventDefault()
        if (event.ctrlKey || event.metaKey) {
          selection.goToRowEdge('start', { extend: event.shiftKey })
        } else {
          selection.moveSelection(0, -1, { extend: event.shiftKey })
        }
        break
      case 'ArrowRight':
        event.preventDefault()
        if (event.ctrlKey || event.metaKey) {
          selection.goToRowEdge('end', { extend: event.shiftKey })
        } else {
          selection.moveSelection(0, 1, { extend: event.shiftKey })
        }
        break
      case 'Tab': {
        const moved = selection.moveByTab(!event.shiftKey)
        if (moved) {
          event.preventDefault()
        }
        break
      }
      case 'Home':
        event.preventDefault()
        if (event.ctrlKey || event.metaKey) {
          selection.goToGridEdge('start', { extend: event.shiftKey })
        } else {
          selection.goToRowEdge('start', { extend: event.shiftKey })
        }
        break
      case 'End':
        event.preventDefault()
        if (event.ctrlKey || event.metaKey) {
          selection.goToGridEdge('end', { extend: event.shiftKey })
        } else {
          selection.goToRowEdge('end', { extend: event.shiftKey })
        }
        break
      case 'PageUp': {
        const moved = selection.moveByPage(-1, { extend: event.shiftKey })
        if (moved) {
          event.preventDefault()
        }
        break
      }
      case 'PageDown': {
        const moved = selection.moveByPage(1, { extend: event.shiftKey })
        if (moved) {
          event.preventDefault()
        }
        break
      }
      case 'Enter':
        event.preventDefault()
        {
          const target = selection.triggerEditForSelection()
          if (target) {
            requestEdit(target.rowIndex, target.columnKey)
          }
        }
        break
    }
  }

  /**
   * Forwards wheel events to the zoom handler so pinch-to-zoom works consistently.
   */
  function handleWheel(event: WheelEvent) {
    zoom.handleZoomWheel(event)
  }

  /**
   * Moves focus to the next cell after an edit concludes, honoring direction hints.
   */
  function focusNextCell(payload: NextCellPayload) {
    selection.selectCell(payload.rowIndex, payload.key, false, { colIndex: payload.colIndex })
    let handled = false
    if (payload.direction === 'up') {
      selection.moveSelection(-1, 0)
      handled = true
    } else if (payload.direction === 'down') {
      selection.moveSelection(1, 0)
      handled = true
    } else {
      handled = selection.moveByTab(!(payload.shift ?? false))
    }
    payload.handled = handled
  }

  return {
    handleKeydown,
    handleWheel,
    focusNextCell,
  }
}
