import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export function SearchField({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn("search-field", className)}
      type="search"
      {...props}
    />
  );
}
