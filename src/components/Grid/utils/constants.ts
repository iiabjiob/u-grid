export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 2
export const ZOOM_STEP = 0.1

export const AUTO_SCROLL_THRESHOLD = 32
export const AUTO_SCROLL_MAX_SPEED = 24
export const AUTO_SCROLL_MIN_SPEED = 6

export const FILL_HANDLE_SIZE = 8

export const BASE_ROW_HEIGHT = 24
export const VIRTUALIZATION_BUFFER = 10

export const NULL_FILTER_KEY = "__NULL__"
export const UNDEFINED_FILTER_KEY = "__UNDEFINED__"

export function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}
