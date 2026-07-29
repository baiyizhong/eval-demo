import type { ComponentType, SVGProps } from 'react'
import {
  Bell,
  Bug,
  CalendarClock,
  Construction,
  Database,
  FileX,
  GalleryVerticalEnd,
  HelpCircle,
  LayoutDashboard,
  ListTodo,
  Lock,
  MessagesSquare,
  Monitor,
  Package,
  ServerOff,
  Settings,
  ShieldCheck,
  UserCog,
  UserX,
  Users,
  Wrench,
  Workflow,
  AudioWaveform,
  Command,
} from 'lucide-react'

type LucideIcon = ComponentType<
  SVGProps<SVGSVGElement> & { className?: string }
>

const iconMap: Record<string, LucideIcon> = {
  AudioWaveform,
  Bell,
  Bug,
  CalendarClock,
  Command,
  Construction,
  Database,
  FileX,
  GalleryVerticalEnd,
  HelpCircle,
  LayoutDashboard,
  ListTodo,
  Lock,
  MessagesSquare,
  Monitor,
  Package,
  ServerOff,
  Settings,
  ShieldCheck,
  UserCog,
  UserX,
  Users,
  Wrench,
  Workflow,
}

export function resolveIcon(iconName: string): LucideIcon {
  return iconMap[iconName] ?? LayoutDashboard
}

export { iconMap }
