import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  showText?: boolean;
}

export default function Logo({ 
  className, 
  iconClassName, 
  textClassName,
  showText = true 
}: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2 font-semibold", className)}>
      <span 
        className={cn(
          "h-5 w-5 rounded-md bg-gradient-to-br from-blue-600 to-cyan-500 shadow-inner shadow-white/30 ring-1 ring-black/5 dark:ring-white/10 flex-shrink-0",
          iconClassName
        )} 
      />
      {showText && <span className={textClassName}>Waitfree</span>}
    </div>
  );
}
