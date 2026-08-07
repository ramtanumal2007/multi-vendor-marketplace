import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-md bg-[#eee] bg-gradient-to-r from-[#eee] via-[#f5f5f5] to-[#eee] bg-[length:400%_100%] animate-skeleton-shimmer",
        className
      )}
      {...props}
    />
  );
}
