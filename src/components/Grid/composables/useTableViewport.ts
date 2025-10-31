import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { UiTableColumn, VisibleRow } from '../types'
import { BASE_ROW_HEIGHT, VIRTUALIZATION_BUFFER, clamp } from '../utils/constants'
import {
  COLUMN_VIRTUALIZATION_BUFFER,
  resolveColumnWidth,
  supportsCssZoom,
  type ColumnWidthMetrics,
} from '../utils/gridUtils'
import {
  buildVisibleRowPool,
  createHorizontalVirtualizer,
  createVerticalVirtualizer,
  type ColumnMetric,
} from './useAxisVirtualizer'
import { useRafScheduler } from './useRafScheduler'

export interface UseTableViewportOptions {
  containerRef: Ref<HTMLDivElement | null>
  headerRef: Ref<HTMLElement | null>
  processedRows: ComputedRef<VisibleRow[]>
  columns: Ref<UiTableColumn[]> | ComputedRef<UiTableColumn[]>
  zoom: Ref<number>
  onAfterScroll?: () => void
  onNearBottom?: () => void
  isLoading?: Ref<boolean>
  rowHeightMode?: Ref<'fixed' | 'auto'> | 'fixed' | 'auto'
  virtualization?: Ref<boolean> | boolean
}

export type TableViewportState = {
  startIndex: number
  endIndex: number
  visibleCount: number
  poolSize: number
  totalRowCount: number
}

interface ScrollPending {
  top: number | null
  left: number | null
}

type ColumnPinMode = 'left' | 'right' | 'none'

interface ColumnVirtualizationSnapshot {
  pinnedLeft: ColumnMetric[]
  pinnedRight: ColumnMetric[]
  visibleScrollable: ColumnMetric[]
  visibleColumns: ColumnMetric[]
  columnWidthMap: Map<string, number>
  leftPadding: number
  rightPadding: number
  totalScrollableWidth: number
  visibleScrollableWidth: number
  scrollableStart: number
  scrollableEnd: number
  visibleStart: number
  visibleEnd: number
  pinnedLeftWidth: number
  pinnedRightWidth: number
  metrics: ColumnWidthMetrics
  containerWidthForColumns: number
}

const ROW_POOL_OVERSCAN = 5
const SCROLL_EPSILON = 0.5
const SCROLL_EDGE_PADDING = 1

function now() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function resolveRowHeightModeValue(
  mode: UseTableViewportOptions['rowHeightMode'],
): 'fixed' | 'auto' {
  if (!mode) return 'fixed'
  if (typeof mode === 'string') return mode
  return mode.value ?? 'fixed'
}

function resolveVirtualizationValue(value: UseTableViewportOptions['virtualization']): boolean {
  if (typeof value === 'boolean') return value
  if (value && typeof value === 'object') {
    return Boolean((value as Ref<boolean>).value)
  }
  return true
}

function resolvePinMode(column: UiTableColumn): ColumnPinMode {
  if (column.sticky === 'left' || column.isSystem) {
    return 'left'
  }
  if (column.sticky === 'right') {
    return 'right'
  }
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
  if (column.stickyLeft) {
    return 'left'
  }
  if (column.stickyRight) {
    return 'right'
  }
  return 'none'
}

function createEmptyColumnSnapshot(): ColumnVirtualizationSnapshot {
  return {
    pinnedLeft: [],
    pinnedRight: [],
    visibleScrollable: [],
    visibleColumns: [],
    columnWidthMap: new Map<string, number>(),
    leftPadding: 0,
    rightPadding: 0,
    totalScrollableWidth: 0,
    visibleScrollableWidth: 0,
    scrollableStart: 0,
    scrollableEnd: 0,
    visibleStart: 0,
    visibleEnd: 0,
    pinnedLeftWidth: 0,
    pinnedRightWidth: 0,
    metrics: { widths: [], offsets: [], totalWidth: 0 },
    containerWidthForColumns: 0,
  }
}

export interface UseTableViewportResult {
  scrollTop: Ref<number>
  scrollLeft: Ref<number>
  viewportHeight: Ref<number>
  viewportWidth: Ref<number>
  totalRowCount: Ref<number>
  effectiveRowHeight: Ref<number>
  visibleCount: Ref<number>
  poolSize: Ref<number>
  totalContentHeight: Ref<number>
  startIndex: Ref<number>
  endIndex: Ref<number>
  visibleRows: Ref<VisibleRow[]>
  visibleRowsPool: Ref<Array<VisibleRow | null>>
  virtualizationEnabled: Ref<boolean>
  visibleColumns: Ref<UiTableColumn[]>
  visibleColumnEntries: Ref<ColumnMetric[]>
  visibleScrollableColumns: Ref<UiTableColumn[]>
  visibleScrollableEntries: Ref<ColumnMetric[]>
  pinnedLeftColumns: Ref<UiTableColumn[]>
  pinnedLeftEntries: Ref<ColumnMetric[]>
  pinnedRightColumns: Ref<UiTableColumn[]>
  pinnedRightEntries: Ref<ColumnMetric[]>
  leftPadding: Ref<number>
  rightPadding: Ref<number>
  columnWidthMap: Ref<Map<string, number>>
  visibleStartCol: Ref<number>
  visibleEndCol: Ref<number>
  scrollableRange: Ref<{ start: number; end: number }>
  clampScrollTopValue: (value: number) => number
  handleScroll: (event: Event) => void
  updateViewportHeight: () => void
  measureRowHeight: () => void
  cancelScrollRaf: () => void
  scrollToRow: (index: number) => void
  scrollToColumn: (key: string) => void
  isRowVisible: (index: number) => boolean
  debugMode: Ref<boolean>
  fps: Ref<number>
  state: Ref<TableViewportState>
  attach: () => void
  detach: () => void
  refresh: (force?: boolean) => void
}

export function useTableViewport(options: UseTableViewportOptions): UseTableViewportResult {
  const {
    containerRef,
    headerRef,
    processedRows,
    columns,
    zoom,
    onAfterScroll,
    onNearBottom,
    isLoading,
    rowHeightMode = 'fixed',
    virtualization = true,
  } = options

  const scheduler = useRafScheduler()
  const verticalVirtualizer = createVerticalVirtualizer()
  const horizontalVirtualizer = createHorizontalVirtualizer()

  // Public refs that consumers rely on
  const scrollTopRef = ref(0)
  const scrollLeftRef = ref(0)
  const viewportHeightRef = ref(0)
  const viewportWidthRef = ref(0)
  const totalRowCountRef = ref(0)
  const effectiveRowHeightRef = ref(BASE_ROW_HEIGHT)
  const visibleCountRef = ref(0)
  const poolSizeRef = ref(0)
  const totalContentHeightRef = ref(0)
  const startIndexRef = ref(0)
  const endIndexRef = ref(0)
  const virtualizationEnabledRef = ref(true)

  const visibleRowsRef = shallowRef<VisibleRow[]>([])
  const visibleRowsPoolRef = shallowRef<Array<VisibleRow | null>>([])

  const visibleColumnsRef = shallowRef<UiTableColumn[]>([])
  const visibleColumnEntriesRef = shallowRef<ColumnMetric[]>([])
  const visibleScrollableColumnsRef = shallowRef<UiTableColumn[]>([])
  const visibleScrollableEntriesRef = shallowRef<ColumnMetric[]>([])
  const pinnedLeftColumnsRef = shallowRef<UiTableColumn[]>([])
  const pinnedLeftEntriesRef = shallowRef<ColumnMetric[]>([])
  const pinnedRightColumnsRef = shallowRef<UiTableColumn[]>([])
  const pinnedRightEntriesRef = shallowRef<ColumnMetric[]>([])
  const leftPaddingRef = ref(0)
  const rightPaddingRef = ref(0)
  const visibleStartColRef = ref(0)
  const visibleEndColRef = ref(0)
  const scrollableRangeRef = ref({ start: 0, end: 0 })
  const columnWidthMapRef = shallowRef<Map<string, number>>(new Map())

  watch(
    () => resolveVirtualizationValue(virtualization),
    () => {
      scheduleUpdate(true)
    },
    { immediate: false },
  )

  let debugModeValue = false
  const fps = ref(0)
  const fpsSamples: number[] = []
  let fpsTaskId: number | null = null
  let lastFrameTime = 0
  let lastSampleTime = 0

  const debugMode = {
    get value() {
      return debugModeValue
    },
    set value(next: boolean) {
      if (debugModeValue === next) return
      debugModeValue = next
      if (debugModeValue) {
        startFpsMonitor()
      } else {
        stopFpsMonitor()
      }
    },
  } as Ref<boolean>

  const stateRef = ref<TableViewportState>({
    startIndex: 0,
    endIndex: 0,
    visibleCount: 0,
    poolSize: 0,
    totalRowCount: 0,
  })

  // Internal mutable state
  let scrollTop = 0
  let scrollLeft = 0
  let viewportHeight = 0
  let viewportWidth = 0
  let totalRowCount = 0
  let startIndex = 0
  let endIndex = 0
  let poolSize = 0
  let overscanLeadingRows = 0
  let overscanTrailingRows = 0
  let pending: ScrollPending = { top: null, left: null }
  let resizeObserver: ResizeObserver | null = null
  let columnSnapshot: ColumnVirtualizationSnapshot = createEmptyColumnSnapshot()
  let attached = false
  let waitForContainerTaskId: number | null = null
  let scheduledUpdateTaskId: number | null = null
  let pendingForce = false
  let afterScrollTaskId: number | null = null

  function startFpsMonitor() {
    if (!debugMode.value) return
    if (fpsTaskId !== null) return
    fpsSamples.length = 0
    lastFrameTime = now()
    lastSampleTime = lastFrameTime

    const tick = () => {
      if (!debugMode.value) {
        stopFpsMonitor()
        return
      }

      const timestamp = now()
      const delta = timestamp - lastFrameTime
      lastFrameTime = timestamp

      if (delta > 0) {
        const current = 1000 / delta
        fpsSamples.push(current)
        if (fpsSamples.length > 60) {
          fpsSamples.shift()
        }
      }

      if (timestamp - lastSampleTime >= 250 && fpsSamples.length) {
        lastSampleTime = timestamp
        const sum = fpsSamples.reduce((total, value) => total + value, 0)
        fps.value = Math.min(240, sum / fpsSamples.length)
      }

      fpsTaskId = scheduler.schedule(tick, { priority: 'low' })
    }

    fpsTaskId = scheduler.schedule(tick, { priority: 'low' })
  }

  function stopFpsMonitor() {
    if (fpsTaskId !== null) {
      scheduler.cancel(fpsTaskId)
      fpsTaskId = null
    }
    fpsSamples.length = 0
    fps.value = 0
  }

  function scheduleAfterScroll() {
    if (!onAfterScroll) return
    if (afterScrollTaskId !== null) {
      scheduler.cancel(afterScrollTaskId)
      afterScrollTaskId = null
    }
    afterScrollTaskId = scheduler.schedule(
      () => {
        afterScrollTaskId = null
        onAfterScroll?.()
      },
      { priority: 'normal' },
    )
  }

  function clampScrollTopValue(value: number) {
    if (!Number.isFinite(value)) return 0
    const container = containerRef.value

    const rowHeight = effectiveRowHeightRef.value || BASE_ROW_HEIGHT
    const baseMax = Math.max(0, totalRowCount * rowHeight - viewportHeight)
    const overscanPx = Math.max(0, overscanTrailingRows) * rowHeight
    const visibleSpan = virtualizationEnabledRef.value
      ? Math.max(1, visibleCountRef.value)
      : Math.max(1, totalRowCount)
    const trailingGap = Math.max(0, viewportHeight - visibleSpan * rowHeight)
    const extendedMax = Math.max(0, baseMax + overscanPx + trailingGap + SCROLL_EDGE_PADDING)
    const containerLimit = container
      ? Math.max(0, container.scrollHeight - container.clientHeight)
      : baseMax
    const maxScroll = Math.max(baseMax, Math.min(extendedMax, containerLimit))
    if (!Number.isFinite(maxScroll) || maxScroll <= 0) {
      return 0
    }
    return clamp(value, 0, maxScroll)
  }

  function clampScrollLeftValue(value: number) {
    if (!Number.isFinite(value)) return 0
    const container = containerRef.value

    const metrics = columnSnapshot.metrics
    const averageWidth = metrics.widths.length ? metrics.totalWidth / metrics.widths.length : 0
    const bufferPx = COLUMN_VIRTUALIZATION_BUFFER * averageWidth
    const effectiveViewport = Math.max(
      0,
      columnSnapshot.containerWidthForColumns -
        columnSnapshot.pinnedLeftWidth -
        columnSnapshot.pinnedRightWidth,
    )
    const trailingGap = Math.max(0, effectiveViewport - columnSnapshot.visibleScrollableWidth)
    const baseMax = Math.max(0, columnSnapshot.totalScrollableWidth - effectiveViewport)
    const extendedMax = Math.max(0, baseMax + bufferPx + trailingGap + SCROLL_EDGE_PADDING)
    const containerLimit = container
      ? Math.max(0, container.scrollWidth - container.clientWidth)
      : baseMax
    const maxScroll = Math.max(baseMax, Math.min(extendedMax, containerLimit))
    if (!Number.isFinite(maxScroll) || maxScroll <= 0) {
      return 0
    }
    return clamp(value, 0, maxScroll)
  }

  function updateVisibleRows() {
    if (!poolSize) {
      visibleRowsPoolRef.value = []
      visibleRowsRef.value = []
      return
    }

    const { pool, rows } = buildVisibleRowPool(processedRows.value, startIndex, poolSize)
    visibleRowsPoolRef.value = pool
    visibleRowsRef.value = rows
  }

  function buildHorizontalMeta(layoutScale: number, width: number) {
    const sourceColumns = (columns as Ref<UiTableColumn[]>).value ?? []

    const pinnedLeft: ColumnMetric[] = []
    const pinnedRight: ColumnMetric[] = []
    const scrollableColumns: UiTableColumn[] = []
    const scrollableIndices: number[] = []
    const scrollableWidths: number[] = []
    const scrollableOffsets: number[] = []
    let accumulatedWidth = 0

    sourceColumns.forEach((column, index) => {
      const pin = resolvePinMode(column)
      const widthValue = resolveColumnWidth(column, layoutScale)
      const metric: ColumnMetric = { column, index, width: widthValue, pin }

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
      scrollableWidths.push(widthValue)
      accumulatedWidth += widthValue
    })

    const metrics: ColumnWidthMetrics = {
      widths: scrollableWidths,
      offsets: scrollableOffsets,
      totalWidth: accumulatedWidth,
    }

    const pinnedLeftWidth = pinnedLeft.reduce((sum, metric) => sum + metric.width, 0)
    const pinnedRightWidth = pinnedRight.reduce((sum, metric) => sum + metric.width, 0)
    const containerWidthForColumns = Math.max(0, width)
    return {
      container: containerRef.value ?? null,
      scrollableColumns,
      scrollableIndices,
      metrics,
      pinnedLeft,
      pinnedRight,
      pinnedLeftWidth,
      pinnedRightWidth,
      zoom: layoutScale,
      containerWidthForColumns,
      indexColumnWidth: 60,
    }
  }

  function applyColumnSnapshot(
    meta: ReturnType<typeof buildHorizontalMeta>,
    start: number,
    end: number,
    payload: {
      visibleStart: number
      visibleEnd: number
      leftPadding: number
      rightPadding: number
      totalScrollableWidth: number
      visibleScrollableWidth: number
    },
  ) {
    const visibleScrollable: ColumnMetric[] = []
    for (let idx = start; idx < end; idx += 1) {
      const column = meta.scrollableColumns[idx]
      if (!column) continue
      const widthValue = meta.metrics.widths[idx] ?? resolveColumnWidth(column, meta.zoom)
      visibleScrollable.push({
        column,
        index: meta.scrollableIndices[idx] ?? idx,
        width: widthValue,
        pin: 'none',
      })
    }

    const columnWidthMap = new Map<string, number>()
    meta.pinnedLeft.forEach((metric) => columnWidthMap.set(metric.column.key, metric.width))
    meta.pinnedRight.forEach((metric) => columnWidthMap.set(metric.column.key, metric.width))
    meta.scrollableColumns.forEach((column, idx) => {
      const widthValue = meta.metrics.widths[idx] ?? resolveColumnWidth(column, meta.zoom)
      columnWidthMap.set(column.key, widthValue)
    })

    const visibleColumns = [...meta.pinnedLeft, ...visibleScrollable, ...meta.pinnedRight]
    const visibleIndexes = visibleColumns.map((entry) => entry.index)
    const visibleStart = visibleIndexes.length ? Math.min(...visibleIndexes) : 0
    const visibleEnd = visibleIndexes.length ? Math.max(...visibleIndexes) + 1 : 0

    columnSnapshot = {
      pinnedLeft: meta.pinnedLeft,
      pinnedRight: meta.pinnedRight,
      visibleScrollable,
      visibleColumns,
      columnWidthMap,
      leftPadding: payload.leftPadding,
      rightPadding: payload.rightPadding,
      totalScrollableWidth: meta.metrics.totalWidth,
      visibleScrollableWidth: payload.visibleScrollableWidth,
      scrollableStart: start,
      scrollableEnd: end,
      visibleStart,
      visibleEnd,
      pinnedLeftWidth: meta.pinnedLeftWidth,
      pinnedRightWidth: meta.pinnedRightWidth,
      metrics: meta.metrics,
      containerWidthForColumns: meta.containerWidthForColumns,
    }

    visibleColumnsRef.value = visibleColumns.map((entry) => entry.column)
    visibleColumnEntriesRef.value = visibleColumns
    visibleScrollableColumnsRef.value = visibleScrollable.map((entry) => entry.column)
    visibleScrollableEntriesRef.value = visibleScrollable
    pinnedLeftColumnsRef.value = meta.pinnedLeft.map((entry) => entry.column)
    pinnedLeftEntriesRef.value = meta.pinnedLeft
    pinnedRightColumnsRef.value = meta.pinnedRight.map((entry) => entry.column)
    pinnedRightEntriesRef.value = meta.pinnedRight
    leftPaddingRef.value = payload.leftPadding
    rightPaddingRef.value = payload.rightPadding
    columnWidthMapRef.value = columnWidthMap
    visibleStartColRef.value = visibleStart
    visibleEndColRef.value = visibleEnd
    scrollableRangeRef.value = { start, end }
  }

  function runUpdate(_force = false) {
    const container = containerRef.value
    const rows = processedRows.value
    totalRowCount = rows.length
    totalRowCountRef.value = totalRowCount

    const mode = resolveRowHeightModeValue(rowHeightMode)
    const virtualizationEnabledByProp = resolveVirtualizationValue(virtualization)
    const verticalVirtualizationEnabled = virtualizationEnabledByProp && mode === 'fixed'
    virtualizationEnabledRef.value = verticalVirtualizationEnabled

    const zoomFactor = Math.max(zoom.value || 1, 0.01)
    const layoutScale = supportsCssZoom ? zoomFactor : 1
    const resolvedRowHeight = BASE_ROW_HEIGHT * layoutScale
    effectiveRowHeightRef.value = resolvedRowHeight

    if (!container) {
      return
    }

    viewportHeight = Math.max(
      container.clientHeight - (headerRef.value?.offsetHeight ?? 0),
      resolvedRowHeight,
    )
    viewportWidth = container.clientWidth
    viewportHeightRef.value = viewportHeight
    viewportWidthRef.value = viewportWidth

    const pendingTop = pending.top ?? container.scrollTop
    const pendingLeft = pending.left ?? container.scrollLeft
    pending = { top: null, left: null }

    const verticalState = verticalVirtualizer.update({
      axis: 'vertical',
      viewportSize: viewportHeight,
      scrollOffset: pendingTop,
      virtualizationEnabled: verticalVirtualizationEnabled,
      estimatedItemSize: resolvedRowHeight,
      totalCount: totalRowCount,
      overscan: verticalVirtualizationEnabled ? ROW_POOL_OVERSCAN + VIRTUALIZATION_BUFFER : 0,
      meta: {
        container,
        zoom: zoomFactor,
      },
    })

    scrollTop = clampScrollTopValue(verticalState.offset)
    if (Math.abs(container.scrollTop - scrollTop) > SCROLL_EPSILON) {
      container.scrollTop = scrollTop
    } else {
      scrollTop = container.scrollTop
    }
    scrollTopRef.value = scrollTop

    totalContentHeightRef.value = totalRowCount * resolvedRowHeight
    visibleCountRef.value = verticalState.visibleCount
    poolSize = verticalState.poolSize
    poolSizeRef.value = poolSize
    startIndex = verticalState.startIndex
    endIndex = verticalState.endIndex
    overscanLeadingRows = verticalState.overscanLeading
    overscanTrailingRows = verticalState.overscanTrailing
    startIndexRef.value = startIndex
    endIndexRef.value = endIndex

    if (!poolSize || totalRowCount === 0) {
      visibleRowsPoolRef.value = []
      visibleRowsRef.value = []
    } else {
      updateVisibleRows()
    }

    const columnMeta = buildHorizontalMeta(layoutScale, viewportWidth)
    const fallbackWidth =
      columnMeta.metrics.widths[0] ??
      columnMeta.pinnedLeft[0]?.width ??
      columnMeta.pinnedRight[0]?.width ??
      60
    const averageColumnWidth = columnMeta.metrics.widths.length
      ? Math.max(1, columnMeta.metrics.totalWidth / Math.max(columnMeta.metrics.widths.length, 1))
      : Math.max(1, fallbackWidth)

    const horizontalState = horizontalVirtualizer.update({
      axis: 'horizontal',
      viewportSize: viewportWidth,
      scrollOffset: pendingLeft,
      virtualizationEnabled: true,
      estimatedItemSize: averageColumnWidth,
      totalCount: columnMeta.scrollableColumns.length,
      overscan: 0,
      meta: columnMeta,
    })

    scrollLeft = clampScrollLeftValue(horizontalState.offset)
    if (Math.abs(container.scrollLeft - scrollLeft) > SCROLL_EPSILON) {
      container.scrollLeft = scrollLeft
    } else {
      scrollLeft = container.scrollLeft
    }
    scrollLeftRef.value = scrollLeft

    applyColumnSnapshot(
      columnMeta,
      horizontalState.startIndex,
      horizontalState.endIndex,
      horizontalState.payload,
    )

    stateRef.value = {
      startIndex,
      endIndex,
      visibleCount: verticalState.visibleCount,
      poolSize,
      totalRowCount,
    }

    if (onNearBottom && viewportHeight > 0 && totalRowCount > 0) {
      const threshold = Math.max(0, totalContentHeightRef.value - viewportHeight * 2)
      if (scrollTop >= threshold && !isLoading?.value) {
        onNearBottom()
      }
    }

    scheduleAfterScroll()
  }

  function scheduleUpdate(force = false) {
    pendingForce = pendingForce || force
    if (scheduledUpdateTaskId !== null) return
    scheduledUpdateTaskId = scheduler.schedule(
      () => {
        const forceUpdate = pendingForce
        pendingForce = false
        scheduledUpdateTaskId = null
        runUpdate(forceUpdate)
      },
      { priority: 'high' },
    )
  }

  function handleScroll(event: Event) {
    const target = event.target as HTMLElement | null
    if (!target || !attached) return
    pending.top = target.scrollTop
    pending.left = target.scrollLeft
    scheduleUpdate()
  }

  function handleResize() {
    scheduleUpdate(true)
  }

  function updateViewportHeight() {
    scheduleUpdate(true)
  }

  function measureRowHeight() {
    scheduleUpdate(true)
  }

  function cancelScrollRaf() {
    if (scheduledUpdateTaskId !== null) {
      scheduler.cancel(scheduledUpdateTaskId)
      scheduledUpdateTaskId = null
    }
    if (afterScrollTaskId !== null) {
      scheduler.cancel(afterScrollTaskId)
      afterScrollTaskId = null
    }
    pendingForce = false
  }

  function scrollToRow(index: number) {
    const container = containerRef.value
    if (!container) return
    const rowHeight = effectiveRowHeightRef.value
    const clampedIndex = clamp(index, 0, Math.max(totalRowCount - 1, 0))
    const target = clampScrollTopValue(clampedIndex * rowHeight)
    pending.top = target
    scheduleUpdate(true)
  }

  function scrollToColumn(key: string) {
    const container = containerRef.value
    if (!container) return
    const map = columnWidthMapRef.value
    let offset = 0
    for (const [columnKey, width] of map.entries()) {
      if (columnKey === key) break
      offset += width
    }
    pending.left = clampScrollLeftValue(offset)
    scheduleUpdate(true)
  }

  scheduler.flush()
  function attach() {
    if (attached) return
    const container = containerRef.value
    if (!container) {
      if (waitForContainerTaskId === null) {
        waitForContainerTaskId = scheduler.schedule(
          () => {
            waitForContainerTaskId = null
            attach()
          },
          { priority: 'high', immediate: false },
        )
      }
      return
    }
    attached = true
    container.addEventListener('scroll', handleScroll, { passive: true })
    resizeObserver = new ResizeObserver(() => {
      handleResize()
    })
    resizeObserver.observe(container)
    if (headerRef.value) {
      resizeObserver.observe(headerRef.value)
    }
    scheduleUpdate(true)
    scheduler.flush()
  }

  function detach() {
    if (!attached) return
    attached = false
    if (waitForContainerTaskId !== null) {
      scheduler.cancel(waitForContainerTaskId)
      waitForContainerTaskId = null
    }
    const container = containerRef.value
    if (!container) return
    container.removeEventListener('scroll', handleScroll)
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    cancelScrollRaf()
  }

  function refresh(force?: boolean) {
    scheduleUpdate(force === true)
  }

  onMounted(() => {
    attach()
  })

  onBeforeUnmount(() => {
    detach()
  })

  return {
    scrollTop: scrollTopRef,
    scrollLeft: scrollLeftRef,
    viewportHeight: viewportHeightRef,
    viewportWidth: viewportWidthRef,
    totalRowCount: totalRowCountRef,
    effectiveRowHeight: effectiveRowHeightRef,
    visibleCount: visibleCountRef,
    poolSize: poolSizeRef,
    totalContentHeight: totalContentHeightRef,
    startIndex: startIndexRef,
    endIndex: endIndexRef,
    visibleRows: visibleRowsRef,
    visibleRowsPool: visibleRowsPoolRef,
    virtualizationEnabled: virtualizationEnabledRef,
    visibleColumns: visibleColumnsRef,
    visibleColumnEntries: visibleColumnEntriesRef,
    visibleScrollableColumns: visibleScrollableColumnsRef,
    visibleScrollableEntries: visibleScrollableEntriesRef,
    pinnedLeftColumns: pinnedLeftColumnsRef,
    pinnedLeftEntries: pinnedLeftEntriesRef,
    pinnedRightColumns: pinnedRightColumnsRef,
    pinnedRightEntries: pinnedRightEntriesRef,
    leftPadding: leftPaddingRef,
    rightPadding: rightPaddingRef,
    columnWidthMap: columnWidthMapRef,
    visibleStartCol: visibleStartColRef,
    visibleEndCol: visibleEndColRef,
    scrollableRange: scrollableRangeRef,
    clampScrollTopValue,
    handleScroll,
    updateViewportHeight,
    measureRowHeight,
    cancelScrollRaf,
    scrollToRow,
    scrollToColumn,
    isRowVisible: (index: number) => {
      return index >= startIndex && index <= endIndex
    },
    debugMode,
    fps,
    state: stateRef,
    attach,
    detach,
    refresh,
  }
}
