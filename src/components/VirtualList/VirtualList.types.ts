export interface VirtualListSlotProps<T = unknown> {
  item: T
  index: number
}

export interface VirtualListSlots<T = unknown> {
  default?: (props: VirtualListSlotProps<T>) => any
}

export interface VirtualListExposedMethods {
  scrollTo: (index: number) => void
  scrollToTop: () => void
  scrollToBottom: () => void
}

export interface VirtualListScrollPayload {
  event: Event | null
  scrollTop: number
}
