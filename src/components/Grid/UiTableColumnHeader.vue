<template>
  <div>

    <div
      v-if="showLeftPlaceholder"
      class="ui-table-header-filler ui-table-header-filler--left"
      :style="{ width: leftPaddingStyle }"
      aria-hidden="true"
    ></div>
    <div
      class="ui-table-header-cell relative overflow-visible h-full select-none text-start cursor-pointer"
      :class="[
        baseHeaderClass,
        headerBackgroundClass,
        systemHighlighted ? 'border-blue-500' : '',
        systemSelected
          ? 'dark:text-blue-50'
          : systemHighlighted
            ? 'dark:text-blue-50'
            : col.isSystem
              ? 'dark:text-neutral-200'
              : 'dark:text-gray-200'
      ]"
      :style="headerCellStyle"
      :data-column-key="col.key"
      :title="col.label"
      role="columnheader"
      :aria-sort="ariaSort"
      :aria-colindex="ariaColIndex"
    aria-rowindex="1"
      :tabindex="computedTabIndex"
      @click="onHeaderClick"
      @keydown="onHeaderKeydown"
      ref="headerCellRef"
    >
      <div class="relative flex flex-col items-stretch gap-0.5 w-full">
        <div class="flex items-center gap-1 w-full">
          <div :class="['flex items-center gap-1 flex-1 min-w-0', headerJustifyClass]">
            <span
              v-if="grouped"
              class="flex items-center gap-0.5 flex-shrink-0 text-amber-600 dark:text-amber-300"
            >
              <svg
                class="h-3 w-3"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M3 4h7M3 8h10M3 12h5" />
              </svg>
              <span
                v-if="groupOrder != null"
                class="text-[9px] font-semibold leading-none"
              >
                {{ groupOrder }}
              </span>
            </span>
            <span
              class="text-xs font-semibold leading-none truncate flex-1 min-w-0"
              :class="headerTextClass"
              data-auto-resize-target
            >
              {{ displayText }}
            </span>
            <svg
              v-if="sortDirection === 'asc'"
              class="h-3 w-3 text-blue-500 dark:text-blue-300"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M7 15l5-5 5 5" />
            </svg>
            <svg
              v-else-if="sortDirection === 'desc'"
              class="h-3 w-3 text-blue-500 dark:text-blue-300"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M7 9l5 5 5-5" />
            </svg>
          </div>
          <button
            v-if="!isMenuDisabled"
            ref="menuButtonRef"
            type="button"
            class="ui-table__icon-button ui-table__icon-button--menu ml-auto flex-shrink-0"
            draggable="false"
            :class="[
              filterButtonClass,
              isMenuOpen ? 'ui-table__icon-button--active' : ''
            ]"
            aria-label="Open column menu"
            aria-haspopup="menu"
            :aria-expanded="isMenuOpen ? 'true' : 'false'"
            @click.stop="toggleMenu"
            @keydown.enter.prevent.stop="toggleMenu"
            @keydown.space.prevent.stop="toggleMenu"
          >
            <span
              v-if="sortPriorityLabel"
              class="absolute -top-1 -right-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-blue-500 text-[9px] font-semibold leading-none text-white shadow-sm dark:bg-blue-400"
            >
              {{ sortPriorityLabel }}
            </span>
            <svg
              v-if="filterActive"
              class="h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 4h16l-6 7v6l-4-2v-4L4 4z" />
            </svg>
            <svg
              v-else
              class="h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
        <span
          v-if="showSecondary"
          class="text-[10px] text-gray-500 dark:text-gray-400 font-normal leading-tight truncate w-full"
          :class="headerTextClass"
        >
          {{ col.label }}
        </span>

        <teleport v-if="!isMenuDisabled" to="body">
          <Transition
            enter-active-class="transition ease-out duration-100"
            enter-from-class="opacity-0 -translate-y-1"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition ease-in duration-75"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-1"
          >
            <div
              v-if="isMenuOpen"
              ref="popoverPanelRef"
              :style="popoverPanelStyle"
              class="fixed z-50 mt-1 w-64 rounded-md border border-neutral-300 bg-white text-left shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
              @click.stop
            >
              <slot name="menu" :close="closeMenu" :col="col" :sort-direction="sortDirection" />
            </div>
          </Transition>
        </teleport>
      </div>

      <!-- resize handle -->
      <div
        v-if="col.resizable"
        class="ui-table-column-resize absolute top-0 h-full z-10"
        :style="resizeHandleStyle"
        @mousedown.prevent="startResize"
        @dblclick.stop="autoResize($event)"
        @click.stop
      />
    </div>
    <div
      v-if="showRightPlaceholder"
      class="ui-table-header-filler ui-table-header-filler--right"
      :style="{ width: rightPaddingStyle }"
      aria-hidden="true"
    ></div>
  </div>
</template>

<script setup lang="ts">
const headerCellStyle = computed(() => {
  const styles: Record<string, string> = { top: `${topOffset.value}px` }
  const side = stickySide.value
  const shouldInheritBackground = !props.col.isSystem
  const stickyZIndex = props.col.isSystem ? "36" : "21"

  if (side === "left") {
    styles.position = "sticky"
    styles.left = stickyLeftOffset.value != null ? `${stickyLeftOffset.value}px` : "0px"
    styles.zIndex = stickyZIndex
    if (shouldInheritBackground) {
      styles.background = "inherit"
    }
  } else if (side === "right") {
    styles.position = "sticky"
    styles.right = stickyRightOffset.value != null ? `${stickyRightOffset.value}px` : "0px"
    styles.zIndex = stickyZIndex
    if (shouldInheritBackground) {
      styles.background = "inherit"
    }
  } else if (props.sticky) {
    styles.position = "sticky"
    styles.left = props.stickyLeftOffset != null ? `${props.stickyLeftOffset}px` : ""
    styles.zIndex = stickyZIndex
    if (shouldInheritBackground) {
      styles.background = "inherit"
    }
  }

  if (visualWidth.value != null) {
    const width = Math.max(0, visualWidth.value)
    styles.width = `${width}px`
    styles.minWidth = `${width}px`
    return styles
  }

  if (props.col.maxWidth) {
    return styles
  }

  if (props.col.width != null) {
    styles.width = `${props.col.width * (props.zoomScale ?? 1)}px`
  }
  if (props.col.minWidth != null) {
    styles.minWidth = `${props.col.minWidth * (props.zoomScale ?? 1)}px`
  }

  return styles
})
import { ref, computed, onBeforeUnmount, watch, onMounted, nextTick } from "vue"
import type { UiTableColumn } from "./types"
import { getColumnCellElements } from "./utils/getCellElementsByRange"

type ColumnSortDirection = "asc" | "desc"

type AlignOption = "left" | "center" | "right"

const AUTO_RESIZE_PADDING = 12
const SELECT_TRIGGER_BUFFER = 24

let measurementCanvas: HTMLCanvasElement | null = null
let measurementContext: CanvasRenderingContext2D | null = null

const JUSTIFY_CLASS_MAP: Record<AlignOption, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
}

const TEXT_ALIGN_CLASS_MAP: Record<AlignOption, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
}

function normalizeAlign(value: string | null | undefined, fallback: AlignOption): AlignOption {
  if (typeof value === "string") {
    const lowered = value.toLowerCase()
    if (lowered === "left" || lowered === "center" || lowered === "right") {
      return lowered as AlignOption
    }
  }
  return fallback
}

function parseSize(value: string | null | undefined) {
  const parsed = Number.parseFloat(value ?? "")
  return Number.isFinite(parsed) ? parsed : 0
}

function resolveGap(style: CSSStyleDeclaration) {
  const columnGap = parseSize(style.columnGap)
  if (columnGap) return columnGap
  const gapValue = style.gap ?? "0"
  if (!gapValue) return 0
  const [first] = gapValue.split(" ")
  return parseSize(first)
}

function findContentTargets(element: HTMLElement) {
  const targets = element.querySelectorAll<HTMLElement>("[data-auto-resize-target]")
  if (targets.length) return Array.from(targets)
  return [element]
}

function getMeasurementContext() {
  if (typeof document === "undefined") return null
  if (!measurementCanvas) {
    measurementCanvas = document.createElement("canvas")
  }
  if (!measurementContext) {
    measurementContext = measurementCanvas.getContext("2d")
  }
  return measurementContext
}

function applyTextTransform(text: string, transform: string) {
  switch (transform) {
    case "uppercase":
      return text.toLocaleUpperCase()
    case "lowercase":
      return text.toLocaleLowerCase()
    case "capitalize":
      return text.replace(/(^|\s)\p{L}/gu, match => match.toLocaleUpperCase())
    default:
      return text
  }
}

function measureTextContent(element: HTMLElement) {
  const rawText = element.textContent ?? ""
  const text = rawText.trim()
  if (!text) {
    return Math.max(element.scrollWidth, element.getBoundingClientRect().width)
  }
  const ctx = getMeasurementContext()
  if (!ctx) {
    return Math.max(element.scrollWidth, element.getBoundingClientRect().width)
  }
  const style = window.getComputedStyle(element)
  const fontParts = [style.fontStyle, style.fontVariant, style.fontWeight, style.fontStretch, style.fontSize, style.fontFamily].filter(Boolean)
  ctx.font = fontParts.join(" ") || ctx.font
  const transformedText = applyTextTransform(text, style.textTransform)
  let width = ctx.measureText(transformedText).width
  const letterSpacing = parseSize(style.letterSpacing)
  if (letterSpacing) {
    width += letterSpacing * Math.max(0, transformedText.length - 1)
  }
  const wordSpacing = parseSize(style.wordSpacing)
  if (wordSpacing && transformedText.trim()) {
    const wordCount = Math.max(0, transformedText.trim().split(/\s+/u).length - 1)
    width += wordSpacing * wordCount
  }
  return width
}

function measureBaseWidth(element: HTMLElement) {
  const style = window.getComputedStyle(element)
  const padding = parseSize(style.paddingLeft) + parseSize(style.paddingRight)
  const border = parseSize(style.borderLeftWidth) + parseSize(style.borderRightWidth)
  const contentTargets = findContentTargets(element)
  let contentWidth = 0
  for (const target of contentTargets) {
    const targetStyle = window.getComputedStyle(target)
    const targetWidth = measureTextContent(target)
    const targetMargins = parseSize(targetStyle.marginLeft) + parseSize(targetStyle.marginRight)
    contentWidth = Math.max(contentWidth, targetWidth + targetMargins)
  }
  if (!contentWidth) {
    contentWidth = Math.max(element.scrollWidth, element.getBoundingClientRect().width)
  }
  return contentWidth + padding + border
}

function measureBodyCellWidth(element: HTMLElement) {
  const base = measureBaseWidth(element)
  const accessory = element.querySelector<HTMLElement>(".ui-table__cell-select-trigger")
  let width = base + AUTO_RESIZE_PADDING
  if (accessory) {
    const accessoryStyle = window.getComputedStyle(accessory)
    const accessoryWidth = accessory.offsetWidth + parseSize(accessoryStyle.marginLeft) + parseSize(accessoryStyle.marginRight)
    width = Math.max(width, base + accessoryWidth + AUTO_RESIZE_PADDING)
  } else if (element.dataset.editorType === "select") {
    width = Math.max(width, base + SELECT_TRIGGER_BUFFER)
  }
  return width
}

function measureHeaderWidth(element: HTMLElement) {
  let width = measureBaseWidth(element)
  const additionalTargets = element.querySelectorAll<HTMLElement>("[data-auto-resize-target]")
  for (const target of additionalTargets) {
    const targetStyle = window.getComputedStyle(target)
    const targetWidth = measureTextContent(target) + parseSize(targetStyle.marginLeft) + parseSize(targetStyle.marginRight)
    width = Math.max(width, targetWidth)
  }
  const menuButton = element.querySelector<HTMLElement>(".ui-table__icon-button")
  if (!menuButton) {
    return width + AUTO_RESIZE_PADDING
  }
  const buttonStyle = window.getComputedStyle(menuButton)
  const parentStyle = menuButton.parentElement ? window.getComputedStyle(menuButton.parentElement) : null
  const gap = parentStyle ? resolveGap(parentStyle) : 0
  const buttonWidth = menuButton.offsetWidth + parseSize(buttonStyle.marginLeft) + parseSize(buttonStyle.marginRight)
  return width + buttonWidth + gap + AUTO_RESIZE_PADDING
}

const props = defineProps<{
  col: UiTableColumn
  displayLabel?: string
  systemSelected?: boolean
  systemHighlighted?: boolean
  topOffset?: number
  sortDirection?: ColumnSortDirection | null
  filterActive?: boolean
  menuOpen?: boolean
  zoomScale?: number
  layoutWidth?: number | null
  visualWidth?: number | null
  sortPriority?: number | null
  showLeftFiller?: boolean
  leftPadding?: number
  showRightFiller?: boolean
  rightPadding?: number
  tabIndex?: number
  ariaColIndex?: number | string
  tableContainer?: HTMLElement | null
  stickyLeftOffset?: number
  sticky?: boolean
  stickySide?: "left" | "right" | null
  stickyRightOffset?: number
  disableMenu?: boolean
  baseClass?: string
  grouped?: boolean
  groupOrder?: number | null
}>()
const emit = defineEmits(["resize", "select", "menu-open", "menu-close"])

const displayText = computed(() => props.displayLabel ?? props.col.label ?? "")
const systemSelected = computed(() => props.systemSelected ?? false)
const systemHighlighted = computed(() => props.systemHighlighted ?? false)
const sortDirection = computed<ColumnSortDirection | null>(() => props.sortDirection ?? null)
const filterActive = computed(() => props.filterActive ?? false)
const zoomScale = computed(() => props.zoomScale ?? 1)
const visualWidth = computed(() => props.visualWidth ?? null)
const sortPriority = computed(() => props.sortPriority ?? null)
const grouped = computed(() => props.grouped === true)
const groupOrder = computed(() => (typeof props.groupOrder === "number" ? props.groupOrder : null))
const resizeHandleStyle = computed(() => ({
  cursor: "col-resize",
  width: "12px",
  right: "-6px",
  left: "auto",
  pointerEvents: "auto" as const,
}))
const stickySide = computed<"left" | "right" | null>(() => props.stickySide ?? (props.sticky ? "left" : null))
const stickyLeftOffset = computed(() => props.stickyLeftOffset ?? 0)
const stickyRightOffset = computed(() => props.stickyRightOffset ?? 0)
const isMenuDisabled = computed(() => Boolean(props.disableMenu))
const showSecondary = computed(() => {
  const text = displayText.value?.trim()
  const label = props.col.label?.trim()
  return Boolean(label && text && label !== text)
})
const topOffset = computed(() => props.topOffset ?? 0)
const isMenuOpen = ref(false)
const filterButtonClass = computed(() => {
  if (isMenuDisabled.value) return ""
  if (sortDirection.value || filterActive.value) {
    return "ui-table__icon-button--highlight"
  }
  return ""
})
const headerAlign = computed<AlignOption>(() => normalizeAlign(props.col.headerAlign, normalizeAlign(props.col.align, "center")))
const headerTextClass = computed(() => TEXT_ALIGN_CLASS_MAP[headerAlign.value])
const headerJustifyClass = computed(() => JUSTIFY_CLASS_MAP[headerAlign.value])
const headerBackgroundClass = computed(() => (props.col.isSystem ? "" : ""))
const baseHeaderClass = computed(() => props.baseClass ?? "")
const sortPriorityLabel = computed(() => (sortPriority.value != null ? String(sortPriority.value) : null))
const menuButtonRef = ref<HTMLElement | null>(null)
const computedTabIndex = computed(() => props.tabIndex ?? -1)
const ariaColIndex = computed(() => props.ariaColIndex ?? undefined)
const ariaSort = computed(() => {
  if (sortDirection.value === "asc") return "ascending"
  if (sortDirection.value === "desc") return "descending"
  return "none"
})

let startX = 0
let startWidth = 0
let resizeZoomScale = 1
const displayWidth = computed(() => {
  const zoom = zoomScale.value || 1
  const base = props.col.width
  if (base == null) return "auto"
  let width = base * zoom
  if (props.col.minWidth != null) {
    width = Math.max(width, props.col.minWidth * zoom)
  }
  if (props.col.maxWidth != null) {
    width = Math.min(width, props.col.maxWidth * zoom)
  }
  return `${width}px`
})

const popoverPanelRef = ref<HTMLElement | null>(null)
const headerCellRef = ref<HTMLElement | null>(null)
const popoverPanelStyle = ref<Record<string, string>>({})
const POPOVER_WIDTH = 256
const POPOVER_MARGIN = 4
const VIEWPORT_PADDING = 8
const leftPaddingValue = computed(() => Math.max(0, props.leftPadding ?? 0))
const rightPaddingValue = computed(() => Math.max(0, props.rightPadding ?? 0))
const showLeftPlaceholder = computed(() => Boolean(props.showLeftFiller && leftPaddingValue.value > 0))
const showRightPlaceholder = computed(() => Boolean(props.showRightFiller && rightPaddingValue.value > 0))
const leftPaddingStyle = computed(() => `${leftPaddingValue.value}px`)
const rightPaddingStyle = computed(() => `${rightPaddingValue.value}px`)

let isPointerResizing = false
let resizeReleaseTimeout: ReturnType<typeof setTimeout> | null = null

function cancelResizeReleaseTimeout() {
  if (resizeReleaseTimeout != null) {
    clearTimeout(resizeReleaseTimeout)
    resizeReleaseTimeout = null
  }
}

// Toggle between opening and closing the column action menu
function toggleMenu() {
  if (isMenuDisabled.value) return
  if (isPointerResizing) return
  if (isMenuOpen.value) {
    closeMenu()
  } else {
    openMenu()
  }
}

// Open the column menu, position it, and bind global listeners
function openMenu(emitEvent = true) {
  if (isMenuDisabled.value) return
  if (isPointerResizing) return
  if (isMenuOpen.value) return
  isMenuOpen.value = true
  nextTick(() => updatePopoverPanelPosition())
  attachGlobalListeners()
  if (emitEvent) {
    emit("menu-open", closeMenu)
  }
}

// Close the column menu and detach global listeners
function closeMenu(emitEvent = true) {
  if (!isMenuOpen.value) return
  isMenuOpen.value = false
  detachGlobalListeners()
  if (emitEvent) {
    emit("menu-close")
  }
}

// Close menu when clicking outside the trigger or panel
function handleDocumentPointer(event: MouseEvent) {
  const panel = popoverPanelRef.value
  const button = menuButtonRef.value
  const target = event.target as Node | null
  if (!target) return
  if (panel && panel.contains(target)) return
  if (button && button.contains(target)) return
  closeMenu()
}

// Close menu on Escape without bubbling to parent handlers
function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.stopPropagation()
    closeMenu()
    return
  }
  if ((event.key === "Enter" || event.key === " ") && isMenuDisabled.value) {
    event.stopPropagation()
  }
}

// Subscribe to external events that may reposition or close the menu
function attachGlobalListeners() {
  if (isMenuDisabled.value) return
  window.addEventListener("scroll", updatePopoverPanelPosition, true)
  window.addEventListener("resize", updatePopoverPanelPosition)
  document.addEventListener("mousedown", handleDocumentPointer, true)
  document.addEventListener("keydown", handleKeydown)
}

// Remove external listeners to avoid leaks once menu closes
function detachGlobalListeners() {
  if (isMenuDisabled.value) return
  window.removeEventListener("scroll", updatePopoverPanelPosition, true)
  window.removeEventListener("resize", updatePopoverPanelPosition)
  document.removeEventListener("mousedown", handleDocumentPointer, true)
  document.removeEventListener("keydown", handleKeydown)
}

// Begin drag-to-resize flow and capture initial measurements
function startResize(e: MouseEvent) {
  cancelResizeReleaseTimeout()
  isPointerResizing = true
  e.preventDefault()
  e.stopPropagation()
  startX = e.pageX
  const zoom = zoomScale.value || 1
  startWidth = props.col.width ?? 120
  resizeZoomScale = zoom
  document.body.style.cursor = "col-resize"
  document.body.style.userSelect = "none"
  document.body.classList.add("ui-table-resize-active")
  window.addEventListener("mousemove", onMove)
  window.addEventListener("mouseup", stopResize)
}

// Update column width while dragging within defined limits
function onMove(e: MouseEvent) {
  // Constraints
  const min = props.col.minWidth ?? 10
  const max = props.col.maxWidth ?? window.innerWidth
  const delta = (e.pageX - startX) / resizeZoomScale
  let newWidth = Math.max(min, Math.round(startWidth + delta))
  newWidth = Math.min(newWidth, max)
  emit("resize", props.col.key, newWidth)
}

// Finalize resize interaction and restore document styles
function stopResize(_e?: MouseEvent) {
  document.body.style.cursor = ""
  document.body.style.userSelect = ""
  document.body.classList.remove("ui-table-resize-active")
  window.removeEventListener("mousemove", onMove)
  window.removeEventListener("mouseup", stopResize)
  if (isPointerResizing) {
    cancelResizeReleaseTimeout()
    resizeReleaseTimeout = setTimeout(() => {
      isPointerResizing = false
      resizeReleaseTimeout = null
    }, 0)
  }
}

// Emit select event unless the resize handle was targeted
function onHeaderClick(e: MouseEvent | KeyboardEvent) {
  const isOnHandle = (e.target as HTMLElement).closest(".ui-table-column-resize")
  if (isOnHandle || isPointerResizing) return
  emit("select", e)
}

function onHeaderKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault()
    onHeaderClick(event)
    return
  }
  if (event.key === "ArrowDown" && event.altKey) {
    if (isMenuDisabled.value) return
    event.preventDefault()
    openMenu()
  }
}

/**
 * Auto-resize column width to fit content (Excel-like)
 */
function autoResize(_e: MouseEvent) {
  const header = headerCellRef.value
  if (!header) return

  const container = props.tableContainer
  const columnElements = container ? getColumnCellElements(container, props.col.key) : []
  const uniqueElements = Array.from(new Set(columnElements)) as HTMLElement[]
  if (!uniqueElements.includes(header)) {
    uniqueElements.push(header)
  }

  let maxWidth = 0
  for (const element of uniqueElements) {
    if (!(element instanceof HTMLElement)) continue
    const candidate = element === header || element.classList.contains("ui-table-header-cell")
      ? measureHeaderWidth(element)
      : measureBodyCellWidth(element)
    if (Number.isFinite(candidate)) {
      maxWidth = Math.max(maxWidth, candidate)
    }
  }

  const zoom = zoomScale.value || 1
  const minWidth = props.col.minWidth ?? 10
  const maxWidthConstraint = props.col.maxWidth ?? Number.POSITIVE_INFINITY
  const normalizedWidth = maxWidth / zoom
  const clampedWidth = Math.min(maxWidthConstraint, Math.max(minWidth, Math.ceil(normalizedWidth)))
  const newWidth = Number.isFinite(clampedWidth) ? clampedWidth : minWidth
  emit("resize", props.col.key, newWidth)
}

// Sync menu panel position with the current header geometry
function updatePopoverPanelPosition() {
  const panel = popoverPanelRef.value
  const header = headerCellRef.value
  if (!panel || !header) return
  const rect = header.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const panelHeight = panel.offsetHeight || panel.getBoundingClientRect().height || 0

  let left = rect.right - POPOVER_WIDTH
  left = Math.min(left, viewportWidth - VIEWPORT_PADDING - POPOVER_WIDTH)
  left = Math.max(VIEWPORT_PADDING, left)

  const preferredTop = rect.bottom + POPOVER_MARGIN
  let top = preferredTop
  const maxTop = viewportHeight - VIEWPORT_PADDING - panelHeight

  if (panelHeight && preferredTop + panelHeight > viewportHeight - VIEWPORT_PADDING) {
    const topAbove = rect.top - POPOVER_MARGIN - panelHeight
    if (topAbove >= VIEWPORT_PADDING) {
      top = topAbove
    } else {
      top = Math.max(VIEWPORT_PADDING, maxTop)
    }
  } else {
    top = Math.max(VIEWPORT_PADDING, Math.min(preferredTop, maxTop))
  }

  popoverPanelStyle.value = {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    width: `${POPOVER_WIDTH}px`,
    maxHeight: `${Math.max(0, viewportHeight - VIEWPORT_PADDING * 2)}px`,
  }
}

watch(
  () => props.menuOpen ?? false,
  value => {
    if (value && !isMenuOpen.value) {
      openMenu(false)
    } else if (!value && isMenuOpen.value) {
      closeMenu(false)
    }
  }
)

onMounted(() => {
  updatePopoverPanelPosition()
})

onBeforeUnmount(() => {
  detachGlobalListeners()
  cancelResizeReleaseTimeout()
  stopResize()
})
</script>

<style scoped>
th {
  transition: width 0.1s ease-out;
  overflow: visible;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(body.ui-table-resize-active),
:global(body.ui-table-resize-active *) {
  cursor: col-resize !important;
}

</style>
