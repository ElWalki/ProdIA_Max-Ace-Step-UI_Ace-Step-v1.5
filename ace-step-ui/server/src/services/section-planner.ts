/**
 * Section Planner for structured music generation.
 *
 * Parses lyrics with structure tags ([Verse], [Chorus], [Rap], etc.) into
 * sections and estimates BPM-aligned durations using musical phrasing rules.
 *
 * Key design:
 *   • Each section is assigned a number of MEASURES based on its type and
 *     line count, then snapped to the nearest musical phrase boundary
 *     (multiples of 4 measures — standard phrasing in pop/urban music).
 *   • Different section types have different "measures per lyric line"
 *     ratios: rap packs more words per measure, choruses are slower/melodic.
 *   • Instrumental sections (intro, interlude, outro) get fixed block sizes.
 */

export interface LyricSection {
  tag: string;           // e.g. "Intro", "Verse 1", "Chorus", "Bridge", "Outro", "Rap"
  lyrics: string;        // The lyrics text for this section (without the tag line)
  lineCount: number;     // Number of non-empty lyric lines
  estimatedDuration: number; // Estimated duration in seconds
  startTime: number;     // Cumulative start time in seconds
  measures: number;      // Number of measures assigned to this section
}

export interface SectionPlan {
  sections: LyricSection[];
  totalDuration: number;
  bpm: number;
  beatsPerMeasure: number;
  measureDuration: number; // seconds per measure
}

// ---------------------------------------------------------------------------
// Section type configuration
// ---------------------------------------------------------------------------
//
// measuresPerLine — how many measures one lyric line typically occupies.
//   • Rap/fast sections: 1 line ≈ 1 measure (dense text)
//   • Melodic sections:  1 line ≈ 2 measures (held notes, breathing room)
//   • Choruses:          1 line ≈ 2 measures (repetitive, melodic)
//
// fixedMeasures — for instrumental/structural sections with no or few lyrics,
//   use a fixed number of measures instead of calculating from line count.
//
// minMeasures / maxMeasures — hard clamps after snapping to phrase boundary.

interface SectionConfig {
  measuresPerLine: number;
  fixedMeasures?: number;  // override line-based calculation
  minMeasures: number;
  maxMeasures: number;
  phraseSize: number;      // snap to multiples of this (typically 4)
}

const DEFAULT_CONFIG: SectionConfig = {
  measuresPerLine: 2,
  minMeasures: 4,
  maxMeasures: 64,
  phraseSize: 4,
};

function getSectionConfig(tag: string): SectionConfig {
  const t = tag.toLowerCase().replace(/\s*\d+$/, '').trim(); // "verse 2" → "verse"
  switch (t) {
    // --- Vocal sections ---
    case 'verse':
      return { measuresPerLine: 2, minMeasures: 8, maxMeasures: 32, phraseSize: 4 };
    case 'chorus':
    case 'hook':
      return { measuresPerLine: 2, minMeasures: 8, maxMeasures: 32, phraseSize: 4 };
    case 'pre-chorus':
    case 'prechorus':
    case 'post-chorus':
      return { measuresPerLine: 2, minMeasures: 4, maxMeasures: 16, phraseSize: 4 };
    case 'bridge':
      return { measuresPerLine: 2, minMeasures: 4, maxMeasures: 16, phraseSize: 4 };

    // --- Dense/fast sections (rap, spoken word) ---
    case 'rap':
    case 'rap verse':
    case 'spoken':
    case 'freestyle':
      return { measuresPerLine: 1, minMeasures: 8, maxMeasures: 32, phraseSize: 4 };

    // --- Instrumental / structural ---
    case 'intro':
      return { measuresPerLine: 2, fixedMeasures: 4, minMeasures: 4, maxMeasures: 16, phraseSize: 4 };
    case 'outro':
      return { measuresPerLine: 2, fixedMeasures: 8, minMeasures: 4, maxMeasures: 16, phraseSize: 4 };
    case 'interlude':
    case 'breakdown':
      return { measuresPerLine: 2, fixedMeasures: 4, minMeasures: 4, maxMeasures: 16, phraseSize: 4 };
    case 'instrumental':
    case 'solo':
      return { measuresPerLine: 2, fixedMeasures: 8, minMeasures: 4, maxMeasures: 32, phraseSize: 4 };
    case 'drop':
      return { measuresPerLine: 2, fixedMeasures: 8, minMeasures: 8, maxMeasures: 32, phraseSize: 8 };

    default:
      return DEFAULT_CONFIG;
  }
}

/**
 * Snap a raw measure count to the nearest musical phrase boundary.
 * Musical phrases are typically 4 measures; this ensures sections start/end
 * on phrase boundaries which sounds natural.
 */
function snapToPhrase(rawMeasures: number, phraseSize: number, min: number, max: number): number {
  // Round to nearest multiple of phraseSize
  const snapped = Math.max(phraseSize, Math.round(rawMeasures / phraseSize) * phraseSize);
  return Math.min(max, Math.max(min, snapped));
}

/**
 * Parse beats-per-measure from a time signature string.
 * Supports: "2" (2/4), "3" (3/4), "4" (4/4), "5" (5/4), "6" (6/8),
 *           "7" (7/8), "8" (8/8 or 4/4 double-time).
 * Also supports fractional notation like "4/4", "6/8", "7/8".
 */
export function parseBeatsPerMeasure(timeSignature: string): number {
  const ts = (timeSignature || '4').trim();
  // Handle "X/Y" notation — extract numerator
  const slashMatch = ts.match(/^(\d+)\/\d+$/);
  if (slashMatch) {
    const num = parseInt(slashMatch[1], 10);
    return num > 0 ? num : 4;
  }
  const val = parseInt(ts, 10);
  return (val > 0 && val <= 12) ? val : 4;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse lyrics text into structured sections.
 * Recognizes tags like [Verse 1], [Chorus], [Intro], etc.
 */
export function parseLyricSections(lyrics: string): Array<{ tag: string; lyrics: string; lineCount: number }> {
  const lines = lyrics.split('\n');
  const sections: Array<{ tag: string; lyrics: string; lineCount: number }> = [];
  
  let currentTag = '';
  let currentLines: string[] = [];
  
  const tagRegex = /^\[([^\]]+)\]/;
  
  for (const line of lines) {
    const match = line.trim().match(tagRegex);
    if (match) {
      // Save previous section if it has content
      if (currentTag || currentLines.length > 0) {
        const lyricText = currentLines.join('\n').trim();
        const nonEmptyLines = currentLines.filter(l => l.trim().length > 0);
        sections.push({
          tag: currentTag || 'Verse',
          lyrics: lyricText,
          lineCount: nonEmptyLines.length,
        });
      }
      currentTag = match[1].trim();
      // Check if there's text after the tag on the same line
      const afterTag = line.trim().replace(tagRegex, '').trim();
      currentLines = afterTag ? [afterTag] : [];
    } else {
      currentLines.push(line);
    }
  }
  
  // Don't forget the last section
  if (currentTag || currentLines.length > 0) {
    const lyricText = currentLines.join('\n').trim();
    const nonEmptyLines = currentLines.filter(l => l.trim().length > 0);
    sections.push({
      tag: currentTag || 'Verse',
      lyrics: lyricText,
      lineCount: nonEmptyLines.length,
    });
  }
  
  return sections.filter(s => s.lyrics.length > 0 || isInstrumentalTag(s.tag));
}

/** Check if a section tag represents an instrumental/structural section. */
function isInstrumentalTag(tag: string): boolean {
  const t = tag.toLowerCase().replace(/\s*\d+$/, '').trim();
  return ['intro', 'outro', 'interlude', 'breakdown', 'instrumental', 'solo', 'drop'].includes(t);
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/**
 * Estimate the duration for each section based on BPM, time signature, and
 * line count.
 *
 * Algorithm:
 *   1. For each section, calculate raw measures = lineCount × measuresPerLine
 *      (or use fixedMeasures for instrumental sections).
 *   2. Snap to the nearest phrase boundary (multiple of 4 measures).
 *   3. Clamp to min/max for the section type.
 *   4. If a targetTotalDuration is given, scale all sections proportionally
 *      then re-snap to phrase boundaries.
 *   5. Convert measures → seconds using measureDuration = (beatsPerMeasure / BPM) × 60.
 */
export function planSections(
  lyrics: string,
  bpm: number = 120,
  timeSignature: string = '4',
  targetTotalDuration?: number,
  sectionMeasures?: number,
): SectionPlan {
  const effectiveBpm = (bpm && bpm > 0) ? bpm : 120;
  const beatsPerMeasure = parseBeatsPerMeasure(timeSignature);
  const measureDuration = (beatsPerMeasure / effectiveBpm) * 60;
  
  const rawSections = parseLyricSections(lyrics);
  
  if (rawSections.length === 0) {
    // No sections found — return single section with full lyrics
    const lineCount = lyrics.split('\n').filter(l => l.trim().length > 0).length;
    const fallbackDuration = targetTotalDuration || Math.max(30, snapToPhrase(lineCount * 2, 4, 8, 64) * measureDuration);
    return {
      sections: [{
        tag: 'Full Song',
        lyrics: lyrics.trim(),
        lineCount,
        estimatedDuration: Math.round(fallbackDuration),
        startTime: 0,
        measures: Math.round(fallbackDuration / measureDuration),
      }],
      totalDuration: Math.round(fallbackDuration),
      bpm: effectiveBpm,
      beatsPerMeasure,
      measureDuration,
    };
  }
  
  // Step 1: Calculate measures per section
  // If sectionMeasures override is provided, use it as the phrase/snap size
  const sectionsWithMeasures = rawSections.map(s => {
    const cfg = getSectionConfig(s.tag);
    // Apply sectionMeasures override: snap to user's chosen block size
    const effectivePhraseSize = sectionMeasures && sectionMeasures > 0 ? sectionMeasures : cfg.phraseSize;
    const effectiveMinMeasures = sectionMeasures && sectionMeasures > 0 ? sectionMeasures : cfg.minMeasures;
    let rawMeasures: number;
    if (cfg.fixedMeasures !== undefined && s.lineCount === 0) {
      // Instrumental section with no lyrics: use fixed block (or sectionMeasures override)
      rawMeasures = sectionMeasures && sectionMeasures > 0 ? sectionMeasures : cfg.fixedMeasures;
    } else if (cfg.fixedMeasures !== undefined && s.lineCount > 0) {
      // Structural section with some lyrics (e.g. intro with vocals)
      rawMeasures = Math.max(cfg.fixedMeasures, s.lineCount * cfg.measuresPerLine);
    } else {
      rawMeasures = s.lineCount * cfg.measuresPerLine;
    }
    const measures = snapToPhrase(rawMeasures, effectivePhraseSize, effectiveMinMeasures, cfg.maxMeasures);
    return { ...s, measures, cfg };
  });
  
  // Step 2: If target duration specified, scale proportionally then re-snap
  if (targetTotalDuration && targetTotalDuration > 0) {
    const naturalTotal = sectionsWithMeasures.reduce((sum, s) => sum + s.measures, 0) * measureDuration;
    if (naturalTotal > 0) {
      const scale = targetTotalDuration / naturalTotal;
      for (const s of sectionsWithMeasures) {
        const scaled = s.measures * scale;
        s.measures = snapToPhrase(scaled, s.cfg.phraseSize, s.cfg.minMeasures, s.cfg.maxMeasures);
      }
    }
  }
  
  // Step 3: Build final plan with cumulative start times
  let cumulative = 0;
  const sections: LyricSection[] = sectionsWithMeasures.map(s => {
    const duration = parseFloat((s.measures * measureDuration).toFixed(2));
    const section: LyricSection = {
      tag: s.tag,
      lyrics: s.lyrics,
      lineCount: s.lineCount,
      estimatedDuration: duration,
      startTime: parseFloat(cumulative.toFixed(2)),
      measures: s.measures,
    };
    cumulative += duration;
    return section;
  });
  
  return {
    sections,
    totalDuration: parseFloat(cumulative.toFixed(2)),
    bpm: effectiveBpm,
    beatsPerMeasure,
    measureDuration: parseFloat(measureDuration.toFixed(4)),
  };
}
