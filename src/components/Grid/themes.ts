import type { UiTableStyleConfig } from './UiTable.vue'

export const industrialNeutralTheme: UiTableStyleConfig = {
  table: {
    wrapper: 'font-mono text-xs text-neutral-800 dark:text-neutral-200',
    container: '',
  },
  header: {
    row: '',
    cell: 'bg-neutral-100 dark:bg-slate-950 px-3 py-2 text-xs font-semibold leading-tight text-neutral-600 dark:text-neutral-200',
    selectionCell:
      'bg-neutral-100 dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-neutral-600 dark:text-neutral-200',
    indexCell:
      'bg-neutral-100 dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-neutral-600 dark:text-neutral-200',
  },
  body: {
    row: 'bg-white dark:bg-neutral-900 hover:bg-blue-50 dark:hover:bg-blue-900/30',
    cell: ' text-sm text-neutral-800 dark:text-neutral-200 whitespace-nowrap',
    selectionCell: ' bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200',
    indexCell:
      'bg-neutral-100 dark:bg-neutral-800 text-xs text-neutral-500 dark:text-neutral-400 select-none',
  },
  group: {
    row: 'border-b border-neutral-200 dark:border-neutral-700 bg-neutral-100/70 dark:bg-neutral-800/60',
    cell: ' text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-600 dark:text-neutral-300 flex items-center gap-2',
    caret: 'text-neutral-500 dark:text-neutral-400',
  },
  summary: {
    row: 'bg-neutral-100 dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700 shadow-sm',
    cell: ' text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide',
    labelCell:
      ' text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-[0.15em]',
  },
  state: {
    selectedRow: 'bg-blue-50 dark:bg-blue-900/30',
  },
}
