import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { FILL_HANDLE_SIZE, clamp } from '../utils/constants'
import { getCellElement, scrollCellIntoView, elementFromPoint } from '../utils/gridUtils'
import type {
  CellEditEvent,
  UiTableColumn,
  UiTableSelectionSnapshot,
  UiTableSelectionSnapshotRange,
  UiTableSelectionRangeInput,
  UiTableSelectedCell,
  VisibleRow,
} from '../types'
import type { HistoryEntry } from './useTableHistory'
import { canPasteIntoColumn } from './useTableEditing'

export interface SelectionPoint {
  rowIndex: number
  colIndex: number
}

export interface SelectionRange {
  anchor: SelectionPoint
  focus: SelectionPoint
  startRow: number
  endRow: number
  startCol: number
  endCol: number
}

export interface SelectionArea {
  startRow: number
  endRow: number
  startCol: number
  endCol: number
}

export interface SelectedRowPayload {
  displayIndex: number
  originalIndex: number
  row: any
}

interface UseTableSelectionOptions {
  containerRef: Ref<HTMLDivElement | null>
  localColumns: Ref<UiTableColumn[]>
  processedRows: ComputedRef<VisibleRow[]>
  totalRowCount: Ref<number>
  viewport: {
    effectiveRowHeight: Ref<number>
    viewportHeight: Ref<number>
    scrollTop: Ref<number>
    clampScrollTopValue: (value: number) => number
    scrollToColumn?: (key: string) => void
  }
  isEditingCell: Ref<boolean>
  focusContainer: () => void
  emitSelectionChange: (snapshot: UiTableSelectionSnapshot) => void
  setCellValueDirect: (
    rowIndex: number,
    colIndex: number,
    value: unknown,
    options?: {
      collector?: CellEditEvent[]
      historyCollector?: HistoryEntry[]
      suppressHistory?: boolean
      force?: boolean
    },
  ) => boolean
  setCellValueFromPaste: (
    rowIndex: number,
    colIndex: number,
    rawValue: string,
    options?: {
      collector?: CellEditEvent[]
      historyCollector?: HistoryEntry[]
      suppressHistory?: boolean
    },
  ) => boolean
  getCellRawValue: (rowIndex: number, colIndex: number) => unknown
  dispatchEvents: (events: CellEditEvent[]) => void
  recordHistory: (entries: HistoryEntry[]) => void
  stopAutoScroll: () => void
  updateAutoScroll: (event: MouseEvent) => void
  lastPointerEvent: Ref<MouseEvent | null>
  deleteRows?: (rows: SelectedRowPayload[]) => void
  rowIndexColumnKey?: string
}

export function useTableSelection(options: UseTableSelectionOptions) {
  const {
    containerRef,
    localColumns,
    processedRows,
    totalRowCount,
    viewport,
    isEditingCell,
    focusContainer,
    emitSelectionChange,
    setCellValueDirect,
    setCellValueFromPaste,
    getCellRawValue,
    dispatchEvents,
    recordHistory,
    stopAutoScroll,
    updateAutoScroll,
    lastPointerEvent,
    deleteRows,
    rowIndexColumnKey,
  } = options

  const selectedCell = ref<SelectionPoint | null>(null)
  const anchorCell = ref<SelectionPoint | null>(null)
  const selectionRanges = ref<SelectionRange[]>([])
  const activeRangeIndex = ref(-1)
  const dragAnchorCell = ref<SelectionPoint | null>(null)
  const isDraggingSelection = ref(false)
  const fullRowSelection = ref<{ start: number; end: number } | null>(null)
  const rowSelectionAnchor = ref<number | null>(null)
  const isRowSelectionDragging = ref(false)
  const fullColumnSelection = ref<number | null>(null)
  const fillOriginRange = ref<SelectionRange | null>(null)
  const fillPreviewRange = ref<SelectionArea | null>(null)
  const fillTargetCell = ref<SelectionPoint | null>(null)
  const isFillDragging = ref(false)
  const fillHandleStyle = ref<Record<string, string> | null>(null)
  const lastCommittedFillArea = ref<SelectionArea | null>(null)
  const lastSelectionSignature = ref('')

  let overlayRaf: number | null = null

  function getGridDimensions() {
    return {
      rowCount: totalRowCount.value,
      colCount: localColumns.value.length,
    }
  }

  function clampPointToGrid(point: SelectionPoint) {
    const { rowCount, colCount } = getGridDimensions()
    const maxRow = Math.max(rowCount - 1, 0)
    const maxCol = Math.max(colCount - 1, 0)
    return {
      rowIndex: clamp(point.rowIndex, 0, maxRow),
      colIndex: clamp(point.colIndex, 0, maxCol),
    }
  }

  function createRange(anchor: SelectionPoint, focus: SelectionPoint): SelectionRange {
    const clampedAnchor = clampPointToGrid(anchor)
    const clampedFocus = clampPointToGrid(focus)
    const startRow = Math.min(clampedAnchor.rowIndex, clampedFocus.rowIndex)
    const endRow = Math.max(clampedAnchor.rowIndex, clampedFocus.rowIndex)
    const startCol = Math.min(clampedAnchor.colIndex, clampedFocus.colIndex)
    const endCol = Math.max(clampedAnchor.colIndex, clampedFocus.colIndex)
    return {
      anchor: clampedAnchor,
      focus: clampedFocus,
      startRow,
      endRow,
      startCol,
      endCol,
    }
  }

  function normalizeRange(range: SelectionRange): SelectionRange | null {
    const { rowCount, colCount } = getGridDimensions()
    if (rowCount <= 0 || colCount <= 0) return null
    return createRange(range.anchor, range.focus)
  }

  function scheduleOverlayUpdate() {
    if (overlayRaf !== null) return
    overlayRaf = requestAnimationFrame(() => {
      overlayRaf = null
      updateSelectionOverlay()
    })
  }

  function updateSelectionOverlay() {
    const container = containerRef.value
    const active = getActiveRange()
    if (
      !container ||
      !active ||
      !selectedCell.value ||
      Boolean(fullRowSelection.value) ||
      fullColumnSelection.value !== null ||
      isEditingCell.value ||
      isFillDragging.value
    ) {
      fillHandleStyle.value = null
      return
    }
    const column = localColumns.value[active.endCol]
    if (!column) {
      fillHandleStyle.value = null
      return
    }
    if (column.isSystem) {
      fillHandleStyle.value = null
      return
    }
    const cell = getCellElement(container, active.endRow, column.key)
    if (!cell) {
      fillHandleStyle.value = null
      return
    }
    const containerRect = container.getBoundingClientRect()
    const cellRect = cell.getBoundingClientRect()
    const pinnedRowIndexCell = container.querySelector<HTMLElement>(
      `.ui-table__row-index[data-row-index="${active.endRow}"]`,
    )
    const size = FILL_HANDLE_SIZE
    if (pinnedRowIndexCell) {
      const pinnedRect = pinnedRowIndexCell.getBoundingClientRect()
      if (cellRect.right - size <= pinnedRect.right + 0.5) {
        fillHandleStyle.value = null
        return
      }
    }
    const left = container.scrollLeft + (cellRect.right - containerRect.left) - size
    const top = container.scrollTop + (cellRect.bottom - containerRect.top) - size
    fillHandleStyle.value = {
      width: `${size}px`,
      height: `${size}px`,
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
    }
  }

  function getActiveRange(): SelectionRange | null {
    if (!selectionRanges.value.length) return null
    const index = clamp(activeRangeIndex.value, 0, selectionRanges.value.length - 1)
    return selectionRanges.value[index] ?? null
  }

  function applySelectionUpdate(ranges: SelectionRange[], activeIndex: number) {
    const normalized = ranges
      .map(normalizeRange)
      .filter((item): item is SelectionRange => item != null)

    if (!normalized.length) {
      selectionRanges.value = []
      activeRangeIndex.value = -1
      selectedCell.value = null
      anchorCell.value = null
      dragAnchorCell.value = null
      fillPreviewRange.value = null
      fillOriginRange.value = null
      fillTargetCell.value = null
      isFillDragging.value = false
      emitSelectionChangeSnapshot(true)
      scheduleOverlayUpdate()
      return
    }

    const index = clamp(activeIndex, 0, normalized.length - 1)
    selectionRanges.value = normalized
    activeRangeIndex.value = index
    const active = normalized[index]
    selectedCell.value = { ...active.focus }
    anchorCell.value = { ...active.anchor }
    dragAnchorCell.value = { ...active.anchor }
    fillPreviewRange.value = null
    fillOriginRange.value = null
    fillTargetCell.value = null
    isFillDragging.value = false
    emitSelectionChangeSnapshot(true)
    scheduleOverlayUpdate()
  }

  function setSingleCellSelection(point: SelectionPoint) {
    applySelectionUpdate([createRange(point, point)], 0)
  }

  function extendActiveRangeTo(point: SelectionPoint) {
    const active = getActiveRange()
    if (!active) {
      setSingleCellSelection(point)
      return
    }
    const range = createRange(active.anchor, point)
    const next = selectionRanges.value.slice()
    next[activeRangeIndex.value] = range
    applySelectionUpdate(next, activeRangeIndex.value)
  }

  function addAdditionalRange(range: SelectionRange) {
    const next = selectionRanges.value.concat(range)
    applySelectionUpdate(next, next.length - 1)
  }

  function findRangeIndexContaining(point: SelectionPoint) {
    return selectionRanges.value.findIndex(
      (range) =>
        point.rowIndex >= range.startRow &&
        point.rowIndex <= range.endRow &&
        point.colIndex >= range.startCol &&
        point.colIndex <= range.endCol,
    )
  }

  function toggleCellSelection(point: SelectionPoint) {
    const index = findRangeIndexContaining(point)
    if (index !== -1) {
      if (selectionRanges.value.length <= 1) {
        setSingleCellSelection(point)
        return
      }
      const next = selectionRanges.value.slice()
      next.splice(index, 1)
      const nextIndex = Math.min(index, next.length - 1)
      applySelectionUpdate(next, nextIndex)
      return
    }
    addAdditionalRange(createRange(point, point))
  }

  function clearCellSelection() {
    applySelectionUpdate([], -1)
  }

  function emitSelectionChangeSnapshot(force = false) {
    const snapshot = getSelectionSnapshot()
    const signature = JSON.stringify(snapshot)
    if (!force && signature === lastSelectionSignature.value) return
    lastSelectionSignature.value = signature
    emitSelectionChange(snapshot)
  }

  function getSelectionSnapshot(): UiTableSelectionSnapshot {
    return {
      ranges: selectionRanges.value.map((range) => ({
        startRow: range.startRow,
        endRow: range.endRow,
        startCol: range.startCol,
        endCol: range.endCol,
        anchor: { ...range.anchor },
        focus: { ...range.focus },
      })) as UiTableSelectionSnapshotRange[],
      activeRangeIndex: activeRangeIndex.value,
      activeCell: selectedCell.value ? { ...selectedCell.value } : null,
    }
  }

  function focusCell(rowIndex: number, column: number | string, options?: { extend?: boolean }) {
    if (!hasGridData()) return false
    const colIndex =
      typeof column === 'number'
        ? column
        : localColumns.value.findIndex((col) => col.key === column)
    if (colIndex < 0) return false
    const { rowCount, colCount } = getGridDimensions()
    const target: SelectionPoint = {
      rowIndex: clamp(rowIndex, 0, Math.max(rowCount - 1, 0)),
      colIndex: clamp(colIndex, 0, Math.max(colCount - 1, 0)),
    }
    clearFullRowSelection()
    clearFullColumnSelection()
    if (options?.extend) {
      extendActiveRangeTo(target)
    } else {
      setSingleCellSelection(target)
    }
    focusContainer()
    nextTick(() => scrollSelectionIntoView())
    return true
  }

  function getActiveCell() {
    if (anchorCell.value) {
      return { ...anchorCell.value }
    }
    return selectedCell.value ? { ...selectedCell.value } : null
  }

  function getSelectionCursor(option?: { preferAnchor?: boolean }) {
    if (option?.preferAnchor) {
      return anchorCell.value ?? selectedCell.value
    }
    return selectedCell.value ?? anchorCell.value
  }

  function goToRowEdge(edge: 'start' | 'end', options?: { extend?: boolean }) {
    const active = getSelectionCursor()
    if (!active) return false
    const targetCol = edge === 'start' ? 0 : Math.max(0, localColumns.value.length - 1)
    return focusCell(active.rowIndex, targetCol, options)
  }

  function goToColumnEdge(edge: 'start' | 'end', options?: { extend?: boolean }) {
    const active = getSelectionCursor()
    if (!active) return false
    const targetRow = edge === 'start' ? 0 : Math.max(0, totalRowCount.value - 1)
    return focusCell(targetRow, active.colIndex, options)
  }

  function goToGridEdge(edge: 'start' | 'end', options?: { extend?: boolean }) {
    const targetRow = edge === 'start' ? 0 : Math.max(0, totalRowCount.value - 1)
    const targetCol = edge === 'start' ? 0 : Math.max(0, localColumns.value.length - 1)
    return focusCell(targetRow, targetCol, options)
  }

  function moveByPage(direction: number, options?: { extend?: boolean }) {
    const active = getSelectionCursor()
    if (!active) return false
    const rowHeight = viewport.effectiveRowHeight.value || 1
    const viewportHeight = viewport.viewportHeight.value || rowHeight
    const pageSize = Math.max(1, Math.round(viewportHeight / rowHeight))
    const targetRow = active.rowIndex + direction * pageSize
    return focusCell(targetRow, active.colIndex, options)
  }

  function hasGridData() {
    return totalRowCount.value > 0 && localColumns.value.length > 0
  }

  function clearFullRowSelection() {
    fullRowSelection.value = null
    rowSelectionAnchor.value = null
  }

  function clearFullColumnSelection() {
    fullColumnSelection.value = null
  }

  function setFullRowSelectionRange(
    startRow: number,
    endRow: number,
    options?: { focus?: boolean; preserveAnchor?: boolean; anchorRow?: number | null },
  ) {
    if (!hasGridData()) return
    const { rowCount, colCount } = getGridDimensions()
    if (rowCount <= 0 || colCount <= 0) return
    const normalizedStart = clamp(Math.min(startRow, endRow), 0, rowCount - 1)
    const normalizedEnd = clamp(Math.max(startRow, endRow), 0, rowCount - 1)
    if (normalizedStart > normalizedEnd) return

    const nextAnchor = options?.preserveAnchor
      ? rowSelectionAnchor.value
      : (options?.anchorRow ?? normalizedStart)

    rowSelectionAnchor.value =
      nextAnchor != null ? clamp(nextAnchor, normalizedStart, normalizedEnd) : normalizedStart

    fullRowSelection.value = {
      start: normalizedStart,
      end: normalizedEnd,
    }

    clearFullColumnSelection()
    const anchorPoint: SelectionPoint = { rowIndex: normalizedStart, colIndex: 0 }
    const focusPoint: SelectionPoint = {
      rowIndex: normalizedEnd,
      colIndex: Math.max(colCount - 1, 0),
    }
    applySelectionUpdate([createRange(anchorPoint, focusPoint)], 0)

    const activeRow = rowSelectionAnchor.value ?? normalizedStart
    selectedCell.value = { rowIndex: activeRow, colIndex: 0 }
    anchorCell.value = { rowIndex: activeRow, colIndex: 0 }

    if (options?.focus ?? true) {
      focusContainer()
    }
  }

  function selectCell(
    rowIndex: number,
    columnKey: string,
    focus = true,
    options?: { fullRow?: boolean; fullColumn?: boolean; colIndex?: number },
  ) {
    if (!hasGridData()) return
    const colIndex =
      options?.colIndex ?? localColumns.value.findIndex((col) => col.key === columnKey)

    if (options?.fullRow) {
      setFullRowSelectionRange(rowIndex, rowIndex, { focus, anchorRow: rowIndex })
      return
    }

    if (options?.fullColumn) {
      if (colIndex !== -1) {
        fullColumnSelection.value = clamp(colIndex, 0, Math.max(localColumns.value.length - 1, 0))
      } else {
        fullColumnSelection.value = null
      }
      clearFullRowSelection()
      clearCellSelection()
      if (focus) focusContainer()
      return
    }

    clearFullRowSelection()
    clearFullColumnSelection()

    if (colIndex === -1) {
      if (focus) focusContainer()
      return
    }

    const clampedRow = clamp(rowIndex, 0, totalRowCount.value - 1)
    const clampedCol = clamp(colIndex, 0, localColumns.value.length - 1)
    setSingleCellSelection({ rowIndex: clampedRow, colIndex: clampedCol })
    if (focus) focusContainer()
  }

  function scrollSelectionIntoView(attempt = 0) {
    const container = containerRef.value
    if (!container) return

    const activeRange = getActiveRange()
    const cursor = getSelectionCursor()
    if (!activeRange && !cursor) return

    const rowTargets = new Set<number>()
    if (activeRange) {
      rowTargets.add(activeRange.startRow)
      rowTargets.add(activeRange.endRow)
    } else if (cursor) {
      rowTargets.add(cursor.rowIndex)
    }

    const colTargets = new Set<number>()
    if (activeRange) {
      colTargets.add(activeRange.startCol)
      colTargets.add(activeRange.endCol)
    } else if (cursor) {
      colTargets.add(cursor.colIndex)
    }

    // Ensure vertical visibility for the full active span (anchor/focus)
    if (rowTargets.size) {
      const rowHeight = viewport.effectiveRowHeight.value || 1
      const viewportHeight = viewport.viewportHeight.value || rowHeight
      const scrollArgsBase = {
        container,
        rowHeight,
        viewportHeight,
        clampScrollTop: viewport.clampScrollTopValue,
      }

      const sortedRows = Array.from(rowTargets).sort((a, b) => a - b)
      let nextScrollTop = viewport.scrollTop.value

      for (const rowIndex of sortedRows) {
        nextScrollTop = scrollCellIntoView({
          ...scrollArgsBase,
          targetRowIndex: rowIndex,
          currentScrollTop: nextScrollTop,
        })
      }

      viewport.scrollTop.value = nextScrollTop
    }

    if (!colTargets.size) return

    const padding = 2
    const containerRect = container.getBoundingClientRect()
    const referenceRows = rowTargets.size ? Array.from(rowTargets) : cursor ? [cursor.rowIndex] : []

    const columnKeys = Array.from(colTargets)
      .map((index) => localColumns.value[index]?.key)
      .filter((key): key is string => Boolean(key))

    let minLeft: number | null = null
    let maxRight: number | null = null
    let resolvedColumn = false

    for (const key of columnKeys) {
      let rect: DOMRect | null = null

      for (const rowIndex of referenceRows) {
        const cell = getCellElement(container, rowIndex, key)
        if (cell) {
          rect = cell.getBoundingClientRect()
          break
        }
      }

      if (!rect) {
        const headerCell = container.querySelector<HTMLElement>(
          `.ui-table-header-cell[data-column-key="${key}"]`,
        )
        if (headerCell) {
          rect = headerCell.getBoundingClientRect()
        }
      }

      if (!rect) {
        continue
      }

      resolvedColumn = true
      minLeft = minLeft === null ? rect.left : Math.min(minLeft, rect.left)
      maxRight = maxRight === null ? rect.right : Math.max(maxRight, rect.right)
    }

    const scheduleRetry = () => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => scrollSelectionIntoView(attempt + 1))
      } else {
        nextTick(() => scrollSelectionIntoView(attempt + 1))
      }
    }

    if (!resolvedColumn) {
      if (viewport.scrollToColumn && columnKeys.length && attempt < 4) {
        viewport.scrollToColumn(columnKeys[0])
        scheduleRetry()
      }
      return
    }

    const viewLeft = container.scrollLeft
    const viewRight = viewLeft + container.clientWidth

    let adjusted = false

    if (minLeft !== null) {
      const cellLeft = minLeft - containerRect.left + viewLeft
      if (cellLeft < viewLeft + padding) {
        container.scrollLeft = Math.max(0, cellLeft - padding)
        adjusted = true
      }
    }

    if (maxRight !== null) {
      const cellRight = maxRight - containerRect.left + viewLeft
      if (cellRight > viewRight - padding) {
        container.scrollLeft = cellRight - container.clientWidth + padding
        adjusted = true
      }
    }

    if (adjusted && attempt < 4) {
      scheduleRetry()
    }
  }

  function setSelection(
    rangesInput: UiTableSelectionRangeInput | UiTableSelectionRangeInput[],
    options?: { activeRangeIndex?: number; focus?: boolean },
  ) {
    const rangesArray = Array.isArray(rangesInput) ? rangesInput : [rangesInput]
    if (!rangesArray.length) {
      clearSelection()
      return
    }
    clearFullRowSelection()
    clearFullColumnSelection()
    const normalized = rangesArray.map((range) => normalizeExternalRange(range))
    const activeIndex = options?.activeRangeIndex ?? 0
    applySelectionUpdate(normalized, activeIndex)
    if (options?.focus ?? true) {
      focusContainer()
      nextTick(() => scrollSelectionIntoView())
    }
  }

  function normalizeExternalRange(input: UiTableSelectionRangeInput): SelectionRange {
    const startRow = Math.min(input.startRow, input.endRow)
    const endRow = Math.max(input.startRow, input.endRow)
    const startCol = Math.min(input.startCol, input.endCol)
    const endCol = Math.max(input.startCol, input.endCol)
    const anchor: SelectionPoint = input.anchor
      ? { rowIndex: input.anchor.rowIndex, colIndex: input.anchor.colIndex }
      : { rowIndex: startRow, colIndex: startCol }
    const focus: SelectionPoint = input.focus
      ? { rowIndex: input.focus.rowIndex, colIndex: input.focus.colIndex }
      : { rowIndex: endRow, colIndex: endCol }
    return createRange(anchor, focus)
  }

  function clearSelection() {
    clearFullRowSelection()
    clearFullColumnSelection()
    clearCellSelection()
  }

  function iterSelectionCells(
    callback: (rowIndex: number, colIndex: number, column: UiTableColumn | undefined) => void,
  ) {
    const { rowCount, colCount } = getGridDimensions()
    const ranges = selectionRanges.value.length ? selectionRanges.value : []
    let hadRanges = false
    for (const range of ranges) {
      hadRanges = true
      const startRow = clamp(range.startRow, 0, rowCount - 1)
      const endRow = clamp(range.endRow, 0, rowCount - 1)
      const startCol = clamp(range.startCol, 0, colCount - 1)
      const endCol = clamp(range.endCol, 0, colCount - 1)
      for (let row = startRow; row <= endRow; row += 1) {
        for (let col = startCol; col <= endCol; col += 1) {
          callback(row, col, localColumns.value[col])
        }
      }
    }
    if (!hadRanges) {
      const rowRange = fullRowSelection.value
      if (rowRange) {
        const startRow = clamp(rowRange.start, 0, rowCount - 1)
        const endRow = clamp(rowRange.end, 0, rowCount - 1)
        for (let row = startRow; row <= endRow; row += 1) {
          for (let col = 0; col < colCount; col += 1) {
            callback(row, col, localColumns.value[col])
          }
        }
        return
      }
    }
    const activePoint = anchorCell.value ?? selectedCell.value
    if (!hadRanges && activePoint) {
      const row = clamp(activePoint.rowIndex, 0, Math.max(rowCount - 1, 0))
      const col = clamp(activePoint.colIndex, 0, Math.max(colCount - 1, 0))
      callback(row, col, localColumns.value[col])
    }
  }

  function getSelectedCells(): UiTableSelectedCell[] {
    const cells: UiTableSelectedCell[] = []
    iterSelectionCells((rowIndex, colIndex, column) => {
      if (!column) return
      const entry = processedRows.value[rowIndex]
      cells.push({
        rowIndex,
        colIndex,
        columnKey: column.key,
        value: entry?.row?.[column.key],
        row: entry?.row,
      })
    })
    return cells
  }

  function isCellSelected(rowIndex: number, colIndex: number) {
    const rowRange = fullRowSelection.value
    if (
      (rowRange && rowIndex >= rowRange.start && rowIndex <= rowRange.end) ||
      fullColumnSelection.value === colIndex
    ) {
      return false
    }
    const sel = anchorCell.value ?? selectedCell.value
    if (!sel) return false
    return sel.rowIndex === rowIndex && sel.colIndex === colIndex
  }

  function isRowFullySelected(rowIndex: number) {
    const range = fullRowSelection.value
    if (!range) return false
    return rowIndex >= range.start && rowIndex <= range.end
  }

  function isColumnFullySelected(colIndex: number) {
    return fullColumnSelection.value === colIndex
  }

  function isRowInSelectionRect(rowIndex: number) {
    const rowRange = fullRowSelection.value
    if (rowRange && rowIndex >= rowRange.start && rowIndex <= rowRange.end) {
      return true
    }
    if (
      selectionRanges.value.some((range) => rowIndex >= range.startRow && rowIndex <= range.endRow)
    ) {
      return true
    }
    const preview = fillPreviewRange.value
    if (preview && rowIndex >= preview.startRow && rowIndex <= preview.endRow) {
      return true
    }
    return false
  }

  function isColumnInSelectionRect(colIndex: number) {
    if (
      selectionRanges.value.some((range) => colIndex >= range.startCol && colIndex <= range.endCol)
    ) {
      return true
    }
    const preview = fillPreviewRange.value
    if (preview && colIndex >= preview.startCol && colIndex <= preview.endCol) {
      return true
    }
    return false
  }

  function isCellInFillPreview(rowIndex: number, colIndex: number) {
    const preview = fillPreviewRange.value
    if (!preview) return false
    if (
      rowIndex < preview.startRow ||
      rowIndex > preview.endRow ||
      colIndex < preview.startCol ||
      colIndex > preview.endCol
    ) {
      return false
    }
    const origin = fillOriginRange.value
    if (
      origin &&
      rowIndex >= origin.startRow &&
      rowIndex <= origin.endRow &&
      colIndex >= origin.startCol &&
      colIndex <= origin.endCol
    ) {
      return false
    }
    return true
  }

  function getSelectionEdges(rowIndex: number, colIndex: number) {
    const index = findRangeIndexContaining({ rowIndex, colIndex })
    if (index === -1) return null
    const range = selectionRanges.value[index]
    return {
      top: rowIndex === range.startRow,
      bottom: rowIndex === range.endRow,
      left: colIndex === range.startCol,
      right: colIndex === range.endCol,
      active: index === activeRangeIndex.value,
    }
  }

  function getFillPreviewEdges(rowIndex: number, colIndex: number) {
    const preview = fillPreviewRange.value
    if (!preview) return null
    if (
      rowIndex < preview.startRow ||
      rowIndex > preview.endRow ||
      colIndex < preview.startCol ||
      colIndex > preview.endCol
    ) {
      return null
    }
    const origin = fillOriginRange.value
    if (
      origin &&
      rowIndex >= origin.startRow &&
      rowIndex <= origin.endRow &&
      colIndex >= origin.startCol &&
      colIndex <= origin.endCol
    ) {
      return null
    }
    return {
      top: rowIndex === preview.startRow,
      bottom: rowIndex === preview.endRow,
      left: colIndex === preview.startCol,
      right: colIndex === preview.endCol,
      active: true,
    }
  }

  function rowHeaderClass(rowIndex: number) {
    const isFull = isRowFullySelected(rowIndex)
    const activeRow = (anchorCell.value ?? selectedCell.value)?.rowIndex
    const isHighlighted =
      isRowFullySelected(rowIndex) || activeRow === rowIndex || isRowInSelectionRect(rowIndex)
    const inSelection = isRowInSelectionRect(rowIndex)
    return {
      'ui-table__row-index--full': isFull,
      'ui-table__row-index--highlight': !isFull && isHighlighted,
      'ui-table__row-index--range': !isFull && !isHighlighted && inSelection,
    }
  }

  function onCellSelect(payload: {
    rowIndex: number
    key: string
    colIndex?: number
    focus?: boolean
    event?: MouseEvent
  }) {
    const shouldFocus = payload.focus ?? true
    const colIndex =
      payload.colIndex ?? localColumns.value.findIndex((col) => col.key === payload.key)
    if (colIndex === -1) {
      selectCell(payload.rowIndex, payload.key, shouldFocus, { colIndex })
      return
    }

    const point: SelectionPoint = {
      rowIndex: clamp(payload.rowIndex, 0, Math.max(totalRowCount.value - 1, 0)),
      colIndex: clamp(colIndex, 0, Math.max(localColumns.value.length - 1, 0)),
    }

    const event = payload.event
    if (event?.shiftKey) {
      extendActiveRangeTo(point)
      if (shouldFocus) focusContainer()
      return
    }

    if (event && (event.ctrlKey || event.metaKey)) {
      toggleCellSelection(point)
      if (shouldFocus) focusContainer()
      return
    }

    selectCell(point.rowIndex, payload.key, shouldFocus, { colIndex: point.colIndex })
  }

  function resolveRowAnchor(fallback: number) {
    if (rowSelectionAnchor.value != null) return rowSelectionAnchor.value
    const active = anchorCell.value ?? selectedCell.value
    if (active) return active.rowIndex
    return fallback
  }

  function onRowIndexClick(rowIndex: number, event?: MouseEvent) {
    if (!hasGridData()) return
    dragAnchorCell.value = null
    const clampedRow = clamp(rowIndex, 0, Math.max(totalRowCount.value - 1, 0))
    const isShift = Boolean(event?.shiftKey)
    const isToggle = Boolean(event?.metaKey || event?.ctrlKey)

    if (isShift) {
      const anchorRow = clamp(resolveRowAnchor(clampedRow), 0, Math.max(totalRowCount.value - 1, 0))
      setFullRowSelectionRange(anchorRow, clampedRow, { focus: true, anchorRow })
      event?.preventDefault()
      return
    }

    if (isToggle) {
      const range = fullRowSelection.value
      if (range && clampedRow >= range.start && clampedRow <= range.end) {
        clearFullRowSelection()
        clearCellSelection()
        focusContainer()
        return
      }
    }

    setFullRowSelectionRange(clampedRow, clampedRow, { focus: true, anchorRow: clampedRow })
    rowSelectionAnchor.value = clampedRow

    if (event?.button !== 0) return

    stopAutoScroll()
    isRowSelectionDragging.value = true
    lastPointerEvent.value = event
    updateAutoScroll(event)
    window.addEventListener('mousemove', onRowSelectionMouseMove, { passive: false })
    window.addEventListener('mouseup', handleRowSelectionMouseUp)
    event.preventDefault()
  }

  function onColumnHeaderClick(colIndex: number) {
    if (!hasGridData()) return
    dragAnchorCell.value = null
    if (
      fullColumnSelection.value === colIndex &&
      !selectionRanges.value.length &&
      selectedCell.value === null
    ) {
      clearFullColumnSelection()
      focusContainer()
      return
    }
    fullColumnSelection.value = colIndex
    clearFullRowSelection()
    clearCellSelection()
    selectedCell.value = null
    anchorCell.value = null
    focusContainer()
  }

  function onCellDragStart(payload: { rowIndex: number; colIndex: number; event: MouseEvent }) {
    if (isEditingCell.value) return
    if (!hasGridData()) return
    if (payload.event.button !== 0) return
    clearFullRowSelection()
    clearFullColumnSelection()
    isDraggingSelection.value = true
    const anchor = {
      rowIndex: clamp(payload.rowIndex, 0, totalRowCount.value - 1),
      colIndex: clamp(payload.colIndex, 0, localColumns.value.length - 1),
    }
    dragAnchorCell.value = anchor
    if (!selectionRanges.value.length) {
      setSingleCellSelection(anchor)
    }
    stopAutoScroll()
    updateAutoScroll(payload.event)
    window.addEventListener('mousemove', onSelectionMouseMove, { passive: false })
    window.addEventListener('mouseup', handleSelectionMouseUp)
    focusContainer()
    payload.event.preventDefault()
  }

  function onCellDragEnter(payload: { rowIndex: number; colIndex: number; event: MouseEvent }) {
    if (!isDraggingSelection.value) return
    if (!(payload.event.buttons & 1)) {
      handleSelectionMouseUp()
      return
    }
    updateSelectionDrag(payload.rowIndex, payload.colIndex)
  }

  function updateSelectionDrag(rowIndex: number, colIndex: number) {
    if (!isDraggingSelection.value) return
    extendActiveRangeTo({ rowIndex, colIndex })
  }

  function updateSelectionDragFromPoint(clientX: number, clientY: number) {
    const target = getCellFromPoint(clientX, clientY)
    if (!target) return
    updateSelectionDrag(target.rowIndex, target.colIndex)
  }

  function onSelectionMouseMove(event: MouseEvent) {
    if (!isDraggingSelection.value) return
    event.preventDefault()
    updateSelectionDragFromPoint(event.clientX, event.clientY)
    updateAutoScroll(event)
  }

  function handleSelectionMouseUp() {
    if (!isDraggingSelection.value) return
    isDraggingSelection.value = false
    window.removeEventListener('mouseup', handleSelectionMouseUp)
    window.removeEventListener('mousemove', onSelectionMouseMove)
    stopAutoScroll()
  }

  function getCellFromPoint(clientX: number, clientY: number): SelectionPoint | null {
    const container = containerRef.value
    const element = elementFromPoint(clientX, clientY)
    if (!element || !container) return null
    let current: Element | null = element
    while (current && current !== document.body) {
      if (
        current instanceof HTMLElement &&
        current.hasAttribute('data-row-index') &&
        current.hasAttribute('data-col-key')
      ) {
        const rowIndex = Number.parseInt(current.getAttribute('data-row-index') || '', 10)
        const colKey = current.getAttribute('data-col-key') || ''
        const colIndex = localColumns.value.findIndex((col) => col.key === colKey)
        if (!Number.isNaN(rowIndex) && colIndex !== -1) {
          return { rowIndex, colIndex }
        }
        break
      }
      current = current.parentElement
    }
    const rect = container.getBoundingClientRect()
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return null
    }
    return null
  }

  function getRowIndexFromPoint(clientX: number, clientY: number): number | null {
    const container = containerRef.value
    if (!container) return null
    const element = elementFromPoint(clientX, clientY)
    if (!element) return null
    let current: Element | null = element
    while (current && current !== document.body) {
      if (current instanceof HTMLElement && current.hasAttribute('data-row-index')) {
        const value = Number.parseInt(current.getAttribute('data-row-index') || '', 10)
        if (!Number.isNaN(value)) {
          return clamp(value, 0, Math.max(totalRowCount.value - 1, 0))
        }
        break
      }
      current = current.parentElement
    }
    const rect = container.getBoundingClientRect()
    if (clientY < rect.top) return 0
    if (clientY > rect.bottom) return Math.max(totalRowCount.value - 1, 0)
    return null
  }

  function updateRowSelectionFromPoint(clientX: number, clientY: number) {
    const targetRow = getRowIndexFromPoint(clientX, clientY)
    if (targetRow === null) return
    const anchorRow = rowSelectionAnchor.value ?? targetRow
    setFullRowSelectionRange(anchorRow, targetRow, { focus: false, anchorRow })
  }

  function onRowSelectionMouseMove(event: MouseEvent) {
    if (!isRowSelectionDragging.value) return
    event.preventDefault()
    updateRowSelectionFromPoint(event.clientX, event.clientY)
    lastPointerEvent.value = event
    updateAutoScroll(event)
  }

  function handleRowSelectionMouseUp() {
    if (!isRowSelectionDragging.value) return
    isRowSelectionDragging.value = false
    window.removeEventListener('mousemove', onRowSelectionMouseMove)
    window.removeEventListener('mouseup', handleRowSelectionMouseUp)
    stopAutoScroll()
    lastPointerEvent.value = null
  }

  function startFillDrag(event: MouseEvent) {
    if (isEditingCell.value) return
    const origin = getActiveRange()
    if (!origin) return
    event.preventDefault()
    event.stopPropagation()
    fillOriginRange.value = {
      anchor: { ...origin.anchor },
      focus: { ...origin.focus },
      startRow: origin.startRow,
      endRow: origin.endRow,
      startCol: origin.startCol,
      endCol: origin.endCol,
    }
    fillPreviewRange.value = null
    fillTargetCell.value = null
    isFillDragging.value = true
    lastPointerEvent.value = event
    updateFillPreviewFromPoint(event.clientX, event.clientY)
    updateAutoScroll(event)
    window.addEventListener('mousemove', onFillMouseMove, { passive: false })
    window.addEventListener('mouseup', onFillMouseUp, { passive: false })
  }

  function onFillMouseMove(event: MouseEvent) {
    if (!isFillDragging.value) return
    event.preventDefault()
    updateFillPreviewFromPoint(event.clientX, event.clientY)
    updateAutoScroll(event)
  }

  function onFillMouseUp(event: MouseEvent) {
    if (!isFillDragging.value) return
    event.preventDefault()
    window.removeEventListener('mousemove', onFillMouseMove)
    window.removeEventListener('mouseup', onFillMouseUp)
    updateFillPreviewFromPoint(event.clientX, event.clientY)
    stopAutoScroll()
    const shouldCommit = Boolean(fillPreviewRange.value)
    if (shouldCommit) {
      applyFillOperation()
    }
    resetFillState()
    scheduleOverlayUpdate()
  }

  function resetFillState() {
    stopAutoScroll()
    isFillDragging.value = false
    fillPreviewRange.value = null
    fillOriginRange.value = null
    fillTargetCell.value = null
  }

  function applyFillOperation() {
    const origin = fillOriginRange.value
    const preview = fillPreviewRange.value
    if (!origin || !preview) return
    const { rowCount, colCount } = getGridDimensions()
    if (rowCount <= 0 || colCount <= 0) return
    lastCommittedFillArea.value = null

    const startRow = clamp(preview.startRow, 0, rowCount - 1)
    const endRow = clamp(preview.endRow, 0, rowCount - 1)
    const startCol = clamp(preview.startCol, 0, colCount - 1)
    const endCol = clamp(preview.endCol, 0, colCount - 1)

    const originStartRow = clamp(Math.min(origin.startRow, origin.endRow), 0, rowCount - 1)
    const originEndRow = clamp(Math.max(origin.startRow, origin.endRow), 0, rowCount - 1)
    const originStartCol = clamp(Math.min(origin.startCol, origin.endCol), 0, colCount - 1)
    const originEndCol = clamp(Math.max(origin.startCol, origin.endCol), 0, colCount - 1)

    const patternRows = originEndRow - originStartRow + 1
    const patternCols = originEndCol - originStartCol + 1
    if (patternRows <= 0 || patternCols <= 0) return

    let changed = false
    const batchEvents: CellEditEvent[] = []
    const historyEntries: HistoryEntry[] = []
    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        if (
          row >= originStartRow &&
          row <= originEndRow &&
          col >= originStartCol &&
          col <= originEndCol
        ) {
          continue
        }
        const relativeRow = row - originStartRow
        const relativeCol = col - originStartCol
        const sourceRowOffset = ((relativeRow % patternRows) + patternRows) % patternRows
        const sourceColOffset = ((relativeCol % patternCols) + patternCols) % patternCols
        const sourceRow = originStartRow + sourceRowOffset
        const sourceCol = originStartCol + sourceColOffset
        const value = getCellRawValue(sourceRow, sourceCol)
        if (
          setCellValueDirect(row, col, value, {
            collector: batchEvents,
            historyCollector: historyEntries,
          })
        ) {
          changed = true
        }
      }
    }

    const anchor = { ...origin.anchor }
    const focus = fillTargetCell.value
      ? {
          rowIndex: clamp(fillTargetCell.value.rowIndex, 0, rowCount - 1),
          colIndex: clamp(fillTargetCell.value.colIndex, 0, colCount - 1),
        }
      : { rowIndex: endRow, colIndex: endCol }

    dispatchEvents(batchEvents)
    if (historyEntries.length) {
      recordHistory(historyEntries)
    }

    if (changed) {
      applySelectionUpdate([createRange(anchor, focus)], 0)
      lastCommittedFillArea.value = {
        startRow,
        endRow,
        startCol,
        endCol,
      }
    } else {
      applySelectionUpdate([createRange(anchor, origin.focus)], 0)
    }
    focusContainer()
  }

  function autoFillDownFromActiveRange() {
    const origin = getActiveRange()
    if (!origin) return
    const { rowCount } = getGridDimensions()
    if (rowCount <= 0) return
    const originStartRow = Math.min(origin.startRow, origin.endRow)
    const originEndRow = Math.max(origin.startRow, origin.endRow)
    const originStartCol = Math.min(origin.startCol, origin.endCol)
    const originEndCol = Math.max(origin.startCol, origin.endCol)

    const targetEndRow = rowCount - 1
    if (originEndRow >= targetEndRow) return

    fillOriginRange.value = {
      anchor: { ...origin.anchor },
      focus: { ...origin.focus },
      startRow: origin.startRow,
      endRow: origin.endRow,
      startCol: origin.startCol,
      endCol: origin.endCol,
    }

    fillPreviewRange.value = {
      startRow: originStartRow,
      endRow: targetEndRow,
      startCol: originStartCol,
      endCol: originEndCol,
    }

    fillTargetCell.value = {
      rowIndex: targetEndRow,
      colIndex: origin.focus.colIndex,
    }

    applyFillOperation()
    resetFillState()
    scheduleOverlayUpdate()
  }

  function handleAutoScrollFrame() {
    if (isFillDragging.value && lastPointerEvent.value) {
      updateFillPreviewFromPoint(lastPointerEvent.value.clientX, lastPointerEvent.value.clientY)
    } else if (isDraggingSelection.value && lastPointerEvent.value) {
      updateSelectionDragFromPoint(lastPointerEvent.value.clientX, lastPointerEvent.value.clientY)
    } else if (isRowSelectionDragging.value && lastPointerEvent.value) {
      updateRowSelectionFromPoint(lastPointerEvent.value.clientX, lastPointerEvent.value.clientY)
    }
    scheduleOverlayUpdate()
  }

  function updateFillPreviewFromPoint(clientX: number, clientY: number) {
    const target = getCellFromPoint(clientX, clientY)
    const effectiveTarget = target ?? fillTargetCell.value
    updateFillPreviewForTarget(effectiveTarget ?? null)
  }

  function updateFillPreviewForTarget(target: SelectionPoint | null) {
    const origin = fillOriginRange.value
    if (!origin) return
    const { rowCount, colCount } = getGridDimensions()
    if (rowCount <= 0 || colCount <= 0) {
      fillPreviewRange.value = null
      fillTargetCell.value = null
      scheduleOverlayUpdate()
      return
    }
    if (!target) {
      fillPreviewRange.value = null
      fillTargetCell.value = null
      scheduleOverlayUpdate()
      return
    }
    const clampedTarget: SelectionPoint = {
      rowIndex: clamp(target.rowIndex, 0, rowCount - 1),
      colIndex: clamp(target.colIndex, 0, colCount - 1),
    }
    const originStartRow = Math.min(origin.startRow, origin.endRow)
    const originEndRow = Math.max(origin.startRow, origin.endRow)
    const originStartCol = Math.min(origin.startCol, origin.endCol)
    const originEndCol = Math.max(origin.startCol, origin.endCol)
    let startRow = originStartRow
    let endRow = originEndRow
    let startCol = originStartCol
    let endCol = originEndCol

    if (clampedTarget.rowIndex < originStartRow) {
      startRow = clampedTarget.rowIndex
    } else if (clampedTarget.rowIndex > originEndRow) {
      endRow = clampedTarget.rowIndex
    }

    if (clampedTarget.colIndex < originStartCol) {
      startCol = clampedTarget.colIndex
    } else if (clampedTarget.colIndex > originEndCol) {
      endCol = clampedTarget.colIndex
    }

    startRow = clamp(startRow, 0, rowCount - 1)
    endRow = clamp(endRow, 0, rowCount - 1)
    startCol = clamp(startCol, 0, colCount - 1)
    endCol = clamp(endCol, 0, colCount - 1)

    if (
      startRow === originStartRow &&
      endRow === originEndRow &&
      startCol === originStartCol &&
      endCol === originEndCol
    ) {
      fillPreviewRange.value = null
      fillTargetCell.value = null
    } else {
      fillPreviewRange.value = {
        startRow,
        endRow,
        startCol,
        endCol,
      }
      fillTargetCell.value = clampedTarget
    }
    scheduleOverlayUpdate()
  }

  function getBoundsForRange(
    range: SelectionRange | null,
    fallbackToAll: boolean,
  ): SelectionArea | null {
    const { rowCount, colCount } = getGridDimensions()
    if (rowCount <= 0 || colCount <= 0) return null
    let target: SelectionArea | null = null
    if (range) {
      target = {
        startRow: range.startRow,
        endRow: range.endRow,
        startCol: range.startCol,
        endCol: range.endCol,
      }
    } else if (fallbackToAll) {
      target = {
        startRow: 0,
        endRow: rowCount - 1,
        startCol: 0,
        endCol: colCount - 1,
      }
    }
    if (!target) return null
    const startRow = clamp(Math.min(target.startRow, target.endRow), 0, rowCount - 1)
    const endRow = clamp(Math.max(target.startRow, target.endRow), 0, rowCount - 1)
    const startCol = clamp(Math.min(target.startCol, target.endCol), 0, colCount - 1)
    const endCol = clamp(Math.max(target.startCol, target.endCol), 0, colCount - 1)
    if (startRow > endRow || startCol > endCol) return null
    return { startRow, endRow, startCol, endCol }
  }

  function buildSelectionMatrix(
    range: SelectionRange | null,
    options?: { includeHeaders?: boolean; fallbackToAll?: boolean },
  ) {
    const bounds = getBoundsForRange(range, options?.fallbackToAll ?? false)
    if (!bounds) return [] as string[][]
    const matrix: string[][] = []
    if (options?.includeHeaders) {
      const header: string[] = []
      for (let colIndex = bounds.startCol; colIndex <= bounds.endCol; colIndex += 1) {
        const column = localColumns.value[colIndex]
        header.push(column?.label ?? column?.key ?? '')
      }
      matrix.push(header)
    }
    for (let rowIndex = bounds.startRow; rowIndex <= bounds.endRow; rowIndex += 1) {
      const values: string[] = []
      for (let colIndex = bounds.startCol; colIndex <= bounds.endCol; colIndex += 1) {
        values.push(getCellDisplayValue(rowIndex, colIndex))
      }
      matrix.push(values)
    }
    return matrix
  }

  function getCellDisplayValue(rowIndex: number, colIndex: number): string {
    const entry = processedRows.value[rowIndex]
    const column = localColumns.value[colIndex]
    if (!entry || !column) return ''
    if (rowIndexColumnKey && column.key === rowIndexColumnKey) {
      const displayIndex = entry.displayIndex ?? rowIndex
      return String(displayIndex + 1)
    }
    const raw = entry.row?.[column.key]
    if (raw === null || raw === undefined) return ''
    if (column.editor === 'select') {
      const options = getColumnOptions(column, entry.row)
      const match = options.find((option) => String(option.value) === String(raw))
      if (match) return String(match.label ?? '')
    }
    return String(raw)
  }

  function getColumnOptions(column: UiTableColumn | undefined, row: any) {
    if (!column?.options) return []
    try {
      return typeof column.options === 'function'
        ? (column.options(row) ?? [])
        : (column.options ?? [])
    } catch {
      return []
    }
  }

  function applyMatrixToSelection(matrix: string[][], baseOverride?: SelectionPoint | null) {
    if (!matrix.length || !matrix[0]?.length) return
    const { rowCount, colCount } = getGridDimensions()
    if (rowCount <= 0 || colCount <= 0) return
    const matrixRowCount = matrix.length
    const matrixColBaseline = matrix[0]?.length ?? 1
    let selectionBounds = !baseOverride ? getBoundsForRange(getActiveRange(), false) : null
    const batchEvents: CellEditEvent[] = []
    const historyEntries: HistoryEntry[] = []
    let changedAny = false

    if (selectionBounds) {
      const selectionHeight = selectionBounds.endRow - selectionBounds.startRow + 1
      const selectionWidth = selectionBounds.endCol - selectionBounds.startCol + 1
      const matrixWidth = matrix[0]?.length ?? matrixColBaseline
      if (matrixRowCount > selectionHeight || matrixWidth > selectionWidth) {
        selectionBounds = null
      }
    }

    if (selectionBounds) {
      const { startRow, endRow, startCol, endCol } = selectionBounds
      for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
        const sourceRow = (rowIndex - startRow) % matrixRowCount
        const rowValues = matrix[sourceRow] ?? []
        const rowWidth = rowValues.length || matrixColBaseline
        if (!rowWidth) continue
        for (let colIndex = startCol; colIndex <= endCol; colIndex += 1) {
          const sourceCol = (colIndex - startCol) % rowWidth
          const rawValue = rowValues[sourceCol] ?? ''
          if (
            setCellValueFromPaste(rowIndex, colIndex, rawValue, {
              collector: batchEvents,
              historyCollector: historyEntries,
            })
          ) {
            changedAny = true
          }
        }
      }
      dispatchEvents(batchEvents)
      if (historyEntries.length) {
        recordHistory(historyEntries)
      }
      if (changedAny) {
        focusContainer()
        scheduleOverlayUpdate()
      }
      return
    }

    const base = baseOverride ?? anchorCell.value ?? selectedCell.value ?? getActiveRange()?.anchor
    if (!base) return
    const baseRow = clamp(base.rowIndex, 0, rowCount - 1)
    const baseCol = clamp(base.colIndex, 0, colCount - 1)
    setSingleCellSelection({ rowIndex: baseRow, colIndex: baseCol })
    let maxRow = baseRow
    let maxCol = baseCol
    for (let r = 0; r < matrixRowCount; r += 1) {
      const targetRow = baseRow + r
      if (targetRow >= rowCount) break
      const rowValues = matrix[r] ?? []
      for (let c = 0; c < rowValues.length; c += 1) {
        const targetCol = baseCol + c
        if (targetCol >= colCount) break
        const changed = setCellValueFromPaste(targetRow, targetCol, rowValues[c] ?? '', {
          collector: batchEvents,
          historyCollector: historyEntries,
        })
        if (changed) {
          if (targetRow > maxRow) maxRow = targetRow
          if (targetCol > maxCol) maxCol = targetCol
        }
      }
    }
    if (maxRow !== baseRow || maxCol !== baseCol) {
      extendActiveRangeTo({ rowIndex: maxRow, colIndex: maxCol })
    } else {
      setSingleCellSelection({ rowIndex: baseRow, colIndex: baseCol })
    }
    dispatchEvents(batchEvents)
    if (historyEntries.length) {
      recordHistory(historyEntries)
    }
    focusContainer()
  }

  function clearSelectionValues() {
    if (!hasGridData()) return
    const rowRange = fullRowSelection.value
    if (rowRange) {
      const { rowCount } = getGridDimensions()
      const startRow = clamp(rowRange.start, 0, rowCount - 1)
      const endRow = clamp(rowRange.end, 0, rowCount - 1)
      const rows: number[] = []
      for (let row = startRow; row <= endRow; row += 1) {
        rows.push(row)
      }
      if (rows.length && deleteRows) {
        const payload = rows.map((displayIndex) => {
          const entry = processedRows.value[displayIndex]
          return {
            displayIndex,
            originalIndex: entry?.originalIndex ?? displayIndex,
            row: entry?.row,
          }
        })
        deleteRows(payload)
        clearSelection()
        focusContainer()
        return
      }
    }
    const batchEvents: CellEditEvent[] = []
    const historyEntries: HistoryEntry[] = []
    let cleared = false
    iterSelectionCells((rowIndex, colIndex, column) => {
      if (!column) return
      if (!canPasteIntoColumn(column)) return
      if (
        setCellValueDirect(rowIndex, colIndex, null, {
          collector: batchEvents,
          historyCollector: historyEntries,
        })
      ) {
        cleared = true
      }
    })
    dispatchEvents(batchEvents)
    if (historyEntries.length) {
      recordHistory(historyEntries)
    }
    if (cleared) {
      focusContainer()
      scheduleOverlayUpdate()
    }
  }

  function handleDocumentMouseDown(event: MouseEvent) {
    const container = containerRef.value
    if (!container) return
    if (container.contains(event.target as Node)) return
    clearFullRowSelection()
    clearFullColumnSelection()
    clearCellSelection()
  }

  function ensureSelectionBounds() {
    if (!hasGridData()) {
      clearCellSelection()
      isEditingCell.value = false
      fullRowSelection.value = null
      fullColumnSelection.value = null
      isDraggingSelection.value = false
      return
    }

    const { rowCount, colCount } = getGridDimensions()

    if (fullRowSelection.value) {
      const nextStart = clamp(fullRowSelection.value.start, 0, Math.max(rowCount - 1, 0))
      const nextEnd = clamp(fullRowSelection.value.end, 0, Math.max(rowCount - 1, 0))
      if (nextStart > nextEnd) {
        clearFullRowSelection()
        clearCellSelection()
      } else if (
        nextStart !== fullRowSelection.value.start ||
        nextEnd !== fullRowSelection.value.end
      ) {
        setFullRowSelectionRange(nextStart, nextEnd, { focus: false, preserveAnchor: true })
      } else if (rowSelectionAnchor.value != null) {
        rowSelectionAnchor.value = clamp(rowSelectionAnchor.value, nextStart, nextEnd)
      }
    }

    if (fullColumnSelection.value !== null) {
      fullColumnSelection.value = clamp(fullColumnSelection.value, 0, Math.max(colCount - 1, 0))
    }

    if (selectionRanges.value.length) {
      applySelectionUpdate(selectionRanges.value, activeRangeIndex.value)
    } else {
      const current = anchorCell.value ?? selectedCell.value
      if (current) {
        setSingleCellSelection(clampPointToGrid(current))
      }
    }

    if (dragAnchorCell.value) {
      dragAnchorCell.value = clampPointToGrid(dragAnchorCell.value)
    }
  }

  function moveSelection(rowDelta: number, colDelta: number, options: { extend?: boolean } = {}) {
    clearFullRowSelection()
    clearFullColumnSelection()
    if (!hasGridData()) return
    const current = getSelectionCursor()
    if (!current) {
      selectCell(0, localColumns.value[0].key, true, { colIndex: 0 })
      return
    }

    const rowCount = totalRowCount.value
    const colCount = localColumns.value.length
    const newRow = clamp(current.rowIndex + rowDelta, 0, rowCount - 1)
    const newCol = clamp(current.colIndex + colDelta, 0, colCount - 1)

    const point: SelectionPoint = { rowIndex: newRow, colIndex: newCol }
    if (options.extend) {
      extendActiveRangeTo(point)
    } else {
      setSingleCellSelection(point)
    }
    focusContainer()
    nextTick(() => scrollSelectionIntoView())
  }

  function moveByTab(forward: boolean) {
    clearFullRowSelection()
    clearFullColumnSelection()
    if (!hasGridData()) return false
    const current = getSelectionCursor()
    if (!current) {
      selectCell(0, localColumns.value[0].key, true, { colIndex: 0 })
      return true
    }

    const rowCount = totalRowCount.value
    const colCount = localColumns.value.length
    let { rowIndex, colIndex } = current

    if (forward) {
      if (rowIndex === rowCount - 1 && colIndex === colCount - 1) {
        return false
      }
      colIndex += 1
      if (colIndex >= colCount) {
        colIndex = 0
        rowIndex = clamp(rowIndex + 1, 0, rowCount - 1)
      }
    } else {
      if (rowIndex === 0 && colIndex === 0) {
        return false
      }
      colIndex -= 1
      if (colIndex < 0) {
        colIndex = colCount - 1
        rowIndex = clamp(rowIndex - 1, 0, rowCount - 1)
      }
    }

    setSingleCellSelection({ rowIndex, colIndex })
    focusContainer()
    nextTick(() => scrollSelectionIntoView())
    return true
  }

  function triggerEditForSelection() {
    const active = getSelectionCursor()
    if (!active) return null
    const column = localColumns.value[active.colIndex]
    if (!column) return null
    if (!canPasteIntoColumn(column)) return null
    return {
      rowIndex: active.rowIndex,
      columnKey: column.key,
    }
  }

  watch([selectedCell, anchorCell], ([focus, anchor]) => {
    scheduleOverlayUpdate()
    const target = anchor ?? focus
    if (
      !target ||
      isDraggingSelection.value ||
      isFillDragging.value ||
      isRowSelectionDragging.value
    )
      return
    nextTick(() => scrollSelectionIntoView())
  })

  watch(
    () => isEditingCell.value,
    () => scheduleOverlayUpdate(),
  )

  watch(
    () => localColumns.value.length,
    () => ensureSelectionBounds(),
  )

  watch(
    () => totalRowCount.value,
    () => ensureSelectionBounds(),
  )

  onBeforeUnmount(() => {
    window.removeEventListener('mouseup', handleSelectionMouseUp)
    window.removeEventListener('mousemove', onSelectionMouseMove)
    window.removeEventListener('mousemove', onFillMouseMove)
    window.removeEventListener('mouseup', onFillMouseUp)
    window.removeEventListener('mousemove', onRowSelectionMouseMove)
    window.removeEventListener('mouseup', handleRowSelectionMouseUp)
    document.removeEventListener('mousedown', handleDocumentMouseDown)
  })

  if (typeof document !== 'undefined') {
    document.addEventListener('mousedown', handleDocumentMouseDown)
  }

  return {
    selectedCell,
    anchorCell,
    selectionRanges,
    activeRangeIndex,
    fullRowSelection,
    fullColumnSelection,
    isDraggingSelection,
    isFillDragging,
    fillPreviewRange,
    fillHandleStyle,
    scheduleOverlayUpdate,
    setSelection,
    clearSelection,
    focusCell,
    getActiveCell,
    getSelectionSnapshot,
    getActiveRange,
    selectCell,
    iterSelectionCells,
    getSelectedCells,
    isCellSelected,
    isCellInSelectionRange: (rowIndex: number, colIndex: number) =>
      findRangeIndexContaining({ rowIndex, colIndex }) !== -1,
    isRowFullySelected,
    isColumnFullySelected,
    isRowInSelectionRect,
    isColumnInSelectionRect,
    isCellInFillPreview,
    getSelectionEdges,
    getFillPreviewEdges,
    rowHeaderClass,
    onCellSelect,
    onRowIndexClick,
    onColumnHeaderClick,
    onCellDragStart,
    onCellDragEnter,
    handleSelectionMouseUp,
    moveSelection,
    moveByTab,
    moveByPage,
    goToRowEdge,
    goToColumnEdge,
    goToGridEdge,
    triggerEditForSelection,
    clearSelectionValues,
    applyMatrixToSelection,
    buildSelectionMatrix,
    getBoundsForRange,
    startFillDrag,
    autoFillDownFromActiveRange,
    handleAutoScrollFrame,
    lastCommittedFillArea,
  }
}
