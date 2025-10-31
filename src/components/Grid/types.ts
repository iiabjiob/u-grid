export type UiTableColumnAlignment = 'left' | 'center' | 'right'
export type UiTableColumnEditor = 'text' | 'select' | 'number' | 'checkbox' | 'none'
export type UiTableColumnSticky = 'left' | 'right'

export interface UiTableColumn {
  key: string
  label: string
  width?: number
  minWidth?: number
  maxWidth?: number
  resizable?: boolean
  sortable?: boolean
  visible?: boolean
  editor?: UiTableColumnEditor | string
  align?: UiTableColumnAlignment | string
  headerAlign?: UiTableColumnAlignment | string
  options?: { label: string; value: any }[] | ((row: any) => { label: string; value: any }[])
  placeholder?: string
  editable?: boolean
  validator?: (value: unknown, row: any) => boolean | string
  filterType?: 'set' | 'text' | 'number' | 'date'
  /**
   * Declarative sticky positioning for left or right pinned columns.
   */
  sticky?: UiTableColumnSticky
  /**
   * Marks a column as a system column (row index, selection checkbox, etc).
   * System columns never participate in filtering or sorting.
   */
  isSystem?: boolean
  /**
   * Make the column sticky on the left. true = auto, number = custom offset (px)
   */
  stickyLeft?: boolean | number
  /**
   * Make the column sticky on the right. true = auto, number = custom offset (px)
   */
  stickyRight?: boolean | number
  /**
   * Declarative pin state used by table controls.
   */
  pin?: 'left' | 'right' | 'none'
}

export interface CellEditEvent<T = any> {
  /**
   * Index of the row in the original (unfiltered) dataset.
   * Kept for backward compatibility.
   */
  rowIndex: number
  key: keyof T | string
  value: unknown
  /**
   * Index of the row in the original dataset.
   * Same as rowIndex; explicit name for clarity when both display and source
   * indexes are emitted.
   */
  originalRowIndex?: number
  /**
   * Index of the row in the currently displayed (filtered/sorted) view.
   */
  displayRowIndex?: number
  /**
   * Full row payload for convenience when reacting to edit events.
   */
  row?: T
}

export interface UiTableSelectionPoint {
  rowIndex: number
  colIndex: number
}

export interface UiTableSelectionRangeInput {
  startRow: number
  endRow: number
  startCol: number
  endCol: number
  anchor?: UiTableSelectionPoint
  focus?: UiTableSelectionPoint
}

export interface UiTableSelectionSnapshotRange extends UiTableSelectionRangeInput {
  anchor: UiTableSelectionPoint
  focus: UiTableSelectionPoint
}

export interface UiTableSelectionSnapshot {
  ranges: UiTableSelectionSnapshotRange[]
  activeRangeIndex: number
  activeCell: UiTableSelectionPoint | null
}

export interface UiTableSelectedCell<T = any> {
  rowIndex: number
  colIndex: number
  columnKey: string
  value: unknown
  row?: T
}

export interface VisibleRow<T = any> {
  row: T
  originalIndex: number
  displayIndex?: number
  /**
   * Make the row sticky at the top. true = auto, number = custom offset (px)
   */
  stickyTop?: boolean | number
  /**
   * Makes the row sticky at the bottom edge of the viewport.
   */
  stickyBottom?: boolean | number
}
