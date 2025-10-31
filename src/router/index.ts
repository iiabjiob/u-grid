import GridDemo from '@/views/GridDemo.vue'
import VirtualListDemo from '@/views/VirtualListDemo.vue'
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'grid-demo',
      component: GridDemo,
    },
    {
      path: '/virtual-list-demo',
      name: 'virtual-list-demo',
      component: VirtualListDemo,
    },
  ],
})

export default router
