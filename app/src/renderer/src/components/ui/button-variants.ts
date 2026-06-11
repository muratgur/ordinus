import { cva } from 'class-variance-authority'

// Kept in a non-component module so button.tsx stays fast-refresh friendly while
// other components (e.g. alert-dialog) can reuse the variant classes.
// Polish pass: `transition` (not just colors) + a 2% press squash give every
// button the same quiet tactile feedback app-wide. Guarded by motion-safe.
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium tracking-normal transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-safe:active:scale-[0.98] [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-active',
        secondary: 'border border-border bg-card text-card-foreground hover:bg-accent',
        outline: 'border border-input bg-card text-card-foreground hover:bg-accent',
        ghost: 'hover:bg-accent hover:text-accent-foreground'
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3',
        icon: 'size-10'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)
