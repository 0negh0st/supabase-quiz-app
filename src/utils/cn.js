import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility para combinar clases de Tailwind CSS
 * Evita conflictos y merge clases correctamente
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
