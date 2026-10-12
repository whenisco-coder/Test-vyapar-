/**
 * Encrypted Backup & Restore Module
 * Uses standard WebCrypto API (PBKDF2 + AES-GCM-256).
 * Zero external dependencies.
 */

export interface BackupEnvelope {
  format: 'BUSINESS_OS_ENCRYPTED_BACKUP_V1';
  salt: string;      // Base64
  iv: string;        // Base64
  ciphertext: string;// Base64
  timestamp: string;
}

export interface BackupPayload {
  version: number;
  exported_at: string;
  checksum: string;
  tables: Record<string, any[]>;
}

function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function computeSha256(text: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptBackup(tables: Record<string, any[]>, passphrase: string): Promise<BackupEnvelope> {
  if (!passphrase || passphrase.length < 4) {
    throw new Error('Passphrase must be at least 4 characters long');
  }

  const rawTablesJson = JSON.stringify(tables);
  const checksum = await computeSha256(rawTablesJson);

  const payload: BackupPayload = {
    version: 1,
    exported_at: new Date().toISOString(),
    checksum,
    tables,
  };

  const payloadString = JSON.stringify(payload);
  const enc = new TextEncoder();
  const plaintext = enc.encode(payloadString);

  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const key = await deriveKey(passphrase, salt);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    plaintext
  );

  return {
    format: 'BUSINESS_OS_ENCRYPTED_BACKUP_V1',
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertext),
    timestamp: payload.exported_at,
  };
}

export async function decryptBackup(envelope: BackupEnvelope, passphrase: string): Promise<BackupPayload> {
  if (envelope.format !== 'BUSINESS_OS_ENCRYPTED_BACKUP_V1') {
    throw new Error('Unsupported backup file format');
  }

  if (!envelope.salt || !envelope.iv || !envelope.ciphertext) {
    throw new Error('Corrupt or malformed backup file structure');
  }

  const salt = base64ToBuffer(envelope.salt);
  const iv = base64ToBuffer(envelope.iv);
  const ciphertext = base64ToBuffer(envelope.ciphertext);

  let key: CryptoKey;
  try {
    key = await deriveKey(passphrase, salt);
  } catch (e: any) {
    throw new Error(`Key derivation failed: ${e.message}`);
  }

  let decryptedBuffer: ArrayBuffer;
  try {
    decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as any,
      },
      key,
      ciphertext as any
    );
  } catch {
    throw new Error('Incorrect passphrase or corrupted backup file');
  }

  const dec = new TextDecoder();
  const decryptedJson = dec.decode(decryptedBuffer);

  let payload: BackupPayload;
  try {
    payload = JSON.parse(decryptedJson);
  } catch {
    throw new Error('Failed to parse decrypted backup data');
  }

  // Validate checksum
  const expectedChecksum = payload.checksum;
  const actualChecksum = await computeSha256(JSON.stringify(payload.tables));
  if (expectedChecksum !== actualChecksum) {
    throw new Error('Integrity check failed: Backup checksum mismatch');
  }

  return payload;
}
