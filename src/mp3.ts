// MP3 splicing for narration: join separately synthesised chunks with real silence between them, at frame boundaries.
// Only frame headers are read (no decoding), so the cost is one small loop per frame plus memcpy: a ten-minute chapter
// at 22.05 kHz is ~23,000 frames, well under a millisecond of CPU.
//
// Each chunk's ID3 tags and Xing/Info/VBRI frame are dropped (a mid-stream Xing frame would make the browser think the
// whole file is as long as the first chunk). Silence is a run of frames cloned from the neighbouring chunk's own header
// (same MPEG version, sample rate, channel mode and bitrate) with all-zero side info, which every decoder plays as
// digital silence. A fresh Xing/Info frame at the front carries the total frame and byte counts so duration and seeking
// are exact.

export interface FrameInfo {
  version: 1 | 2 | 2.5; bitrate: number; sampleRate: number; padding: number; mode: number; protection: boolean;
  samplesPerFrame: number; length: number; sideInfo: number;
}

const BR_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BR_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SR = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 2.5: [11025, 12000, 8000] } as const;

/** Parse a Layer III frame header at `i`; null if there isn't one (free-format bitrate is not supported). */
export function parseFrame(b: Uint8Array, i: number): FrameInfo | null {
  if (i + 4 > b.length || b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null;
  const v = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3, bri = b[i + 2] >> 4, sri = (b[i + 2] >> 2) & 3;
  if (v === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) return null; // layer bits 01 = Layer III
  const version = v === 3 ? 1 : v === 2 ? 2 : 2.5;
  const bitrate = (version === 1 ? BR_V1_L3 : BR_V2_L3)[bri] * 1000;
  const sampleRate = SR[version][sri];
  const padding = (b[i + 2] >> 1) & 1, mode = b[i + 3] >> 6, protection = (b[i + 1] & 1) === 0;
  const samplesPerFrame = version === 1 ? 1152 : 576;
  const length = Math.floor((samplesPerFrame / 8) * bitrate / sampleRate) + padding;
  const mono = mode === 3;
  const sideInfo = version === 1 ? (mono ? 17 : 32) : (mono ? 9 : 17);
  return { version, bitrate, sampleRate, padding, mode, protection, samplesPerFrame, length, sideInfo };
}

const tagAt = (b: Uint8Array, i: number, tag: string) => i + tag.length <= b.length && [...tag].every((ch, k) => b[i + k] === ch.charCodeAt(0));

/** True for a Xing/Info (LAME) or VBRI header frame: metadata, not audio. */
function isInfoFrame(b: Uint8Array, i: number, f: FrameInfo) {
  const x = i + 4 + (f.protection ? 2 : 0) + f.sideInfo;
  return tagAt(b, x, "Xing") || tagAt(b, x, "Info") || tagAt(b, i + 36, "VBRI");
}

export interface Mp3Stream { frames: Array<[number, number]>; first: FrameInfo | null; headerAt: number; samples: number; vbr: boolean }

/** Locate every audio frame in an MP3 byte stream, skipping ID3v2/ID3v1 and Xing/Info/VBRI frames. */
export function scanMp3(b: Uint8Array): Mp3Stream {
  let i = 0;
  while (tagAt(b, i, "ID3") && i + 10 <= b.length) { // ID3v2 (possibly several); size is syncsafe, +10 for a footer
    const size = ((b[i + 6] & 0x7f) << 21) | ((b[i + 7] & 0x7f) << 14) | ((b[i + 8] & 0x7f) << 7) | (b[i + 9] & 0x7f);
    i += 10 + size + (b[i + 5] & 0x10 ? 10 : 0);
  }
  let end = b.length;
  if (end - 128 >= i && tagAt(b, end - 128, "TAG")) end -= 128; // ID3v1
  const frames: Array<[number, number]> = []; let first: FrameInfo | null = null; let headerAt = -1; let samples = 0; let br = 0; let vbr = false;
  while (i + 4 <= end) {
    const f = parseFrame(b, i);
    // accept a header only if the frame fits and is followed by another header or the end, so stray 0xFFE bytes don't count
    if (!f || i + f.length > end || (i + f.length + 4 <= end && !parseFrame(b, i + f.length) && i + f.length !== end)) { i++; continue; }
    if (!isInfoFrame(b, i, f)) {
      if (!first) { first = f; headerAt = i; br = f.bitrate; } else if (f.bitrate !== br) vbr = true;
      frames.push([i, i + f.length]); samples += f.samplesPerFrame;
    }
    i += f.length;
  }
  return { frames, first, headerAt, samples, vbr };
}

/** One frame of digital silence with the same version / rate / mode / bitrate as `hdr` (4 header bytes). No CRC, no padding. */
export function silentFrame(hdr: Uint8Array): Uint8Array {
  const h = Uint8Array.from(hdr.subarray(0, 4));
  h[1] |= 1; h[2] &= ~2; // protection bit = 1 (no CRC); padding bit = 0
  const f = parseFrame(h, 0)!;
  const out = new Uint8Array(f.length); out.set(h, 0); // side info and main data all zero: part2_3_length = 0 → silence
  return out;
}

/** A Xing (VBR) or Info (CBR) frame carrying the total frame and byte counts. */
function infoFrame(hdr: Uint8Array, frames: number, bytes: number, vbr: boolean): Uint8Array {
  const out = silentFrame(hdr); const f = parseFrame(out, 0)!;
  const x = 4 + f.sideInfo; const tag = vbr ? "Xing" : "Info";
  for (let k = 0; k < 4; k++) out[x + k] = tag.charCodeAt(k);
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  dv.setUint32(x + 4, 0x3); dv.setUint32(x + 8, frames); dv.setUint32(x + 12, bytes + out.length); // flags: frames + bytes
  return out;
}

export const frameMs = (f: Pick<FrameInfo, "samplesPerFrame" | "sampleRate">) => (f.samplesPerFrame / f.sampleRate) * 1000;

export interface SplicePart { audio: Uint8Array; pauseAfterMs: number }
export interface SpliceResult { bytes: Uint8Array; spliced: boolean; frames: number; durationMs: number; silenceMs: number }

/**
 * Join MP3 chunks, inserting `pauseAfterMs` of silence after each (rounded to whole frames, ±13 ms at 22.05 kHz).
 * If any chunk isn't parseable Layer III, or the chunks disagree on sample rate / channel mode, falls back to plain
 * concatenation without pauses (still playable, just the old behaviour) and reports spliced: false.
 */
export function spliceMp3(parts: SplicePart[]): SpliceResult {
  const scans = parts.map((p) => scanMp3(p.audio));
  const f0 = scans[0]?.first;
  const ok = !!f0 && scans.every((s) => s.first && s.first.sampleRate === f0.sampleRate && (s.first.mode === 3) === (f0.mode === 3) && s.first.version === f0.version);
  if (!ok) {
    const bytes = concat(parts.map((p) => p.audio));
    return { bytes, spliced: false, frames: 0, durationMs: 0, silenceMs: 0 };
  }
  const pieces: Uint8Array[] = []; let frames = 0; let silenceFrames = 0; let vbr = false; let size = 0;
  scans.forEach((s, k) => {
    const a = parts[k].audio;
    if (s.vbr || s.first!.bitrate !== f0.bitrate) vbr = true;
    // frames found by scanMp3 are contiguous runs in practice; copy each maximal contiguous run in one subarray
    let runStart = s.frames[0][0], runEnd = s.frames[0][1];
    for (let j = 1; j < s.frames.length; j++) {
      const [st, en] = s.frames[j];
      if (st === runEnd) { runEnd = en; continue; }
      pieces.push(a.subarray(runStart, runEnd)); size += runEnd - runStart; runStart = st; runEnd = en;
    }
    pieces.push(a.subarray(runStart, runEnd)); size += runEnd - runStart;
    frames += s.frames.length;
    const pause = k < parts.length - 1 ? parts[k].pauseAfterMs : 0;
    const n = Math.round(Math.max(0, pause) / frameMs(s.first!));
    if (n > 0) {
      const sil = silentFrame(a.subarray(s.headerAt, s.headerAt + 4));
      for (let j = 0; j < n; j++) pieces.push(sil);
      size += n * sil.length; frames += n; silenceFrames += n;
    }
  });
  const head = infoFrame(parts[0].audio.subarray(scans[0].headerAt, scans[0].headerAt + 4), frames, size, vbr);
  const bytes = concat([head, ...pieces]);
  const ms = frameMs(f0);
  return { bytes, spliced: true, frames, durationMs: Math.round(frames * ms), silenceMs: Math.round(silenceFrames * ms) };
}

export function concat(list: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(list.reduce((n, b) => n + b.byteLength, 0)); let off = 0;
  for (const b of list) { out.set(b, off); off += b.byteLength; }
  return out;
}
