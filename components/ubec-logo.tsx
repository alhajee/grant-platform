import Image from "next/image";
import { cn } from "@/lib/utils";

export function UbecLogo({ className, size = 44 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/ubec-logo.png"
      alt="UBEC"
      width={500}
      height={503}
      unoptimized
      className={cn("ubec-logo", className)}
      style={{ width: size, height: "auto", flexShrink: 0 }}
    />
  );
}
