import type { ComponentType, SVGProps } from 'react'
import {
  Bell,
  Bug,
  Construction,
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
  Command,
  Construction,
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
}

export function resolveIcon(iconName: string): LucideIcon {
  return iconMap[iconName] ?? LayoutDashboard
}

export { iconMap }
