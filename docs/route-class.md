# Route class

`useRouteClass` toggles one CSS class around a navigation. It does not render a
transition component, and it does not run an animation. The stylesheet decides
what the class looks like, including under `prefers-reduced-motion`.

Call it inside component setup or an active effect scope, with the same router
hooks as `useRouteTransition`: `beforeResolve` and `afterEach`.

```ts
import { useTemplateRef } from '@usevibejs/ui'
import { useRouter } from '@usevibejs/ui/router'
import { useRouteClass } from '@usevibejs/motion'

const root = useTemplateRef<HTMLElement>('root')
const route = useRouteClass(useRouter(), root, { className: 'route-transition' })
```

```css
.route-transition {
  opacity: 0.72;
}
@media (prefers-reduced-motion: reduce) {
  .route-transition {
    opacity: 1;
  }
}
```

The class is added when a navigation targets a different `fullPath`, and removed
after that navigation's `afterEach` flushes. A newer navigation supersedes an
older completion, so a stale `afterEach` does not remove the class early.
`stop()` removes the hooks and the class this composable added.

If the element already had the class, completion leaves it in place. Choose a
class that belongs to the route change. An empty class name adds nothing.
A missing target skips that navigation. Same-path updates are ignored.

`route.active` is true while the class this call added is on the target.
Changing the target or the class name applies on the next navigation.
