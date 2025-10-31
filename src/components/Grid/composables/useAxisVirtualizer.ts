import { shallowRef } from 'vue'
import type { Ref } from 'vue'
import { clamp } from '../utils/constants'
import {
  calculateVisibleColumns,
  COLUMN_VIRTUALIZATION_BUFFER,
  type ColumnWidthMetrics,
} from '../utils/gridUtils'
import type { UiTableColumn, VisibleRow } from '../types'

export type AxisOrientation = 'vertical' | 'horizontal'

export interface AxisVirtualizerContext<TMeta> {
  axis: AxisOrientation
  viewportSize: number
  scrollOffset: number
  virtualizationEnabled: boolean
  estimatedItemSize: number
  totalCount: number
  overscan: number
  meta: TMeta
}

export interface AxisVirtualizerInternalContext<TMeta> extends AxisVirtualizerContext<TMeta> {
  visibleCount: number
  poolSize: number
  overscanLeading: number
  overscanTrailing: number
}

export interface AxisVirtualizerRange<TPayload> {
  start: number
  end: number
  payload: TPayload
}

export interface AxisVirtualizerState<TPayload> {
  axis: AxisOrientation
  offset: number
  viewportSize: number
  totalCount: number
  startIndex: number
  endIndex: number
  visibleCount: number
  poolSize: number
  overscanLeading: number
  overscanTrailing: number
  payload: TPayload
}

export interface AxisVirtualizerStrategy<TMeta, TPayload> {
  computeVisibleCount(context: AxisVirtualizerContext<TMeta>): number
  clampScroll(value: number, context: AxisVirtualizerInternalContext<TMeta>): number
  computeRange(
    offset: number,
    context: AxisVirtualizerInternalContext<TMeta>,
  ): AxisVirtualizerRange<TPayload>
  getOffsetForIndex?(index: number, context: AxisVirtualizerInternalContext<TMeta>): number
}

export interface AxisVirtualizer<TMeta, TPayload> {
  state: Ref<AxisVirtualizerState<TPayload>>
  update(context: AxisVirtualizerContext<TMeta>): AxisVirtualizerState<TPayload>
  getOffsetForIndex(index: number, context: AxisVirtualizerInternalContext<TMeta>): number
  isIndexVisible(index: number): boolean
}

export function useAxisVirtualizer<TMeta, TPayload>(
  axis: AxisOrientation,
  strategy: AxisVirtualizerStrategy<TMeta, TPayload>,
  initialPayload: TPayload,
): AxisVirtualizer<TMeta, TPayload> {
  const state = shallowRef<AxisVirtualizerState<TPayload>>({
    axis,
    offset: 0,
    viewportSize: 0,
    totalCount: 0,
    startIndex: 0,
    endIndex: 0,
    visibleCount: 0,
    poolSize: 0,
    overscanLeading: 0,
    overscanTrailing: 0,
    payload: initialPayload,
  })

  function update(context: AxisVirtualizerContext<TMeta>): AxisVirtualizerState<TPayload> {
    const virtualizationEnabled = context.virtualizationEnabled && context.totalCount > 0
    const visibleCount = virtualizationEnabled
      ? Math.max(1, strategy.computeVisibleCount(context))
      : context.totalCount
    const overscanBase = virtualizationEnabled ? Math.max(0, Math.round(context.overscan)) : 0
    const poolSize = virtualizationEnabled
      ? Math.min(context.totalCount, Math.max(visibleCount + overscanBase, visibleCount))
      : context.totalCount

    const availableOverscan = Math.max(poolSize - visibleCount, 0)
    const overscanLeading = virtualizationEnabled
      ? Math.min(Math.ceil(availableOverscan / 2), availableOverscan)
      : 0
    const overscanTrailing = virtualizationEnabled
      ? Math.max(0, availableOverscan - overscanLeading)
      : 0

    const internalContext: AxisVirtualizerInternalContext<TMeta> = {
      ...context,
      virtualizationEnabled,
      visibleCount,
      poolSize,
      overscanLeading,
      overscanTrailing,
    }

    const offset = strategy.clampScroll(context.scrollOffset, internalContext)
    const range = strategy.computeRange(offset, internalContext)
    const maxPoolStart = Math.max(context.totalCount - internalContext.poolSize, 0)
    const normalizedStart = clamp(range.start, 0, maxPoolStart)
    const normalizedEnd = Math.min(context.totalCount, Math.max(range.end, normalizedStart))

    const nextState: AxisVirtualizerState<TPayload> = {
      axis,
      offset,
      viewportSize: context.viewportSize,
      totalCount: context.totalCount,
      startIndex: normalizedStart,
      endIndex: normalizedEnd,
      visibleCount,
      poolSize: Math.max(normalizedEnd - normalizedStart, 0),
      overscanLeading,
      overscanTrailing,
      payload: range.payload,
    }

    state.value = nextState
    return nextState
  }

  function getOffsetForIndex(
    index: number,
    context: AxisVirtualizerInternalContext<TMeta>,
  ): number {
    if (strategy.getOffsetForIndex) {
      return strategy.getOffsetForIndex(index, context)
    }
    const clampedIndex = clamp(index, 0, Math.max(context.totalCount - 1, 0))
    return clampedIndex * context.estimatedItemSize
  }

  function isIndexVisible(index: number): boolean {
    const current = state.value
    return index >= current.startIndex && index < current.endIndex
  }

  return {
    state,
    update,
    getOffsetForIndex,
    isIndexVisible,
  }
}

export interface VerticalVirtualizerMeta {
  container: HTMLDivElement | null
  zoom: number
}

export function createVerticalVirtualizer() {
  return useAxisVirtualizer<VerticalVirtualizerMeta, undefined>(
    'vertical',
    {
      computeVisibleCount(context) {
        const zoom = context.meta.zoom || 1
        const rowHeight = context.estimatedItemSize || 1
        const adjustedViewport =
          zoom >= 1 ? context.viewportSize : context.viewportSize / Math.max(zoom, 0.01)
        return Math.max(1, Math.ceil((adjustedViewport || rowHeight) / Math.max(rowHeight, 1)))
      },
      clampScroll(value, context) {
        if (!context.virtualizationEnabled) {
          const container = context.meta.container
          if (!container) return 0
          const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight)
          return clamp(value, 0, maxScroll)
        }

        const container = context.meta.container
        const rowHeight = context.estimatedItemSize || 1
        const baseMax = Math.max(0, context.totalCount * rowHeight - context.viewportSize)
        const overscanPx = Math.max(0, context.overscanTrailing) * rowHeight
        const visibleSpan = Math.max(1, context.visibleCount)
        const trailingGap = Math.max(0, context.viewportSize - visibleSpan * rowHeight)
        const extendedMax = Math.max(0, baseMax + overscanPx + trailingGap + 1)
        const containerLimit = container
          ? Math.max(0, container.scrollHeight - container.clientHeight)
          : baseMax
        const maxScroll = Math.max(baseMax, Math.min(extendedMax, containerLimit))
        if (!Number.isFinite(maxScroll) || maxScroll <= 0) {
          return 0
        }
        return clamp(value, 0, maxScroll)
      },
      computeRange(offset, context) {
        if (!context.virtualizationEnabled) {
          return {
            start: 0,
            end: context.totalCount,
            payload: undefined,
          }
        }
        const rowHeight = context.estimatedItemSize || 1
        const rawStart = Math.floor(offset / Math.max(rowHeight, 1))
        const desiredStart = rawStart - context.overscanLeading
        const maxPoolStart = Math.max(context.totalCount - context.poolSize, 0)
        const start = clamp(desiredStart, 0, maxPoolStart)
        const end = Math.min(context.totalCount, start + context.poolSize)
        return {
          start,
          end,
          payload: undefined,
        }
      },
      getOffsetForIndex(index, context) {
        const rowHeight = context.estimatedItemSize || 1
        const clampedIndex = clamp(index, 0, Math.max(context.totalCount - 1, 0))
        return clampedIndex * rowHeight
      },
    },
    undefined,
  )
}

export type ColumnPinMode = 'left' | 'right' | 'none'

export interface ColumnMetric {
  column: UiTableColumn
  index: number
  width: number
  pin: ColumnPinMode
}

export interface HorizontalVirtualizerMeta {
  container: HTMLDivElement | null
  scrollableColumns: UiTableColumn[]
  scrollableIndices: number[]
  metrics: ColumnWidthMetrics
  pinnedLeft: ColumnMetric[]
  pinnedRight: ColumnMetric[]
  pinnedLeftWidth: number
  pinnedRightWidth: number
  zoom: number
  containerWidthForColumns: number
  indexColumnWidth: number
}

export interface HorizontalVirtualizerPayload {
  visibleStart: number
  visibleEnd: number
  leftPadding: number
  rightPadding: number
  totalScrollableWidth: number
  visibleScrollableWidth: number
}

export function createHorizontalVirtualizer() {
  return useAxisVirtualizer<HorizontalVirtualizerMeta, HorizontalVirtualizerPayload>(
    'horizontal',
    {
      computeVisibleCount(context) {
        if (!context.virtualizationEnabled) {
          return context.totalCount
        }
        const { metrics } = context.meta
        if (!metrics.widths.length) return 0
        const averageWidth = metrics.totalWidth / Math.max(metrics.widths.length, 1)
        if (!Number.isFinite(averageWidth) || averageWidth <= 0) {
          return metrics.widths.length
        }
        const pinnedWidth = context.meta.pinnedLeftWidth + context.meta.pinnedRightWidth
        const effectiveViewport = Math.max(0, context.meta.containerWidthForColumns - pinnedWidth)
        if (effectiveViewport <= 0) return 1
        return Math.max(1, Math.ceil(effectiveViewport / averageWidth))
      },
      clampScroll(value, context) {
        const { container, metrics, containerWidthForColumns, pinnedLeftWidth, pinnedRightWidth } =
          context.meta
        if (!metrics.widths.length) return 0

        if (!context.virtualizationEnabled) {
          const baseMax = Math.max(0, (container?.scrollWidth ?? 0) - (container?.clientWidth ?? 0))
          return clamp(value, 0, baseMax)
        }

        const averageWidth = metrics.totalWidth / Math.max(metrics.widths.length, 1)
        const bufferPx = COLUMN_VIRTUALIZATION_BUFFER * averageWidth
        const effectiveViewport = Math.max(
          0,
          containerWidthForColumns - pinnedLeftWidth - pinnedRightWidth,
        )
        const trailingGap = Math.max(0, effectiveViewport - metrics.totalWidth)
        const baseMax = Math.max(0, metrics.totalWidth - effectiveViewport)
        const extendedMax = Math.max(0, baseMax + bufferPx + trailingGap + 1)
        const containerLimit = container
          ? Math.max(0, container.scrollWidth - container.clientWidth)
          : baseMax
        const maxScroll = Math.max(baseMax, Math.min(extendedMax, containerLimit))
        if (!Number.isFinite(maxScroll) || maxScroll <= 0) {
          return 0
        }
        return clamp(value, 0, maxScroll)
      },
      computeRange(offset, context) {
        const {
          scrollableColumns,
          containerWidthForColumns,
          pinnedLeftWidth,
          pinnedRightWidth,
          metrics,
          zoom,
        } = context.meta

        if (!scrollableColumns.length) {
          return {
            start: 0,
            end: 0,
            payload: {
              visibleStart: 0,
              visibleEnd: 0,
              leftPadding: 0,
              rightPadding: 0,
              totalScrollableWidth: 0,
              visibleScrollableWidth: 0,
            },
          }
        }

        if (!context.virtualizationEnabled) {
          const totalWidth = metrics.totalWidth
          return {
            start: 0,
            end: scrollableColumns.length,
            payload: {
              visibleStart: 0,
              visibleEnd: scrollableColumns.length,
              leftPadding: 0,
              rightPadding: 0,
              totalScrollableWidth: totalWidth,
              visibleScrollableWidth: totalWidth,
            },
          }
        }

        const visibleRange = calculateVisibleColumns(
          offset,
          containerWidthForColumns,
          scrollableColumns,
          {
            zoom,
            buffer: COLUMN_VIRTUALIZATION_BUFFER,
            pinnedLeftWidth,
            pinnedRightWidth,
            metrics,
          },
        )

        const visibleStart = visibleRange.startIndex
        const visibleEnd = visibleRange.endIndex
        const overscanStart = Math.max(0, visibleStart - context.overscanLeading)
        const overscanEnd = Math.min(context.totalCount, visibleEnd + context.overscanTrailing)
        const visibleScrollableWidth = Math.max(
          0,
          visibleRange.totalWidth - (visibleRange.leftPadding + visibleRange.rightPadding),
        )

        return {
          start: overscanStart,
          end: overscanEnd,
          payload: {
            visibleStart,
            visibleEnd,
            leftPadding: visibleRange.leftPadding,
            rightPadding: visibleRange.rightPadding,
            totalScrollableWidth: metrics.totalWidth,
            visibleScrollableWidth,
          },
        }
      },
      getOffsetForIndex(index, context) {
        const { metrics } = context.meta
        if (!metrics.offsets.length) return 0
        const clamped = clamp(index, 0, Math.max(metrics.offsets.length - 1, 0))
        return metrics.offsets[clamped] ?? 0
      },
    },
    {
      visibleStart: 0,
      visibleEnd: 0,
      leftPadding: 0,
      rightPadding: 0,
      totalScrollableWidth: 0,
      visibleScrollableWidth: 0,
    },
  )
}

export interface VisibleRowPoolResult {
  pool: Array<VisibleRow | null>
  rows: VisibleRow[]
}

export function buildVisibleRowPool(
  rows: VisibleRow[],
  startIndex: number,
  poolSize: number,
): VisibleRowPoolResult {
  const pool: Array<VisibleRow | null> = new Array(poolSize)
  const visible: VisibleRow[] = []

  for (let poolIndex = 0; poolIndex < poolSize; poolIndex += 1) {
    const rowIndex = startIndex + poolIndex
    const entry = rows[rowIndex]
    if (!entry) {
      pool[poolIndex] = null
      continue
    }
    const item = { ...entry, displayIndex: rowIndex }
    pool[poolIndex] = item
    visible.push(item)
  }

  return { pool, rows: visible }
}
