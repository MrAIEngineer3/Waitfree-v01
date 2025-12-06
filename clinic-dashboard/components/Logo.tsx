import { cn } from "@/lib/utils";
import Image from "next/image";

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
    <div className={cn(
      "flex items-center gap-3 font-semibold group cursor-pointer",
      className
    )}>
      {/* Logo Image Container with natural integration */}
      <div className={cn(
        "relative flex-shrink-0 rounded-xl overflow-hidden",
        "bg-gradient-to-br from-blue-50/80 via-white to-cyan-50/80",
        "shadow-sm hover:shadow-md transition-all duration-300 ease-out",
        "ring-1 ring-black/5 dark:ring-white/10"
      )}>
        <Image 
          src="/logo.png"
          alt="WaitFree Logo"
          width={150}
          height={150}
          className={cn(
            "h-16 w-auto object-contain",
            "transition-transform duration-300 ease-out",
            "group-hover:scale-105",
            iconClassName
          )}
          priority
        />
      </div>
      
      {/* Text with clear visibility */}
      {showText && (
        <div className="flex flex-col min-w-0">
          <span className={cn(
            "text-lg font-bold tracking-tight text-foreground",
            "transition-colors duration-200",
            textClassName
          )}>
            <span className="text-blue-600 dark:text-blue-400">Wait</span>
            <span className="text-emerald-600 dark:text-emerald-400">Free</span>
          </span>
          <span className="text-[10px] font-medium text-muted-foreground tracking-wide truncate">
            Track your turn. Save your time.
          </span>
        </div>
      )}
    </div>
  );
}
