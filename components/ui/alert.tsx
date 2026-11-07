import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { CircleAlertIcon, CircleCheckIcon, InfoIcon, TriangleAlertIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Inline notices (in pages, forms and dialogs): a tinted card with an icon, a bold title and a description, in the same
 * palette as the page `Banner` (components/ui/banner.tsx), which has an illustration and suits page-level notices.
 * Variants by use: default/info (how something works, read-only states), success (done), warning (needs attention),
 * destructive (blocked or failing). The variant's icon is added unless the first child is already an icon; `icon={false}`
 * leaves it out.
 */
const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-1 rounded-xl border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-(--alert-icon)",
  {
    variants: {
      variant: {
        default: "border-[#e3d9c6] bg-[#f6f1e8] text-[#2a2620] [--alert-icon:#7a6a4c] [--alert-muted:#5e574c]",
        info: "border-[#e3d9c6] bg-[#f6f1e8] text-[#2a2620] [--alert-icon:#7a6a4c] [--alert-muted:#5e574c]",
        success: "border-[#c5dcbb] bg-[#e7f2e2] text-[#1f2e1c] [--alert-icon:#2f7a3b] [--alert-muted:#4a5c45]",
        warning: "border-[#eadb93] bg-[#fbf4d6] text-[#2e2810] [--alert-icon:#a36a00] [--alert-muted:#5f5530]",
        destructive: "border-[#efc7cc] bg-[#fbecee] text-[#7a1d26] [--alert-icon:#c42b37] [--alert-muted:#7a3a42]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

type AlertVariant = NonNullable<VariantProps<typeof alertVariants>["variant"]>
const variantIcon: Record<AlertVariant, React.ComponentType<{ "aria-hidden"?: boolean }>> = {
  default: InfoIcon, info: InfoIcon, success: CircleCheckIcon, warning: TriangleAlertIcon, destructive: CircleAlertIcon,
}

function Alert({
  className,
  variant,
  icon,
  children,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants> & { icon?: false }) {
  const first = React.Children.toArray(children)[0]
  const hasIcon = React.isValidElement(first) && typeof first.type !== "string" && first.type !== AlertTitle && first.type !== AlertDescription
  const Icon = variantIcon[variant ?? "default"]
  return (
    <div
      data-slot="alert"
      data-variant={variant ?? "default"}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {!hasIcon && icon !== false && <Icon aria-hidden />}
      {children}
    </div>
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "col-start-2 min-h-4 font-semibold leading-snug tracking-tight",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 grid justify-items-start gap-1 text-sm text-(--alert-muted) [&_p]:leading-relaxed",
        className
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
