import { cn } from "@/lib/utils/cn";

export function BrandMark({
  className,
  labelClassName
}: {
  className?: string;
  labelClassName?: string;
}) {
  return (
    <div className={cn(className)}>
      <span className={cn(labelClassName)}>Clode</span>
    </div>
  );
}
