<template>
    <div class="flex flex-col gap-2 p-10">
        <div class="flex gap-2 items-center">
            <input v-model="searchTerm" type="text" class="border border-gray-300 rounded px-2 py-1 text-sm flex-1"
                placeholder="Filter rows…" />
            <button @click="scrollTop">Scroll To Top</button>
            <button @click="scrollBottom">Scroll To Bottom</button>
            <button @click="scrollMid">Scroll To 500</button>
        </div>
        <div class="text-sm text-gray-500">
            Scroll top: {{ scrollPosition }} | Showing {{ filteredRows.length }} / {{ rows.length }}
        </div>

        <VirtualList ref="listRef" :items="filteredRows" :item-height="28" :height="400" @scroll="handleScroll">
            <template #default="{ item, index }">
                <div class="flex items-center border-b border-gray-200 px-2" style="height: 28px;">
                    #{{ index + 1 }} — {{ item }}
                </div>
            </template>
        </VirtualList>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import VirtualList from "@/components/VirtualList/VirtualList.vue"
import type {
    VirtualListExposedMethods,
    VirtualListScrollPayload,
} from "@/components/VirtualList/VirtualList.types"

const listRef = ref<VirtualListExposedMethods | null>(null)
const rows = Array.from({ length: 10_000 }, (_, i) => `Row ${i + 1}`)
const scrollPosition = ref(0)
const searchTerm = ref("")
const filteredRows = computed(() => {
    const term = searchTerm.value.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => row.toLowerCase().includes(term))
})

watch(searchTerm, () => {
    listRef.value?.scrollToTop()
    scrollPosition.value = 0
})

function scrollTop() {
    listRef.value?.scrollToTop()
}
function scrollBottom() {
    listRef.value?.scrollToBottom()
}
function scrollMid() {
    listRef.value?.scrollTo(500)
}

function handleScroll(payload: VirtualListScrollPayload) {
    scrollPosition.value = payload.scrollTop
}
</script>
