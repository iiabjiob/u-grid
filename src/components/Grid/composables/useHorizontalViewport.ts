import { computed, ref, watch, watchEffect } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { UiTableColumn } from '../types'
import {
  calculateVisibleColumns,
  COLUMN_VIRTUALIZATION_BUFFER,
  resolveColumnWidth,
  type ColumnWidthMetrics,
} from '../utils/gridUtils'
import { clamp } from '../utils/constants'

export interface UseHorizontalViewportOptions {
  containerRef: Ref<HTMLDivElement | null>
  columns: Ref<UiTableColumn[]> | ComputedRef<UiTableColumn[]>
  zoom: Ref<number>
  viewportWidth: Ref<number>
}

type ColumnPinMode = 'left' | 'right' | 'none'

interface ColumnMetric {
  column: UiTableColumn
  index: number
  width: number
  pin: ColumnPinMode
}

interface ColumnLayoutMetrics {
  zoom: number
  pinnedLeft: ColumnMetric[]
  pinnedRight: ColumnMetric[]
  pinnedLeftWidth: number
  pinnedRightWidth: number
  scrollableColumns: UiTableColumn[]
  scrollableIndices: number[]
  scrollableMetrics: ColumnWidthMetrics
}

const INDEX_COLUMN_WIDTH = 60
const SCROLL_EPSILON = 0.5
const SCROLL_EDGE_PADDING = 1

function resolvePinMode(column: UiTableColumn): ColumnPinMode {
  const raw = column as unknown as Record<string, unknown>
  const pinned = raw?.pinned
  const pin = raw?.pin
  const lock = raw?.lock
  const locked = raw?.locked

  if (
    pinned === true ||
    pinned === 'left' ||
    pin === 'left' ||
    lock === 'left' ||
    locked === true
  ) {
    return 'left'
  }
  if (pinned === 'right' || pin === 'right' || lock === 'right') {
    return 'right'
  }
  return 'none'
}

export function useHorizontalViewport({
  containerRef,
  columns,
  zoom,
  viewportWidth,
}: UseHorizontalViewportOptions) {
  const scrollLeft = ref(0)
  const pendingScrollLeft = ref<number | null>(null)
  const scrollFrame = ref<number | null>(null)
  const columnRef = 'value' in columns ? columns : ref(columns)

  const columnLayoutMetrics = computed<ColumnLayoutMetrics>(() => {
    const zoomFactor = zoom.value || 1
    const sourceColumns = columnRef.value ?? []

    const pinnedLeft: ColumnMetric[] = []
    const pinnedRight: ColumnMetric[] = []
    const scrollableColumns: UiTableColumn[] = []
    const scrollableIndices: number[] = []
    const scrollableWidths: number[] = []
    const scrollableOffsets: number[] = []
    let accumulatedWidth = 0

    sourceColumns.forEach((column, index) => {
      const pin = resolvePinMode(column)
      const width = resolveColumnWidth(column, zoomFactor)
      const metric: ColumnMetric = { column, index, width, pin }

      if (pin === 'left') {
        pinnedLeft.push(metric)
        return
      }
      if (pin === 'right') {
        pinnedRight.push(metric)
        return
      }

      scrollableColumns.push(column)
      scrollableIndices.push(index)
      scrollableOffsets.push(accumulatedWidth)
      scrollableWidths.push(width)
      accumulatedWidth += width
    })

    const scrollableMetrics: ColumnWidthMetrics = {
      widths: scrollableWidths,
      offsets: scrollableOffsets,
      totalWidth: accumulatedWidth,
    }

    const pinnedLeftWidth = pinnedLeft.reduce((sum, metric) => sum + metric.width, 0)
    const pinnedRightWidth = pinnedRight.reduce((sum, metric) => sum + metric.width, 0)

    return {
      zoom: zoomFactor,
      pinnedLeft,
      pinnedRight,
      pinnedLeftWidth,
      pinnedRightWidth,
      scrollableColumns,
      scrollableIndices,
      scrollableMetrics,
    }
  })

  const effectiveViewportWidth = computed(() => {
    const layout = columnLayoutMetrics.value
    const indexWidth = INDEX_COLUMN_WIDTH * layout.zoom
    return Math.max(
      0,
      viewportWidth.value - indexWidth - layout.pinnedLeftWidth - layout.pinnedRightWidth,
    )
  })

  const columnVirtualization = computed(() => {
    const layout = columnLayoutMetrics.value
    const columnWidthMap = new Map<string, number>()

    layout.pinnedLeft.forEach((metric) => columnWidthMap.set(metric.column.key, metric.width))
    layout.pinnedRight.forEach((metric) => columnWidthMap.set(metric.column.key, metric.width))

    layout.scrollableColumns.forEach((column, index) => {
      const width =
        layout.scrollableMetrics.widths[index] ?? resolveColumnWidth(column, layout.zoom)
      columnWidthMap.set(column.key, width)
    })

    const indexWidth = INDEX_COLUMN_WIDTH * layout.zoom
    const containerWidthForColumns = Math.max(0, viewportWidth.value - indexWidth)
    let startIndex = 0
    let endIndex = layout.scrollableColumns.length
    let leftPadding = 0
    let rightPadding = 0
    const fullScrollableWidth = layout.scrollableMetrics.totalWidth
    let visibleScrollableWidth = fullScrollableWidth
    const visibleScrollable: ColumnMetric[] = []

    if (layout.scrollableColumns.length) {
      const visibleRange = calculateVisibleColumns(
        scrollLeft.value,
        containerWidthForColumns,
        layout.scrollableColumns,
        {
          zoom: layout.zoom,
          buffer: COLUMN_VIRTUALIZATION_BUFFER,
          pinnedLeftWidth: layout.pinnedLeftWidth,
          pinnedRightWidth: layout.pinnedRightWidth,
          metrics: layout.scrollableMetrics,
        },
      )

      startIndex = visibleRange.startIndex
      endIndex = visibleRange.endIndex
      leftPadding = visibleRange.leftPadding
      rightPadding = visibleRange.rightPadding
      visibleScrollableWidth = visibleRange.totalWidth

      for (let idx = startIndex; idx < endIndex; idx += 1) {
        const column = layout.scrollableColumns[idx]
        if (!column) continue
        const width =
          layout.scrollableMetrics.widths[idx] ?? resolveColumnWidth(column, layout.zoom)
        visibleScrollable.push({
          column,
          index: layout.scrollableIndices[idx] ?? idx,
          width,
          pin: 'none',
        })
      }
    }

    const visibleColumns = [...layout.pinnedLeft, ...visibleScrollable, ...layout.pinnedRight]
    const visibleIndexes = visibleColumns.map((entry) => entry.index)
    const visibleStart = visibleIndexes.length ? Math.min(...visibleIndexes) : 0
    const visibleEnd = visibleIndexes.length ? Math.max(...visibleIndexes) + 1 : 0

    return {
      pinnedLeft: layout.pinnedLeft,
      pinnedRight: layout.pinnedRight,
      visibleScrollable,
      visibleColumns,
      columnWidthMap,
      visibleStart,
      visibleEnd,
      leftPadding,
      rightPadding,
      totalScrollableWidth: fullScrollableWidth,
      visibleScrollableWidth,
      pinnedLeftWidth: layout.pinnedLeftWidth,
      pinnedRightWidth: layout.pinnedRightWidth,
      scrollableMetrics: layout.scrollableMetrics,
      containerWidthForColumns,
      indexColumnWidth: indexWidth,
      zoom: layout.zoom,
      scrollableStart: startIndex,
      scrollableEnd: endIndex,
    }
  })

  function clampScrollLeftValue(value: number) {
    if (!Number.isFinite(value)) return 0
    const container = containerRef.value

    const metrics = columnVirtualization.value.scrollableMetrics
    const containerWidthForColumns = columnVirtualization.value.containerWidthForColumns
    const averageWidth = metrics.widths.length ? metrics.totalWidth / metrics.widths.length : 0
    const bufferPx = COLUMN_VIRTUALIZATION_BUFFER * averageWidth
    const trailingGap = Math.max(
      0,
      containerWidthForColumns - columnVirtualization.value.visibleScrollableWidth,
    )
    const virtualizationMax = Math.max(
      0,
      columnVirtualization.value.totalScrollableWidth -
        effectiveViewportWidth.value +
        bufferPx +
        trailingGap +
        SCROLL_EDGE_PADDING,
    )

    const containerMax = container ? Math.max(0, container.scrollWidth - container.clientWidth) : 0
    const maxScroll = Math.max(virtualizationMax, containerMax)

    if (!Number.isFinite(maxScroll) || maxScroll <= 0) {
      return 0
    }
    return clamp(value, 0, maxScroll)
  }

  function applyScrollLeft(value: number) {
    const container = containerRef.value
    if (!container) return
    const delta = Math.abs(container.scrollLeft - value)
    let applied = value
    if (delta > SCROLL_EPSILON) {
      container.scrollLeft = value
      applied = container.scrollLeft
    } else {
      applied = container.scrollLeft
    }
    scrollLeft.value = applied
  }

  function handleHorizontalScroll(event: Event) {
    const target = event.target as HTMLElement | null
    if (!target) return

    const nextLeft = clampScrollLeftValue(target.scrollLeft)
    pendingScrollLeft.value = nextLeft

    if (scrollFrame.value !== null) return

    scrollFrame.value = requestAnimationFrame(() => {
      scrollFrame.value = null
      if (pendingScrollLeft.value != null) {
        const value = pendingScrollLeft.value
        pendingScrollLeft.value = null
        applyScrollLeft(value)
      }
    })
  }

  function cancelScrollFrame() {
    if (scrollFrame.value !== null) {
      cancelAnimationFrame(scrollFrame.value)
      scrollFrame.value = null
    }
  }

  function scrollToColumn(key: string) {
    const map = columnVirtualization.value.columnWidthMap
    let offset = 0
    for (const [columnKey, width] of map.entries()) {
      if (columnKey === key) break
      offset += width
    }
    applyScrollLeft(offset)
  }

  watchEffect(() => {
    const container = containerRef.value
    if (!container) return
    const nextLeft = clampScrollLeftValue(container.scrollLeft)
    applyScrollLeft(nextLeft)
  })

  watch(
    () => viewportWidth.value,
    () => {
      const container = containerRef.value
      if (!container) return
      const nextLeft = clampScrollLeftValue(container.scrollLeft)
      applyScrollLeft(nextLeft)
    },
  )

  watch(
    () => columnRef.value,
    () => {
      const container = containerRef.value
      if (!container) return
      const nextLeft = clampScrollLeftValue(container.scrollLeft)
      applyScrollLeft(nextLeft)
    },
  )

  return {
    scrollLeft,
    effectiveViewportWidth,
    columnVirtualization,
    clampScrollLeftValue,
    handleHorizontalScroll,
    scrollToColumn,
    cancelScrollFrame,
    pinnedLeftColumns: computed(() =>
      columnVirtualization.value.pinnedLeft.map((entry) => entry.column),
    ),
    pinnedLeftEntries: computed(() => columnVirtualization.value.pinnedLeft),
    pinnedRightColumns: computed(() =>
      columnVirtualization.value.pinnedRight.map((entry) => entry.column),
    ),
    pinnedRightEntries: computed(() => columnVirtualization.value.pinnedRight),
    visibleColumns: computed(() =>
      columnVirtualization.value.visibleColumns.map((entry) => entry.column),
    ),
    visibleColumnEntries: computed(() => columnVirtualization.value.visibleColumns),
    visibleScrollableColumns: computed(() =>
      columnVirtualization.value.visibleScrollable.map((entry) => entry.column),
    ),
    visibleScrollableEntries: computed(() => columnVirtualization.value.visibleScrollable),
    leftPadding: computed(() => columnVirtualization.value.leftPadding),
    rightPadding: computed(() => columnVirtualization.value.rightPadding),
    columnWidthMap: computed(() => columnVirtualization.value.columnWidthMap),
    visibleStartCol: computed(() => columnVirtualization.value.visibleStart),
    visibleEndCol: computed(() => columnVirtualization.value.visibleEnd),
    scrollableRange: computed(() => ({
      start: columnVirtualization.value.scrollableStart,
      end: columnVirtualization.value.scrollableEnd,
    })),
  }
}
