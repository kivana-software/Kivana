import { setSection } from '../app/AppProvider'
import { useAppStore, type Section } from '../app/appStore'
import { SidebarIconView } from './icons'
import type { SidebarIcon } from './sidebarModel'
import { t } from './i18n'
import { isTauriRuntime } from '../storage/tauriJsonStore'

export function Sidebar(props: { onHoverChange?: (expanded: boolean) => void }) {
  const { state, dispatch } = useAppStore()
  const lang = state.settings.language
  const tt = (key: string, fallback?: string) => t(lang, key, fallback)
  const siteUrl = 'https://kivana.eu/'

  async function openSite(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!isTauriRuntime()) {
      window.open(siteUrl, '_blank', 'noreferrer')
      return
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('open_external_url', { url: siteUrl })
      return
    } catch {
    }
    try {
      window.open(siteUrl, '_blank', 'noreferrer')
    } catch {
    }
  }

  const items: Array<{ section: Section; title: string; icon: SidebarIcon }> = [
    { section: 'dashboard', title: tt('nav.dashboard', 'Dashboard'), icon: 'overview' },
    { section: 'accounts', title: tt('nav.accounts', 'Accounts'), icon: 'accounts' },
    { section: 'transactions', title: tt('nav.transactions', 'Transactions'), icon: 'transactions' },
    { section: 'bills', title: tt('nav.bills', 'Bills'), icon: 'calendar' },
    { section: 'settings', title: tt('nav.settings', 'Settings'), icon: 'settings' },
  ]

  return (
    <aside
      className="sidebar"
      data-tour="sidebar"
      data-tauri-drag-region
      onMouseEnter={() => props.onHoverChange?.(true)}
      onMouseLeave={() => props.onHoverChange?.(false)}
    >
      <div className="sidebarDragGutter" data-tauri-drag-region />
      <div className="brand" data-tauri-drag-region>
        <img className="brandMark" src="/kivana-logo.png" alt="Kivana logo" data-tauri-drag-region />
        <div className="brandName" data-tauri-drag-region>
          Kivana
        </div>
      </div>

      <nav className="sbNav">
        <div className="sbGroup">
          {items.map((item) => {
            const active = state.ui.section === item.section
            return (
              <button
                key={item.section}
                type="button"
                className={active ? 'sbItem active' : 'sbItem'}
                onClick={() => dispatch(setSection(item.section))}
                title={item.title}
                data-tour={`nav-${item.section}`}
              >
                <SidebarIconView icon={item.icon} />
                <span className="sbText">
                  <span className="sbTitle">{item.title}</span>
                </span>
              </button>
            )
          })}
        </div>
      </nav>

      <div className="sbFooter">
        <a href={siteUrl} onClick={openSite}>
          kivana.eu
        </a>
      </div>
    </aside>
  )
}
