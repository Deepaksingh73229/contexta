// ============================================================
// utils/cn.ts
// Class name merging utility (clsx + tailwind-merge).
// ============================================================

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}