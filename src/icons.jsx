import {
  Ban,
  Camera,
  Check,
  ChartColumn,
  ChevronRight,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  Clock,
  Container,
  Database,
  DollarSign,
  Download,
  Gauge,
  History,
  Info,
  Lock,
  LogIn,
  LogOut,
  MapPin,
  Maximize2,
  MessageSquare,
  ListChecks,
  Package,
  Pencil,
  Printer,
  RotateCcw,
  Route,
  ScrollText,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Snowflake,
  Timer,
  TriangleAlert,
  Truck,
  Users,
  Warehouse,
  X,
} from 'lucide-react'

// One icon per meaning, so the same thing looks the same everywhere. Icons sit beside a word and are
// hidden from screen readers; an icon-only button needs its own aria-label.
export const ICONS = {
  gate: Shield,
  checkIn: LogIn,
  checkOut: LogOut,
  shipping: Truck,
  truck: Truck,
  dock: Warehouse,
  overview: ChartColumn,
  chart: ChartColumn,
  waiting: Clock,
  time: Timer,
  inspect: ClipboardCheck,
  inspected: ShieldCheck,
  done: CircleCheck,
  check: Check,
  failed: CircleX,
  blocked: Ban,
  warning: TriangleAlert,
  info: Info,
  money: DollarSign,
  load: Package,
  drop: Container,
  yard: MapPin,
  handoff: Route,
  log: ScrollText,
  history: History,
  seal: Lock,
  reefer: Snowflake,
  search: Search,
  data: Database,
  speed: Gauge,
  people: Users,
  messages: MessageSquare,
  photo: Camera,
  export: Download,
  print: Printer,
  enlarge: Maximize2,
  settings: Settings,
  close: X,
  purpose: ListChecks,
  edit: Pencil,
  undo: RotateCcw,
  chevron: ChevronRight,
}

export function Icon({ name, size = 20, className = '' }) {
  const C = ICONS[name]
  return <C size={size} strokeWidth={2} aria-hidden="true" focusable="false" className={'shrink-0 ' + className} />
}

// Small square chip holding an icon: card headers (on the tinted strip) and tiles.
export function IconChip({ name, size = 18, className = '' }) {
  return (
    <span className={'grid size-9 shrink-0 place-items-center rounded-[10px] bg-panel text-signal shadow-card ' + className}>
      <Icon name={name} size={size} />
    </span>
  )
}
