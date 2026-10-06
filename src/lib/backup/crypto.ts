// Passphrase encryption for backups and partner shares (WebCrypto only, nothing leaves the device).
//
//  • PBKDF2-SHA256, 600,000 iterations, 16-byte random salt per file → 512 bits.
//  • First 256 bits: the AES-GCM key. Second 256 bits: hashed into a short "verifier" stored in
//    the file, so a wrong passphrase is reported as such — distinct from a damaged/tampered
//    file, which fails the GCM tag check.
//  • The JSON is compressed (deflate-raw) before encrypting when the browser supports it.
//  • AES-GCM with a 12-byte random IV per file; the file kind and compression are bound in as
//    additional data.
//  • The passphrase is never stored.

export const PBKDF2_ITERATIONS = 600_000;
/** Shortest passphrase accepted for backups and partner shares. */
export const MIN_PASSPHRASE = 8;

export function checkPassphrase(passphrase: string): void {
  if (passphrase.length < MIN_PASSPHRASE) throw new Error(`Use a passphrase of at least ${MIN_PASSPHRASE} characters.`);
}

export type EncryptedKind = 'backup' | 'partner';

export interface EncryptedFile {
  format: 'wiai-encrypted';
  v: 1;
  kind: EncryptedKind;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  /** Set when the JSON was compressed before encrypting. */
  zip?: 'deflate-raw';
  /** Base64 of SHA-256(second half of the derived bits), first 16 bytes. Not the key. */
  check: string;
  data: string;
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('That passphrase doesn’t open this file. Check it and try again.');
    this.name = 'WrongPassphraseError';
  }
}

export class TamperedFileError extends Error {
  constructor() {
    super('This file has been changed or damaged since it was made, so it can’t be opened safely.');
    this.name = 'TamperedFileError';
  }
}

export class NotOurFileError extends Error {
  constructor(what = 'This isn’t a file made by this app.') {
    super(what);
    this.name = 'NotOurFileError';
  }
}

/** Bytes backed by a plain ArrayBuffer (what WebCrypto accepts). */
type Bytes = Uint8Array<ArrayBuffer>;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Bytes {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function random(n: number): Bytes {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

async function deriveKeys(passphrase: string, salt: Bytes, iterations: number): Promise<{ key: CryptoKey; check: string }> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 512));
  const key = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const check = new Uint8Array(await crypto.subtle.digest('SHA-256', bits.slice(32))).slice(0, 16);
  return { key, check: toBase64(check) };
}

/** Compression applied before encrypting (bound into the authenticated data). */
export type Compression = 'deflate-raw';

const aad = (kind: EncryptedKind, zip?: Compression) => enc.encode(zip ? `wiai|${kind}|1|${zip}` : `wiai|${kind}|1`);

const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

async function pipe(bytes: Bytes, stream: CompressionStream | DecompressionStream): Promise<Bytes> {
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(out);
}

export async function encryptJson(value: unknown, passphrase: string, kind: EncryptedKind): Promise<EncryptedFile> {
  if (!passphrase) throw new Error('A passphrase is needed.');
  const salt = random(16);
  const iv = random(12);
  const { key, check } = await deriveKeys(passphrase, salt, PBKDF2_ITERATIONS);
  // Compress first (JSON shrinks 3–5×): smaller files, and partner shares fit a QR code more often.
  const zip: Compression | undefined = canCompress() ? 'deflate-raw' : undefined;
  const json = enc.encode(JSON.stringify(value));
  const payload = zip ? await pipe(json, new CompressionStream(zip)) : json;
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(kind, zip) }, key, payload);
  return {
    format: 'wiai-encrypted',
    v: 1,
    kind,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: toBase64(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    ...(zip ? { zip } : {}),
    check,
    data: toBase64(new Uint8Array(ct)),
  };
}

export function isEncryptedFile(x: unknown): x is EncryptedFile {
  const f = x as EncryptedFile;
  return (
    !!f && f.format === 'wiai-encrypted' && f.v === 1 && (f.kind === 'backup' || f.kind === 'partner') && typeof f.data === 'string' &&
    (f.zip === undefined || f.zip === 'deflate-raw')
  );
}

export async function decryptJson<T = unknown>(file: EncryptedFile, passphrase: string): Promise<T> {
  if (!isEncryptedFile(file) || file.kdf?.name !== 'PBKDF2' || file.cipher?.name !== 'AES-GCM') throw new NotOurFileError();
  // Our files always use the full iteration count; anything weaker wasn't made by this app.
  if (!(file.kdf.iterations >= PBKDF2_ITERATIONS)) throw new NotOurFileError();
  if (file.zip && !canCompress()) throw new NotOurFileError('This browser is too old to open this file. Update it, or open the app in another browser.');
  let salt: Bytes, iv: Bytes, data: Bytes;
  try {
    salt = fromBase64(file.kdf.salt);
    iv = fromBase64(file.cipher.iv);
    data = fromBase64(file.data);
  } catch {
    throw new TamperedFileError();
  }
  const { key, check } = await deriveKeys(passphrase, salt, file.kdf.iterations);
  if (check !== file.check) throw new WrongPassphraseError();
  let plain: Bytes;
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad(file.kind, file.zip) }, key, data));
  } catch {
    throw new TamperedFileError(); // right passphrase, but the GCM tag doesn't match
  }
  try {
    const json = file.zip ? await pipe(plain, new DecompressionStream(file.zip)) : plain;
    return JSON.parse(dec.decode(json)) as T;
  } catch {
    throw new TamperedFileError();
  }
}

/** Hex SHA-256 of a string (backup checksums). */
export async function sha256Hex(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}
