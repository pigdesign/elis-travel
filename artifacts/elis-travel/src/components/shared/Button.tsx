import React from "react";
import { cn } from "@/lib/utils";
import { Button as ShadcnButton, ButtonProps as ShadcnButtonProps } from "@/components/ui/button";

export interface ButtonProps extends ShadcnButtonProps {
  pill?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, pill = true, ...props }, ref) => {
    return (
      <ShadcnButton
        ref={ref}
        className={cn(
          pill ? "rounded-full" : "rounded-md",
          "font-semibold tracking-wide transition-transform active:scale-95",
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
