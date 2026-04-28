import { Dashboard } from '@/components/Dashboard'
import { useIpcListeners } from '@/hooks/use-ipc-listeners'

function App() {
  useIpcListeners()
  return <Dashboard />
}

export default App
