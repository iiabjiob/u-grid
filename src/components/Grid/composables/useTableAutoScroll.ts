import { ref } from 'vue'
import type { Ref } from 'vue'
import {
  AUTO_SCROLL_MAX_SPEED,
  AUTO_SCROLL_MIN_SPEED,
  AUTO_SCROLL_THRESHOLD,
} from '../utils/constants'

// Manages pointer-driven auto scrolling for UiTable drag interactions.

interface UseTableAutoScrollOptions {
  containerRef: Ref<HTMLDivElement | null>
  onFrame?: (event: { lastPointerEvent: MouseEvent | null }) => void
}

/**
 * Provides helpers to start, maintain, and stop auto scrolling while the user drags across the grid.
 */
export function useTableAutoScroll({ containerRef, onFrame }: UseTableAutoScrollOptions) {
  const autoScrollVelocity = { x: 0, y: 0 }
  const autoScrollFrame = ref<number | null>(null)
  const lastPointerEvent = ref<MouseEvent | null>(null)

  /**
   * Converts the distance of the pointer from the viewport edge into a scroll speed.
   */
  function computeAutoScrollSpeed(distance: number) {
    const clamped = Math.min(Math.max(distance, 0), AUTO_SCROLL_THRESHOLD)
    if (clamped <= 0) return 0
    const ratio = clamped / AUTO_SCROLL_THRESHOLD
    return AUTO_SCROLL_MIN_SPEED + (AUTO_SCROLL_MAX_SPEED - AUTO_SCROLL_MIN_SPEED) * ratio
  }

  /**
   * Advances the scroll position and re-schedules the next animation frame when needed.
   */
  function stepAutoScroll() {
    autoScrollFrame.value = null
    const container = containerRef.value
    if (!container) return

    if (autoScrollVelocity.x) {
      container.scrollLeft += autoScrollVelocity.x
    }
    if (autoScrollVelocity.y) {
      container.scrollTop += autoScrollVelocity.y
    }

    onFrame?.({ lastPointerEvent: lastPointerEvent.value })

    if (autoScrollVelocity.x || autoScrollVelocity.y) {
      autoScrollFrame.value = requestAnimationFrame(stepAutoScroll)
    }
  }

  /**
   * Updates the active scroll velocity based on the pointer position and restarts the RAF loop.
   */
  function updateAutoScroll(event: MouseEvent) {
    lastPointerEvent.value = event
    const container = containerRef.value
    if (!container) return
    const rect = container.getBoundingClientRect()
    let vx = 0
    let vy = 0

    if (event.clientX < rect.left + AUTO_SCROLL_THRESHOLD) {
      vx = -computeAutoScrollSpeed(rect.left + AUTO_SCROLL_THRESHOLD - event.clientX)
    } else if (event.clientX > rect.right - AUTO_SCROLL_THRESHOLD) {
      vx = computeAutoScrollSpeed(event.clientX - (rect.right - AUTO_SCROLL_THRESHOLD))
    }

    if (event.clientY < rect.top + AUTO_SCROLL_THRESHOLD) {
      vy = -computeAutoScrollSpeed(rect.top + AUTO_SCROLL_THRESHOLD - event.clientY)
    } else if (event.clientY > rect.bottom - AUTO_SCROLL_THRESHOLD) {
      vy = computeAutoScrollSpeed(event.clientY - (rect.bottom - AUTO_SCROLL_THRESHOLD))
    }

    autoScrollVelocity.x = vx
    autoScrollVelocity.y = vy

    if ((vx !== 0 || vy !== 0) && autoScrollFrame.value === null) {
      autoScrollFrame.value = requestAnimationFrame(stepAutoScroll)
    } else if (vx === 0 && vy === 0 && autoScrollFrame.value !== null) {
      cancelAnimationFrame(autoScrollFrame.value)
      autoScrollFrame.value = null
    }
  }

  /**
   * Cancels the RAF loop and clears any stored pointer state.
   */
  function stopAutoScroll() {
    if (autoScrollFrame.value !== null) {
      cancelAnimationFrame(autoScrollFrame.value)
      autoScrollFrame.value = null
    }
    autoScrollVelocity.x = 0
    autoScrollVelocity.y = 0
    lastPointerEvent.value = null
  }

  return {
    updateAutoScroll,
    stopAutoScroll,
    lastPointerEvent,
  }
}
