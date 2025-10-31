<template>
  <div
    class="flex h-full flex-col gap-4 rounded-md border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
    data-testid="column-panel"
  >
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-neutral-700 dark:text-neutral-100">Columns</h3>
      <button
        type="button"
        class="text-xs font-semibold uppercase tracking-wide text-neutral-500 transition hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
        @click="emitClose"
      >
        Close
      </button>
    </div>
    <div class="flex items-center justify-between gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
      <button
        type="button"
        class="rounded border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold text-neutral-600 transition hover:border-blue-500 hover:text-blue-600 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-blue-400 dark:hover:text-blue-300"
        data-testid="column-visibility-reset"
        @click="handleReset"
      >
        Reset to Default
      </button>
      <span class="font-medium">{{ visibleCount }} / {{ totalCount }} visible</span>
    </div>
    <div class="flex-1 overflow-y-auto pr-1">
      <DraggableList
        :items="internalColumns"
        :item-key="columnKey"
        @update:items="handleReorder"
      >
        <template #default="{ item }">
          <label
            :data-col-key="item.key"
            class="flex items-center gap-2 rounded px-2 py-1 text-sm text-neutral-700 transition hover:bg-blue-50 dark:text-neutral-100 dark:hover:bg-neutral-800"
          >
            <input
              type="checkbox"
              class="h-4 w-4 cursor-pointer accent-blue-500"
              :checked="item.visible"
              data-testid="column-visibility-checkbox"
              :data-col-key="item.key"
              :name="fieldName(item.key)"
              @change="event => handleToggle(item.key, Boolean((event.target as HTMLInputElement)?.checked))"
            />
            <span class="truncate">{{ item.label }}</span>
          </label>
        </template>
      </DraggableList>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import type { UiTableColumn } from "./types"
import DraggableList from "../DraggableList.vue"

interface ColumnVisibilityState {
  key: string
  label: string
  visible: boolean
}

const props = defineProps<{
  columns: UiTableColumn[]
  storageKey: string
}>()

const emit = defineEmits<{
  (e: "update", payload: ColumnVisibilityState[]): void
  (e: "close"): void
  (e: "reset"): void
}>()

const internalColumns = ref<ColumnVisibilityState[]>([])
const columnKey = (column: ColumnVisibilityState) => column.key

const totalCount = computed(() => internalColumns.value.length)
const visibleCount = computed(() => internalColumns.value.filter(column => column.visible).length)
const storageSlug = computed(() => {
  const slug = props.storageKey?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
  return slug || "columns"
})

function fieldName(key: string) {
  return `column-visibility-${storageSlug.value}-${key}`
}

function mapColumns(columns: UiTableColumn[]): ColumnVisibilityState[] {
  return columns.map(column => ({
    key: column.key,
    label: column.label,
    visible: column.visible !== false,
  }))
}

function persistState(state: ColumnVisibilityState[]) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(props.storageKey, JSON.stringify(state))
  } catch (error) {
    console.warn("Failed to persist column visibility state", error)
  }
}

function emitUpdate(options: { persist?: boolean } = {}) {
  const persist = options.persist !== false
  const payload = internalColumns.value.map(column => ({ ...column }))
  if (persist) {
    persistState(payload)
  }
  emit("update", payload)
}

function handleReorder(columns: ColumnVisibilityState[]) {
  internalColumns.value = columns.map(column => ({ ...column }))
  emitUpdate()
}

function handleToggle(key: string, visible: boolean) {
  internalColumns.value = internalColumns.value.map(column =>
    column.key === key ? { ...column, visible } : column
  )
  emitUpdate()
}

function handleReset() {
  internalColumns.value = internalColumns.value.map(column => ({ ...column, visible: true }))
  emit("reset")
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(props.storageKey)
    } catch (error) {
      console.warn("Failed to clear column visibility state", error)
    }
  }
  emitUpdate({ persist: false })
}

function emitClose() {
  emit("close")
}

function loadStoredState(): ColumnVisibilityState[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(props.storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ColumnVisibilityState[] | undefined
    if (!Array.isArray(parsed)) return null
    return parsed.filter(entry => entry && typeof entry.key === "string")
  } catch (error) {
    console.warn("Failed to hydrate column visibility state", error)
    return null
  }
}

function applyStoredState(stored: ColumnVisibilityState[]) {
  const orderMap = new Map<string, { index: number; visible: boolean }>()
  stored.forEach((entry, index) => {
    orderMap.set(entry.key, { index, visible: Boolean(entry.visible) })
  })

  const nextColumns = internalColumns.value
    .map(column => ({ ...column }))
    .sort((a, b) => {
      const orderA = orderMap.get(a.key)?.index ?? Number.MAX_SAFE_INTEGER
      const orderB = orderMap.get(b.key)?.index ?? Number.MAX_SAFE_INTEGER
      return orderA - orderB
    })
    .map(column => {
      const storedEntry = orderMap.get(column.key)
      return storedEntry ? { ...column, visible: storedEntry.visible } : column
    })

  internalColumns.value = nextColumns
}

let hydrated = false

watch(
  () => props.columns,
  newColumns => {
    internalColumns.value = mapColumns(newColumns)
    const stored = loadStoredState()
    if (stored) {
      applyStoredState(stored)
    }
    if (!hydrated) {
      emitUpdate()
      hydrated = true
    }
  },
  { immediate: true, deep: true }
)
</script>
