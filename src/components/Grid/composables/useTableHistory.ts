import { ref } from 'vue'
import type { Ref } from 'vue'
import type { CellEditEvent } from '../types'

// Tracks undo/redo stacks for UiTable cell edits.

export interface HistoryEntry {
  rowIndex: number
  colIndex: number
  columnKey: string
  oldValue: unknown
  newValue: unknown
}

type HistoryDirection = 'undo' | 'redo'

interface UseTableHistoryOptions {
  applyEntries: (entries: HistoryEntry[], direction: HistoryDirection) => CellEditEvent[]
  onHistoryApplied?: (direction: HistoryDirection, events: CellEditEvent[]) => void
}

/**
 * Provides undo/redo stacks and helpers for UiTable editing operations.
 */
export function useTableHistory({ applyEntries, onHistoryApplied }: UseTableHistoryOptions) {
  const undoStack = ref<HistoryEntry[][]>([])
  const redoStack = ref<HistoryEntry[][]>([])
  const isApplyingHistory = ref(false)

  /**
   * Pushes a history batch onto the target stack.
   */
  function pushRecord(target: Ref<HistoryEntry[][]>, entries: HistoryEntry[]) {
    if (!entries.length) return
    target.value = [...target.value, entries]
  }

  /**
   * Pops the most recent history batch from the target stack.
   */
  function popRecord(target: Ref<HistoryEntry[][]>) {
    const records = target.value
    if (!records.length) return null
    const next = records.slice(0, records.length - 1)
    const record = records[records.length - 1]
    target.value = next
    return record
  }

  /**
   * Records a new history batch and clears the redo stack.
   */
  function recordHistory(entries: HistoryEntry[]) {
    if (isApplyingHistory.value) return
    const filtered = entries.filter((entry) => entry.oldValue !== entry.newValue)
    if (!filtered.length) return
    pushRecord(
      undoStack,
      filtered.map((entry) => ({ ...entry })),
    )
    redoStack.value = []
  }

  /**
   * Applies a history batch from one stack to another, returning emitted events.
   */
  function applyFromStack(
    source: Ref<HistoryEntry[][]>,
    destination: Ref<HistoryEntry[][]>,
    direction: HistoryDirection,
  ) {
    const record = popRecord(source)
    if (!record) return []
    isApplyingHistory.value = true
    try {
      const entries = direction === 'undo' ? [...record].reverse() : record
      const events = applyEntries(entries, direction)
      pushRecord(destination, record)
      onHistoryApplied?.(direction, events)
      return events
    } finally {
      isApplyingHistory.value = false
    }
  }

  /**
   * Pops the undo stack and reapplies the captured entries.
   */
  function undo() {
    return applyFromStack(undoStack, redoStack, 'undo')
  }

  /**
   * Pops the redo stack and reapplies the captured entries.
   */
  function redo() {
    return applyFromStack(redoStack, undoStack, 'redo')
  }

  return {
    undo,
    redo,
    recordHistory,
    isApplyingHistory,
    undoStack,
    redoStack,
  }
}
