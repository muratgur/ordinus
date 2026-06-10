import * as React from 'react'
import {
  type LucideIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  SlidersHorizontal
} from 'lucide-react'

import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@renderer/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { cn } from '@renderer/lib/utils'

/**
 * Left Rail design system (ADR-033).
 *
 * Borderless "Record List Rail" shared across Home, Workboard, Workflows,
 * Conversations, and Agents. One structured shell, role-specific fill.
 *
 * Top is a thin utility row ([collapse] … [search] [filter]) above a prominent
 * full-width CTA, a hairline divider, then the scrolling list. There is no
 * title (the global nav already names the screen). Search opens a ⌘K command
 * palette, so it costs no vertical space. When collapsed the rail does not
 * vanish — it becomes a slim icon strip (expand / new / search / filter), which
 * keeps content from sliding under a floating button.
 *
 * Settings is a Section Nav, not a Record List Rail; it does not use Rail.
 */

export type RailSearchItem = {
  id: string
  label: string
  /** Optional secondary line shown under the label in the palette. */
  meta?: string
  onSelect: () => void
}

export type RailCta = {
  icon?: LucideIcon
  label: string
  onClick: () => void
  disabled?: boolean
}

/** A square icon button used in the rail's utility row and collapsed strip. */
type RailIconButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  icon: LucideIcon
  label: string
  active?: boolean
}

const RailIconButton = React.forwardRef<HTMLButtonElement, RailIconButtonProps>(
  ({ icon: Icon, label, active, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        'relative flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-40',
        active && 'text-foreground',
        className
      )}
      {...props}
    >
      <Icon className="size-4" />
      {active ? (
        <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary ring-2 ring-background" />
      ) : null}
    </button>
  )
)
RailIconButton.displayName = 'RailIconButton'

export function RailFilterToggle({
  icon: Icon,
  label,
  checked,
  onCheckedChange
}: {
  icon: LucideIcon
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}): React.JSX.Element {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-muted">
      <span className="flex items-center gap-2 text-foreground">
        <Icon className="size-3.5 text-muted-foreground" />
        {label}
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  )
}

/** Filter popover trigger (icon button) + content. Renders nothing if no filter. */
function RailFilter({
  filter,
  filterActive
}: {
  filter: React.ReactNode
  filterActive?: boolean
}): React.JSX.Element {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <RailIconButton icon={SlidersHorizontal} label="Filter" active={filterActive} />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-56 border-border bg-card p-1.5 text-foreground shadow-lg"
      >
        {filter}
      </PopoverContent>
    </Popover>
  )
}

/**
 * The rail shell. Screens pass structured props plus the list as children
 * (typically a single <RailList>). Width animates between expanded and the
 * collapsed icon strip; the rail never collapses to zero.
 */
export function Rail({
  collapsed,
  onToggleCollapsed,
  cta,
  search,
  searchPlaceholder = 'Search…',
  filter,
  filterActive,
  children,
  'aria-label': ariaLabel
}: {
  collapsed: boolean
  onToggleCollapsed: () => void
  cta: RailCta
  /** When provided, a search icon opens a ⌘K palette over these items. */
  search?: RailSearchItem[]
  searchPlaceholder?: string
  /** Popover content for the filter (e.g. a "Show archived" toggle). */
  filter?: React.ReactNode
  filterActive?: boolean
  children: React.ReactNode
  'aria-label'?: string
}): React.JSX.Element {
  const [searchOpen, setSearchOpen] = React.useState(false)
  const CtaIcon = cta.icon ?? Plus

  const searchDialog = search ? (
    <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
      <CommandInput placeholder={searchPlaceholder} />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        <CommandGroup>
          {search.map((item) => (
            <CommandItem
              key={item.id}
              value={`${item.label} ${item.meta ?? ''}`}
              onSelect={() => {
                item.onSelect()
                setSearchOpen(false)
              }}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{item.label}</span>
                {item.meta ? (
                  <span className="truncate text-xs text-muted-foreground">{item.meta}</span>
                ) : null}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  ) : null

  if (collapsed) {
    return (
      <aside
        aria-label={ariaLabel}
        className="flex w-12 shrink-0 flex-col items-center gap-1 pt-0.5 transition-[width] duration-200 ease-out"
      >
        <RailIconButton icon={PanelLeftOpen} label="Expand panel" onClick={onToggleCollapsed} />
        <RailIconButton
          icon={CtaIcon}
          label={cta.label}
          disabled={cta.disabled}
          onClick={cta.onClick}
        />
        {search ? (
          <RailIconButton icon={Search} label="Search" onClick={() => setSearchOpen(true)} />
        ) : null}
        {filter ? <RailFilter filter={filter} filterActive={filterActive} /> : null}
        {searchDialog}
      </aside>
    )
  }

  return (
    <aside
      aria-label={ariaLabel}
      className="flex w-64 shrink-0 flex-col gap-2 transition-[width] duration-200 ease-out"
    >
      <div className="flex h-7 items-center justify-between gap-1 pr-0.5">
        <div className="flex items-center gap-0.5">
          {search ? (
            <RailIconButton icon={Search} label="Search" onClick={() => setSearchOpen(true)} />
          ) : null}
          {filter ? <RailFilter filter={filter} filterActive={filterActive} /> : null}
        </div>
        <RailIconButton icon={PanelLeftClose} label="Collapse panel" onClick={onToggleCollapsed} />
      </div>

      <Button size="sm" className="w-full" onClick={cta.onClick} disabled={cta.disabled}>
        <CtaIcon className="size-4" />
        {cta.label}
      </Button>

      <div className="-mx-0.5 border-b border-border/60" />

      {children}
      {searchDialog}
    </aside>
  )
}

/** Scrollable list region. Renders a centered muted empty message when empty. */
export function RailList({
  empty,
  isEmpty,
  children
}: {
  empty: React.ReactNode
  isEmpty: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="ordinus-scrollbar -mr-1.5 flex min-h-0 flex-1 flex-col gap-px overflow-y-auto pr-1.5 pt-0.5">
      {isEmpty ? (
        <p className="px-2 py-8 text-center text-[13px] text-muted-foreground/80">{empty}</p>
      ) : (
        children
      )}
    </div>
  )
}

/**
 * One selectable record row. Owns the shared grammar:
 *  - flat full-width row, rounded chip on hover/select
 *  - selection = thin left orange (primary) bar + neutral fill; orange only in bar
 *  - hover = bg-muted, hover-revealed actions on the right
 *  - unread = bold title + filled dot in the right slot
 *  - running = animated status text replacing the meta line
 *  - dimmed (archived) = reduced opacity
 *
 * Screens supply role-specific fill: title, meta, optional left/right slots,
 * an optional leading dot/icon, and hover actions.
 */
export function RailItem({
  title,
  meta,
  running,
  runningLabel = 'Working…',
  unread,
  selected,
  dimmed,
  leadingDot,
  leadingIcon,
  leftSlot,
  rightSlot,
  actions,
  onSelect,
  onContextMenu
}: {
  title: string
  meta?: React.ReactNode
  running?: boolean
  runningLabel?: string
  unread?: boolean
  selected?: boolean
  dimmed?: boolean
  /** Optional leading status dot color class (e.g. attention/running). */
  leadingDot?: string
  /** Optional small icon rendered just before the title (e.g. a pin). */
  leadingIcon?: React.ReactNode
  leftSlot?: React.ReactNode
  rightSlot?: React.ReactNode
  actions?: React.ReactNode
  onSelect?: () => void
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void
}): React.JSX.Element {
  return (
    <div
      onContextMenu={onContextMenu}
      className={cn(
        'group relative rounded-md transition-colors',
        selected ? 'bg-primary-soft' : 'hover:bg-muted',
        dimmed && 'opacity-55'
      )}
    >
      {selected ? (
        <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-primary" />
      ) : null}
      <button
        type="button"
        className="flex w-full min-w-0 items-start gap-2 rounded-md px-2.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
        onClick={onSelect}
      >
        {leftSlot ? <span className="mt-0.5 shrink-0">{leftSlot}</span> : null}
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            {leadingDot ? (
              <span className={cn('size-1.5 shrink-0 rounded-full', leadingDot)} />
            ) : null}
            {leadingIcon ? <span className="shrink-0">{leadingIcon}</span> : null}
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-[13px] leading-tight',
                unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/85'
              )}
            >
              {title}
            </span>
          </span>
          {running ? (
            <span className="flex items-center gap-1.5 text-[11px] leading-tight text-primary">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              {runningLabel}
            </span>
          ) : meta ? (
            <span className="truncate text-[11px] leading-tight text-muted-foreground">{meta}</span>
          ) : null}
        </span>
        {rightSlot || unread ? (
          <span className="mt-0.5 flex shrink-0 items-center gap-1.5 text-[10px] tabular-nums text-muted-foreground">
            {rightSlot}
            {unread ? <span className="size-1.5 rounded-full bg-primary" /> : null}
          </span>
        ) : null}
      </button>
      {actions ? (
        <div
          className={cn(
            'absolute inset-y-0 right-0 hidden items-center gap-0.5 rounded-r-md pl-8 pr-1.5 group-hover:flex group-focus-within:flex',
            selected
              ? 'bg-gradient-to-l from-primary-soft via-primary-soft to-transparent'
              : 'bg-gradient-to-l from-muted via-muted to-transparent'
          )}
        >
          {actions}
        </div>
      ) : null}
    </div>
  )
}

/** A ghost icon action shown on row hover (pin / archive / delete). */
export function RailItemAction({
  icon: Icon,
  label,
  onClick,
  className,
  disabled
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  className?: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      className={cn(
        'rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-40',
        className
      )}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      <Icon className="size-3.5" />
    </button>
  )
}
