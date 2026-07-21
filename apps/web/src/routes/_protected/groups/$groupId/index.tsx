import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/groups/$groupId/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_protected/groups/$groupId/"!</div>
}
