import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, watchEffect } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { BASE_ROW_HEIGHT, VIRTUALIZATION_BUFFER, clamp } from '../utils/constants'
import type { VisibleRow } from '../types'

const ROW_POOL_OVERSCAN = 5
const SCROLL_EPSILON = 0.5
const SCROLL_EDGE_PADDING = 1

export interface UseVerticalViewportOptions {
  containerRef: Ref<HTMLDivElement | null>
  headerRef?: Ref<HTMLElement | null>
  processedRows: ComputedRef<VisibleRow[]>
  zoom: Ref<number>
  rowHeightMode?: Ref<'fixed' | 'auto'> | 'fixed' | 'auto'
  overscan?: number
}

interface ScrollFrame {
  id: number | null
}

export function useVerticalViewport({
  containerRef,
  headerRef,
  processedRows,
  zoom,
  rowHeightMode = 'fixed',
  overscan,
}: UseVerticalViewportOptions) {
  const scrollTop = ref(0)
  const viewportHeight = ref(0)
  const viewportWidth = ref(0)
  const totalRowCount = computed(() => processedRows.value.length)
  const pendingScrollTop = ref<number | null>(null)
  const scrollFrame: ScrollFrame = { id: null }
  const startIndex = ref(0)
  const endIndex = ref(0)
  const lastScrollIndex = ref(-1)
  const resizeObserverRef = ref<ResizeObserver | null>(null)
  const virtualizationEnabled = computed(() => {
    const mode =
      typeof rowHeightMode === 'object' && 'value' in rowHeightMode
        ? rowHeightMode.value
        : rowHeightMode
    return mode === 'fixed'
  })

  const effectiveRowHeight = computed(() => {
    const zoomFactor = zoom.value || 1
    return zoomFactor < 1 ? BASE_ROW_HEIGHT : BASE_ROW_HEIGHT * zoomFactor
  })

  const visibleCount = computed(() => {
    if (!virtualizationEnabled.value) {
      return totalRowCount.value || 0
    }
    const rowHeight = effectiveRowHeight.value || BASE_ROW_HEIGHT
    const zoomFactor = zoom.value || 1
    const adjustedViewportHeight =
      zoomFactor >= 1 ? viewportHeight.value : viewportHeight.value / Math.max(zoomFactor, 0.01)
    return Math.max(1, Math.ceil((adjustedViewportHeight || rowHeight) / rowHeight))
  })

  const poolSize = computed(() => {
    if (!virtualizationEnabled.value) {
      return totalRowCount.value
    }
    const customOverscan =
      typeof overscan === 'number' ? overscan : ROW_POOL_OVERSCAN + VIRTUALIZATION_BUFFER
    const desired = visibleCount.value + customOverscan
    const total = totalRowCount.value
    if (total <= 0) return 0
    return Math.min(total, Math.max(desired, visibleCount.value))
  })

  const totalContentHeight = computed(() => {
    if (!totalRowCount.value) return 0
    return totalRowCount.value * effectiveRowHeight.value
  })

  const visibleRowsPool = shallowRef<VisibleRow[]>([])
  const visibleRows = computed(() => visibleRowsPool.value)

  function updateVisibleRows() {
    const pool = visibleRowsPool.value
    pool.length = 0
    if (!virtualizationEnabled.value) {
      processedRows.value.forEach((entry, index) => {
        pool.push({ ...entry, displayIndex: index })
      })
      visibleRowsPool.value = pool
      return
    }

    for (let rowIndex = startIndex.value; rowIndex < endIndex.value; rowIndex += 1) {
      const entry = processedRows.value[rowIndex]
      if (!entry) continue
      pool.push({ ...entry, displayIndex: rowIndex })
    }
    visibleRowsPool.value = pool
  }

  function clampScrollTopValue(value: number) {
    if (!Number.isFinite(value)) return 0
    const container = containerRef.value

    if (!virtualizationEnabled.value) {
      const maxScroll = container ? Math.max(0, container.scrollHeight - container.clientHeight) : 0
      return clamp(value, 0, maxScroll)
    }

    const rowHeight = effectiveRowHeight.value || BASE_ROW_HEIGHT
    const overscanRows = ROW_POOL_OVERSCAN + VIRTUALIZATION_BUFFER
    const overscanPx = overscanRows * rowHeight
    const trailingGap = Math.max(0, viewportHeight.value - visibleCount.value * rowHeight)
    const virtualMax = Math.max(
      0,
      totalRowCount.value * rowHeight -
        viewportHeight.value +
        overscanPx +
        trailingGap +
        SCROLL_EDGE_PADDING,
    )
    const containerMax = container
      ? Math.max(0, container.scrollHeight - container.clientHeight)
      : 0
    const maxScroll = Math.max(virtualMax, containerMax)
    return clamp(value, 0, maxScroll)
  }

  function applyScrollTop(value: number) {
    const container = containerRef.value
    if (!container) return
    const delta = Math.abs(container.scrollTop - value)
    let applied = value
    if (delta > SCROLL_EPSILON) {
      container.scrollTop = value
      applied = container.scrollTop
    } else {
      applied = container.scrollTop
    }
    scrollTop.value = applied
  }

  function updateVisibleRange(force = false) {
    if (!virtualizationEnabled.value) {
      startIndex.value = 0
      endIndex.value = totalRowCount.value
      lastScrollIndex.value = 0
      updateVisibleRows()
      return
    }

    const total = totalRowCount.value
    if (total <= 0) {
      startIndex.value = 0
      endIndex.value = 0
      lastScrollIndex.value = -1
      updateVisibleRows()
      return
    }

    const rowHeight = effectiveRowHeight.value || BASE_ROW_HEIGHT
    const rawStartIndex = Math.floor(scrollTop.value / Math.max(rowHeight, 1))
    if (!force && Math.abs(rawStartIndex - lastScrollIndex.value) < 1) {
      return
    }

    const pool = poolSize.value || visibleCount.value
    const clampedStart = clamp(rawStartIndex, 0, Math.max(total - 1, 0))
    const normalizedStart = clamp(clampedStart, 0, Math.max(total - pool, 0))
    startIndex.value = normalizedStart
    endIndex.value = Math.min(total, normalizedStart + pool)
    lastScrollIndex.value = rawStartIndex
    updateVisibleRows()
  }

  function updateViewportMetrics() {
    const container = containerRef.value
    if (!container) return
    const headerHeight = headerRef?.value?.offsetHeight ?? 0
    const height = container.clientHeight - headerHeight
    viewportHeight.value = Math.max(height, effectiveRowHeight.value)
    viewportWidth.value = container.clientWidth

    if (!virtualizationEnabled.value) {
      scrollTop.value = container.scrollTop
    } else {
      const current = clampScrollTopValue(container.scrollTop)
      applyScrollTop(current)
      updateVisibleRange(true)
    }
  }

  function handleVerticalScroll(event: Event) {
    const target = event.target as HTMLElement | null
    if (!target) return

    const nextTop = virtualizationEnabled.value
      ? clampScrollTopValue(target.scrollTop)
      : target.scrollTop
    pendingScrollTop.value = nextTop

    if (scrollFrame.id !== null) return

    scrollFrame.id = requestAnimationFrame(() => {
      scrollFrame.id = null
      if (pendingScrollTop.value != null) {
        const value = pendingScrollTop.value
        pendingScrollTop.value = null
        applyScrollTop(value)
        updateVisibleRange()
      }
    })
  }

  function measureRowHeight() {
    updateViewportMetrics()
  }

  function cancelScrollFrame() {
    if (scrollFrame.id !== null) {
      cancelAnimationFrame(scrollFrame.id)
      scrollFrame.id = null
    }
  }

  function scrollToRow(index: number) {
    const container = containerRef.value
    if (!container) return
    const rowHeight = effectiveRowHeight.value
    const clampedIndex = clamp(index, 0, Math.max(totalRowCount.value - 1, 0))
    const next = clamp(
      clampedIndex * rowHeight,
      0,
      Math.max(totalRowCount.value * rowHeight - viewportHeight.value, 0),
    )
    applyScrollTop(next)
    updateVisibleRange(true)
  }

  function isRowVisible(index: number) {
    return index >= startIndex.value && index < endIndex.value
  }

  onMounted(() => {
    updateViewportMetrics()
    updateVisibleRange(true)
    updateVisibleRows()
  })

  watchEffect(() => {
    const container = containerRef.value
    if (!container) return
    if (resizeObserverRef.value) {
      resizeObserverRef.value.disconnect()
      resizeObserverRef.value = null
    }
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => updateViewportMetrics())
      observer.observe(container)
      resizeObserverRef.value = observer
    }
  })

  watch(
    () => [totalRowCount.value, virtualizationEnabled.value, effectiveRowHeight.value],
    () => {
      updateViewportMetrics()
      updateVisibleRange(true)
    },
    { immediate: true },
  )

  watch(
    () => zoom.value,
    () => {
      updateViewportMetrics()
      updateVisibleRange(true)
    },
  )

  watch(
    () => processedRows.value,
    () => {
      updateVisibleRange(true)
    },
  )

  onBeforeUnmount(() => {
    resizeObserverRef.value?.disconnect()
    resizeObserverRef.value = null
    cancelScrollFrame()
  })

  return {
    scrollTop,
    viewportHeight,
    viewportWidth,
    totalRowCount,
    effectiveRowHeight,
    visibleCount,
    poolSize,
    totalContentHeight,
    virtualizationEnabled,
    startIndex,
    endIndex,
    visibleRows,
    visibleRowsPool,
    clampScrollTopValue,
    updateVisibleRange,
    handleVerticalScroll,
    updateViewportMetrics,
    measureRowHeight,
    cancelScrollFrame,
    scrollToRow,
    isRowVisible,
  }
}
