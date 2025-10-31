<template>
  <div>

    <div :class="['ui-table', tableWrapperClass, { 'ui-table--hoverable': isHoverableTable }]">
      <div v-if="useInlineControls" class="ui-table__toolbar flex items-center justify-end gap-2 mb-2 relative">
        <button type="button"
          class="btn btn-secondary btn-xs flex items-center gap-1 transition-transform transform duration-150 disabled:cursor-not-allowed disabled:opacity-40"
          :class="{ 'hover:-translate-y-0.5 focus:-translate-y-0.5 hover:shadow-sm': hasActiveFiltersOrGroups }"
          :disabled="!hasActiveFiltersOrGroups" :name="resetFiltersButtonName" @click="handleResetAllFilters">
          <span>Reset filters</span>
          <span v-if="resetTargetsCount"
            class="rounded-full bg-blue-50 px-1 py-0.5 text-[10px] font-semibold text-blue-600 dark:bg-blue-500/20 dark:text-blue-300 transition-colors duration-150">
            {{ resetTargetsCount }}
          </span>
        </button>
        <button type="button" class="btn btn-secondary btn-xs" data-testid="column-visibility-toggle"
          :aria-expanded="showVisibilityPanel" aria-haspopup="true" aria-label="Toggle column visibility panel"
          :name="columnToggleButtonName" @click="toggleVisibilityPanel">
          Columns
        </button>

        <transition name="fade">
          <div v-if="showVisibilityPanel" class="ui-table__column-visibility absolute right-0 top-full z-20 mt-2">
            <UiTableColumnVisibility :columns="localColumns" :storage-key="visibilityStorageKey"
              @update="handleColumnsVisibilityUpdate" @close="closeVisibilityPanel" @reset="resetColumnVisibility" />
          </div>
        </transition>
      </div>
      <div class="ui-table__viewport-wrapper overflow-auto">
        <div ref="containerRef" class="ui-table__container" :class="tableContainerClass" data-testid="table-container"
          role="grid" :aria-rowcount="ariaRowCount" :aria-colcount="ariaColCount" aria-multiselectable="true"
          tabindex="0" @focusin="onGridFocusIn" @focusout="onGridFocusOut" @keydown="handleKeydown"
          @wheel.passive.stop="handleWheel" @scroll="handleScroll">

          <div class="ui-table__inner" :style="zoomStyle">
            <div class="ui-table__grid" :style="tableGridStyle">
              <!-- Header Row -->
              <div ref="headerRef" class="ui-table__header-row" role="rowgroup" :style="headerRowStickyStyle">
                <template v-if="hasColumnGroups">
                  <div v-for="(groupRow, groupRowIndex) in headerGroupRows" :key="`header-group-row-${groupRowIndex}`"
                    :class="['ui-table__header-grid', 'ui-table__header-grid--groups', headerRowClass]"
                    :style="headerGridStyle" role="row">
                    <UiTableHeaderGroup v-for="node in groupRow" :key="`${node.group.getGroupId()}-${groupRowIndex}`"
                      :group="node.group" :start-line="node.startLine" :end-line="node.endLine" :level="node.level" />
                  </div>
                </template>
                <div class="ui-table__header-grid" :class="headerRowClass" :style="headerGridStyle">
                  <template v-for="entry in headerSystemEntries" :key="`system-${entry.metric.column.key}`">
                    <div v-if="entry.metric.column.key === SELECTION_COLUMN_KEY"
                      :style="[headerItemStyle(entry), systemColumnStyle(entry.metric.column)]"
                      :class="['ui-table__selection-header ui-table__sticky-divider flex items-center justify-center', headerSelectionCellClass]"
                      role="columnheader" aria-label="Select rows">
                      <label class="flex items-center justify-center p-0">
                        <input :ref="setHeaderSelectionCheckboxRef" type="checkbox"
                          class="h-4 w-4 cursor-pointer rounded border-neutral-300 text-blue-600 transition-colors focus:ring-2 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-blue-400 dark:focus:ring-blue-400"
                          :checked="rowSelection.allSelected.value" :disabled="!selectableRowCount"
                          :name="headerSelectionName" @change="handleHeaderSelectionChange" @click.stop>
                      </label>
                    </div>
                    <UiTableColumnHeader v-else :style="[headerItemStyle(entry), headerColumnWidthStyle(entry)]"
                      :col="entry.metric.column" :base-class="headerCellClass(entry.metric.column)"
                      :system-selected="isColumnFullySelected(getColumnIndex(entry.metric.column.key))"
                      :system-highlighted="isColumnHeaderHighlighted(getColumnIndex(entry.metric.column.key))"
                      :sort-direction="null" :sort-priority="null" :filter-active="false" :menu-open="false"
                      :zoom-scale="zoom"
                      :layout-width="columnWidthMap.get(entry.metric.column.key) ?? entry.metric.width"
                      :visual-width="columnWidthDomMap.get(entry.metric.column.key) ?? 0"
                      :tab-index="getHeaderTabIndex(getColumnIndex(entry.metric.column.key))"
                      :aria-col-index="getAriaColIndex(getColumnIndex(entry.metric.column.key))"
                      :table-container="containerRef" :sticky="isColumnSticky(entry.metric.column)"
                      :sticky-side="getStickySide(entry.metric.column)"
                      :sticky-left-offset="getStickyLeftOffset(entry.metric.column)"
                      :sticky-right-offset="getStickyRightOffset(entry.metric.column)" :disable-menu="true"
                      :grouped="false" :group-order="null" data-testid="ui-table-row-index-header"
                      @resize="onColumnResize" @dblclick="autoResizeColumn(entry.metric.column)"
                      @select="event => handleColumnHeaderClick(entry.metric.column, getColumnIndex(entry.metric.column.key), event)" />
                  </template>
                  <DraggableList axis="horizontal" wrapper-tag="div" item-tag="div" :items="headerDraggableEntries"
                    :item-key="entry => entry.metric.column.key" :item-style="headerItemStyle"
                    :item-draggable="headerItemDraggable" @update:items="handleHeaderReorder">
                    <template #default="{ item }">
                      <UiTableColumnHeader :style="[headerItemStyle(item), headerColumnWidthStyle(item)]"
                        :col="item.metric.column" :base-class="headerCellClass(item.metric.column)"
                        :system-selected="isColumnFullySelected(getColumnIndex(item.metric.column.key))"
                        :system-highlighted="isColumnHeaderHighlighted(getColumnIndex(item.metric.column.key))"
                        :sort-direction="getSortDirectionForColumn(item.metric.column.key)"
                        :sort-priority="getSortPriorityForColumn(item.metric.column.key)"
                        :filter-active="isFilterActiveForColumn(item.metric.column.key)"
                        :menu-open="filterMenuState.columnKey === item.metric.column.key" :zoom-scale="zoom"
                        :layout-width="columnWidthMap.get(item.metric.column.key) ?? item.metric.width"
                        :visual-width="columnWidthDomMap.get(item.metric.column.key) ?? 0"
                        :tab-index="getHeaderTabIndex(getColumnIndex(item.metric.column.key))"
                        :aria-col-index="getAriaColIndex(getColumnIndex(item.metric.column.key))"
                        :table-container="containerRef" :sticky="isColumnSticky(item.metric.column)"
                        :sticky-side="getStickySide(item.metric.column)"
                        :sticky-left-offset="getStickyLeftOffset(item.metric.column)"
                        :sticky-right-offset="getStickyRightOffset(item.metric.column)"
                        :grouped="groupedColumnSet.has(item.metric.column.key)"
                        :group-order="groupOrderMap.get(item.metric.column.key) ?? null" @resize="onColumnResize"
                        @select="event => handleColumnHeaderClick(item.metric.column, getColumnIndex(item.metric.column.key), event)"
                        @menu-open="closeFn => onColumnMenuOpen(item.metric.column.key, closeFn)"
                        @menu-close="() => onColumnMenuClose(item.metric.column.key)"
                        @dblclick="autoResizeColumn(item.metric.column)">
                        <template #menu="slotProps">
                          <FilterPopover :col="item.metric.column" :close="slotProps.close" :options="activeMenuOptions"
                            :selected-keys="filterMenuState.selectedKeys" :search="filterMenuState.search"
                            :is-select-all-checked="isSelectAllChecked"
                            :is-select-all-indeterminate="isSelectAllIndeterminate"
                            :sort-direction="getSortDirectionForColumn(item.metric.column.key)"
                            :register-search-input="setFilterMenuSearchRef"
                            :filter-condition="getAdvancedFilter(item.metric.column.key)"
                            :pin-state="resolveColumnPinState(item.metric.column)" :load-options="loadFilterOptions"
                            :group-active="groupedColumns.includes(item.metric.column.key)"
                            @update:search="(value: string) => (filterMenuState.search = value)"
                            @toggle-option="toggleFilterOption" @toggle-select-all="toggleSelectAll"
                            @apply="onApplyFilter" @cancel="onCancelFilter" @sort="onSortColumn" @reset="onResetFilter"
                            @group="() => onGroupColumn(item.metric.column)"
                            @pin="position => handleColumnPin(item.metric.column, position)"
                            @open-advanced="() => openAdvancedFilterModal(item.metric.column.key)" />
                        </template>
                      </UiTableColumnHeader>
                    </template>
                  </DraggableList>
                </div>
              </div>

              <!-- Data Rows -->
              <div class="ui-table__virtual-container" :style="virtualContainerStyle">
                <div v-for="pooled in pooledRows" :key="pooled.poolIndex" :class="[
                  'ui-table__row-layer virtual-layer transform-gpu will-change-transform contain-strict backface-hidden',
                  { 'ui-table__row-layer--hoverable': isHoverableTable && pooled.entry && !isGroupRowEntry(pooled.entry) }
                ]" data-testid="ui-table-row-layer" :style="rowLayerStyle(pooled)" role="presentation">
                  <template v-if="pooled.entry">
                    <div v-if="isGroupRowEntry(pooled.entry)" :class="['ui-table__group-row', groupRowClass]"
                      role="row">
                      <span :class="['ui-table__group-cell', groupCellClass]" role="gridcell"
                        :aria-colspan="ariaColCount" :style="groupCellStyle(pooled.entry.row.level)" tabindex="0"
                        @click.stop="toggleGroupRow(pooled.entry.row.key)"
                        @keydown.enter.prevent.stop="toggleGroupRow(pooled.entry.row.key)"
                        @keydown.space.prevent.stop="toggleGroupRow(pooled.entry.row.key)">
                        <span
                          :class="['ui-table__group-caret', groupCaretClass, { expanded: isGroupExpanded(pooled.entry.row.key) }]"
                          aria-hidden="true"></span>
                        <span class="ui-table__group-label">{{ pooled.entry.row.value }}</span>
                        <span class="ui-table__group-count">({{ pooled.entry.row.size }})</span>
                      </span>
                    </div>
                    <div v-else class="ui-table__row-grid"
                      :class="[bodyRowClass, rowGridClass(pooled.entry?.row ?? null)]" :style="rowGridStyle" role="row"
                      :aria-rowindex="getAriaRowIndex(pooled.displayIndex)">
                      <template v-for="entry in headerRenderableEntries"
                        :key="`cell-${entry.metric.column.key}-${pooled.displayIndex}`">
                        <div v-if="entry.showLeftFiller" class="ui-table__column-filler ui-table__column-filler--left"
                          :style="{ height: `${rowHeightDom}px` }" aria-hidden="true"></div>
                        <template v-if="entry.metric.column.isSystem">
                          <div v-if="entry.metric.column.key === SELECTION_COLUMN_KEY"
                            class="ui-table__selection-cell ui-table__sticky-divider flex items-center justify-center"
                            :class="bodySelectionCellClass" :style="systemColumnStyle(entry.metric.column)"
                            role="gridcell" :aria-colindex="getAriaColIndex(getColumnIndex(entry.metric.column.key))"
                            :aria-rowindex="getAriaRowIndex(pooled.displayIndex)">
                            <input type="checkbox"
                              class="h-4 w-4 cursor-pointer rounded border-neutral-300 text-blue-600 transition-colors focus:ring-2 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-blue-400 dark:focus:ring-blue-400"
                              :checked="isCheckboxRowSelected(pooled.entry?.row ?? null)" :name="rowSelectionName"
                              @change="() => handleRowCheckboxToggle(pooled.entry?.row ?? null)" @click.stop
                              @mousedown.stop>
                          </div>
                          <div v-else class="ui-table__row-index ui-table__sticky-divider"
                            :class="[bodyIndexCellClass, rowHeaderClass(pooled.displayIndex)]"
                            :style="systemColumnStyle(entry.metric.column)" :data-row-index="pooled.displayIndex"
                            :data-col-key="entry.metric.column.key" role="rowheader"
                            :aria-rowindex="getAriaRowIndex(pooled.displayIndex)" tabindex="-1"
                            @mousedown.stop="onRowIndexClick(pooled.displayIndex, $event)">
                            {{ pooled.displayIndex + 1 }}
                          </div>
                        </template>
                        <template v-else>
                          <UiTableCell :row="pooled.entry.row" :col="entry.metric.column"
                            :row-index="pooled.displayIndex" :original-row-index="pooled.entry.originalIndex"
                            :col-index="getColumnIndex(entry.metric.column.key)"
                            :zoom-scale="supportsCssZoom ? 1 : zoom"
                            :visual-width="columnWidthDomMap.get(entry.metric.column.key) ?? 0"
                            :is-selected="isCellSelected(pooled.displayIndex, getColumnIndex(entry.metric.column.key))"
                            :is-row-selected="isRowFullySelected(pooled.displayIndex)"
                            :is-column-selected="isColumnFullySelected(getColumnIndex(entry.metric.column.key))"
                            :is-range-selected="isCellInSelectionRange(pooled.displayIndex, getColumnIndex(entry.metric.column.key))"
                            :is-fill-preview="isCellInFillPreview(pooled.displayIndex, getColumnIndex(entry.metric.column.key))"
                            :fill-preview-edges="getFillPreviewEdges(pooled.displayIndex, getColumnIndex(entry.metric.column.key))"
                            :range-edges="getSelectionEdges(pooled.displayIndex, getColumnIndex(entry.metric.column.key))"
                            :edit-command="editCommand" :editable="isColumnEditable(entry.metric.column)"
                            :validation-error="getValidationError(pooled.displayIndex, getColumnIndex(entry.metric.column.key))"
                            :tab-index="getCellTabIndex(pooled.displayIndex, getColumnIndex(entry.metric.column.key))"
                            :aria-row-index="getAriaRowIndex(pooled.displayIndex)"
                            :aria-col-index="getAriaColIndex(getColumnIndex(entry.metric.column.key))"
                            :cell-id="getCellDomId(pooled.displayIndex, entry.metric.column.key)"
                            :sticky="isColumnSticky(entry.metric.column)"
                            :sticky-side="getStickySide(entry.metric.column)"
                            :sticky-left-offset="getStickyLeftOffset(entry.metric.column)"
                            :sticky-right-offset="getStickyRightOffset(entry.metric.column)"
                            :class="bodyCellClass(entry.metric.column)"
                            :sticky-top-offset="getStickyTopOffset(pooled.entry)"
                            :sticky-top="Boolean(pooled.entry.stickyTop ?? pooled.entry.row?.stickyTop)"
                            :search-match="isSearchMatchCell(pooled.entry?.displayIndex ?? pooled.displayIndex, entry.metric.column.key)"
                            :active-search-match="isActiveSearchMatchCell(pooled.entry?.displayIndex ?? pooled.displayIndex, entry.metric.column.key)"
                            @edit="onCellEdit" @next-cell="focusNextCell" @select="onCellSelect"
                            @editing-change="value => handleCellEditingChange(value, entry.metric.column.key, pooled.entry?.originalIndex ?? null)"
                            @drag-start="onCellDragStart" @drag-enter="onCellDragEnter"
                            @cell-focus="onCellComponentFocus">
                            <template v-if="hasCustomRenderer(entry.metric.column.key)" #display="cellSlotProps">
                              <slot :name="`cell-${entry.metric.column.key}`" v-bind="cellSlotProps" />
                            </template>
                          </UiTableCell>
                        </template>
                        <div v-if="entry.showRightFiller" class="ui-table__column-filler ui-table__column-filler--right"
                          :style="{ height: `${rowHeightDom}px` }" aria-hidden="true"></div>
                      </template>
                    </div>
                  </template>
                </div>
              </div>

              <!-- No Data Row -->
              <template v-if="!totalRowCountDisplay && !loadingState">
                <div class="ui-table__empty-state" :style="{ gridColumn: '1 / -1' }">
                  No data
                </div>
              </template>

              <!-- Summary Row -->
              <template v-if="hasSummaryRow">
                <div :class="['ui-table__summary-layer sticky bottom-0 z-10', summaryRowClass]" role="row"
                  :aria-rowindex="summaryRowAriaIndex">
                  <div class="ui-table__summary-grid" :style="headerGridStyle">
                    <template v-for="entry in headerRenderableEntries" :key="`summary-${entry.metric.column.key}`">
                      <div v-if="entry.showLeftFiller"
                        class="ui-table__column-filler ui-table__column-filler--left ui-table__summary-filler"
                        aria-hidden="true"></div>
                      <div v-if="entry.metric.column.isSystem"
                        class="ui-table__row-index ui-table__sticky-divider ui-table__summary-index"
                        :class="summaryLabelCellClass" :style="summaryCellStyle(entry.metric.column)" role="rowheader"
                        :aria-rowindex="summaryRowAriaIndex" tabindex="-1">
                        <slot name="summary-label">Summary</slot>
                      </div>
                      <div v-else class="ui-table__summary-cell" :class="summaryCellClass" role="gridcell"
                        :style="summaryCellStyle(entry.metric.column)" :aria-rowindex="summaryRowAriaIndex"
                        :aria-colindex="getAriaColIndex(getColumnIndex(entry.metric.column.key))">
                        <slot v-if="$slots[`summary-${entry.metric.column.key}`]"
                          :name="`summary-${entry.metric.column.key}`" :column="entry.metric.column"
                          :value="props.summaryRow?.[entry.metric.column.key]" />
                        <slot v-else-if="$slots.summary" name="summary" :column="entry.metric.column"
                          :value="props.summaryRow?.[entry.metric.column.key]" />
                        <span v-else>
                          {{ props.summaryRow?.[entry.metric.column.key] ?? '' }}
                        </span>
                      </div>
                      <div v-if="entry.showRightFiller"
                        class="ui-table__column-filler ui-table__column-filler--right ui-table__summary-filler"
                        aria-hidden="true"></div>
                    </template>
                  </div>
                </div>
              </template>
            </div>
          </div>
          <div v-if="fillHandleStyle" class="ui-table-fill-handle" :style="fillHandleStyle"
            @mousedown.prevent.stop="startFillDrag" @dblclick.prevent.stop="autoFillDown" />
        </div>
      </div>

      <!-- <div v-if="loadingState" class="ui-table__loader">Loading...</div> -->
      <!-- <footer class="ui-table__footer">
        <div class="ui-table__footer-left">
          <span class="ui-table__footer-label">Rows</span>
          <span class="ui-table__footer-value">{{ formattedRowCount }}</span>
        </div>
        <div class="ui-table__footer-right">
          <div class="ui-table__footer-metrics">
            <div class="ui-table__footer-metric" title="Sum">
              <span class="ui-table__footer-metric-label">Sum</span>
              <span class="ui-table__footer-metric-value">{{ selectionMetricDisplay.sum }}</span>
            </div>
            <div class="ui-table__footer-metric" title="Min">
              <span class="ui-table__footer-metric-label">Min</span>
              <span class="ui-table__footer-metric-value">{{ selectionMetricDisplay.min }}</span>
            </div>
            <div class="ui-table__footer-metric" title="Max">
              <span class="ui-table__footer-metric-label">Max</span>
              <span class="ui-table__footer-metric-value">{{ selectionMetricDisplay.max }}</span>
            </div>
            <div class="ui-table__footer-metric" title="Average">
              <span class="ui-table__footer-metric-label">Avg</span>
              <span class="ui-table__footer-metric-value">{{ selectionMetricDisplay.avg }}</span>
            </div>
          </div>

        </div>
      </footer> -->
    </div>

    <AdvancedFilterModal :open="advancedModalState.open" :column-label="advancedModalColumn?.label ?? ''"
      :type="advancedModalType" :condition="advancedModalCondition" @apply="handleAdvancedModalApply"
      @clear="handleAdvancedModalClear" @cancel="handleAdvancedModalCancel" />
    <FindModal :open="findReplace.isActive && findReplace.mode === 'find'" @close="closeFindReplace" />
    <ReplaceModal :open="findReplace.isActive && findReplace.mode === 'replace'" @close="closeFindReplace" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, useSlots, onBeforeUnmount, reactive, onMounted, watchEffect, shallowRef } from "vue"
import type { CSSProperties, ComponentPublicInstance } from "vue"
import UiTableColumnHeader from "./UiTableColumnHeader.vue"
import UiTableCell from "./UiTableCell.vue"
import { useTableSettingsStore } from "./tableSettingsStore"
import type { CellEditEvent, UiTableColumn, VisibleRow } from "./types"
import { useTableZoom } from "./composables/useTableZoom"
import { useTableFilters } from "./composables/useTableFilters"
import type { FilterCondition } from "./composables/useTableFilters"
import { useTableSorting, type SortState } from "./composables/useTableSorting"
import { useTableViewport } from "./composables/useTableViewport"
import { useTableHistory, type HistoryEntry } from "./composables/useTableHistory"
import { useTableEditing, isColumnEditable as baseIsColumnEditable } from "./composables/useTableEditing"
import { useTableSelection, type SelectionArea } from "./composables/useTableSelection"
import { useTableClipboard } from "./composables/useTableClipboard"
import { useCellFlash } from "./composables/useCellFlash"
import { getCellElementsByRange, getColumnCellElements, getRowCellElements } from "./utils/getCellElementsByRange"
import { getCellElement, supportsCssZoom } from "./utils/gridUtils"
import { useTableAutoScroll } from "./composables/useTableAutoScroll"
import { useTableEvents } from "./composables/useTableEvents"
import { useAutoResizeColumn } from "@/composables/useAutoResizeColumn"
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from "./utils/constants"
import "./styles/base.css"
import "./styles/table.css"
import "./styles/effects.css"
import "./styles/sidebar.css"
import "./styles/toolbar.css"
import "./styles/status.css"
import "./styles/overlay.css"
import "./styles/zoom.css"
import "./styles/fill-handle.css"
import "./styles/icon-button.css"
import "./styles/row-index.css"
import "./styles/empty-state.css"
import "./styles/summary-footer.css"
import "./styles/cell-select-trigger.css"
import FilterPopover from "./FilterPopover.vue"
import UiTableColumnVisibility from "./UiTableColumnVisibility.vue"
import AdvancedFilterModal from "./AdvancedFilterModal.vue"
import UiTableHeaderGroup from "./UiTableHeaderGroup.vue"
import { useColumnGroups } from "./composables/useColumnGroups"
import {
  buildColumnGroupRenderRows,
  type ColumnGroupRenderRows,
  type UiTableColumnGroupDef,
} from "./utils/ColumnGroup"
import { useFindReplaceStore } from "@/stores/useFindReplaceStore"
import FindModal from "@/components/modals/FindModal.vue"
import ReplaceModal from "@/components/modals/ReplaceModal.vue"
import DraggableList from "../DraggableList.vue"
import { useSelectableRows, type RowData, type RowKey } from "@/composables/useSelectableRows"

type UiTableStyleSection = {
  wrapper?: string
  container?: string
}

type UiTableHeaderStyle = {
  row?: string
  cell?: string
  selectionCell?: string
  indexCell?: string
}

type UiTableBodyStyle = {
  row?: string
  cell?: string
  selectionCell?: string
  indexCell?: string
}

type ColumnPinPosition = "left" | "right" | "none"

type UiTableGroupStyle = {
  row?: string
  cell?: string
  caret?: string
}

type UiTableSummaryStyle = {
  row?: string
  cell?: string
  labelCell?: string
}

type UiTableStateStyle = {
  selectedRow?: string
}

export interface UiTableStyleConfig {
  table?: UiTableStyleSection
  header?: UiTableHeaderStyle
  body?: UiTableBodyStyle
  group?: UiTableGroupStyle
  summary?: UiTableSummaryStyle
  state?: UiTableStateStyle
}

type UiTableResolvedStyleConfig = {
  table: UiTableStyleSection
  header: UiTableHeaderStyle
  body: UiTableBodyStyle
  group: UiTableGroupStyle
  summary: UiTableSummaryStyle
  state: UiTableStateStyle
}

const defaultStyleConfig: UiTableResolvedStyleConfig = {
  table: {
    wrapper: "bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans",
    container: "",
  },
  header: {
    row: "",
    cell: "bg-slate-100/90 dark:bg-slate-900/80 px-3 py-2 text-xs font-semibold leading-tight text-slate-600 dark:text-slate-200",
    selectionCell: "bg-slate-100/90 dark:bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-200",
    indexCell: "bg-slate-100/90 dark:bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-200",
  },
  body: {
    row: "",
    cell: "px-3 py-1.5 text-sm text-slate-800 dark:text-slate-100",
    selectionCell: "bg-slate-100 dark:bg-slate-900 px-3 py-1.5 text-slate-800 dark:text-slate-100",
    indexCell: "bg-slate-100 dark:bg-slate-900 px-3 py-1.5 font-medium text-slate-800 dark:text-slate-100",
  },
  group: {
    row: "",
    cell: "",
    caret: "",
  },
  summary: {
    row: "",
    cell: "",
    labelCell: "",
  },
  state: {
    selectedRow: "",
  },
}

function mergeStyleConfig(base: UiTableResolvedStyleConfig, override?: UiTableStyleConfig | null): UiTableResolvedStyleConfig {
  if (!override) {
    return {
      table: { ...base.table },
      header: { ...base.header },
      body: { ...base.body },
      group: { ...base.group },
      summary: { ...base.summary },
      state: { ...base.state },
    }
  }
  return {
    table: { ...base.table, ...(override.table ?? {}) },
    header: { ...base.header, ...(override.header ?? {}) },
    body: { ...base.body, ...(override.body ?? {}) },
    group: { ...base.group, ...(override.group ?? {}) },
    summary: { ...base.summary, ...(override.summary ?? {}) },
    state: { ...base.state, ...(override.state ?? {}) },
  }
}

interface UiTableProps {
  rows: any[]
  totalRows?: number
  loading?: boolean
  virtualization?: boolean
  rowHeightMode?: "fixed" | "auto"
  columns: UiTableColumn[]
  columnGroups?: UiTableColumnGroupDef[]
  tableName?: string
  summaryRow?: Record<string, any> | null
  debugViewport?: boolean
  inlineControls?: boolean
  showRowIndexColumn?: boolean
  selectable?: boolean
  selected?: (RowData | RowData["id"])[]
  hoverable?: boolean
  styleConfig?: UiTableStyleConfig
}

const props = withDefaults(defineProps<UiTableProps>(), {
  virtualization: true,
  inlineControls: true,
  showRowIndexColumn: false,
  selectable: false,
  hoverable: false,
  styleConfig: () => ({}),
})

const emit = defineEmits([
  "reach-bottom",
  "row-click",
  "cell-edit",
  "batch-edit",
  "selection-change",
  "sort-change",
  "filter-change",
  "filters-reset",
  "zoom-change",
  "column-resize",
  "group-filter-toggle",
  "rows-delete",
  "update:selected",
])

const findReplace = useFindReplaceStore()

const tableName = props.tableName ?? "default"
const tableSettings = useTableSettingsStore()

const VISIBILITY_STORAGE_PREFIX = "uiTable.columns.visibility"
const visibilityStorageKey = `${VISIBILITY_STORAGE_PREFIX}.${tableName}`
const columnVisibilityState = ref<Record<string, boolean>>({})
let visibilityHydrated = false
const showVisibilityPanel = ref(false)
const showGroupFilterPanel = ref(false)
const rowCountFormatter = new Intl.NumberFormat()
const numericSummaryFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
})

const ROW_INDEX_COLUMN_KEY = "__rowIndex__"
const SELECTION_COLUMN_KEY = "__select__"

function createRowIndexColumn(): UiTableColumn {
  return {
    key: ROW_INDEX_COLUMN_KEY,
    label: "#",
    width: 56,
    minWidth: 48,
    maxWidth: 72,
    sortable: false,
    resizable: false,
    editable: false,
    align: "right",
    headerAlign: "right",
    isSystem: true,
    sticky: "left",
    visible: true,
  }
}

function createSelectionColumn(): UiTableColumn {
  return {
    key: SELECTION_COLUMN_KEY,
    label: "",
    width: 48,
    minWidth: 44,
    maxWidth: 56,
    sortable: false,
    resizable: false,
    editable: false,
    align: "center",
    headerAlign: "center",
    isSystem: true,
    sticky: "left",
    visible: true,
  }
}

function ensureSystemColumns(columns: UiTableColumn[], includeRowIndex: boolean, includeSelection: boolean): UiTableColumn[] {
  const sanitized = columns.filter(
    column => column.key !== ROW_INDEX_COLUMN_KEY && column.key !== SELECTION_COLUMN_KEY,
  )

  const systemColumns: UiTableColumn[] = []
  if (includeRowIndex) {
    systemColumns.push(createRowIndexColumn())
  }
  if (includeSelection) {
    systemColumns.push(createSelectionColumn())
  }

  return [...systemColumns, ...sanitized]
}

const fallbackRowKeyMap = new WeakMap<object, RowKey>()
let fallbackRowKeySeed = 0

function applyStoredPinState() {
  const stored = tableSettings.getPinState(tableName)
  if (!stored) return
  localColumns.value = localColumns.value.map(column => {
    if (column.isSystem) return column
    const position = stored[column.key] ?? "none"
    return applyPinProps(column, position)
  })
}

function resolveRowKey(row: RowData, originalIndex?: number): RowKey {
  const candidateId = (row as Record<string, unknown>).id
  if (typeof candidateId === "string" || typeof candidateId === "number") {
    return candidateId
  }
  const keyProp = (row as Record<string, unknown>).key
  if (typeof keyProp === "string" || typeof keyProp === "number") {
    return keyProp
  }
  const internalKey = (row as Record<string, unknown>).__key
  if (typeof internalKey === "string" || typeof internalKey === "number") {
    return internalKey
  }
  if (typeof originalIndex === "number") {
    return originalIndex
  }
  const existing = fallbackRowKeyMap.get(row as object)
  if (existing != null) {
    return existing
  }
  fallbackRowKeySeed += 1
  const generated: RowKey = `row_${fallbackRowKeySeed}`
  fallbackRowKeyMap.set(row as object, generated)
  return generated
}

function rowKeyResolver(row: RowData): RowKey {
  return resolveRowKey(row)
}

const loadingState = computed(() => Boolean(props.loading))
const virtualizationEnabled = computed(() => props.virtualization !== false)
const rowHeightMode = computed(() => props.rowHeightMode ?? "fixed")
const resolvedRows = computed(() => props.rows ?? [])
const useInlineControls = computed(() => props.inlineControls !== false)
const selectionEnabled = computed(() => props.selectable === true)
const isHoverableTable = computed(() => props.hoverable === true)

const styleClasses = computed(() => mergeStyleConfig(defaultStyleConfig, props.styleConfig))
const tableWrapperClass = computed(() => styleClasses.value.table.wrapper ?? "")
const tableContainerClass = computed(() => styleClasses.value.table.container ?? "")
const headerRowClass = computed(() => styleClasses.value.header.row ?? "")
const headerCellBaseClass = computed(() => styleClasses.value.header.cell ?? "")
const headerSelectionCellClass = computed(
  () => styleClasses.value.header.selectionCell ?? headerCellBaseClass.value,
)
const headerIndexCellClass = computed(
  () => styleClasses.value.header.indexCell ?? headerCellBaseClass.value,
)
const bodyRowClass = computed(() => styleClasses.value.body.row ?? "")
const bodyCellBaseClass = computed(() => styleClasses.value.body.cell ?? "")
const bodySelectionCellClass = computed(
  () => styleClasses.value.body.selectionCell ?? bodyCellBaseClass.value,
)
const bodyIndexCellClass = computed(
  () => styleClasses.value.body.indexCell ?? bodyCellBaseClass.value,
)
const groupRowClass = computed(() => styleClasses.value.group.row ?? "")
const groupCellClass = computed(() => styleClasses.value.group.cell ?? "")
const groupCaretClass = computed(() => styleClasses.value.group.caret ?? "")
const summaryRowClass = computed(() => styleClasses.value.summary.row ?? "")
const summaryCellClass = computed(
  () => styleClasses.value.summary.cell ?? bodyCellBaseClass.value,
)
const summaryLabelCellClass = computed(
  () => styleClasses.value.summary.labelCell ?? summaryCellClass.value,
)
const selectedRowClass = computed(() => styleClasses.value.state.selectedRow ?? "")

const resetFiltersButtonName = computed(() => `${tableName}-reset-filters`)
const columnToggleButtonName = computed(() => `${tableName}-column-toggle`)
const headerSelectionName = computed(() => `${tableName}-select-all`)
const rowSelectionName = computed(() => `${tableName}-row-select`)

function headerCellClass(column: UiTableColumn) {
  if (column.key === ROW_INDEX_COLUMN_KEY) {
    return headerIndexCellClass.value
  }
  return headerCellBaseClass.value
}

function bodyCellClass(_column: UiTableColumn) {
  return bodyCellBaseClass.value
}

const containerRef = ref<HTMLDivElement | null>(null)
const headerRef = ref<HTMLElement | null>(null)
const headerHeight = ref(0)
let headerResizeObserver: ResizeObserver | null = null
const localColumns = ref<UiTableColumn[]>([])
const { autoResizeColumn } = useAutoResizeColumn(localColumns, resolvedRows, {
  onWidthChange: (column, width) => {
    onColumnResize(column.key, width)
  },
})
const tableSlots = useSlots()
const visibleColumns = computed(() => localColumns.value.filter(column => column.visible !== false))
const isGridFocused = ref(false)
const ariaColCount = computed(() => Math.max(1, visibleColumns.value.length))

const columnGroupDefs = computed<UiTableColumnGroupDef[]>(() => props.columnGroups ?? [])

const { rootGroups: rootColumnGroups, ungroupedColumns } = useColumnGroups({
  columns: () => visibleColumns.value,
  groupDefs: () => columnGroupDefs.value,
})

// Move focus back to the grid container without scrolling
function focusContainer() {
  if (focusActiveCellElement()) return
  nextTick(() => {
    if (focusActiveCellElement()) return
    const el = containerRef.value
    if (!el) return
    el.focus({ preventScroll: true })
    isGridFocused.value = true
  })
}

function applyHeaderHeight(value: number) {
  headerHeight.value = value
  if (containerRef.value) {
    containerRef.value.style.setProperty("--ui-table-header-height", `${Math.round(value)}px`)
  }
}

watch(
  () => headerRef.value,
  element => {
    headerResizeObserver?.disconnect()
    headerResizeObserver = null
    if (!element) return
    applyHeaderHeight(element.getBoundingClientRect().height)
    if (typeof ResizeObserver !== "undefined") {
      headerResizeObserver = new ResizeObserver(entries => {
        const entry = entries[0]
        if (entry) {
          applyHeaderHeight(entry.contentRect.height)
        }
      })
      headerResizeObserver.observe(element)
    }
  },
  { immediate: true }
)

watch(
  () => containerRef.value,
  container => {
    if (container) {
      container.style.setProperty("--ui-table-header-height", `${Math.round(headerHeight.value)}px`)
    }
  }
)

function toggleVisibilityPanel() {
  const next = !showVisibilityPanel.value
  showVisibilityPanel.value = next
  if (next) {
    showGroupFilterPanel.value = false
    emit("group-filter-toggle", false)
  } else {
    nextTick(() => focusContainer())
  }
}

function openVisibilityPanel() {
  if (showVisibilityPanel.value) return
  showVisibilityPanel.value = true
  showGroupFilterPanel.value = false
  emit("group-filter-toggle", false)
}

function closeVisibilityPanel() {
  if (!showVisibilityPanel.value) return
  showVisibilityPanel.value = false
  nextTick(() => focusContainer())
}

function toggleGroupFilterPanel() {
  const next = !showGroupFilterPanel.value
  showGroupFilterPanel.value = next
  emit("group-filter-toggle", next)
  if (next) {
    showVisibilityPanel.value = false
  } else {
    nextTick(() => focusContainer())
  }
}

function closeGroupFilterPanel() {
  if (!showGroupFilterPanel.value) return
  showGroupFilterPanel.value = false
  emit("group-filter-toggle", false)
  nextTick(() => focusContainer())
}

type VisibilitySnapshot = { key: string; visible: boolean; label?: string }

function buildColumnSnapshot(columns: UiTableColumn[]): VisibilitySnapshot[] {
  return columns.map(column => ({ key: column.key, label: column.label, visible: column.visible !== false }))
}

function updateVisibilityMapFromColumns(columns: UiTableColumn[]) {
  const snapshot = buildColumnSnapshot(columns)
  const next: Record<string, boolean> = {}
  snapshot.forEach(entry => {
    next[entry.key] = entry.visible
  })
  columnVisibilityState.value = next
  return snapshot
}

function persistColumnState(snapshot?: VisibilitySnapshot[]) {
  if (typeof window === "undefined") return
  const payload = snapshot ?? buildColumnSnapshot(localColumns.value)
  try {
    window.localStorage.setItem(visibilityStorageKey, JSON.stringify(payload))
  } catch (error) {
    console.warn("Failed to persist column visibility state", error)
  }
}

function loadColumnStateFromStorage(): VisibilitySnapshot[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(visibilityStorageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as VisibilitySnapshot[] | undefined
    if (!Array.isArray(parsed)) return null
    return parsed.filter(entry => entry && typeof entry.key === "string")
  } catch (error) {
    console.warn("Failed to load column visibility state", error)
    return null
  }
}

function applyStoredColumnState(snapshot: VisibilitySnapshot[]) {
  if (!snapshot.length) {
    updateVisibilityMapFromColumns(localColumns.value)
    return
  }

  const orderMap = new Map<string, { index: number; visible: boolean }>()
  snapshot.forEach((entry, index) => {
    orderMap.set(entry.key, { index, visible: entry.visible !== false })
  })

  const sortedColumns = [...localColumns.value]
    .map((column, originalIndex) => ({ column: { ...column }, originalIndex }))
    .sort((a, b) => {
      const orderA = orderMap.has(a.column.key)
        ? orderMap.get(a.column.key)!.index
        : a.column.isSystem
          ? -1
          : Number.MAX_SAFE_INTEGER
      const orderB = orderMap.has(b.column.key)
        ? orderMap.get(b.column.key)!.index
        : b.column.isSystem
          ? -1
          : Number.MAX_SAFE_INTEGER
      if (orderA !== orderB) {
        return orderA - orderB
      }
      return a.originalIndex - b.originalIndex
    })
    .map(entry => {
      const stored = orderMap.get(entry.column.key)
      return stored ? { ...entry.column, visible: stored.visible } : entry.column
    })

  localColumns.value = sortedColumns
  const snapshotToPersist = updateVisibilityMapFromColumns(sortedColumns)
  persistColumnState(snapshotToPersist)
}

watch(
  [() => props.columns, () => props.showRowIndexColumn, () => props.selectable],
  ([newColumns, includeRowIndex]) => {
    const incoming = (Array.isArray(newColumns) ? newColumns : []) as UiTableColumn[]
    const normalized = ensureSystemColumns(
      incoming,
      includeRowIndex !== false,
      selectionEnabled.value,
    ).map((column: UiTableColumn) => {
      const savedWidth = tableSettings.getColumnWidth(tableName, column.key)
      return {
        ...column,
        width: savedWidth ?? column.width,
        visible: column.visible !== false,
      }
    })

    localColumns.value = normalized
    const stored = loadColumnStateFromStorage()
    if (stored) {
      applyStoredColumnState(stored)
    } else {
      const snapshot = updateVisibilityMapFromColumns(localColumns.value)
      persistColumnState(snapshot)
    }
    applyStoredPinState()
    reorderPinnedColumns()
    visibilityHydrated = true
  },
  { immediate: true }
)

const baseEntries = computed(() =>
  resolvedRows.value.map((row, originalIndex) => ({ row, originalIndex }))
)

const suspendedFilterRows = shallowRef(new Map<string, Set<number>>())

const filters = useTableFilters({
  rows: () => resolvedRows.value,
  localColumns: computed(() => visibleColumns.value),
  emitFilterChange: payload => emit("filter-change", payload),
  getSuspendedRows: () => suspendedFilterRows.value,
})

const {
  filterMenuState,
  isFilterActiveForColumn,
  onColumnMenuOpen,
  onColumnMenuClose: internalOnColumnMenuClose,
  clearFilterForColumn,
  closeActiveMenu,
  applyFilters,
  getAdvancedFilter,
  setAdvancedFilter,
  clearAdvancedFilter,
  columnFilters,
  filtersState,
  resetAllFilters,
} = filters

const activeMenuOptions = filters.activeMenuOptions
const loadFilterOptions = (args: { search: string; offset?: number; limit?: number }) => filters.loadActiveMenuOptions(args.search)
const isSelectAllChecked = filters.isSelectAllChecked
const isSelectAllIndeterminate = filters.isSelectAllIndeterminate
const toggleFilterOption = filters.toggleFilterOption
const toggleSelectAll = filters.toggleSelectAll
const setFilterMenuSearchRef = filters.setFilterMenuSearchRef
const confirmFilterSelection = filters.confirmFilterSelection
const cancelFilterSelection = filters.cancelFilterSelection
const getFilterStateSnapshot = filters.getFilterStateSnapshot
const setFilterStateSnapshot = filters.setFilterStateSnapshot

const activeFilterColumns = computed(() => {
  const keys = new Set<string>()
  Object.keys(columnFilters.value).forEach(key => keys.add(key))
  Object.keys(filtersState.value).forEach(key => {
    const condition = filtersState.value[key]
    if (condition?.clauses?.length) {
      keys.add(key)
    }
  })
  return keys
})

const activeFiltersCount = computed(() => activeFilterColumns.value.size)
const activeGroupCount = computed(() => groupState.value.length)
const resetTargetsCount = computed(() => activeFiltersCount.value + activeGroupCount.value)
const hasActiveFilters = computed(() => activeFiltersCount.value > 0)
const hasActiveFiltersOrGroups = computed(() => resetTargetsCount.value > 0)

function addSuspendedFilterRow(columnKey: string, originalIndex: number) {
  const current = suspendedFilterRows.value
  const next = new Map(current)
  const set = new Set(next.get(columnKey) ?? [])
  set.add(originalIndex)
  next.set(columnKey, set)
  suspendedFilterRows.value = next
}

function clearSuspendedFilterRows() {
  if (!suspendedFilterRows.value.size) return
  suspendedFilterRows.value = new Map()
}

watch(
  () => [columnFilters.value, filtersState.value],
  () => {
    if (!filterHydrated.value) return
    const snapshot = getFilterStateSnapshot()
    tableSettings.setFilterSnapshot(tableName, snapshot)
  },
  { deep: true },
)

const filteredEntries = computed(() => applyFilters(baseEntries.value))

function getFilteredRowEntries() {
  return filteredEntries.value.map(entry => ({ row: entry.row, originalIndex: entry.originalIndex }))
}

function getFilteredRows() {
  return filteredEntries.value.map(entry => entry.row)
}

const advancedModalState = reactive<{ open: boolean; columnKey: string | null }>({
  open: false,
  columnKey: null,
})

const advancedModalColumn = computed(() => {
  if (!advancedModalState.columnKey) return null
  return visibleColumns.value.find(column => column.key === advancedModalState.columnKey) ?? null
})

const advancedModalType = computed<FilterCondition["type"]>(() => {
  const type = advancedModalColumn.value?.filterType
  if (type === "number" || type === "date") return type
  return "text"
})

const advancedModalCondition = computed(() => {
  if (!advancedModalState.columnKey) return null
  return getAdvancedFilter(advancedModalState.columnKey)
})

const {
  applySort,
  toggleColumnSort,
  getSortDirectionForColumn,
  getSortPriorityForColumn,
  ensureSortedOrder,
  applySorting,
  multiSortState,
  setMultiSortState,
} = useTableSorting({
  rows: () => resolvedRows.value,
  localColumns: computed(() => visibleColumns.value),
  emitSortChange: state => emit("sort-change", state),
})

const sortHydrated = ref(false)
const filterHydrated = ref(false)

onMounted(() => {
  const storedSort = tableSettings.getSortState(tableName)
  if (storedSort?.length) {
    setMultiSortState(storedSort)
  }
  const storedFilters = tableSettings.getFilterSnapshot(tableName)
  if (storedFilters) {
    setFilterStateSnapshot(storedFilters)
  }
  const storedGrouping = tableSettings.getGroupState(tableName)
  if (storedGrouping?.columns?.length) {
    const expansion = storedGrouping.expansion ?? {}
    groupExpansion.value = { ...expansion }
    groupState.value = storedGrouping.columns.map(key => ({
      key,
      expanded: expansion[key] ?? true,
    }))
  }
  sortHydrated.value = true
  filterHydrated.value = true
  groupHydrated.value = true
})

watch(
  multiSortState,
  (next: SortState[]) => {
    if (!sortHydrated.value) return
    tableSettings.setSortState(tableName, next)
  },
  { deep: true }
)


const sortedRows = computed(() =>
  applySorting(filteredEntries.value).map((entry: VisibleRow) => {
    const stickyTopFlag = (entry as any).stickyTop ?? entry.row?.stickyTop
    const rawStickyBottom = (entry as any).stickyBottom ?? entry.row?.stickyBottom ?? (entry.row?.sticky ? true : undefined)
    return {
      ...entry,
      stickyTop: stickyTopFlag,
      stickyBottom: rawStickyBottom,
    }
  })
)

const groupState = ref<{ key: string; expanded: boolean }[]>([])
const groupExpansion = ref<Record<string, boolean>>({})
const groupHydrated = ref(false)

const groupedColumns = computed(() => groupState.value.map(group => group.key))
const groupedColumnSet = computed(() => {
  const set = new Set<string>()
  groupState.value.forEach(entry => set.add(entry.key))
  return set
})
const groupOrderMap = computed(() => {
  const map = new Map<string, number>()
  groupState.value.forEach((entry, index) => {
    map.set(entry.key, index + 1)
  })
  return map
})

const GROUP_INDENT_BASE = 12
const GROUP_INDENT_STEP = 16

interface GroupRowData {
  __group: true
  key: string
  columnKey: string
  value: any
  level: number
  size: number
  [key: string]: unknown
}

interface GroupNode {
  key: string
  columnKey: string
  value: any
  level: number
  rows: VisibleRow[]
  children: GroupNode[]
  expanded: boolean
}

function getGroupExpanded(key: string): boolean {
  const record = groupExpansion.value
  if (Object.prototype.hasOwnProperty.call(record, key)) {
    return record[key]
  }
  return true
}

function setGroupExpanded(key: string, expanded: boolean) {
  groupExpansion.value = {
    ...groupExpansion.value,
    [key]: expanded,
  }
  if (groupState.value.some(item => item.key === key)) {
    groupState.value = groupState.value.map(item =>
      item.key === key ? { ...item, expanded } : item
    )
  }
}

function groupRowsByColumns(rows: VisibleRow[], columns: string[]): GroupNode[] {
  if (!columns.length) return []

  const buildLevel = (data: VisibleRow[], level: number): GroupNode[] => {
    const columnKey = columns[level]
    const groupsMap = new Map<any, VisibleRow[]>()
    for (const row of data) {
      const raw = row.row?.[columnKey]
      const value = raw ?? "(blank)"
      if (!groupsMap.has(value)) {
        groupsMap.set(value, [])
      }
      groupsMap.get(value)!.push(row)
    }

    return Array.from(groupsMap.entries()).map(([value, subset]) => {
      const key = `${columnKey}:${String(value)}`
      const children = level < columns.length - 1 ? buildLevel(subset, level + 1) : []
      return {
        key,
        columnKey,
        value,
        level,
        rows: subset,
        children,
        expanded: getGroupExpanded(key),
      }
    })
  }

  return buildLevel(rows, 0)
}

function flattenGroupedTree(groups: GroupNode[]): VisibleRow[] {
  const output: VisibleRow[] = []

  const pushGroupRow = (node: GroupNode) => {
    const payload: GroupRowData = {
      __group: true,
      key: node.key,
      columnKey: node.columnKey,
      value: node.value,
      level: node.level,
      size: node.rows.length,
    }

    output.push({
      row: payload,
      originalIndex: -1,
      displayIndex: 0,
    })
  }

  const pushDataRow = (entry: VisibleRow) => {
    output.push({
      ...entry,
      displayIndex: 0,
    })
  }

  const traverse = (nodes: GroupNode[]) => {
    for (const node of nodes) {
      pushGroupRow(node)
      if (!node.expanded) {
        continue
      }
      if (node.children.length) {
        traverse(node.children)
      } else {
        node.rows.forEach(pushDataRow)
      }
    }
  }

  traverse(groups)

  return output.map((entry, index) => ({
    ...entry,
    displayIndex: index,
  }))
}

const groupedTree = computed(() => (groupedColumns.value.length ? groupRowsByColumns(sortedRows.value, groupedColumns.value) : []))

const flattenedGroupedRows = computed(() => (groupedColumns.value.length ? flattenGroupedTree(groupedTree.value) : []))

const processedRows = computed(() => (groupedColumns.value.length ? flattenedGroupedRows.value : sortedRows.value))

const selectableRows = computed<RowData[]>(() => {
  if (!selectionEnabled.value) {
    return []
  }
  const rows: RowData[] = []
  for (const entry of processedRows.value) {
    if (isGroupRowEntry(entry)) {
      continue
    }
    const row = (entry.row ?? {}) as RowData
    resolveRowKey(row, entry.originalIndex)
    rows.push(row)
  }
  return rows
})

const isSelectionControlled = computed(() => selectionEnabled.value && props.selected !== undefined)
const selectionModel = computed<(RowData | RowKey)[] | undefined>(() => {
  if (!selectionEnabled.value) {
    return undefined
  }
  if (!Array.isArray(props.selected)) {
    return undefined
  }
  return props.selected.filter((item): item is RowData | RowKey => item !== undefined && item !== null)
})

const rowSelection = useSelectableRows<RowData>({
  rows: selectableRows,
  modelValue: selectionModel,
  controlled: isSelectionControlled,
  emitUpdate: rows => {
    emit("update:selected", rows)
  },
  rowKey: rowKeyResolver,
})

watch(
  selectionEnabled,
  enabled => {
    if (!enabled) {
      rowSelection.clearSelection()
    }
  },
  { immediate: false },
)

const selectableRowCount = computed(() => selectableRows.value.length)
const headerSelectionCheckboxRef = ref<HTMLInputElement | null>(null)

function setHeaderSelectionCheckboxRef(element: Element | ComponentPublicInstance | null) {
  headerSelectionCheckboxRef.value = element instanceof HTMLInputElement ? element : null
}

watchEffect(() => {
  const checkbox = headerSelectionCheckboxRef.value
  if (!checkbox) {
    return
  }
  checkbox.indeterminate = selectionEnabled.value && rowSelection.isIndeterminate.value
})

function handleHeaderSelectionChange(event: Event) {
  if (!selectionEnabled.value) {
    return
  }
  event.stopPropagation()
  const target = event.target as HTMLInputElement | null
  const shouldSelectAll = !(rowSelection.allSelected.value && !rowSelection.isIndeterminate.value)
  if (shouldSelectAll) {
    rowSelection.selectAll()
  } else {
    rowSelection.clearSelection()
  }
  if (target) {
    target.blur()
  }
}

function isSelectableDataRow(row: any): row is RowData {
  return Boolean(row && !(row as any).__group)
}

function isCheckboxRowSelected(row: any): boolean {
  if (!selectionEnabled.value || !isSelectableDataRow(row)) {
    return false
  }
  return rowSelection.isRowSelected(row)
}

function handleRowCheckboxToggle(row: any) {
  if (!selectionEnabled.value || !isSelectableDataRow(row)) {
    return
  }
  rowSelection.toggleRow(row)
}

function rowGridClass(row: any) {
  if (!selectionEnabled.value || !isSelectableDataRow(row)) {
    return undefined
  }
  if (!rowSelection.isRowSelected(row)) return undefined
  return selectedRowClass.value || undefined
}

function handleNearBottom() {
  if (loadingState.value) return
  emit("reach-bottom")
}

let handleAutoScrollFrame: ((event: { lastPointerEvent: MouseEvent | null }) => void) | null = null

const { updateAutoScroll, stopAutoScroll, lastPointerEvent } = useTableAutoScroll({
  containerRef,
  onFrame: event => handleAutoScrollFrame?.(event),
})

let handleZoomUpdated: (() => void) | null = null

const { zoom, zoomStyle, setZoom, adjustZoom, handleZoomWheel } = useTableZoom({
  tableName,
  emitZoomChange: (value: number) => emit("zoom-change", value),
  onZoomUpdated: () => handleZoomUpdated?.(),
  focusContainer,
})

const zoomLayoutScale = computed(() => (supportsCssZoom ? Math.max(zoom.value, 0.01) : 1))
const toDomUnits = (value: number) => value / zoomLayoutScale.value

const zoomModel = computed({
  get: () => zoom.value,
  set: (value: number | string) => {
    const numeric = typeof value === "number" ? value : Number(value)
    setZoom(Number.isFinite(numeric) ? numeric : 1)
  },
})

const zoomPercent = computed(() => Math.round(zoom.value * 100))

let handleViewportAfterScroll: (() => void) | null = null

const viewport = useTableViewport({
  containerRef,
  headerRef,
  processedRows,
  columns: computed(() => visibleColumns.value),
  zoom,
  onAfterScroll: () => handleViewportAfterScroll?.(),
  onNearBottom: handleNearBottom,
  isLoading: loadingState,
  rowHeightMode,
  virtualization: virtualizationEnabled,
})

const {
  scrollTop,
  viewportHeight,
  totalRowCount,
  effectiveRowHeight,
  visibleRowsPool,
  poolSize,
  totalContentHeight,
  startIndex,
  endIndex,
  visibleScrollableEntries,
  pinnedLeftEntries,
  pinnedRightEntries,
  leftPadding,
  rightPadding,
  columnWidthMap,
  handleScroll,
  updateViewportHeight,
  measureRowHeight,
  clampScrollTopValue,
  cancelScrollRaf,
  scrollToRow,
  scrollToColumn,
  isRowVisible,
  debugMode,
  fps,
  refresh,
} = viewport

function findGroupByKey(nodes: GroupNode[], key: string): GroupNode | null {
  for (const node of nodes) {
    if (node.key === key) return node
    const child = findGroupByKey(node.children, key)
    if (child) return child
  }
  return null
}

function refreshGroupedView() {
  nextTick(() => {
    refresh(true)
    updateViewportHeight()
    scheduleOverlayUpdate()
  })
}

function toggleGroupRow(key: string) {
  if (!groupedColumns.value.length) return
  const node = findGroupByKey(groupedTree.value, key)
  if (!node) return
  const current = getGroupExpanded(key)
  setGroupExpanded(key, !current)
  refreshGroupedView()
}

function isGroupExpanded(key: string): boolean {
  return getGroupExpanded(key)
}

function onGroupColumn(column: UiTableColumn) {
  if (!column || column.isSystem) return
  const existingIndex = groupState.value.findIndex(item => item.key === column.key)
  if (existingIndex >= 0) {
    groupState.value = groupState.value.filter(item => item.key !== column.key)
  } else {
    groupState.value = [...groupState.value, { key: column.key, expanded: true }]
  }
  groupExpansion.value = {}
  refreshGroupedView()
}

watch(
  groupState,
  () => {
    refreshGroupedView()
  },
  { deep: true }
)

watch(groupedColumns, () => {
  if (!groupHydrated.value) return
  groupExpansion.value = {}
  refreshGroupedView()
})

watch(
  [groupState, groupExpansion],
  ([state, expansion]) => {
    if (!groupHydrated.value) return
    const columns = state.map(item => item.key)
    tableSettings.setGroupState(tableName, columns, expansion)
  },
  { deep: true }
)

function isGroupRowEntry(entry: VisibleRow | null | undefined): entry is VisibleRow & { row: GroupRowData } {
  return Boolean(entry?.row && (entry.row as any).__group)
}

function groupCellStyle(level: number | null | undefined): Record<string, string> {
  const safeLevel = Number.isFinite(level as number) ? Number(level) : 0
  const indent = GROUP_INDENT_BASE + Math.max(0, safeLevel) * GROUP_INDENT_STEP
  return {
    paddingLeft: `${indent}px`,
  }
}

const rowHeightDom = computed(() => toDomUnits(effectiveRowHeight.value))
const totalContentHeightDom = computed(() => toDomUnits(totalContentHeight.value))
const leftPaddingDom = computed(() => toDomUnits(leftPadding.value))
const rightPaddingDom = computed(() => toDomUnits(rightPadding.value))
const columnWidthDomMap = computed(() => {
  const map = new Map<string, number>()
  columnWidthMap.value.forEach((width, key) => {
    map.set(key, toDomUnits(width))
  })
  return map
})

const pinnedLeftKeys = computed(() => new Set(pinnedLeftEntries.value.map(entry => entry.column.key)))
const pinnedRightKeys = computed(() => new Set(pinnedRightEntries.value.map(entry => entry.column.key)))

const stickyLeftOffsets = computed(() => {
  const offsets = new Map<string, number>()
  let accumulated = 0
  pinnedLeftEntries.value.forEach(entry => {
    offsets.set(entry.column.key, accumulated)
    const width = columnWidthDomMap.value.get(entry.column.key) ?? toDomUnits(entry.width ?? 0)
    accumulated += width
  })
  return offsets
})

const stickyRightOffsets = computed(() => {
  const offsets = new Map<string, number>()
  let accumulated = 0
  const entries = [...pinnedRightEntries.value]
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    offsets.set(entry.column.key, accumulated)
    const width = columnWidthDomMap.value.get(entry.column.key) ?? toDomUnits(entry.width ?? 0)
    accumulated += width
  }
  return offsets
})

const stickyBottomOffsets = computed(() => {
  const offsets = new Map<number, number>()
  const stickyEntries = processedRows.value
    .map(entry => entry)
    .filter(entry => entry.stickyBottom)
  let accumulated = 0
  for (let index = stickyEntries.length - 1; index >= 0; index -= 1) {
    const entry = stickyEntries[index]
    const stickyValue = entry?.stickyBottom
    if (typeof stickyValue === "number") {
      offsets.set(entry.originalIndex, stickyValue)
      accumulated = stickyValue + rowHeightDom.value
    } else {
      offsets.set(entry.originalIndex, accumulated)
      accumulated += rowHeightDom.value
    }
  }
  return offsets
})

const totalRowCountDisplay = computed(() => props.totalRows ?? sortedRows.value.length)

const formattedRowCount = computed(() => rowCountFormatter.format(Math.max(0, totalRowCountDisplay.value ?? 0)))

watch(
  () => props.debugViewport,
  (value: boolean | undefined) => {
    debugMode.value = Boolean(value)
  },
  { immediate: true }
)

const columnTrackStartMap = computed(() => {
  const map = new Map<string, number>()
  let trackIndex = 1

  headerRenderableEntries.value.forEach(entry => {
    if (entry.showLeftFiller) {
      trackIndex += 1
    }

    map.set(entry.metric.column.key, trackIndex)
    trackIndex += 1

    if (entry.showRightFiller) {
      trackIndex += 1
    }
  })

  return map
})

const headerGroupRows = computed<ColumnGroupRenderRows>(() => {
  if (!rootColumnGroups.value.length) return []
  return buildColumnGroupRenderRows(rootColumnGroups.value, columnTrackStartMap.value)
})


const groupedColumnKeys = computed<Set<string> | null>(() => {
  if (!rootColumnGroups.value.length) return null
  const keys = new Set<string>()
  rootColumnGroups.value.forEach(group => {
    group.getDisplayedLeafColumns().forEach(column => {
      keys.add(column.key)
    })
  })
  ungroupedColumns.value.forEach(column => keys.add(column.key))
  return keys
})

const hasColumnGroups = computed(() => headerGroupRows.value.length > 0 && (groupedColumnKeys.value?.size ?? 0) > 0)

function getColumnIndex(columnKey: string) {
  const visibleIndex = visibleColumnIndexMap.value.get(columnKey)
  if (visibleIndex != null) {
    return visibleIndex
  }
  const fallbackIndex = localColumns.value.findIndex(column => column.key === columnKey)
  if (fallbackIndex !== -1) {
    return fallbackIndex
  }
  const trackEntry = columnTrackStartMap.value.get(columnKey)
  if (trackEntry != null) {
    return trackEntry - 1
  }
  return 0
}

function reorderColumns(nextColumnsOrder: UiTableColumn[]) {
  const orderMap = new Map(nextColumnsOrder.map((column, index) => [column.key, index]))
  const nextColumns = localColumns.value
    .map((column, originalIndex) => ({ column: { ...column }, originalIndex }))
    .sort((a, b) => {
      const orderA = orderMap.has(a.column.key) ? orderMap.get(a.column.key)! : Number.MAX_SAFE_INTEGER
      const orderB = orderMap.has(b.column.key) ? orderMap.get(b.column.key)! : Number.MAX_SAFE_INTEGER
      if (orderA === orderB) {
        return a.originalIndex - b.originalIndex
      }
      return orderA - orderB
    })
    .map(entry => entry.column)

  localColumns.value = nextColumns
  const snapshot = updateVisibilityMapFromColumns(nextColumns)
  persistColumnState(snapshot)
  nextTick(() => {
    updateViewportHeight()
    scheduleOverlayUpdate()
  })
}

function handleHeaderReorder(entries: HeaderRenderableEntry[]) {
  const queue = entries
    .map(entry => entry.metric.column)
    .filter(column => !column.isSystem)
  const orderedColumns: UiTableColumn[] = []
  headerRenderableEntries.value.forEach(entry => {
    if (entry.metric.column.isSystem) {
      orderedColumns.push(entry.metric.column)
      return
    }
    const next = queue.shift()
    if (next) {
      orderedColumns.push(next)
    }
  })
  if (queue.length) {
    orderedColumns.push(...queue)
  }
  reorderColumns(orderedColumns)
  reorderPinnedColumns()
}

type ViewportApi = typeof viewport
type ColumnEntry = ViewportApi["visibleColumnEntries"]["value"][number]

interface HeaderRenderableEntry {
  metric: ColumnEntry
  showLeftFiller: boolean
  showRightFiller: boolean
}

const headerRenderableEntries = computed<HeaderRenderableEntry[]>(() => {
  const entries: HeaderRenderableEntry[] = []
  const includeLeftFiller = leftPadding.value > 0
  const includeRightFiller = rightPadding.value > 0

  pinnedLeftEntries.value.forEach(metric => {
    entries.push({ metric, showLeftFiller: false, showRightFiller: false })
  })

  const scrollable = visibleScrollableEntries.value
  scrollable.forEach((metric, index) => {
    entries.push({
      metric,
      showLeftFiller: includeLeftFiller && index === 0,
      showRightFiller: includeRightFiller && index === scrollable.length - 1,
    })
  })

  pinnedRightEntries.value.forEach(metric => {
    entries.push({ metric, showLeftFiller: false, showRightFiller: false })
  })

  return entries
})

const visibleColumnEntries = computed(() => headerRenderableEntries.value)

const headerSystemEntries = computed(() => headerRenderableEntries.value.filter(entry => entry.metric.column.isSystem))
const headerDraggableEntries = computed(() => headerRenderableEntries.value.filter(entry => !entry.metric.column.isSystem))

const visibleColumnIndexMap = computed(() => {
  const map = new Map<string, number>()
  visibleColumnEntries.value.forEach(entry => {
    const columnKey = entry.metric.column.key
    const columnIndex = entry.metric.index
    if (Number.isInteger(columnIndex)) {
      map.set(columnKey, columnIndex)
    }
  })
  return map
})

const gridTemplateColumns = computed(() => {
  const segments: string[] = []

  headerRenderableEntries.value.forEach(entry => {
    if (entry.showLeftFiller) {
      segments.push(`${Math.max(0, leftPaddingDom.value)}px`)
    }

    const columnKey = entry.metric.column.key
    const layoutWidth = columnWidthMap.value.get(columnKey) ?? entry.metric.width ?? 0
    const domWidth = toDomUnits(layoutWidth)
    segments.push(`${Math.max(0, domWidth)}px`)

    if (entry.showRightFiller) {
      segments.push(`${Math.max(0, rightPaddingDom.value)}px`)
    }
  })

  return segments.length ? segments.join(" ") : "1fr"
})

function inlineColumnWidth(entry: HeaderRenderableEntry): string | undefined {
  const column = entry.metric.column
  const measured =
    column.width ??
    columnWidthMap.value.get(column.key) ??
    entry.metric.width ??
    column.minWidth
  const width = typeof measured === "number" && Number.isFinite(measured) ? measured : undefined
  if (typeof width === "number" && Number.isFinite(width) && width > 0) {
    return `${Math.round(width)}px`
  }
  return undefined
}

const headerItemStyle = (entry: HeaderRenderableEntry, _index?: number): Record<string, string> | undefined => {
  const columnKey = entry.metric.column.key
  const trackStart = columnTrackStartMap.value.get(columnKey)
  if (trackStart == null) {
    return undefined
  }
  return {
    gridColumn: `${trackStart} / span 1`,
  }
}

const headerColumnWidthStyle = (entry: HeaderRenderableEntry): Record<string, string> => {
  const width = inlineColumnWidth(entry)
  return width ? { width } : {}
}

const headerItemDraggable = (entry: HeaderRenderableEntry) => !entry.metric.column.isSystem

interface PooledRowEntry {
  poolIndex: number
  entry: VisibleRow | null
  displayIndex: number
}

const pooledRows = computed<PooledRowEntry[]>(() => {
  const size = poolSize.value
  const rows = visibleRowsPool.value
  const baseStart = startIndex.value
  const items: PooledRowEntry[] = []
  for (let index = 0; index < size; index += 1) {
    const entry = rows[index] ?? null
    const displayIndex = entry?.displayIndex ?? baseStart + index
    items.push({ poolIndex: index, entry, displayIndex })
  }
  return items
})

const searchHighlightMap = computed(() => {
  if (!findReplace.matches.length) {
    return new Map<string, { active: boolean }>()
  }
  const visibleRows = new Set<number>()
  for (const pooled of pooledRows.value) {
    const entry = pooled.entry
    if (!entry || isGroupRowEntry(entry)) continue
    const index = entry.displayIndex ?? pooled.displayIndex
    if (typeof index === "number" && index >= 0) {
      visibleRows.add(index)
    }
  }
  const map = new Map<string, { active: boolean }>()
  const activeKey = findReplace.activeMatchKey
  for (const match of findReplace.matches) {
    if (!visibleRows.has(match.rowIndex)) continue
    const key = makeSearchKey(match.rowIndex, match.columnKey)
    map.set(key, { active: activeKey === key })
  }
  return map
})

function makeSearchKey(rowIndex: number, columnKey: string) {
  return `${rowIndex}:${columnKey}`
}

function isSearchMatchCell(rowIndex: number | null | undefined, columnKey: string) {
  if (rowIndex == null || rowIndex < 0) return false
  return searchHighlightMap.value.has(makeSearchKey(rowIndex, columnKey))
}

function isActiveSearchMatchCell(rowIndex: number | null | undefined, columnKey: string) {
  if (rowIndex == null || rowIndex < 0) return false
  return searchHighlightMap.value.get(makeSearchKey(rowIndex, columnKey))?.active ?? false
}

const virtualContainerStyle = computed<CSSProperties>(() => ({
  gridColumn: "1 / -1",
  position: "relative",
  height: `${totalContentHeightDom.value}px`,
}))

const headerGridStyle = computed<CSSProperties>(() => ({
  display: "grid",
  gridTemplateColumns: gridTemplateColumns.value,
  alignItems: "stretch",
}))

const tableGridStyle = computed<CSSProperties>(() => ({
  display: "grid",
  gridTemplateColumns: gridTemplateColumns.value,
  gridTemplateRows: "auto",
}))

const headerRowStickyStyle = computed<CSSProperties>(() => ({
  position: "sticky",
  top: "0px",
  zIndex: 45,
}))

const rowGridStyle = computed<CSSProperties>(() => ({
  display: "grid",
  gridTemplateColumns: gridTemplateColumns.value,
  gridAutoRows: `${rowHeightDom.value}px`,
}))

function rowLayerStyle(pooled: PooledRowEntry): CSSProperties {
  const baseIndex = startIndex.value + pooled.poolIndex
  const translateY = baseIndex * rowHeightDom.value
  const style: CSSProperties = {
    position: "absolute",
    top: "0",
    left: "0",
    transform: `translate3d(0, ${translateY}px, 0)`,
    height: `${rowHeightDom.value}px`,
    width: "100%",
  }
  if (!pooled.entry) {
    style.visibility = "hidden"
    style.pointerEvents = "none"
    return style
  }
  const bottomOffset = stickyBottomOffsets.value.get(pooled.entry.originalIndex)
  if (bottomOffset != null) {
    style.position = "sticky"
    style.top = "auto"
    style.bottom = `${bottomOffset}px`
    style.transform = "none"
    style.zIndex = 8
  }
  // For the first sticky row always set top to the header height
  if (pooled.entry.stickyTop && pooled.displayIndex === 0) {
    style.top = `var(--ui-table-header-height, 40px)`
  }
  return style
}

let applyHistoryEntries: (entries: HistoryEntry[], direction: "undo" | "redo") => CellEditEvent[] = () => []
let historyAppliedCallback: ((direction: "undo" | "redo", events: CellEditEvent[]) => void) | null = null

const { undo, redo, recordHistory, isApplyingHistory } = useTableHistory({
  applyEntries: (entries, direction) => applyHistoryEntries(entries, direction),
  onHistoryApplied: (direction, events) => historyAppliedCallback?.(direction, events),
})

// Emit a single-cell edit event to parent listeners
function emitCellEdit(event: CellEditEvent) {
  emit("cell-edit", event)
}

// Emit a batch edit event with cloned payload to avoid mutations
function emitBatchEdit(events: CellEditEvent[]) {
  emit("batch-edit", events.map(item => ({ ...item })))
}

const editing = useTableEditing({
  processedRows,
  localColumns: computed(() => visibleColumns.value),
  emitCellEdit,
  emitBatchEdit,
  recordHistory,
  isApplyingHistory,
})

const {
  validationErrors,
  getValidationError,
  setCellValueDirect,
  setCellValue,
  setCellValueFromPaste,
  getCellValue,
  getCellRawValue,
  dispatchEvents,
  onCellEdit,
  onCellEditingChange: internalOnCellEditingChange,
  requestEdit,
  isEditingCell,
  editCommand,
} = editing

watch(
  isEditingCell,
  (value: boolean) => {
    if (!value) {
      nextTick(() => focusContainer())
    }
  }
)

function handleCellEditingChange(editingState: boolean, columnKey: string, originalIndex: number | null | undefined) {
  internalOnCellEditingChange(editingState)
  if (!editingState) return
  if (!activeFilterColumns.value.has(columnKey)) return
  if (typeof originalIndex !== "number") return
  addSuspendedFilterRow(columnKey, originalIndex)
}

const isColumnEditable = (column: UiTableColumn | undefined) => {
  if (column?.isSystem) return false
  return baseIsColumnEditable(column)
}

// Replay history entries into the grid and return dispatched events
applyHistoryEntries = (entries, direction) => {
  const events: CellEditEvent[] = []
  for (const entry of entries) {
    const value = direction === "undo" ? entry.oldValue : entry.newValue
    setCellValueDirect(entry.rowIndex, entry.colIndex, value, {
      collector: events,
      suppressHistory: true,
      force: true,
    })
  }
  return events
}

const selection = useTableSelection({
  containerRef,
  localColumns: computed(() => visibleColumns.value),
  processedRows,
  totalRowCount,
  viewport: {
    effectiveRowHeight,
    viewportHeight,
    scrollTop,
    clampScrollTopValue,
    scrollToColumn,
  },
  isEditingCell,
  focusContainer,
  emitSelectionChange: snapshot => emit("selection-change", snapshot),
  setCellValueDirect,
  setCellValueFromPaste,
  getCellRawValue,
  dispatchEvents,
  recordHistory,
  stopAutoScroll,
  updateAutoScroll,
  lastPointerEvent,
  deleteRows: rows => emit("rows-delete", rows),
  rowIndexColumnKey: props.showRowIndexColumn !== false ? ROW_INDEX_COLUMN_KEY : undefined,
})

const {
  selectedCell,
  anchorCell,
  fillHandleStyle,
  setSelection,
  clearSelection,
  focusCell,
  moveByPage,
  getSelectionSnapshot,
  getActiveRange,
  selectCell,
  getSelectedCells,
  fullRowSelection,
  fullColumnSelection,
  isCellSelected,
  isCellInSelectionRange,
  isCellInFillPreview,
  isRowFullySelected,
  isColumnFullySelected,
  isColumnInSelectionRect,
  getSelectionEdges,
  getFillPreviewEdges,
  rowHeaderClass,
  onCellSelect,
  onRowIndexClick,
  onColumnHeaderClick,
  onCellDragStart,
  onCellDragEnter,
  moveSelection,
  moveByTab,
  goToRowEdge,
  goToColumnEdge,
  goToGridEdge,
  triggerEditForSelection,
  clearSelectionValues,
  applyMatrixToSelection,
  buildSelectionMatrix,
  startFillDrag,
  autoFillDownFromActiveRange: autoFillDown,
  scheduleOverlayUpdate,
  handleAutoScrollFrame: internalHandleAutoScrollFrame,
  lastCommittedFillArea,
} = selection

function isActiveCell(rowIndex: number, colIndex: number) {
  const active = anchorCell.value ?? selectedCell.value
  return Boolean(active && active.rowIndex === rowIndex && active.colIndex === colIndex)
}

function getCellTabIndex(rowIndex: number, colIndex: number) {
  return isActiveCell(rowIndex, colIndex) ? 0 : -1
}

function getCellDomId(rowIndex: number, columnKey: string) {
  return `ui-table-cell-${rowIndex}-${columnKey}`
}

function getAriaRowIndex(displayIndex: number) {
  return displayIndex + 1
}

function getAriaColIndex(colIndex: number) {
  return colIndex + 1
}

function getHeaderTabIndex(colIndex: number) {
  const active = anchorCell.value ?? selectedCell.value
  if (active?.colIndex === colIndex) return 0
  if (!active && colIndex === 0) return 0
  return -1
}

function focusActiveCellElement(preventScroll = true) {
  const active = anchorCell.value ?? selectedCell.value
  if (!active) return false
  const column = visibleColumns.value[active.colIndex]
  if (!column) return false
  const cell = getCellElement(containerRef.value, active.rowIndex, column.key)
  if (!cell) return false
  cell.focus({ preventScroll })
  isGridFocused.value = true
  return true
}

function onCellComponentFocus(payload: { rowIndex: number; colIndex: number; columnKey: string }) {
  const focused = selectedCell.value ?? anchorCell.value
  const withinRange = isCellInSelectionRange(payload.rowIndex, payload.colIndex)
  if (
    focused &&
    focused.rowIndex === payload.rowIndex &&
    focused.colIndex === payload.colIndex
  ) {
    isGridFocused.value = true
    return
  }

  if (withinRange) {
    isGridFocused.value = true
    return
  }

  selectCell(payload.rowIndex, payload.columnKey, false, { colIndex: payload.colIndex })
  isGridFocused.value = true
}

function onGridFocusIn(event: FocusEvent) {
  const container = containerRef.value
  if (!container) return
  isGridFocused.value = true
  if (event.target === container) {
    nextTick(() => focusActiveCellElement())
  }
}

function onGridFocusOut(event: FocusEvent) {
  const container = containerRef.value
  if (!container) {
    isGridFocused.value = false
    return
  }
  const nextTarget = event.relatedTarget as Node | null
  if (!nextTarget || !container.contains(nextTarget)) {
    isGridFocused.value = false
  }
}

watch(
  anchorCell,
  () => {
    if (!isGridFocused.value) return
    nextTick(() => focusActiveCellElement())
  }
)

findReplace.setContext({
  getRows: () => processedRows.value,
  getColumns: () => visibleColumns.value,
  scrollToCell: async (rowIndex, columnKey) => {
    scrollToRow(rowIndex)
    scrollToColumn(columnKey)
    await nextTick()
  },
  selectCell: (rowIndex, columnKey) => {
    focusCell(rowIndex, columnKey)
  },
  getCellValue: (rowIndex, columnKey) => getCellValue(rowIndex, columnKey),
  setCellValue: (rowIndex, columnKey, value) => setCellValue(rowIndex, columnKey, value),
  focusContainer: () => focusContainer(),
  undo,
  redo,
})

watch(
  () => {
    const cell = anchorCell.value ?? selectedCell.value
    return cell ? cell.colIndex : null
  },
  colIndex => {
    if (colIndex == null || colIndex < 0) {
      findReplace.setActiveColumn(null)
      return
    }
    const column = visibleColumns.value[colIndex]
    findReplace.setActiveColumn(column?.key ?? null)
  },
  { immediate: true }
)

watch(
  () => visibleColumns.value.map(column => column.key).join("|"),
  () => {
    const cell = anchorCell.value ?? selectedCell.value
    if (!cell) {
      findReplace.setActiveColumn(null)
      return
    }
    const column = visibleColumns.value[cell.colIndex]
    findReplace.setActiveColumn(column?.key ?? null)
  }
)

handleAutoScrollFrame = () => internalHandleAutoScrollFrame()
handleViewportAfterScroll = () => scheduleOverlayUpdate()
handleZoomUpdated = () => {
  updateViewportHeight()
  measureRowHeight()
  scheduleOverlayUpdate()
}
const { flash } = useCellFlash()
historyAppliedCallback = (direction, events) => {
  dispatchEvents(events)
  scheduleOverlayUpdate()
  if (!events.length) return
  const historyDirection = direction
  nextTick(() => {
    const container = containerRef.value
    if (!container) return
    const changedCells: HTMLElement[] = []
    for (const event of events) {
      const displayRowIndex = event.displayRowIndex ?? event.rowIndex
      if (displayRowIndex == null || displayRowIndex < 0) continue
      const columnKey = String(event.key)
      const cell = getCellElement(container, displayRowIndex, columnKey)
      if (cell) {
        changedCells.push(cell)
      }
    }
    if (changedCells.length) {
      const flashType = historyDirection === "undo" ? "undo" : "redo"
      flash(changedCells, flashType)
    }
  })
}

watch(
  lastCommittedFillArea,
  area => {
    if (!area) return
    const cells = getCellsForArea(area)
    if (cells.length) {
      flash(cells, 'fill')
    }
    lastCommittedFillArea.value = null
  },
  { flush: 'post' }
)

const { copySelectionToClipboard, pasteClipboardData, exportCSV, importCSV } = useTableClipboard({
  getActiveRange,
  buildSelectionMatrix,
  applyMatrixToSelection: (matrix, baseOverride) => {
    const base = baseOverride ?? anchorCell.value ?? selectedCell.value ?? getActiveRange()?.anchor ?? null
    const rows = matrix.length
    const cols = matrix[0]?.length ?? 0
    const result = applyMatrixToSelection(matrix, baseOverride)
    if (!containerRef.value || !base || !rows || !cols) return result
    const area = {
      startRow: base.rowIndex,
      endRow: base.rowIndex + rows - 1,
      startCol: base.colIndex,
      endCol: base.colIndex + cols - 1,
    }
    const cells = getCellsForArea(area)
    if (cells.length) {
      flash(cells, 'paste')
    }
    return result
  },
})

const selectionMetricDisplay = computed(() => {
  const cells = getSelectedCells()
  const numericValues: number[] = []

  for (const cell of cells) {
    const raw = cell.value
    let numeric: number | null = null
    if (typeof raw === "number") {
      numeric = Number.isFinite(raw) ? raw : null
    } else if (typeof raw === "bigint") {
      numeric = Number(raw)
    } else if (typeof raw === "boolean") {
      numeric = raw ? 1 : 0
    } else if (typeof raw === "string") {
      const normalized = raw.replace(/\s+/g, "").replace(/,/g, "")
      const parsed = Number.parseFloat(normalized)
      numeric = Number.isFinite(parsed) ? parsed : null
    } else if (raw != null) {
      const coerced = Number(raw)
      numeric = Number.isFinite(coerced) ? coerced : null
    }

    if (numeric !== null && Number.isFinite(numeric)) {
      numericValues.push(numeric)
    }
  }

  if (!numericValues.length) {
    return {
      sum: "—",
      min: "—",
      max: "—",
      avg: "—",
    }
  }

  const sum = numericValues.reduce((total, value) => total + value, 0)
  const min = Math.min(...numericValues)
  const max = Math.max(...numericValues)
  const avg = sum / numericValues.length

  return {
    sum: numericSummaryFormatter.format(sum),
    min: numericSummaryFormatter.format(min),
    max: numericSummaryFormatter.format(max),
    avg: numericSummaryFormatter.format(avg),
  }
})

// Collect cell elements for a rectangular area within the grid
function getCellsForArea(area: { startRow: number; endRow: number; startCol: number; endCol: number }): HTMLElement[] {
  const container = containerRef.value
  if (!container) return []
  const normalized = {
    startRow: Math.min(area.startRow, area.endRow),
    endRow: Math.max(area.startRow, area.endRow),
    startCol: Math.min(area.startCol, area.endCol),
    endCol: Math.max(area.startCol, area.endCol),
  }
  return getCellElementsByRange(container, normalized, visibleColumns.value)
}

// Gather cells and headers that should flash on copy action
function collectCellsForCopyFlash(): HTMLElement[] {
  const container = containerRef.value
  if (!container) return []
  const unique = new Set<HTMLElement>()
  const processedColumns = new Set<number>()

  const addColumnHeader = (colIndex: number) => {
    if (processedColumns.has(colIndex)) return
    processedColumns.add(colIndex)
    const column = visibleColumns.value[colIndex]
    if (!column) return
    const header = container.querySelector<HTMLElement>(`.ui-table-header-cell[data-column-key="${column.key}"]`)
    if (header) {
      unique.add(header)
    }
  }
  const snapshot = getSelectionSnapshot()
  for (const range of snapshot.ranges) {
    const cells = getCellsForArea({
      startRow: range.startRow,
      endRow: range.endRow,
      startCol: range.startCol,
      endCol: range.endCol,
    })
    cells.forEach(cell => unique.add(cell))
    const startCol = Math.min(range.startCol, range.endCol)
    const endCol = Math.max(range.startCol, range.endCol)
    for (let col = startCol; col <= endCol; col += 1) {
      addColumnHeader(col)
    }
  }
  if (!snapshot.ranges.length) {
    const active = anchorCell.value ?? selectedCell.value
    if (active) {
      const cellArea = {
        startRow: active.rowIndex,
        endRow: active.rowIndex,
        startCol: active.colIndex,
        endCol: active.colIndex,
      }
      getCellsForArea(cellArea).forEach(cell => unique.add(cell))
      addColumnHeader(active.colIndex)
    }
  }
  if (fullRowSelection.value) {
    const startRow = Math.min(fullRowSelection.value.start, fullRowSelection.value.end)
    const endRow = Math.max(fullRowSelection.value.start, fullRowSelection.value.end)
    for (let row = startRow; row <= endRow; row += 1) {
      getRowCellElements(container, row).forEach(cell => unique.add(cell))
    }
  }
  if (fullColumnSelection.value !== null) {
    const column = visibleColumns.value[fullColumnSelection.value]
    if (column) {
      getColumnCellElements(container, column.key).forEach(cell => unique.add(cell))
      addColumnHeader(fullColumnSelection.value)
    }
  }
  return Array.from(unique)
}

// Wrapper to add flash feedback when copying selection
// Copy current selection and trigger visual feedback
async function copySelectionToClipboardWithFlash() {
  const cells = collectCellsForCopyFlash()
  if (cells.length) {
    flash(cells, 'copy')
  }
  await copySelectionToClipboard()
}

// Wrapper to add flash feedback once paste is committed
// Paste clipboard data and highlight affected cells once applied
async function pasteClipboardDataWithFlash() {
  await pasteClipboardData()
  await nextTick()
  const container = containerRef.value
  if (!container) return
  const snapshot = getSelectionSnapshot()
  const unique = new Set<HTMLElement>()
  if (snapshot.ranges.length) {
    for (const range of snapshot.ranges) {
      const area = {
        startRow: Math.min(range.startRow, range.endRow),
        endRow: Math.max(range.startRow, range.endRow),
        startCol: Math.min(range.startCol, range.endCol),
        endCol: Math.max(range.startCol, range.endCol),
      }
      const cells = getCellsForArea(area)
      cells.forEach(cell => unique.add(cell))
    }
  } else {
    const active = anchorCell.value ?? selectedCell.value
    if (active) {
      const { rowIndex, colIndex } = active
      const cells = getCellsForArea({
        startRow: rowIndex,
        endRow: rowIndex,
        startCol: colIndex,
        endCol: colIndex,
      })
      cells.forEach(cell => unique.add(cell))
    }
  }
  if (unique.size) {
    flash(Array.from(unique), 'paste')
  }
}

function handleColumnsVisibilityUpdate(payload: VisibilitySnapshot[]) {
  if (!payload.length) return
  applyStoredColumnState(payload)
  nextTick(() => {
    updateViewportHeight()
    scheduleOverlayUpdate()
  })
}

function resetColumnVisibility() {
  localColumns.value = localColumns.value.map(column => {
    return { ...column, visible: true }
  })
  const snapshot = updateVisibilityMapFromColumns(localColumns.value)
  persistColumnState(snapshot)

  nextTick(() => {
    updateViewportHeight()
    scheduleOverlayUpdate()
  })
}

const tableEvents = useTableEvents({
  isEditingCell,
  focusContainer,
  selection: {
    moveSelection,
    moveByTab,
    moveByPage,
    triggerEditForSelection,
    clearSelectionValues,
    selectCell,
    scheduleOverlayUpdate,
    goToRowEdge,
    goToColumnEdge,
    goToGridEdge,
  },
  clipboard: {
    copySelectionToClipboard,
    pasteClipboardData,
    copySelectionToClipboardWithFlash,
    pasteClipboardDataWithFlash,
  },
  history: {
    undo,
    redo,
  },
  zoom: {
    handleZoomWheel,
    adjustZoom,
    setZoom,
  },
  requestEdit,
})

const { handleWheel, focusNextCell } = tableEvents

function handleKeydown(event: KeyboardEvent) {
  if (findReplace.isActive) return
  tableEvents.handleKeydown(event)
}

const hasSummaryRow = computed(() => Boolean(props.summaryRow) || Boolean(tableSlots.summary))

const ariaRowCount = computed(() => {
  const total = totalRowCountDisplay.value ?? resolvedRows.value.length
  const summaryOffset = hasSummaryRow.value ? 1 : 0
  return Math.max(1, (total ?? 0) + summaryOffset)
})

const summaryRowAriaIndex = computed(() => {
  const total = totalRowCountDisplay.value ?? resolvedRows.value.length
  return total + 1
})

// Determine if a scoped slot overrides the default cell renderer
function hasCustomRenderer(columnKey: string) {
  return Boolean(tableSlots[`cell-${columnKey}`])
}

// Check if a column header should render highlighted state
function isColumnHeaderHighlighted(colIndex: number) {
  return (
    isColumnFullySelected(colIndex) ||
    (anchorCell.value ?? selectedCell.value)?.colIndex === colIndex ||
    isColumnInSelectionRect(colIndex)
  )
}

// Close column menu and restore focus to the grid
function onColumnMenuClose(columnKey: string) {
  internalOnColumnMenuClose(columnKey)
  focusContainer()
}

// Persist updated column width and notify subscribers
function onColumnResize(key: string, newWidth: number) {
  const index = localColumns.value.findIndex(column => column.key === key)
  if (index === -1) return
  const nextColumns = [...localColumns.value]
  const target = nextColumns[index]
  nextColumns[index] = { ...target, width: newWidth }
  localColumns.value = nextColumns
  tableSettings.setColumnWidth(tableName, key, newWidth)
  emit("column-resize", { key, width: newWidth })
  nextTick(() => updateViewportHeight())
}

watch(
  () => resolvedRows.value.length,
  () => {
    ensureSortedOrder()
    nextTick(() => {
      updateViewportHeight()
      scheduleOverlayUpdate()
      refresh(true)
    })
  }
)

watch(
  () => processedRows.value,
  () => {
    refresh(true)
  }
)

watch(
  () => [columnFilters.value, filtersState.value],
  () => {
    refresh(true)
    scheduleOverlayUpdate()
  },
  { deep: true }
)

watch(
  totalRowCount,
  () => {
    nextTick(() => {
      const maxRow = totalRowCount.value - 1
      for (const key of Object.keys(validationErrors)) {
        const [row] = key.split(":")
        const index = Number(row)
        if (Number.isInteger(index) && index > maxRow) {
          delete validationErrors[key]
        }
      }
    })
  }
)

watch(
  () => props.summaryRow,
  () => {
    nextTick(() => measureRowHeight())
  }
)

watch(
  () => visibleColumns.value.length,
  () => {
    nextTick(() => {
      updateViewportHeight()
      scheduleOverlayUpdate()
    })
  }
)

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable
}

function isEventInsideTable(target: EventTarget | null) {
  const container = containerRef.value
  if (!container || !(target instanceof Node)) return false
  return container.contains(target)
}

function openFindModal() {
  findReplace.activate("find")
}

function openReplaceModal() {
  findReplace.activate("replace")
}

function closeFindReplace() {
  findReplace.deactivate()
  findReplace.clearResults()
  nextTick(() => focusContainer())
}

function handleGlobalKeydown(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  const ctrlOrMeta = event.metaKey || event.ctrlKey
  if (!ctrlOrMeta) return
  const insideTable = isEventInsideTable(event.target)
  const active = findReplace.isActive
  const target = event.target as HTMLElement | null
  const pageRoot = document.querySelector("[data-ui-page]")
  const insidePage = pageRoot ? pageRoot.contains(target) : false
  if (!active && !insideTable && !insidePage) return
  if (!active && isEditableTarget(event.target)) return
  if (key === "f") {
    event.preventDefault()
    openFindModal()
  } else if (key === "h") {
    event.preventDefault()
    openReplaceModal()
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleGlobalKeydown, true)
})

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleGlobalKeydown, true)
  cancelScrollRaf()
  headerResizeObserver?.disconnect()
  headerResizeObserver = null
  // closeActiveMenu() // Commented out to prevent resetting the filter manually
})

// --- FilterPopover event handlers ---
// Confirm selected filter options from popover
function onApplyFilter() {
  confirmFilterSelection()
}
// Revert pending filter changes from popover
function onCancelFilter() {
  cancelFilterSelection()
}
// Apply a one-off sort action from the filter menu
function onSortColumn(dir: string) {
  if (filterMenuState.columnKey) {
    applySort(filterMenuState.columnKey, dir as any)
  }
  cancelFilterSelection()
}
// Clear all filter criteria for the active column
function onResetFilter() {
  if (filterMenuState.columnKey) {
    clearFilterForColumn(filterMenuState.columnKey)
  }
}

function handleResetAllFilters() {
  if (!hasActiveFiltersOrGroups.value) return
  clearSuspendedFilterRows()
  if (hasActiveFilters.value) {
    resetAllFilters()
  }
  handleAdvancedModalCancel()
  if (groupState.value.length) {
    groupState.value = []
  }
  if (Object.keys(groupExpansion.value).length) {
    groupExpansion.value = {}
  }
  emit("filters-reset")
  nextTick(() => {
    refresh(true)
    scheduleOverlayUpdate()
    focusContainer()
  })
}

function applyAdvancedFilterCondition(columnKey: string, condition: FilterCondition | null) {
  if (condition && condition.clauses?.length) {
    setAdvancedFilter(columnKey, {
      type: condition.type,
      clauses: condition.clauses,
    })
  } else {
    clearAdvancedFilter(columnKey)
  }

  nextTick(() => {
    refresh(true)
    scheduleOverlayUpdate()
  })
}

function openAdvancedFilterModal(columnKey: string) {
  advancedModalState.columnKey = columnKey
  advancedModalState.open = true
  closeActiveMenu()
}

function handleAdvancedModalApply(condition: FilterCondition | null) {
  const targetColumn = advancedModalState.columnKey
  if (!targetColumn) {
    handleAdvancedModalCancel()
    return
  }

  applyAdvancedFilterCondition(targetColumn, condition)

  handleAdvancedModalCancel()
}

function handleAdvancedModalClear() {
  const targetColumn = advancedModalState.columnKey
  if (!targetColumn) return
  clearAdvancedFilter(targetColumn)
}

function handleAdvancedModalCancel() {
  advancedModalState.open = false
  advancedModalState.columnKey = null
}

function handleAdvancedFilterApply(columnKey: string, condition: FilterCondition | null) {
  applyAdvancedFilterCondition(columnKey, condition)
}

function handleAdvancedFilterClear(columnKey: string) {
  clearAdvancedFilter(columnKey)
}

// Toggle sort or column selection depending on modifier keys
function handleColumnHeaderClick(column: UiTableColumn, colIndex: number, event: MouseEvent | KeyboardEvent) {
  const isSortable = !column.isSystem && column.sortable !== false
  const shouldSelectColumn = !isSortable || event.metaKey || event.ctrlKey
  if (shouldSelectColumn) {
    onColumnHeaderClick(colIndex)
    return
  }
  toggleColumnSort(column.key, event.shiftKey)
  focusContainer()
}

defineExpose({
  scrollToRow,
  scrollToColumn,
  isRowVisible,
  setSelection,
  clearSelection,
  focusCell,
  getSelectionSnapshot,
  copySelectionToClipboard: copySelectionToClipboardWithFlash,
  pasteClipboardData: pasteClipboardDataWithFlash,
  copySelectionToClipboardWithFlash,
  pasteClipboardDataWithFlash,
  getCellValue,
  setCellValue,
  getSelectedCells,
  exportCSV,
  importCSV,
  undo,
  redo,
  onApplyFilter,
  onCancelFilter,
  onSortColumn,
  onResetFilter,
  openAdvancedFilterModal,
  handleAdvancedModalApply,
  handleAdvancedModalClear,
  handleAdvancedModalCancel,
  handleAdvancedFilterApply,
  handleAdvancedFilterClear,
  setMultiSortState,
  handleColumnHeaderClick,
  resetColumnVisibility,
  openVisibilityPanel,
  closeVisibilityPanel,
  resetAllFilters: handleResetAllFilters,
  onGroupColumn,
  toggleGroupRow,
  getFilteredRowEntries,
  getFilteredRows,
  getFilterStateSnapshot,
  setFilterStateSnapshot,
  selectAllRows: rowSelection.selectAll,
  clearRowSelection: rowSelection.clearSelection,
  toggleRowSelection: rowSelection.toggleRow,
  getSelectedRows: () => rowSelection.selectedRows.value,
})


// --- Sticky helpers ---
function resolveColumnPinState(column: UiTableColumn): ColumnPinPosition {
  if (column.isSystem) return "left"
  const raw = (column as any).pin ?? (column as any).pinned ?? column.sticky
  if (raw === "left") return "left"
  if (raw === "right") return "right"
  if (column.stickyLeft === true) return "left"
  if (column.stickyRight === true) return "right"
  return "none"
}

function applyPinProps(column: UiTableColumn, position: ColumnPinPosition): UiTableColumn {
  if (column.isSystem) return column
  const next = { ...column }
  if (position === "none") {
    delete (next as any).pin
    delete (next as any).pinned
    delete (next as any).sticky
    delete (next as any).stickyLeft
    delete (next as any).stickyRight
  } else {
    (next as any).pin = position
      ; (next as any).pinned = position
    next.sticky = position
    if (position === "left") {
      next.stickyLeft = true
      delete (next as any).stickyRight
    } else {
      next.stickyRight = true
      delete (next as any).stickyLeft
    }
  }
  return next
}

function reorderPinnedColumns() {
  const columns = localColumns.value
  const left = columns.filter(column => !column.isSystem && resolveColumnPinState(column) === "left")
  const right = columns.filter(column => !column.isSystem && resolveColumnPinState(column) === "right")
  if (!left.length && !right.length) return

  const system = columns.filter(column => column.isSystem)
  const middle = columns.filter(column => !column.isSystem && resolveColumnPinState(column) === "none")
  const desiredOrder = [...system, ...left, ...middle, ...right]
  const currentOrder = columns.map(column => column.key).join("|")
  const nextOrder = desiredOrder.map(column => column.key).join("|")
  if (currentOrder === nextOrder) return
  reorderColumns(desiredOrder)
}

function handleColumnPin(column: UiTableColumn, position: ColumnPinPosition) {
  if (column.isSystem) return
  localColumns.value = localColumns.value.map(col => (col.key === column.key ? applyPinProps(col, position) : col))
  reorderPinnedColumns()
  tableSettings.setPinState(tableName, column.key, position)
  closeActiveMenu()
  nextTick(() => {
    updateViewportHeight()
    scheduleOverlayUpdate()
  })
}

function isColumnLeftSticky(column: UiTableColumn): boolean {
  if (column.sticky === "left") return true
  if (column.isSystem) return true
  if (column.stickyLeft === true) return true
  if (typeof column.stickyLeft === "number") return true
  if (pinnedLeftKeys.value.has(column.key)) return true
  return false
}

function isColumnRightSticky(column: UiTableColumn): boolean {
  if (column.sticky === "right") return true
  if (column.stickyRight === true) return true
  if (typeof column.stickyRight === "number") return true
  if (pinnedRightKeys.value.has(column.key)) return true
  return false
}

function isColumnSticky(column: UiTableColumn): boolean {
  return isColumnLeftSticky(column) || isColumnRightSticky(column)
}

function getStickySide(column: UiTableColumn): "left" | "right" | null {
  if (isColumnLeftSticky(column)) return "left"
  if (isColumnRightSticky(column)) return "right"
  return null
}

function getStickyLeftOffset(column: UiTableColumn): number | undefined {
  if (!isColumnLeftSticky(column)) return undefined
  if (typeof column.stickyLeft === "number") return column.stickyLeft
  const fromMap = stickyLeftOffsets.value.get(column.key)
  if (fromMap != null) return fromMap
  let offset = 0
  for (const col of visibleColumns.value) {
    if (col.key === column.key) break
    if (isColumnLeftSticky(col)) {
      offset += columnWidthDomMap.value.get(col.key) ?? 0
    }
  }
  return offset
}

function getStickyRightOffset(column: UiTableColumn): number | undefined {
  if (!isColumnRightSticky(column)) return undefined
  if (typeof column.stickyRight === "number") return column.stickyRight
  const fromMap = stickyRightOffsets.value.get(column.key)
  if (fromMap != null) return fromMap
  let offset = 0
  const reversed = [...visibleColumns.value].reverse()
  for (const col of reversed) {
    if (col.key === column.key) break
    if (isColumnRightSticky(col)) {
      offset += columnWidthDomMap.value.get(col.key) ?? 0
    }
  }
  return offset
}

function columnStickyStyle(column: UiTableColumn, baseZIndex = 10): CSSProperties {
  const style: CSSProperties = {}
  const domWidth = columnWidthDomMap.value.get(column.key)
  const layoutWidth = columnWidthMap.value.get(column.key)
  const resolvedWidth = domWidth ?? (layoutWidth != null ? toDomUnits(layoutWidth) : null)
  if (resolvedWidth != null) {
    style.width = `${resolvedWidth}px`
    style.minWidth = `${resolvedWidth}px`
  }
  const side = getStickySide(column)
  if (side === "left") {
    const offset = getStickyLeftOffset(column) ?? 0
    style.position = "sticky"
    style.left = `${offset}px`
    style.zIndex = String(baseZIndex)
    style.background = "inherit"
  } else if (side === "right") {
    const offset = getStickyRightOffset(column) ?? 0
    style.position = "sticky"
    style.right = `${offset}px`
    style.zIndex = String(baseZIndex)
    style.background = "inherit"
  }
  return style
}

function systemColumnStyle(column: UiTableColumn): CSSProperties {
  const style = columnStickyStyle(column, column.isSystem ? 35 : 15)
  if (column.isSystem && column.key === SELECTION_COLUMN_KEY) {
    const currentZ = Number(style.zIndex ?? 0)
    style.zIndex = String(currentZ > 0 ? Math.max(currentZ, 40) : 40)
  } else if (!column.isSystem && !style.background) {
    style.background = "inherit"
  }
  return style
}

function summaryCellStyle(column: UiTableColumn): CSSProperties {
  const style = columnStickyStyle(column, 12)
  if (column.isSystem) {
    style.background = undefined
  } else if (!style.background) {
    style.background = "inherit"
  }
  return style
}

function getStickyTopOffset(row: any): number | undefined {
  if (!row.stickyTop) return undefined
  // If stickyTop is a number, use it directly
  if (typeof row.stickyTop === 'number') return row.stickyTop
  // Automatic calculation: sum heights of preceding sticky rows
  let offset = 0
  // pooledRows includes only visible entries, so search by displayIndex
  for (const pooled of pooledRows.value) {
    if (!pooled.entry) continue
    if (pooled.entry.displayIndex === row.displayIndex) break
    if (pooled.entry.stickyTop) {
      offset += rowHeightDom.value
    }
  }
  return offset
}

</script>
