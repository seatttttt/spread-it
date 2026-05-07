import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Class-name merge helper.
 * Use everywhere we conditionally compose Tailwind classes: * preserves later-class-wins semantics and dedupes conflicts.
 */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
