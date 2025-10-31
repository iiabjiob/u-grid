// Helper to find cell DOM elements within a range
import { getCellElement } from './gridUtils'

/**
 * Return DOM cell elements for the given SelectionRange.
 * @param container Table DOM element
 * @param range SelectionRange
 * @param columns Column definitions with keys
 */
export function getCellElementsByRange(
  container: HTMLElement,
  range: { startRow: number; endRow: number; startCol: number; endCol: number },
  columns: { key: string }[],
): HTMLElement[] {
  const cells: HTMLElement[] = []
  for (let row = range.startRow; row <= range.endRow; row++) {
    for (let col = range.startCol; col <= range.endCol; col++) {
      const colKey = columns[col]?.key
      if (!colKey) continue
      const cell = getCellElement(container, row, colKey)
      if (cell) cells.push(cell)
    }
  }
  return cells
}

export function getColumnCellElements(container: HTMLElement, columnKey: string): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(`[data-col-key="${columnKey}"]`))
}

export function getRowCellElements(container: HTMLElement, rowIndex: number): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(`[data-row-index="${rowIndex}"][data-col-key]`),
  )
}
