import { createRouter, createWebHashHistory } from 'vue-router'
import person from "@/views/person.vue";
import HelloWorld from "@/components/HelloWorld.vue";
import TheWelcome from "@/components/TheWelcome.vue";
import WelcomeItem from "@/components/WelcomeItem.vue";
import PressureTest from "@/views/PressureTest.vue";
import BlockchainDashboard from "@/views/BlockchainDashboard.vue";


const router = createRouter({
  history: createWebHashHistory('/'),
  routes: [
    {
      path: '/',
      name: 'welcome',
      component: HelloWorld,
    },
    { path: '/dashboard',
      name: 'dashboard',
      component: BlockchainDashboard,
    },
    { path: '/person',
      name:'person',
      component: person,
    },
    { path: '/test',
      name:'test',
      component: PressureTest,
    },
  ],
})

export default router
