/**
 * Cryptographic Backup and Restore Engine
 * 
 * Uses standard WebCrypto APIs (supported natively in all modern browsers and Node 18+):
 * - Key derivation: PBKDF2 with SHA-256 (100,000 iterations)
 * - Encryption: AES-GCM 256-bit
 * - Checksum: SHA-256
 */

export interface BackupEnvelope {
  format: 'business-os-encrypted-backup-v1';
  version: number;
  saltHex: string;
  ivHex: string;
  ciphertextHex: string;
  checksum: string;
  timestamp: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hexadecimal string');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function computeSha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return bytesToHex(new Uint8Array(digest));
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt arbitrary database payload (JSON string or object) with a passphrase
 */
export async function encryptBackup(
  payload: unknown,
  passphrase: string
): Promise<string> {
  if (!passphrase || passphrase.trim().length === 0) {
    throw new Error('A non-empty passphrase is required to encrypt backup');
  }

  const jsonStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const checksum = await computeSha256(jsonStr);

  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(salt);
  crypto.getRandomValues(iv);

  const key = await deriveKey(passphrase, salt);
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(jsonStr);

  const cipherBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    plaintextBytes
  );

  const envelope: BackupEnvelope = {
    format: 'business-os-encrypted-backup-v1',
    version: 1,
    saltHex: bytesToHex(salt),
    ivHex: bytesToHex(iv),
    ciphertextHex: bytesToHex(new Uint8Array(cipherBuffer)),
    checksum,
    timestamp: new Date().toISOString(),
  };

  return JSON.stringify(envelope, null, 2);
}

/**
 * Decrypt and verify backup envelope with a passphrase.
 * Returns parsed payload. Throws clear error on wrong passphrase, tamper, or corrupt format.
 */
export async function decryptBackup<T = unknown>(
  backupEnvelopeJson: string,
  passphrase: string
): Promise<T> {
  if (!passphrase || passphrase.trim().length === 0) {
    throw new Error('A passphrase is required to decrypt backup');
  }

  let envelope: BackupEnvelope;
  try {
    envelope = JSON.parse(backupEnvelopeJson);
  } catch {
    throw new Error('Invalid backup file format: not valid JSON');
  }

  if (envelope.format !== 'business-os-encrypted-backup-v1') {
    throw new Error('Unsupported or unrecognized backup format');
  }

  const salt = hexToBytes(envelope.saltHex);
  const iv = hexToBytes(envelope.ivHex);
  const cipherBytes = hexToBytes(envelope.ciphertextHex);

  const key = await deriveKey(passphrase, salt);

  let decryptedBuffer: ArrayBuffer;
  try {
    decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as any,
      },
      key,
      cipherBytes as any
    );
  } catch {
    throw new Error('Decryption failed: Incorrect passphrase or corrupted backup file');
  }

  const decoder = new TextDecoder();
  const decryptedJson = decoder.decode(decryptedBuffer);

  // Checksum verification
  const computedChecksum = await computeSha256(decryptedJson);
  if (computedChecksum !== envelope.checksum) {
    throw new Error('Integrity check failed: Checksum does not match. The file may be tampered.');
  }

  return JSON.parse(decryptedJson) as T;
}
