// Import style text files
import mainStyleText from './main_style.txt?raw';
import allStyleText from './all_style.txt?raw';

// Main styles (top-level genres) from main_style.txt
export const MAIN_STYLES = mainStyleText
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 0);

// All styles from all_style.txt
export const ALL_STYLES = allStyleText
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 0);

// Backward-compatible alias
export const GENRE_KEYS = MAIN_STYLES;

// Sub-styles: all styles minus the main genres
const mainStylesLower = new Set(MAIN_STYLES.map(s => s.toLowerCase().trim()));

export const SUB_STYLES = ALL_STYLES.filter(style => {
  const styleLower = style.toLowerCase().trim();
  return !mainStylesLower.has(styleLower);
});

// Type definitions
export type MainStyle = typeof MAIN_STYLES[number];
export type AllStyle = typeof ALL_STYLES[number];
export type SubStyle = typeof SUB_STYLES[number];
