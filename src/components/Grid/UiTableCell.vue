<template>
  <div
    :class="[
      'ui-table-cell ui-table-cell--hover-target relative',
      columnTextAlignClass,
      {
        'ui-table-cell--system': isSystemColumn,
        'ui-table-cell--selection': isSelectionColumn,
        'bg-blue-100 dark:bg-blue-900/40': !isSystemColumn && showCellSelection && !editing,
        'bg-blue-100/40 dark:bg-blue-900/30': !isSystemColumn && isRowSelected && !showCellSelection && !editing,
        'bg-blue-50/40 dark:bg-blue-900/25': !isSystemColumn && isColumnSelected && !showCellSelection && !editing,
        'bg-blue-100/30 dark:bg-blue-900/30': !isSystemColumn && isRangeSelected && !showCellSelection && !isRowSelected && !isColumnSelected && !editing,
        'bg-blue-200/30 dark:bg-blue-900/35': !isSystemColumn && isFillPreview && !showCellSelection && !editing,
        'bg-yellow-200/60 dark:bg-yellow-700/40': !isSystemColumn && isSearchMatch && !isActiveSearchMatch && !showCellSelection && !editing,
        'bg-yellow-100/70 dark:bg-yellow-600/40': !isSystemColumn && isActiveSearchMatch && !showCellSelection && !editing,
        'select-none': !editing,
        'cursor-text': isEditable && !isSystemColumn,
        'cursor-default': !isEditable || isSystemColumn,
        'bg-red-50 dark:bg-red-900/30': !isSystemColumn && validationError && !editing
      }
    ]"
    :id="cellIdAttr ?? undefined"
    role="gridcell"
    :tabindex="tabIndexAttr"
    :aria-selected="isSelected ? 'true' : 'false'"
    :aria-readonly="isEditable ? undefined : 'true'"
    :aria-rowindex="ariaRowIndexAttr"
    :aria-colindex="ariaColIndexAttr"
    :style="cellStyle"
    :data-row-index="rowIndex"
    :data-col-key="col.key"
    :data-editor-type="col.editor || undefined"
    :title="validationError || undefined"
    :aria-invalid="validationError ? 'true' : undefined"
    :data-highlighted="highlightActive ? 'true' : null"
    @mousedown="onCellMouseDown"
    @dblclick="startEdit"
    @mouseenter="onCellMouseEnter"
    @focus="handleFocus"
  >
    <template v-if="col.editor === 'select'">
      <div :class="['relative w-full h-full', columnTextAlignClass]">
        <template v-if="editing">
          <UiSelect
            ref="selectComponent"
            v-model="editValue"
            :name="`cell-${rowIndex}-${col.key}`"
            :placeholder="col.placeholder"
            :class="['w-full text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-800 px-1 py-0.5', columnTextAlignClass]"
            @update:modelValue="onSelectChange"
            @blur="onSelectBlur"
            @keydown.esc.stop.prevent="cancelSelectEdit"
          >
            <option
              v-for="opt in getOptions()"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </UiSelect>
        </template>
        <template v-else>
          <div :class="['px-1 py-0.5 pr-6', columnTextAlignClass]" data-auto-resize-target>
            <slot
              v-if="$slots.display"
              name="display"
              :value="row[col.key]"
              :row="row"
              :column="col"
              :row-index="rowIndex"
              :col-index="colIndex"
            />
            <span v-else :class="['block truncate', columnTextAlignClass]">
              {{ selectLabel }}
            </span>
          </div>
          <button
            v-if="isSelected && isEditable"
            type="button"
            class="ui-table__cell-select-trigger"
            @mousedown.prevent
            @click.stop="startSelectEdit"
            aria-label="Open options"
          >
            <svg
              class="w-3 h-3"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </template>
      </div>
    </template>
    <input
      v-else-if="editing && (col.editor === 'text' || col.editor === 'number')"
      v-model="editValue"
      ref="inputRef"
      :name="`cell-${rowIndex}-${col.key}`"
      :class="['w-full bg-white dark:bg-neutral-800 outline-none px-1 py-0.5 text-sm', columnTextAlignClass]"
      autocomplete="off"
      spellcheck="false"
      inputmode="text"
      @keydown.enter.prevent="onEnterKey"
      @keydown.tab="onTabKey"
      @keydown.esc.prevent="cancelEdit"
      @blur="onInputBlur"
    />
    <template v-else>
      <slot
        v-if="$slots.display"
        name="display"
        :value="row[col.key]"
        :row="row"
        :column="col"
        :row-index="rowIndex"
        :col-index="colIndex"
      />
      <span v-else :class="['block truncate px-1 py-0.5', columnTextAlignClass]" data-auto-resize-target>
        {{ row[col.key] }}
      </span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed } from "vue"
import type { UiTableColumn } from "./types"
import UiSelect from "../UiSelect.vue";


type ColumnOption = { label: string; value: any }

interface EditCommand {
  rowIndex: number
  key: string
}

type UiSelectInstance = InstanceType<typeof UiSelect> & {
  focus?: () => void
  open?: () => void
}

type AlignOption = "left" | "center" | "right"

const ALIGN_CLASS_MAP: Record<AlignOption, string> = {
  left: "text-left justify-start",
  center: "text-center justify-center",
  right: "text-right justify-end",
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

const props = withDefaults(defineProps<{
  row: Record<string, any>
  col: UiTableColumn
  rowIndex: number
  colIndex: number
  originalRowIndex?: number
  isSelected?: boolean
  isRowSelected?: boolean
  isColumnSelected?: boolean
  editCommand?: EditCommand | null
  isRangeSelected?: boolean
  rangeEdges?: { top: boolean; bottom: boolean; left: boolean; right: boolean; active?: boolean } | null
  fillPreviewEdges?: { top: boolean; bottom: boolean; left: boolean; right: boolean } | null
  zoomScale?: number
  isFillPreview?: boolean
  editable?: boolean
  validationError?: string | null
  tabIndex?: number
  ariaRowIndex?: number | string
  ariaColIndex?: number | string
  cellId?: string
  visualWidth?: number | null
  sticky?: boolean
  stickyLeftOffset?: number
  stickyTop?: boolean
  stickyTopOffset?: number
  stickySide?: "left" | "right" | null
  stickyRightOffset?: number
  searchMatch?: boolean
  activeSearchMatch?: boolean
}>(), {
  isSelected: false,
  isRowSelected: false,
  isColumnSelected: false,
  editCommand: null,
  originalRowIndex: undefined,
  isRangeSelected: false,
  rangeEdges: null,
  fillPreviewEdges: null,
  zoomScale: 1,
  isFillPreview: false,
  editable: true,
  validationError: null,
  tabIndex: -1,
  ariaRowIndex: undefined,
  ariaColIndex: undefined,
  cellId: undefined,
  visualWidth: null,
  stickySide: null,
  stickyRightOffset: undefined,
  searchMatch: false,
  activeSearchMatch: false,
})

const emit = defineEmits(["edit", "next-cell", "select", "editing-change", "drag-start", "drag-enter", "cell-focus"])

const editing = ref(false)
const editValue = ref<any>("")
const inputRef = ref<HTMLInputElement | null>(null)
const selectComponent = ref<UiSelectInstance | null>(null)

const sourceRowIndex = computed(() =>
  props.originalRowIndex ?? props.rowIndex
)

const isSelected = computed(() => !!props.isSelected)
const isRowSelected = computed(() => !!props.isRowSelected)
const isColumnSelected = computed(() => !!props.isColumnSelected)
const isRangeSelected = computed(() => !!props.isRangeSelected)
const isEditable = computed(() => props.editable !== false)
const validationError = computed(() => props.validationError ?? null)
const isFillPreview = computed(() => !!props.isFillPreview)
const isSearchMatch = computed(() => Boolean(props.searchMatch))
const isActiveSearchMatch = computed(() => Boolean(props.activeSearchMatch))
const showCellSelection = computed(
  () => isSelected.value && !isRowSelected.value && !isColumnSelected.value
)
const selectLabel = computed(() => {
  if (props.col.editor !== "select") return String(props.row[props.col.key] ?? "")
  const options = getOptions()
  const value = props.row[props.col.key]
  const match = options.find(opt => String(opt.value) === String(value))
  if (match) return match.label
  if (value === null || value === undefined) return ""
  return String(value)
})
const zoomScale = computed(() => props.zoomScale ?? 1)
const visualWidth = computed(() => props.visualWidth ?? null)
const columnAlign = computed<AlignOption>(() => normalizeAlign(props.col.align, "left"))
const columnTextAlignClass = computed(() => ALIGN_CLASS_MAP[columnAlign.value])
const stickySide = computed<"left" | "right" | null>(() => props.stickySide ?? (props.sticky ? "left" : null))
const isSystemColumn = computed(() => Boolean(props.col.isSystem))
const isSelectionColumn = computed(() => props.col.key === "__select__")

const cellStyle = computed(() => {
  const styles: Record<string, string> = {}
  let isSticky = false
  if (stickySide.value === "left") {
    styles.position = "sticky"
    styles.left = props.stickyLeftOffset != null ? `${props.stickyLeftOffset}px` : "0px"
    styles.zIndex = '10'
    styles.background = 'inherit'
    isSticky = true
  } else if (stickySide.value === "right") {
    styles.position = "sticky"
    styles.right = props.stickyRightOffset != null ? `${props.stickyRightOffset}px` : "0px"
    styles.zIndex = '10'
    styles.background = 'inherit'
    isSticky = true
  }
  if (props.stickyTop) {
    styles.position = 'sticky'
    styles.top = props.stickyTopOffset != null ? `${props.stickyTopOffset}px` : '0px'
    styles.zIndex = isSticky ? '12' : '11'
    styles.background = 'inherit'
    isSticky = true
  }
  if (isSelectionColumn.value) {
    const current = Number(styles.zIndex ?? 0)
    styles.zIndex = String(current > 0 ? Math.max(current, 40) : 40)
  }
  if (visualWidth.value != null) {
    const width = Math.max(0, visualWidth.value)
    styles.width = `${width}px`
    styles.minWidth = `${width}px`
  } else if (!props.col.maxWidth) {
    const zoom = zoomScale.value || 1
    const baseWidth = props.col.width
    if (baseWidth != null) {
      let width = baseWidth * zoom
      if (props.col.minWidth != null) {
        width = Math.max(width, props.col.minWidth * zoom)
      }
      styles.width = `${width}px`
    }
    if (props.col.minWidth != null) {
      styles.minWidth = `${props.col.minWidth * zoom}px`
    }
  }
  if (combinedShadow.value) {
    styles.boxShadow = styles.boxShadow ? `${styles.boxShadow}, ${combinedShadow.value}` : combinedShadow.value
  }
  return styles
})
const selectionShadow = computed(() => {
  if (!isRangeSelected.value || !props.rangeEdges) return ""
  const color = props.rangeEdges.active ? "rgba(37, 99, 235, 0.95)" : "rgba(59, 130, 246, 0.7)"
  const shadows: string[] = []
  if (props.rangeEdges.top) shadows.push(`inset 0 2px 0 0 ${color}`)
  if (props.rangeEdges.bottom) shadows.push(`inset 0 -2px 0 0 ${color}`)
  if (props.rangeEdges.left) shadows.push(`inset 2px 0 0 0 ${color}`)
  if (props.rangeEdges.right) shadows.push(`inset -2px 0 0 0 ${color}`)
  return shadows.join(", ")
})

const fillPreviewShadow = computed(() => {
  if (!isFillPreview.value || !props.fillPreviewEdges) return ""
  const color = "rgba(59, 130, 246, 0.5)"
  const shadows: string[] = []
  if (props.fillPreviewEdges.top) shadows.push(`inset 0 1px 0 0 ${color}`)
  if (props.fillPreviewEdges.bottom) shadows.push(`inset 0 -1px 0 0 ${color}`)
  if (props.fillPreviewEdges.left) shadows.push(`inset 1px 0 0 0 ${color}`)
  if (props.fillPreviewEdges.right) shadows.push(`inset -1px 0 0 0 ${color}`)
  return shadows.join(", ")
})

const activeSelectionShadow = computed(() => {
  if (!showCellSelection.value || editing.value) return ""
  const color = validationError.value ? "rgba(248, 113, 113, 0.9)" : "rgba(37, 99, 235, 0.95)"
  return `inset 0 0 0 2px ${color}`
})

const inactiveErrorShadow = computed(() => {
  if (!validationError.value || editing.value || showCellSelection.value) return ""
  return "inset 0 0 0 1px rgba(248, 113, 113, 0.75)"
})

const searchShadow = computed(() => {
  if (!isSearchMatch.value || showCellSelection.value) return ""
  if (isActiveSearchMatch.value) {
    return "inset 0 0 0 2px rgba(37, 99, 235, 0.85)"
  }
  return "inset 0 0 0 2px rgba(250, 204, 21, 0.7)"
})

const combinedShadow = computed(() => {
  const parts = []
  if (selectionShadow.value) parts.push(selectionShadow.value)
  if (fillPreviewShadow.value) parts.push(fillPreviewShadow.value)
  if (activeSelectionShadow.value) parts.push(activeSelectionShadow.value)
  if (inactiveErrorShadow.value) parts.push(inactiveErrorShadow.value)
  if (searchShadow.value) parts.push(searchShadow.value)
  return parts.join(", ")
})
const highlightActive = computed(() => {
  if (isSystemColumn.value || editing.value) return false
  if (showCellSelection.value) return true
  if ((isRowSelected.value || isColumnSelected.value || isRangeSelected.value || isFillPreview.value) && !showCellSelection.value) return true
  if ((isSearchMatch.value || isActiveSearchMatch.value) && !showCellSelection.value) return true
  if (validationError.value && !showCellSelection.value) return true
  return false
})
const tabIndexAttr = computed(() => props.tabIndex ?? -1)
const ariaRowIndexAttr = computed(() => props.ariaRowIndex ?? undefined)
const ariaColIndexAttr = computed(() => props.ariaColIndex ?? undefined)
const cellIdAttr = computed(() => props.cellId ?? undefined)

watch(
  () => props.row[props.col.key],
  (v) => (editValue.value = v),
  { immediate: true }
)

watch(
  editing,
  (value) => {
    emit("editing-change", value)
  }
)

// Enter edit mode depending on editor type and focus the control
function startEdit() {
  if (editing.value) return
  if (!isEditable.value) return
  if (props.col.editor === "text" || props.col.editor === "number") {
    editing.value = true
    editValue.value = props.row[props.col.key]
    nextTick(() => {
      inputRef.value?.focus()
      inputRef.value?.select()
    })
  } else if (props.col.editor === "select") {
    startSelectEdit()
  }
}

// Open select editor immediately with focus when available
function startSelectEdit() {
  if (editing.value || props.col.editor !== "select") return
  if (!isEditable.value) return
  editing.value = true
  editValue.value = props.row[props.col.key]
  nextTick(() => {
    selectComponent.value?.focus?.()
    selectComponent.value?.open?.()
  })
}

// Exit select edit mode without committing changes
function cancelSelectEdit() {
  if (!editing.value) return
  editing.value = false
  editValue.value = props.row[props.col.key]
}

// Commit the edited value if it changed and exit edit mode
function confirmEdit() {
  if (editValue.value !== props.row[props.col.key]) {
    emit("edit", {
      rowIndex: sourceRowIndex.value,
      originalRowIndex: sourceRowIndex.value,
      displayRowIndex: props.rowIndex,
      row: props.row,
      key: props.col.key,
      value: editValue.value,
    })
  }
  editing.value = false
}

// Handle select option change and immediately confirm edit
function onSelectChange(value: string | null) {
  editValue.value = value
  confirmEdit()
}

// Commit edit when select component loses focus
function onSelectBlur() {
  if (!editing.value) return
  confirmEdit()
}

// Commit value then trigger navigation to the next cell via Tab
function onTabKey(event: KeyboardEvent) {
  confirmEdit()
  const payload = {
    rowIndex: props.rowIndex,
    key: props.col.key,
    colIndex: props.colIndex,
    shift: event.shiftKey,
    handled: false,
  }
  emit("next-cell", payload)
  if (payload.handled) {
    event.preventDefault()
  }
}

// Commit value and move vertically when Enter is pressed
function onEnterKey(event: KeyboardEvent) {
  confirmEdit()
  emit("next-cell", {
    rowIndex: props.rowIndex,
    key: props.col.key,
    colIndex: props.colIndex,
    shift: event.shiftKey,
    handled: false,
    direction: event.shiftKey ? "up" : "down",
  })
}

// Commit edit when text input loses focus
function onInputBlur() {
  confirmEdit()
}

// Abort text edit and restore original value
function cancelEdit() {
  editing.value = false
  editValue.value = props.row[props.col.key]
}

// Resolve select options array from column definition
function getOptions(): ColumnOption[] {
  if (!props.col.options) return []
  const resolved = typeof props.col.options === "function"
    ? props.col.options(props.row)
    : props.col.options
  return Array.isArray(resolved) ? resolved : []
}

// Select cell and initiate drag selection when appropriate
function onCellMouseDown(event: MouseEvent) {
  const interactiveTarget = (event.target as HTMLElement).closest("input,select,textarea,[contenteditable='true'],button")
  const shouldFocusTable = !interactiveTarget
  emit("select", {
    rowIndex: props.rowIndex,
    key: props.col.key,
    colIndex: props.colIndex,
    focus: shouldFocusTable,
    event,
  })
  if (event.button === 0 && shouldFocusTable && !(event.shiftKey || event.metaKey || event.ctrlKey || event.altKey)) {
    emit("drag-start", {
      rowIndex: props.rowIndex,
      colIndex: props.colIndex,
      event,
    })
  }
}

// Extend selection while mouse is pressed and moving across cells
function onCellMouseEnter(event: MouseEvent) {
  if (!(event.buttons & 1)) return
  emit("drag-enter", {
    rowIndex: props.rowIndex,
    colIndex: props.colIndex,
    event,
  })
}

function handleFocus(event: FocusEvent) {
  emit("cell-focus", {
    rowIndex: props.rowIndex,
    colIndex: props.colIndex,
    columnKey: props.col.key,
    event,
  })
}

watch(
  () => props.editCommand,
  (command) => {
    if (!command) return
    if (command.rowIndex === props.rowIndex && command.key === props.col.key) {
      startEdit()
    }
  }
)

watch(
  () => props.isSelected,
  (selected) => {
    if (!selected && editing.value) {
      confirmEdit()
    }
  }
)
</script>

<style scoped>
td {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
select {
  appearance: none;
  cursor: pointer;
  padding-right: 1rem;
}
</style>
