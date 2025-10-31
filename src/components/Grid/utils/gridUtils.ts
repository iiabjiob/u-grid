import type { Ref } from "vue"
import type { UiTableColumn } from "../types"

export const DEFAULT_COLUMN_WIDTH = 160
export const COLUMN_VIRTUALIZATION_BUFFER = 2

export const supportsCssZoom =
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("zoom: 1")

export interface ColumnWidthMetrics {
  widths: number[]
  offsets: number[]
  totalWidth: number
}

export function resolveColumnWidth(column: UiTableColumn, zoom = 1) {
  const baseWidth = column.width ?? column.minWidth ?? DEFAULT_COLUMN_WIDTH
  const minWidth = column.minWidth ?? baseWidth
  const maxWidth = column.maxWidth ?? baseWidth
  const scaledBase = Math.max(minWidth, Math.min(maxWidth, baseWidth)) * zoom
  return Number.isFinite(scaledBase) ? scaledBase : DEFAULT_COLUMN_WIDTH * zoom
}

export function accumulateColumnWidths(columns: UiTableColumn[], zoom = 1): ColumnWidthMetrics {
  const widths: number[] = []
  const offsets: number[] = []
  let totalWidth = 0

  for (const column of columns) {
    offsets.push(totalWidth)
    const width = resolveColumnWidth(column, zoom)
    widths.push(width)
    totalWidth += width
  }

  return { widths, offsets, totalWidth }
}

export interface VisibleColumnRange {
  startIndex: number
  endIndex: number
  leftPadding: number
  rightPadding: number
}

function findFirstVisibleColumn(scrollLeft: number, widths: number[], offsets: number[]) {
  let low = 0
  let high = widths.length - 1
  let candidate = widths.length

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const columnStart = offsets[mid]
    const columnEnd = columnStart + widths[mid]
    if (columnEnd >= scrollLeft) {
      candidate = mid
      high = mid - 1
    } else {
      low = mid + 1
    }
  }

  return Math.min(candidate, widths.length)
}

function findLastVisibleColumn(scrollRight: number, widths: number[], offsets: number[]) {
  let low = 0
  let high = widths.length - 1
  let candidate = -1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const columnStart = offsets[mid]
    if (columnStart <= scrollRight) {
      candidate = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return Math.min(candidate, widths.length - 1)
}

export function calculateVisibleColumns(
  scrollLeft: number,
  containerWidth: number,
  columns: UiTableColumn[],
  options: {
    zoom?: number
    buffer?: number
    pinnedLeftWidth?: number
    pinnedRightWidth?: number
    metrics?: ColumnWidthMetrics
  } = {}
): VisibleColumnRange & ColumnWidthMetrics {
  const { zoom = 1, buffer = COLUMN_VIRTUALIZATION_BUFFER, pinnedLeftWidth = 0, pinnedRightWidth = 0, metrics: suppliedMetrics } = options

  const metrics = suppliedMetrics ?? accumulateColumnWidths(columns, zoom)
  const { widths, offsets, totalWidth } = metrics

  if (!widths.length) {
    return {
      startIndex: 0,
      endIndex: 0,
      leftPadding: 0,
      rightPadding: 0,
      widths,
      offsets,
      totalWidth,
    }
  }

  const effectiveViewportWidth = Math.max(0, containerWidth - pinnedLeftWidth - pinnedRightWidth)
  if (totalWidth <= effectiveViewportWidth) {
    return {
      startIndex: 0,
      endIndex: widths.length,
      leftPadding: 0,
      rightPadding: 0,
      widths,
      offsets,
      totalWidth,
    }
  }

  const effectiveScrollLeft = Math.max(0, scrollLeft - pinnedLeftWidth)
  const scrollRight = effectiveScrollLeft + effectiveViewportWidth

  const firstVisible = findFirstVisibleColumn(effectiveScrollLeft, widths, offsets)
  const lastVisible = findLastVisibleColumn(scrollRight, widths, offsets)

  const startIndex = Math.max(0, firstVisible - buffer)
  const endIndex = Math.min(widths.length, lastVisible + 1 + buffer)

  const leftPadding = offsets[startIndex] ?? 0
  const rightPadding = totalWidth - (offsets[endIndex] ?? totalWidth)

  return {
    startIndex,
    endIndex,
    leftPadding,
    rightPadding,
    widths,
    offsets,
    totalWidth,
  }
}

export function getCellElement(
  container: HTMLElement | null,
  rowIndex: number,
  columnKey: string
) {
  if (!container) return null
  return container.querySelector<HTMLElement>(
    `[data-row-index="${rowIndex}"][data-col-key="${columnKey}"]`
  )
}

export function focusElement(elementRef: Ref<HTMLElement | null>) {
  const element = elementRef.value
  if (!element) return
  element.focus({ preventScroll: true })
}

interface ScrollIntoViewInput {
  container: HTMLElement | null
  targetRowIndex: number
  rowHeight: number
  viewportHeight: number
  currentScrollTop: number
  clampScrollTop: (value: number) => number
}

export function scrollCellIntoView({
  container,
  targetRowIndex,
  rowHeight,
  viewportHeight,
  currentScrollTop,
  clampScrollTop,
}: ScrollIntoViewInput) {
  if (!container) return currentScrollTop
  const targetTop = targetRowIndex * rowHeight
  const targetBottom = targetTop + rowHeight
  const viewTop = currentScrollTop
  const viewBottom = viewTop + viewportHeight
  let nextScrollTop = viewTop
  if (targetTop < viewTop) {
    nextScrollTop = targetTop
  } else if (targetBottom > viewBottom) {
    nextScrollTop = targetBottom - viewportHeight
  }
  nextScrollTop = clampScrollTop(nextScrollTop)
  if (nextScrollTop !== viewTop) {
    container.scrollTop = nextScrollTop
  }
  return nextScrollTop
}

export function elementFromPoint(clientX: number, clientY: number) {
  if (typeof document === "undefined") return null
  return document.elementFromPoint(clientX, clientY)
}
