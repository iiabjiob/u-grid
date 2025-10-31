import { defineStore } from 'pinia'
import type { SortState } from './composables/useTableSorting'
import type { FilterStateSnapshot } from './composables/useTableFilters'

export const useTableSettingsStore = defineStore('tableSettingsStore', {
  state: () => ({
    // structure: { [tableName]: { [colKey]: width } }
    columnWidths: {} as Record<string, Record<string, number>>,
    sortStates: {} as Record<string, SortState[]>,
    filterSnapshots: {} as Record<string, FilterStateSnapshot>,
    pinStates: {} as Record<string, Record<string, 'left' | 'right' | 'none'>>,
    groupStates: {} as Record<string, { columns: string[]; expansion: Record<string, boolean> }>,
  }),

  actions: {
    setColumnWidth(tableName: string, colKey: string, width: number) {
      if (!this.columnWidths[tableName]) {
        this.columnWidths[tableName] = {}
      }
      this.columnWidths[tableName][colKey] = width
    },

    getColumnWidth(tableName: string, colKey: string): number | undefined {
      return this.columnWidths[tableName]?.[colKey]
    },

    setSortState(tableName: string, state: SortState[]) {
      if (!state.length) {
        delete this.sortStates[tableName]
        return
      }
      this.sortStates[tableName] = state.map((entry) => ({ ...entry }))
    },

    getSortState(tableName: string): SortState[] | undefined {
      const stored = this.sortStates[tableName]
      return stored ? stored.map((entry) => ({ ...entry })) : undefined
    },

    setFilterSnapshot(tableName: string, snapshot: FilterStateSnapshot | null) {
      const isEmpty =
        !snapshot ||
        (Object.keys(snapshot.columnFilters ?? {}).length === 0 &&
          Object.keys(snapshot.advancedFilters ?? {}).length === 0)
      if (isEmpty) {
        delete this.filterSnapshots[tableName]
        return
      }
      this.filterSnapshots[tableName] = JSON.parse(JSON.stringify(snapshot))
    },

    getFilterSnapshot(tableName: string): FilterStateSnapshot | null {
      const stored = this.filterSnapshots[tableName]
      if (!stored) return null
      return JSON.parse(JSON.stringify(stored))
    },

    setPinState(tableName: string, columnKey: string, position: 'left' | 'right' | 'none') {
      if (position === 'none') {
        if (this.pinStates[tableName]) {
          delete this.pinStates[tableName][columnKey]
          if (Object.keys(this.pinStates[tableName]).length === 0) {
            delete this.pinStates[tableName]
          }
        }
        return
      }

      if (!this.pinStates[tableName]) {
        this.pinStates[tableName] = {}
      }
      this.pinStates[tableName][columnKey] = position
    },

    getPinState(tableName: string): Record<string, 'left' | 'right' | 'none'> | null {
      const stored = this.pinStates[tableName]
      if (!stored) return null
      return { ...stored }
    },

    setGroupState(tableName: string, columns: string[], expansion: Record<string, boolean> = {}) {
      const uniqueColumns = Array.from(
        new Set(columns.filter((column) => typeof column === 'string' && column.length > 0)),
      )
      if (!uniqueColumns.length) {
        delete this.groupStates[tableName]
        return
      }
      const sanitizedExpansion: Record<string, boolean> = {}
      Object.entries(expansion ?? {}).forEach(([key, value]) => {
        if (typeof value === 'boolean') {
          sanitizedExpansion[key] = value
        }
      })
      this.groupStates[tableName] = {
        columns: uniqueColumns,
        expansion: sanitizedExpansion,
      }
    },

    getGroupState(
      tableName: string,
    ): { columns: string[]; expansion: Record<string, boolean> } | null {
      const stored = this.groupStates[tableName]
      if (!stored) return null
      return {
        columns: [...stored.columns],
        expansion: { ...stored.expansion },
      }
    },

    clearTable(tableName: string) {
      delete this.columnWidths[tableName]
      delete this.sortStates[tableName]
      delete this.filterSnapshots[tableName]
      delete this.pinStates[tableName]
      delete this.groupStates[tableName]
    },
  },

  // auto-persist via pinia-plugin-persistedstate
  persist: {
    key: 'unitlab-table-settings',
    storage: localStorage,
  },
})
