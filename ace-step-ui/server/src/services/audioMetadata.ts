import NodeID3 from 'node-id3';
import fs from 'fs';
import path from 'path';

export interface AudioMetadataOptions {
  title: string;
  artist: string;
  album?: string;
  bpm?: number;
  key?: string;
  timeSignature?: string;
  genre?: string;
  year?: string;
  comment?: string;
  coverImagePath?: string;
  coverImageBuffer?: Buffer;
}

/**
 * Write ID3 metadata tags to an MP3 file buffer.
 * Returns a new buffer with the tags embedded.
 */
export function tagMp3Buffer(buffer: Buffer, meta: AudioMetadataOptions): Buffer {
  const tags: NodeID3.Tags = {
    title: meta.title,
    artist: meta.artist,
    album: meta.album || 'ProdIA pro',
    year: meta.year || new Date().getFullYear().toString(),
    genre: meta.genre || 'AI Generated',
    comment: {
      language: 'eng',
      text: meta.comment || buildComment(meta),
    },
    bpm: meta.bpm ? String(meta.bpm) : undefined,
    initialKey: meta.key || undefined,
    encodedBy: 'ProdIA pro V0.1.0',
    publisher: 'ProdIA pro',
  };

  // Add cover art if available
  if (meta.coverImageBuffer) {
    tags.image = {
      mime: 'image/jpeg',
      type: { id: 3, name: 'front cover' },
      description: 'Cover',
      imageBuffer: meta.coverImageBuffer,
    };
  } else if (meta.coverImagePath && fs.existsSync(meta.coverImagePath)) {
    const imgBuffer = fs.readFileSync(meta.coverImagePath);
    const ext = path.extname(meta.coverImagePath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
    tags.image = {
      mime,
      type: { id: 3, name: 'front cover' },
      description: 'Cover',
      imageBuffer: imgBuffer,
    };
  }

  // Write tags to buffer
  const tagged = NodeID3.update(tags, buffer);
  if (tagged instanceof Buffer) {
    return tagged;
  }
  // If update returns false/true instead of buffer, fall back
  return buffer;
}

/**
 * Build a comment string from metadata fields.
 */
function buildComment(meta: AudioMetadataOptions): string {
  const parts: string[] = ['Generated with ProdIA pro V0.1.0'];
  if (meta.bpm) parts.push(`BPM: ${meta.bpm}`);
  if (meta.key) parts.push(`Key: ${meta.key}`);
  if (meta.timeSignature) parts.push(`Time: ${meta.timeSignature}/4`);
  return parts.join(' | ');
}

/**
 * Tag an audio buffer with metadata based on format.
 * Currently supports MP3 only. FLAC passes through untagged.
 */
export function tagAudioBuffer(
  buffer: Buffer,
  format: 'mp3' | 'flac',
  meta: AudioMetadataOptions
): Buffer {
  if (format === 'mp3') {
    return tagMp3Buffer(buffer, meta);
  }
  // FLAC: pass through for now (could add vorbis comments later)
  return buffer;
}
