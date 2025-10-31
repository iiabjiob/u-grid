import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { createComparator } from '../utils/validators'
import type { UiTableColumn } from '../types'

interface VisibleRow {
  row: any
  originalIndex: number
}

export type SortDirection = 'asc' | 'desc'

export interface SortState {
  key: string
  direction: SortDirection
}

interface UseTableSortingOptions {
  rows: () => any[]
  localColumns: Ref<UiTableColumn[]>
  emitSortChange: (state: SortState | null) => void
}

export function useTableSorting({ rows, localColumns, emitSortChange }: UseTableSortingOptions) {
  const multiSortState = ref<SortState[]>([])
  const sortedOrder = ref<number[] | null>(null)

  const sortState = computed<SortState | null>(() => multiSortState.value[0] ?? null)

  // Resolve the column definition for a given sort key
  function getColumnByKey(key: string): UiTableColumn | undefined {
    return localColumns.value.find((column) => column.key === key)
  }

  // Replace the current multi-sort state and emit the primary sort change
  function setMultiSortState(next: SortState[]) {
    multiSortState.value = next
    if (!next.length) {
      sortedOrder.value = null
      emitSortChange(null)
      return
    }
    recomputeSortedOrder()
    emitSortChange({ ...next[0] })
  }

  // Clean sorted order array from stale indices and duplicate entries
  function ensureSortedOrder() {
    if (!sortedOrder.value) return
    const rowCount = rows().length
    const seen = new Set<number>()
    const next: number[] = []
    for (const index of sortedOrder.value) {
      if (index >= 0 && index < rowCount && !seen.has(index)) {
        next.push(index)
        seen.add(index)
      }
    }
    for (let i = 0; i < rowCount; i += 1) {
      if (!seen.has(i)) {
        next.push(i)
      }
    }
    sortedOrder.value = next
  }

  // Recompute the sorted order indices based on active sort comparators
  function recomputeSortedOrder() {
    if (!multiSortState.value.length) {
      sortedOrder.value = null
      return
    }
    const dataset = rows()
    const comparators = multiSortState.value.map((sort) => {
      const column = getColumnByKey(sort.key)
      return {
        ...sort,
        comparator: createComparator(column),
      }
    })

    const order = dataset
      .map((_, index) => index)
      .sort((aIndex, bIndex) => {
        const aRow = dataset[aIndex]
        const bRow = dataset[bIndex]
        for (const sort of comparators) {
          const result = sort.comparator(aRow?.[sort.key], bRow?.[sort.key])
          if (result !== 0) {
            const multiplier = sort.direction === 'asc' ? 1 : -1
            return result * multiplier
          }
        }
        return aIndex - bIndex
      })
    sortedOrder.value = order
    ensureSortedOrder()
  }

  // Apply single-column sorting and reset the stack
  function applySort(columnKey: string, direction: SortDirection) {
    setMultiSortState([{ key: columnKey, direction }])
  }

  // Get the active direction for a specific column
  function getSortDirectionForColumn(columnKey: string): SortDirection | null {
    const match = multiSortState.value.find((entry) => entry.key === columnKey)
    return match?.direction ?? null
  }

  // Reorder visible rows using the cached index order
  function applySorting<T extends VisibleRow>(entries: T[]): T[] {
    const order = sortedOrder.value
    if (!order || !multiSortState.value.length) return entries
    const orderMap = new Map<number, number>()
    order.forEach((idx, position) => {
      if (!orderMap.has(idx)) {
        orderMap.set(idx, position)
      }
    })
    const maxPos = order.length
    return [...entries].sort((a, b) => {
      const posA = orderMap.has(a.originalIndex)
        ? orderMap.get(a.originalIndex)!
        : maxPos + a.originalIndex
      const posB = orderMap.has(b.originalIndex)
        ? orderMap.get(b.originalIndex)!
        : maxPos + b.originalIndex
      if (posA === posB) {
        return a.originalIndex - b.originalIndex
      }
      return posA - posB
    })
  }

  // Return the priority (1-based) for the requested column
  function getSortPriorityForColumn(columnKey: string): number | null {
    const index = multiSortState.value.findIndex((entry) => entry.key === columnKey)
    return index === -1 ? null : index + 1
  }

  // Determine the next direction a sort toggle should use
  function getNextDirection(current: SortDirection | null): SortDirection | null {
    if (!current) return 'asc'
    if (current === 'asc') return 'desc'
    return null
  }

  // Toggle sorting for a column, optionally stacking it with existing sorts
  function toggleColumnSort(columnKey: string, additive: boolean) {
    const currentIndex = multiSortState.value.findIndex((entry) => entry.key === columnKey)
    if (!additive) {
      const current = currentIndex !== -1 ? multiSortState.value[currentIndex] : null
      const nextDirection = getNextDirection(current?.direction ?? null)
      if (!nextDirection) {
        setMultiSortState([])
        return
      }
      setMultiSortState([{ key: columnKey, direction: nextDirection }])
      return
    }

    const next = [...multiSortState.value]
    if (currentIndex === -1) {
      next.push({ key: columnKey, direction: 'asc' })
      setMultiSortState(next)
      return
    }

    const current = next[currentIndex]
    const nextDirection = getNextDirection(current.direction)
    if (!nextDirection) {
      next.splice(currentIndex, 1)
      setMultiSortState(next)
      return
    }
    next[currentIndex] = { key: columnKey, direction: nextDirection }
    setMultiSortState(next)
  }

  // Remove a column from the current sort state
  function clearSortForColumn(columnKey: string) {
    const next = multiSortState.value.filter((entry) => entry.key !== columnKey)
    setMultiSortState(next)
  }

  // Apply chained comparators to arbitrary data sets
  function applyMultiSort<T>(data: T[]): T[] {
    if (!multiSortState.value.length) return [...data]
    const comparators = multiSortState.value.map((sort) => {
      const column = getColumnByKey(sort.key)
      return {
        ...sort,
        comparator: createComparator(column),
      }
    })
    return [...data].sort((a: any, b: any) => {
      for (const sort of comparators) {
        const result = sort.comparator(a?.[sort.key], b?.[sort.key])
        if (result !== 0) {
          const multiplier = sort.direction === 'asc' ? 1 : -1
          return result * multiplier
        }
      }
      return 0
    })
  }

  watch(
    () => rows().length,
    () => ensureSortedOrder(),
  )

  return {
    sortState,
    multiSortState,
    sortedOrder,
    applySort,
    toggleColumnSort,
    clearSortForColumn,
    getSortDirectionForColumn,
    getSortPriorityForColumn,
    ensureSortedOrder,
    recomputeSortedOrder,
    applySorting,
    applyMultiSort,
    setMultiSortState,
  }
}
