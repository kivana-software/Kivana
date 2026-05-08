import type { DueSeverity, SidebarIcon } from './sidebarModel'
import type { AccountKind, BillCategory, TransactionKind } from '../domain/models'

export function SidebarIconView(props: { icon: SidebarIcon; dueSeverity?: DueSeverity }) {
  const color = 'var(--muted)'

  switch (props.icon) {
    case 'overview':
      return <IconBox color={color}><ListIcon /></IconBox>
    case 'calendar':
      return <IconBox color={color}><CalendarIcon /></IconBox>
    case 'accounts':
      return <IconBox color={color}><CardIcon /></IconBox>
    case 'transactions':
      return <IconBox color={color}><LinesIcon /></IconBox>
    case 'settings':
      return <IconBox color={color}><GearIcon /></IconBox>
  }
}

function IconBox(props: { color: string; children: React.ReactNode }) {
  return (
    <span className="sbIcon" style={{ color: props.color }}>
      {props.children}
    </span>
  )
}

function Svg(props: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {props.children}
    </svg>
  )
}

function ListIcon() {
  return (
    <Svg>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </Svg>
  )
}

function ArrowDownIcon() {
  return (
    <Svg>
      <path d="M12 3v14" />
      <path d="M7 12l5 5 5-5" />
    </Svg>
  )
}

function CalendarIcon() {
  return (
    <Svg>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4" />
      <path d="M8 3v4" />
      <path d="M3 10h18" />
      <path d="M7 14h.01" />
      <path d="M12 14h.01" />
      <path d="M17 14h.01" />
      <path d="M7 18h.01" />
      <path d="M12 18h.01" />
      <path d="M17 18h.01" />
    </Svg>
  )
}

function CardIcon() {
  return (
    <Svg>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
    </Svg>
  )
}

function LinesIcon() {
  return (
    <Svg>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h10" />
    </Svg>
  )
}

function TargetIcon() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3" />
      <path d="M22 12h-3" />
      <path d="M12 22v-3" />
      <path d="M2 12h3" />
    </Svg>
  )
}

function ChartIcon() {
  return (
    <Svg>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 15v-5" />
      <path d="M12 15V7" />
      <path d="M16 15v-8" />
    </Svg>
  )
}

export function SparkleIcon() {
  return (
    <Svg>
      <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z" />
      <path d="M5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14z" />
    </Svg>
  )
}

function GearIcon() {
  return (
    <Svg>
      <path d="M12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z" />
      <path d="M19.4 15a1 1 0 00.2 1.1l.1.1a2 2 0 01-1.4 3.4h-.2a1 1 0 00-1 .7l-.1.2a2 2 0 01-3.8 0l-.1-.2a1 1 0 00-1-.7h-.2a2 2 0 01-1.4-3.4l.1-.1a1 1 0 00.2-1.1l-.1-.2a2 2 0 010-2.9l.1-.2a1 1 0 00-.2-1.1l-.1-.1A2 2 0 014.9 6.1h.2a1 1 0 001-.7l.1-.2a2 2 0 013.8 0l.1.2a1 1 0 001 .7h.2a2 2 0 011.4 3.4l-.1.1a1 1 0 00-.2 1.1l.1.2a2 2 0 010 2.9l-.1.2z" />
    </Svg>
  )
}

export function BillCategoryIcon(props: { category: BillCategory }) {
  switch (props.category) {
    case 'housing':
      return <HomeIcon />
    case 'utilities':
      return <BoltIcon />
    case 'subscriptions':
      return <RepeatIcon />
    case 'insurance':
      return <ShieldIcon />
    case 'taxes':
      return <ReceiptIcon />
    case 'transport':
      return <CarIcon />
    default:
      return <DotsIcon />
  }
}

export function AccountKindIcon(props: { kind: AccountKind }) {
  switch (props.kind) {
    case 'checking':
    case 'savings':
      return <BankIcon />
    case 'credit':
      return <CreditCardIcon />
    case 'cash':
      return <WalletIcon />
    case 'investment':
      return <ChartIcon />
    default:
      return <CardIcon />
  }
}

export function TransactionKindIcon(props: { kind: TransactionKind }) {
  switch (props.kind) {
    case 'income':
      return <ArrowDownIcon />
    case 'expense':
      return <ArrowUpIcon />
    default:
      return <SwapIcon />
  }
}

export function GoalIcon() {
  return <TargetIcon />
}

function ArrowUpIcon() {
  return (
    <Svg>
      <path d="M12 21V7" />
      <path d="M7 12l5-5 5 5" />
    </Svg>
  )
}

function SwapIcon() {
  return (
    <Svg>
      <path d="M7 7h13" />
      <path d="M17 3l3 4-3 4" />
      <path d="M17 17H4" />
      <path d="M7 21l-3-4 3-4" />
    </Svg>
  )
}

function HomeIcon() {
  return (
    <Svg>
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 10v10h14V10" />
    </Svg>
  )
}

function BoltIcon() {
  return (
    <Svg>
      <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
    </Svg>
  )
}

function RepeatIcon() {
  return (
    <Svg>
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 014-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 01-4 4H3" />
    </Svg>
  )
}

function ShieldIcon() {
  return (
    <Svg>
      <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z" />
    </Svg>
  )
}

function ReceiptIcon() {
  return (
    <Svg>
      <path d="M6 2h12v20l-2-1-2 1-2-1-2 1-2-1-2 1V2z" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
      <path d="M8 15h6" />
    </Svg>
  )
}

function CarIcon() {
  return (
    <Svg>
      <path d="M5 16l-1-4 2-6h12l2 6-1 4" />
      <path d="M7 16h10" />
      <circle cx="7.5" cy="16.5" r="1.5" />
      <circle cx="16.5" cy="16.5" r="1.5" />
    </Svg>
  )
}

function DotsIcon() {
  return (
    <Svg>
      <path d="M6 12h.01" />
      <path d="M12 12h.01" />
      <path d="M18 12h.01" />
    </Svg>
  )
}

function CreditCardIcon() {
  return (
    <Svg>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h3" />
    </Svg>
  )
}

function BankIcon() {
  return (
    <Svg>
      <path d="M12 3l9 5H3l9-5z" />
      <path d="M5 10v8" />
      <path d="M9 10v8" />
      <path d="M15 10v8" />
      <path d="M19 10v8" />
      <path d="M4 20h16" />
    </Svg>
  )
}

function WalletIcon() {
  return (
    <Svg>
      <path d="M3 7h18v12H3z" />
      <path d="M3 9h14a2 2 0 012 2v4a2 2 0 01-2 2H3" />
      <path d="M16 13h.01" />
    </Svg>
  )
}
