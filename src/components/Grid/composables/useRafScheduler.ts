import { onBeforeUnmount } from 'vue'

const globalObject: typeof globalThis = typeof window !== 'undefined' ? window : globalThis
const isJsdom =
  typeof navigator !== 'undefined' &&
  typeof navigator.userAgent === 'string' &&
  navigator.userAgent.toLowerCase().includes('jsdom')

type FrameHandle = number

const raf: (callback: FrameRequestCallback) => FrameHandle =
  !isJsdom && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
    ? (callback) => window.requestAnimationFrame(callback)
    : (callback) => globalObject.setTimeout(() => callback(now()), 0)

const caf: (handle: FrameHandle) => void =
  !isJsdom && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function'
    ? (handle) => window.cancelAnimationFrame(handle as number)
    : (handle) => globalObject.clearTimeout(handle)

type SchedulerPriority = 'high' | 'normal' | 'low'

interface ScheduleOptions {
  priority?: SchedulerPriority
  immediate?: boolean
}

interface ScheduledTask {
  id: number
  callback: () => void
  priority: SchedulerPriority
}

function now() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

export interface RafScheduler {
  schedule(callback: () => void, options?: ScheduleOptions): number
  cancel(taskId: number): void
  flush(): void
  runNow(callback: () => void): void
}

export function useRafScheduler(): RafScheduler {
  let frameHandle: FrameHandle | null = null
  let nextTaskId = 1
  const queues: Record<SchedulerPriority, Map<number, ScheduledTask>> = {
    high: new Map(),
    normal: new Map(),
    low: new Map(),
  }

  function ensureFrame() {
    if (frameHandle !== null) return
    frameHandle = raf(processFrame)
  }

  function processFrame() {
    frameHandle = null
    runQueue('high')
    runQueue('normal')
    runQueue('low')

    if (queues.high.size || queues.normal.size || queues.low.size) {
      ensureFrame()
    }
  }

  function runQueue(priority: SchedulerPriority) {
    const tasks = queues[priority]
    if (!tasks.size) return

    const entries = Array.from(tasks.values())
    tasks.clear()
    for (const task of entries) {
      try {
        task.callback()
      } catch (error) {
        // Let other callbacks continue running even if one fails.
        globalObject.setTimeout(() => {
          throw error
        }, 0)
      }
    }
  }

  function schedule(callback: () => void, options: ScheduleOptions = {}) {
    const priority = options.priority ?? 'normal'
    const taskId = nextTaskId
    nextTaskId += 1

    if (options.immediate) {
      callback()
      return taskId
    }

    queues[priority].set(taskId, { id: taskId, callback, priority })
    ensureFrame()
    return taskId
  }

  function cancel(taskId: number) {
    ;(Object.keys(queues) as SchedulerPriority[]).forEach((priority) => {
      queues[priority].delete(taskId)
    })
  }

  function flush() {
    if (frameHandle !== null) {
      caf(frameHandle)
      frameHandle = null
    }
    runQueue('high')
    runQueue('normal')
    runQueue('low')
  }

  function runNow(callback: () => void) {
    callback()
  }

  onBeforeUnmount(() => {
    if (frameHandle !== null) {
      caf(frameHandle)
      frameHandle = null
    }
    queues.high.clear()
    queues.normal.clear()
    queues.low.clear()
  })

  return {
    schedule,
    cancel,
    flush,
    runNow,
  }
}
