<template>
    <div class="h-full w-full flex flex-col gap-4 p-6">
        <header class="flex items-center justify-between">
            <div>
                <h1 class="text-lg font-semibold text-neutral-800 dark:text-neutral-100">UiTable Demo</h1>
                <p class="text-sm text-neutral-500 dark:text-neutral-400">Static dataset used for automated table
                    scenarios.</p>
            </div>
        </header>
        <div
            class="flex-1 overflow-auto min-h-0 rounded border border-neutral-200 bg-white p-2 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
            <UiTable table-name="demo" :columns="columns" :rows="rows" :virtualization="true" :selectable="true"
                :hoverable="true" :inline-controls="true" :show-row-index-column="true" :style-config="tableTheme"
                class="h-full min-w-[700px]" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from "vue"
import UiTable from "@/components/Grid/UiTable.vue"
import type { UiTableColumnGroupDef } from "@/components/Grid/utils/ColumnGroup"
import { industrialNeutralTheme } from "@/components/Grid/themes"

const tableTheme = industrialNeutralTheme
const demoColumns = [
    {
        key: "rowIndex",
        label: "#",
        width: 48,
        isSystem: true,
        stickyLeft: true,
    },
    {
        key: "col_1",
        label: "Customer Id",
        width: 160,
        resizable: true,
        sortable: true,
        stickyLeft: true,
        groupable: true,
    },
    {
        key: "col_2",
        label: "Customer Name",
        width: 200,
        resizable: true,
        sortable: true,
        groupable: true,
    },
    ...Array.from({ length: 18 }, (_, index) => {
        const id = index + 3
        return {
            key: `col_${id}`,
            label: `Column ${id}`,
            width: 160,
            resizable: true,
            sortable: true,
            groupable: true,
        }
    }),
]

const columnLookup = demoColumns.reduce<Record<string, (typeof demoColumns)[number]>>((acc, column) => {
    acc[column.key] = column
    return acc
}, {})

// const columnGroups = ref<UiTableColumnGroupDef[]>([
//   {
//     groupId: "customer",
//     headerName: "Customer",
//     expanded: true,
//     children: [
//       columnLookup["col_1"],
//       columnLookup["col_2"],
//       {
//         groupId: "customer-contact",
//         headerName: "Contact",
//         children: [columnLookup["col_3"], columnLookup["col_4"]],
//       },
//     ],
//   },
//   {
//     groupId: "metrics",
//     headerName: "Metrics",
//     expanded: true,
//     children: [
//       columnLookup["col_5"],
//       columnLookup["col_6"],
//       {
//         groupId: "finance",
//         headerName: "Finance",
//         expanded: false,
//         children: [columnLookup["col_7"], columnLookup["col_8"]],
//       },
//       columnLookup["col_9"],
//     ],
//   },
// ])

const rows = ref(
    Array.from({ length: 10_000 }, (_, rowIndex) => {
        const base: Record<string, string | number> = { id: rowIndex + 1 }
        for (const column of demoColumns) {
            if (column.key === "rowIndex") {
                base[column.key] = rowIndex + 1
                continue
            }
            base[column.key] = `Row ${rowIndex + 1} - ${column.label}`
        }
        return base
    }),
)

const columns = ref(demoColumns)
</script>
