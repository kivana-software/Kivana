import { DashboardView } from './sections/DashboardView'
import { BillsView } from './sections/BillsView'
import { AccountsView } from './sections/AccountsView'
import { TransactionsView } from './sections/TransactionsView'
import { SettingsView } from './sections/SettingsView'
import { useAppStore } from '../app/appStore'

export function SectionRouter() {
  const { state } = useAppStore()
  switch (state.ui.section) {
    case 'dashboard':
      return <DashboardView />
    case 'bills':
      return <BillsView />
    case 'accounts':
      return <AccountsView />
    case 'transactions':
      return <TransactionsView />
    case 'settings':
      return <SettingsView />
  }
}
