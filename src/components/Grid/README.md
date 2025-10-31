# UiTable Component Documentation

**Version**: 1.0  
**Type**: Vue 3 Component  
**License**: Proprietary

---

## Table of Contents

- [English Documentation](#english-documentation)
  - [Overview](#overview)
  - [Features](#features)
  - [Installation](#installation)
  - [Basic Usage](#basic-usage)
  - [Props API](#props-api)
  - [Events API](#events-api)
  - [Column Configuration](#column-configuration)
  - [Selection & Navigation](#selection--navigation)
  - [Editing & Validation](#editing--validation)
  - [Filtering & Sorting](#filtering--sorting)
  - [Clipboard Operations](#clipboard-operations)
  - [Advanced Features](#advanced-features)
  - [Exposed Methods](#exposed-methods)
  - [Slots](#slots)
  - [Styling & Theming](#styling--theming)
  - [Performance Considerations](#performance-considerations)
  - [Accessibility](#accessibility)

---

## English Documentation

### Overview

**UiTable** is a high-performance, feature-rich data grid component for Vue 3 applications. It provides spreadsheet-like functionality with virtual scrolling, inline editing, advanced filtering, multi-column sorting, keyboard navigation, clipboard support, and full accessibility compliance.

**Key Characteristics:**
- Virtual scrolling for efficient rendering of large datasets (100k+ rows)
- Inline cell editing with validation
- Excel-like keyboard shortcuts and navigation
- Multi-range selection with visual feedback
- Copy/paste support with clipboard integration
- Column filtering (set-based and advanced conditions)
- Multi-column sorting with priority indicators
- Undo/redo history
- Customizable cell renderers via slots
- Full ARIA support for screen readers
- Dark mode compatible
- Responsive zoom controls

---

### Features

#### Core Features
- ✅ **Virtual Scrolling** - Renders only visible rows for optimal performance
- ✅ **Inline Editing** - Text, number, and select editors with validation
- ✅ **Selection** - Single cell, range, row, and column selection
- ✅ **Keyboard Navigation** - Arrow keys, Tab, Enter, Page Up/Down, Home/End
- ✅ **Clipboard** - Copy/paste with Excel compatibility
- ✅ **Filtering** - Set-based filters and advanced condition builder
- ✅ **Sorting** - Single and multi-column sorting
- ✅ **Undo/Redo** - Full edit history with Cmd+Z/Cmd+Shift+Z
- ✅ **Fill Handle** - Excel-like drag-to-fill functionality
- ✅ **Column Resizing** - Drag column borders to resize
- ✅ **Column Visibility** - Show/hide columns with persistence
- ✅ **Summary Row** - Display aggregated data at the bottom
- ✅ **Dark Mode** - Automatic theme switching
- ✅ **Accessibility** - WCAG 2.1 AA compliant with ARIA support

#### Advanced Features
- Auto-scroll during drag selection
- Visual flash feedback for paste, copy, fill, undo/redo operations
- Sticky headers and index column
- Zoom controls (50% - 200%)
- Custom cell renderers via slots
- Row and column context menus
- Validation errors with visual indicators
- Configurable row height modes (fixed/auto)
- CSV import/export
- localStorage persistence for column widths, visibility, sort, and zoom

---

### Installation

```bash
# The component is already part of your project
# No additional installation required
```

**Import in your component:**

```vue
<script setup lang="ts">
import UiTable from '@/components/ui/UiTable/UiTable.vue'
import type { UiTableColumn } from '@/components/ui/UiTable/types'
</script>
```

---

### Basic Usage

```vue
<template>
  <UiTable
    :rows="tableData"
    :columns="tableColumns"
    table-name="my-data-table"
    @cell-edit="handleCellEdit"
    @selection-change="handleSelectionChange"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import UiTable from '@/components/ui/UiTable/UiTable.vue'
import type { UiTableColumn, CellEditEvent } from '@/components/ui/UiTable/types'

const tableData = ref([
  { id: 1, name: 'John Doe', age: 30, email: 'john@example.com' },
  { id: 2, name: 'Jane Smith', age: 25, email: 'jane@example.com' },
  { id: 3, name: 'Bob Johnson', age: 35, email: 'bob@example.com' },
])

const tableColumns = ref<UiTableColumn[]>([
  {
    key: 'id',
    label: 'ID',
    width: 80,
    editable: false,
    sortable: true,
  },
  {
    key: 'name',
    label: 'Name',
    width: 200,
    editor: 'text',
    sortable: true,
    filterType: 'text',
  },
  {
    key: 'age',
    label: 'Age',
    width: 100,
    editor: 'number',
    sortable: true,
    filterType: 'number',
  },
  {
    key: 'email',
    label: 'Email',
    width: 250,
    editor: 'text',
    sortable: true,
    filterType: 'text',
  },
])

function handleCellEdit(event: CellEditEvent) {
  const { rowIndex, key, value } = event
  tableData.value[rowIndex][key as keyof typeof tableData.value[0]] = value
  console.log('Cell edited:', event)
}

function handleSelectionChange(snapshot: any) {
  console.log('Selection changed:', snapshot)
}
</script>
```

---

### Props API

| Prop | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `rows` | `any[]` | - | ✅ | Array of data objects to display |
| `columns` | `UiTableColumn[]` | - | ✅ | Column configuration array |
| `tableName` | `string` | `'default'` | ❌ | Unique identifier for localStorage persistence |
| `totalRows` | `number` | - | ❌ | Total row count (for pagination scenarios) |
| `loading` | `boolean` | `false` | ❌ | Loading state indicator |
| `virtualization` | `boolean` | `true` | ❌ | Enable/disable virtual scrolling |
| `rowHeightMode` | `'fixed' \| 'auto'` | `'fixed'` | ❌ | Row height calculation mode |
| `summaryRow` | `Record<string, any>` | `null` | ❌ | Data for summary row at bottom |
| `debugViewport` | `boolean` | `false` | ❌ | Show viewport debug overlay |
| `inlineControls` | `boolean` | `true` | ❌ | Show inline toolbar controls |

---

### Events API

| Event | Payload | Description |
|-------|---------|-------------|
| `cell-edit` | `CellEditEvent` | Fired when a single cell value is edited |
| `batch-edit` | `CellEditEvent[]` | Fired when multiple cells are edited at once |
| `selection-change` | `UiTableSelectionSnapshot` | Fired when selection changes |
| `sort-change` | `SortState[]` | Fired when sort configuration changes |
| `filter-change` | `FilterState` | Fired when filters are applied or cleared |
| `column-resize` | `{ key: string, width: number }` | Fired when column is resized |
| `zoom-change` | `number` | Fired when zoom level changes |
| `reach-bottom` | - | Fired when scrolled near bottom (for infinite scroll) |
| `row-click` | `{ rowIndex: number, row: any }` | Fired when row is clicked |
| `rows-delete` | `number[]` | Fired when rows are deleted via keyboard |
| `group-filter-toggle` | `boolean` | Fired when group filter panel is toggled |

#### Event Payload Types

```typescript
interface CellEditEvent<T = any> {
  rowIndex: number           // Index in original dataset
  originalRowIndex?: number  // Same as rowIndex (explicit)
  displayRowIndex?: number   // Index in filtered/sorted view
  key: keyof T | string      // Column key
  value: unknown             // New cell value
  row?: T                    // Full row object
}

interface UiTableSelectionSnapshot {
  ranges: UiTableSelectionRangeInput[]
  activeRangeIndex: number
  activeCell: { rowIndex: number, colIndex: number } | null
}

interface SortState {
  columnKey: string
  direction: 'asc' | 'desc'
  priority: number  // For multi-column sort
}
```

---

### Column Configuration

Each column in the `columns` array can have the following properties:

```typescript
interface UiTableColumn {
  key: string                    // Unique column identifier (required)
  label: string                  // Display name (required)
  width?: number                 // Column width in pixels
  minWidth?: number              // Minimum width constraint
  maxWidth?: number              // Maximum width constraint
  resizable?: boolean            // Allow column resizing (default: true)
  sortable?: boolean             // Enable sorting (default: true)
  visible?: boolean              // Column visibility (default: true)
  editable?: boolean             // Allow cell editing (default: true)
  editor?: 'text' | 'select' | 'number' | 'none'  // Editor type
  align?: 'left' | 'center' | 'right'            // Content alignment
  headerAlign?: 'left' | 'center' | 'right'      // Header alignment
  filterType?: 'set' | 'text' | 'number' | 'date' // Filter type
  options?: Array<{label: string, value: any}>    // For select editor
  placeholder?: string           // Input placeholder text
  validator?: (value: unknown, row: any) => boolean | string  // Validation function
}
```

#### Column Configuration Examples

**Text Column with Validation:**
```typescript
{
  key: 'email',
  label: 'Email Address',
  width: 250,
  editor: 'text',
  sortable: true,
  filterType: 'text',
  validator: (value) => {
    const email = String(value || '')
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || 'Invalid email format'
  }
}
```

**Select Column with Options:**
```typescript
{
  key: 'status',
  label: 'Status',
  width: 150,
  editor: 'select',
  sortable: true,
  filterType: 'set',
  options: [
    { label: 'Active', value: 'active' },
    { label: 'Inactive', value: 'inactive' },
    { label: 'Pending', value: 'pending' }
  ]
}
```

**Number Column:**
```typescript
{
  key: 'price',
  label: 'Price',
  width: 120,
  editor: 'number',
  sortable: true,
  filterType: 'number',
  align: 'right',
  validator: (value) => {
    const num = Number(value)
    return num >= 0 || 'Price must be positive'
  }
}
```

**Read-only Column:**
```typescript
{
  key: 'id',
  label: 'ID',
  width: 80,
  editable: false,
  sortable: true,
  align: 'center'
}
```

---

### Selection & Navigation

#### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Arrow Keys | Navigate between cells |
| Tab / Shift+Tab | Move to next/previous editable cell |
| Enter | Start editing or move down |
| Shift+Enter | Move up |
| Ctrl/Cmd+A | Select all cells |
| Shift+Click | Extend selection |
| Ctrl/Cmd+Click | Toggle selection |
| Home / End | Jump to row start/end |
| Ctrl/Cmd+Home/End | Jump to grid corners |
| Page Up / Down | Scroll by page |
| Ctrl/Cmd+C | Copy selection |
| Ctrl/Cmd+V | Paste from clipboard |
| Ctrl/Cmd+Z | Undo last edit |
| Ctrl/Cmd+Shift+Z | Redo last undone edit |
| Delete / Backspace | Clear selected cells |
| Esc | Cancel editing / Clear selection |

#### Programmatic Selection

```typescript
// Get component reference
const tableRef = ref<InstanceType<typeof UiTable>>()

// Select a single cell
tableRef.value?.focusCell(5, 'email')

// Set a range selection
tableRef.value?.setSelection({
  startRow: 0,
  endRow: 5,
  startCol: 0,
  endCol: 2
})

// Clear selection
tableRef.value?.clearSelection()

// Get current selection
const snapshot = tableRef.value?.getSelectionSnapshot()
```

---

### Editing & Validation

#### Editor Types

**Text Editor:**
```typescript
{ key: 'name', label: 'Name', editor: 'text' }
```
- Single-line text input
- Triggers on double-click or F2
- Commit on Enter or blur

**Number Editor:**
```typescript
{ key: 'age', label: 'Age', editor: 'number' }
```
- Numeric input with validation
- Shows numeric keyboard on mobile

**Select Editor:**
```typescript
{
  key: 'category',
  label: 'Category',
  editor: 'select',
  options: [
    { label: 'Type A', value: 'a' },
    { label: 'Type B', value: 'b' }
  ]
}
```
- Dropdown selection
- Opens immediately on activation

#### Validation

Validators return `true` for valid values or an error string:

```typescript
{
  key: 'quantity',
  label: 'Quantity',
  editor: 'number',
  validator: (value, row) => {
    const num = Number(value)
    if (!Number.isInteger(num)) return 'Must be an integer'
    if (num < 0) return 'Must be positive'
    if (num > 1000) return 'Cannot exceed 1000'
    return true
  }
}
```

Invalid cells show:
- Red border
- Error tooltip on hover
- Error icon in cell

---

### Filtering & Sorting

#### Set-Based Filtering

Click column header menu → Select/deselect values → Apply

```typescript
{
  key: 'status',
  label: 'Status',
  filterType: 'set'  // Shows checkbox list of unique values
}
```

#### Advanced Condition Filtering

Click "Filter by condition" in column menu:

**Text Conditions:**
- Contains
- Starts with
- Ends with
- Equals

**Number/Date Conditions:**
- Equals
- Greater than (>)
- Less than (<)
- Greater or equal (>=)
- Less or equal (<=)
- Between

**Multi-Clause Filters:**
- Add multiple conditions
- Combine with AND/OR logic

```typescript
{
  key: 'price',
  label: 'Price',
  filterType: 'number'  // Enables advanced number filters
}
```

#### Multi-Column Sorting

- Click column header to sort
- Shift+Click to add secondary sort
- Sort priority indicators show order
- Up to 3 levels of sorting

**Programmatic Sorting:**
```typescript
tableRef.value?.setMultiSortState([
  { columnKey: 'name', direction: 'asc', priority: 1 },
  { columnKey: 'age', direction: 'desc', priority: 2 }
])
```

---

### Clipboard Operations

#### Copy
- Select cells → Ctrl/Cmd+C
- Copies to clipboard in TSV format (Excel-compatible)
- Visual flash feedback on copy

#### Paste
- Select target cell → Ctrl/Cmd+V
- Pastes from clipboard maintaining structure
- Automatically expands to fit data
- Visual flash feedback on paste
- Creates undo history entry

#### CSV Export/Import

```typescript
const tableRef = ref<InstanceType<typeof UiTable>>()

// Export entire table to CSV
const csvData = tableRef.value?.exportCSV()
downloadFile(csvData, 'data.csv')

// Import CSV data
const csvContent = await readFile()
tableRef.value?.importCSV(csvContent)
```

---

### Advanced Features

#### Fill Handle

Excel-like drag-to-fill:
1. Select a cell or range
2. Hover over bottom-right corner
3. Drag down/across to fill
4. Double-click to auto-fill down to last row

**Auto-Fill Logic:**
- Numbers: Increment by pattern
- Text: Repeat values
- Dates: Increment by day/month/year

#### Undo/Redo

- Full edit history tracking
- Ctrl/Cmd+Z to undo
- Ctrl/Cmd+Shift+Z to redo
- Works with all edit operations (type, paste, fill, batch)
- Visual flash feedback

#### Column Visibility

Toggle columns on/off:
```typescript
// Programmatic control
tableRef.value?.openVisibilityPanel()
tableRef.value?.closeVisibilityPanel()
tableRef.value?.resetColumnVisibility()
```

Settings persist to localStorage automatically.

#### Zoom Controls

- Zoom range: 50% - 200%
- Ctrl/Cmd + Mouse Wheel to zoom
- Zoom persists per table instance

```typescript
// Programmatic zoom
tableRef.value?.setZoom(1.5)  // 150%
```

#### Summary Row

Display aggregated data:
```vue
<UiTable
  :rows="data"
  :columns="columns"
  :summary-row="{
    name: 'Total',
    quantity: totalQuantity,
    price: averagePrice
  }"
>
  <template #summary-price="{ value }">
    <strong>${{ value.toFixed(2) }}</strong>
  </template>
</UiTable>
```

---

### Exposed Methods

Access these via template ref:

```typescript
const tableRef = ref<InstanceType<typeof UiTable>>()
```

| Method | Signature | Description |
|--------|-----------|-------------|
| `scrollToRow` | `(index: number) => void` | Scroll to specific row |
| `scrollToColumn` | `(key: string) => void` | Scroll to specific column |
| `isRowVisible` | `(index: number) => boolean` | Check if row is in viewport |
| `focusCell` | `(row: number, col: string) => void` | Focus specific cell |
| `setSelection` | `(range: SelectionRange) => void` | Set selection programmatically |
| `clearSelection` | `() => void` | Clear current selection |
| `getSelectionSnapshot` | `() => SelectionSnapshot` | Get current selection state |
| `getCellValue` | `(row: number, col: number) => any` | Get cell value |
| `setCellValue` | `(row: number, col: number, value: any) => void` | Set cell value |
| `getSelectedCells` | `() => SelectedCell[]` | Get all selected cells |
| `copySelectionToClipboard` | `() => Promise<void>` | Copy selection to clipboard |
| `pasteClipboardData` | `() => Promise<void>` | Paste from clipboard |
| `exportCSV` | `() => string` | Export table as CSV |
| `importCSV` | `(csv: string) => void` | Import CSV data |
| `undo` | `() => void` | Undo last edit |
| `redo` | `() => void` | Redo last undone edit |
| `resetColumnVisibility` | `() => void` | Show all columns |
| `openVisibilityPanel` | `() => void` | Open column visibility panel |
| `closeVisibilityPanel` | `() => void` | Close column visibility panel |

---

### Slots

#### Cell Renderer Slots

Customize cell rendering:

```vue
<UiTable :rows="data" :columns="columns">
  <template #cell-status="{ value, row, column, rowIndex, colIndex }">
    <span :class="statusClass(value)">
      {{ value }}
    </span>
  </template>

  <template #cell-avatar="{ row }">
    <img :src="row.avatarUrl" class="w-8 h-8 rounded-full" />
  </template>
</UiTable>
```

**Slot Props:**
- `value` - Current cell value
- `row` - Full row object
- `column` - Column configuration
- `rowIndex` - Row index
- `colIndex` - Column index

#### Summary Slots

Customize summary row cells:

```vue
<UiTable :rows="data" :columns="columns" :summary-row="summaryData">
  <!-- Column-specific summary -->
  <template #summary-price="{ value, column }">
    <strong>${{ value.toFixed(2) }}</strong>
  </template>

  <!-- Generic summary (fallback) -->
  <template #summary="{ value, column }">
    {{ value }}
  </template>

  <!-- Summary row label -->
  <template #summary-label>
    <strong>Totals:</strong>
  </template>
</UiTable>
```

---

### Styling & Theming

#### CSS Classes

Key classes for customization:

```css
.ui-table { /* Main container */ }
.ui-table__container { /* Scrollable grid */ }
.ui-table__header-row { /* Header row */ }
.ui-table-header { /* Header cells */ }
.ui-table__row-index { /* Row number column */ }
.ui-table-cell { /* Data cells */ }
.ui-table__summary-row { /* Summary row */ }
.ui-table-fill-handle { /* Fill drag handle */ }
```

#### Dark Mode

Component automatically adapts to dark mode via Tailwind's `dark:` classes.

#### Custom Theme

Override CSS variables or use Tailwind utilities:

```css
.ui-table {
  --ui-table-header-bg: #f3f4f6;
  --ui-table-border: #e5e7eb;
  --ui-table-selected: #dbeafe;
}

.dark .ui-table {
  --ui-table-header-bg: #1f2937;
  --ui-table-border: #374151;
  --ui-table-selected: #1e3a8a;
}
```

---

### Performance Considerations

#### Virtual Scrolling

- Enabled by default via `virtualization` prop
- Renders only visible rows (~30-50 at a time)
- Supports datasets with 100k+ rows
- Automatically handles scroll and resize events

**Disable for small datasets:**
```vue
<UiTable :rows="data" :columns="columns" :virtualization="false" />
```

#### Best Practices

1. **Unique Row Keys**: Ensure row data has stable references
2. **Column Width**: Specify `width` to avoid layout thrashing
3. **Validators**: Keep validation logic synchronous and fast
4. **Custom Renderers**: Avoid heavy computations in slot templates
5. **Large Pastes**: Consider batch edit events over individual cell edits

#### Performance Metrics

- Initial render: ~50-100ms for 10k rows
- Scroll performance: 60fps on modern hardware
- Edit latency: <16ms (single frame)
- Filter/sort: ~100-300ms for 10k rows

---

### Accessibility

Full WCAG 2.1 AA compliance:

#### Keyboard Navigation
- Complete keyboard control (no mouse required)
- Standard grid navigation patterns
- Focus management with visible indicators

#### Screen Reader Support
- ARIA grid role with proper row/cell structure
- aria-rowcount and aria-colcount for virtual scrolling
- aria-selected for selection states
- aria-invalid for validation errors
- Descriptive aria-labels for controls

#### Visual Indicators
- High contrast selection borders
- Focus rings on active elements
- Error states with color + icon
- Status messages for actions

#### Testing
```bash
# Run accessibility tests
npm run test -- UiTable.a11y.spec.ts
```

---

## License

Proprietary - Internal use only

---

## Support

For questions and issues, please contact the development team or create an issue in the project repository.

---

**Last Updated**: October 2025  
**Component Version**: 1.0  
**Framework**: Vue 3 + TypeScript
