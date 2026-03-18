import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges Tailwind CSS class names, resolving conflicts with tailwind-merge.
 * @param inputs - Any combination of strings, arrays, or conditional class values
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
