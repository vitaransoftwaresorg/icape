"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type AdminBackButtonProps = {
  href?: string;
  label?: string;
  onClick?: () => void;
  className?: string;
};

const backButtonClassName =
  "inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-brand";

export function AdminBackButton({
  href,
  label = "Back",
  onClick,
  className,
}: AdminBackButtonProps) {
  const content = (
    <>
      <ArrowLeft className="size-4" aria-hidden />
      {label}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={cn(backButtonClassName, className)}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={href || "/admin/dashboard"}
      className={cn(backButtonClassName, className)}
    >
      {content}
    </Link>
  );
}