import { defineRoutes } from '@usevibejs/ui/router';
import DemosPage from './pages/DemosPage.vibe';
import GuidePage from './pages/GuidePage.vibe';
import BenchPage from './pages/BenchPage.vibe';

export const routes = defineRoutes([
  { path: '/', name: 'demos', component: DemosPage },
  { path: '/guide', name: 'guide', component: GuidePage },
  { path: '/bench', name: 'bench', component: BenchPage },
]);
