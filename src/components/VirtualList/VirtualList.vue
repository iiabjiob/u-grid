<!--
  @slot default — Slot for rendering each row.
  Props: { item, index }
-->
<script setup lang="ts">
import { ref, computed, onMounted, watch, type CSSProperties } from "vue"
import type {
  VirtualListSlots,
  VirtualListExposedMethods,
  VirtualListScrollPayload,
} from "./VirtualList.types"

export interface Slots extends VirtualListSlots {}

// Declare slot type (TS-aware)
defineSlots<VirtualListSlots>()

interface Props<T> {
  items: any[]
  itemHeight?: number
  overscan?: number
  height?: number | string
}

const props = defineProps<Props<any>>()
const emit = defineEmits<{ (e: "scroll", payload: VirtualListScrollPayload): void }>()

const containerRef = ref<HTMLDivElement | null>(null)
const scrollTop = ref(0)
const visibleCount = ref(0)
const startIndex = ref(0)
const endIndex = ref(0)

const itemHeight = computed(() => props.itemHeight ?? 28)
const overscan = computed(() => props.overscan ?? 5)
const totalHeight = computed(() => props.items.length * itemHeight.value)
const offsetTop = computed(() => startIndex.value * itemHeight.value)

const visibleItems = computed(() => {
  const slice = props.items.slice(startIndex.value, endIndex.value)
  return slice.map((data, i) => ({
    data,
    index: startIndex.value + i,
  }))
})

function updateVisibleRange() {
  const el = containerRef.value
  if (!el) return
  const vh = el.clientHeight
  visibleCount.value = Math.ceil(vh / itemHeight.value)
  const baseStart = Math.floor(scrollTop.value / itemHeight.value)
  const start = Math.max(0, baseStart - overscan.value)
  const range = visibleCount.value + overscan.value * 2
  startIndex.value = start
  endIndex.value = Math.min(props.items.length, start + range)
}

function handleScroll(e: Event) {
  const el = e.target as HTMLElement
  scrollTop.value = el.scrollTop
  updateVisibleRange()
  emit("scroll", { event: e, scrollTop: scrollTop.value })
}

function scrollTo(index: number) {
  const el = containerRef.value
  if (!el) return
  el.scrollTop = index * itemHeight.value
  scrollTop.value = el.scrollTop
  updateVisibleRange()
  emit("scroll", { event: null, scrollTop: scrollTop.value })
}

function scrollToTop() {
  const el = containerRef.value
  if (!el) return
  el.scrollTop = 0
  scrollTop.value = 0
  updateVisibleRange()
  emit("scroll", { event: null, scrollTop: scrollTop.value })
}

function scrollToBottom() {
  const el = containerRef.value
  if (!el) return
  el.scrollTop = props.items.length * itemHeight.value
  scrollTop.value = el.scrollTop
  updateVisibleRange()
  emit("scroll", { event: null, scrollTop: scrollTop.value })
}

defineExpose<VirtualListExposedMethods>({ scrollTo, scrollToTop, scrollToBottom })

onMounted(updateVisibleRange)
watch(() => props.items, updateVisibleRange)
watch(itemHeight, updateVisibleRange)
watch(() => props.items.length, updateVisibleRange)
watch(() => props.height, updateVisibleRange)

const containerStyle = computed<CSSProperties>(() => ({
  overflowY: "auto",
  height:
    typeof props.height === "number"
      ? `${props.height}px`
      : props.height || "300px",
  position: "relative",
}))

const wrapperStyle = computed<CSSProperties>(() => ({
  height: `${totalHeight.value}px`,
  position: "relative",
}))

const itemsStyle = computed<CSSProperties>(() => ({
  transform: `translateY(${offsetTop.value}px)`,
  willChange: "transform",
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  width: "100%",
}))
</script>

<template>
  <!-- default slot props: { item, index } -->
  <div ref="containerRef" :style="containerStyle" @scroll="handleScroll">
    <div :style="wrapperStyle">
      <div :style="itemsStyle">
        <template v-for="item in visibleItems" :key="item.index">
          <slot :item="item.data" :index="item.index" />
        </template>
      </div>
    </div>
  </div>
</template>
