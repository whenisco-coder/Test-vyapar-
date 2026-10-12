import { afterEach, describe, it, expect } from 'vitest';
import { AppService } from '../src/domain/services';
import { encryptBackup } from '../src/domain/crypto';
import { generateUUIDv7 } from '../src/domain/uuid';
import type { Customer } from '../src/domain/types';
import { cleanupRealSqliteDbs, makeDb } from './helpers/file-sqlite-client';

afterEach(() => cleanupRealSqliteDbs());

async function setupBusiness(service: AppService, businessName: string) {
  await service.init();
  await service.setupBusiness({ businessName, stateCode: '27', invoicePrefix: 'APX' });
}

describe('Encrypted Backup & Restore System (T6, D14) — real SQLite', () => {
  it('performs full round-trip backup and restore into fresh database', async () => {
    const sourceDb = makeDb();
    const source = new AppService(sourceDb);
    await setupBusiness(source, 'Apex Tyres & Spares');

    const testCust: Customer = {
      id: generateUUIDv7(), name: 'Pooja Auto Agency', type: 'customer', party_kind: 'B2B',
      gstin: '27AAPFU0939F1ZV', state_code: '27', device_id: 'dev-1', user_id: 'default-owner',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    await source.customers.save(testCust);
    const passphrase = 'SuperSecretBackupPassword2026!';
    const encryptedBackupJson = await source.createEncryptedBackup(passphrase);
    expect(encryptedBackupJson).toContain('business-os-encrypted-backup-v1');
    expect(encryptedBackupJson).toContain('checksum');

    const freshDb = makeDb();
    const freshAppService = new AppService(freshDb);
    await freshAppService.init();
    expect(await freshAppService.settings.get()).toBeNull();
    expect(await freshAppService.customers.getById(testCust.id)).toBeNull();

    await freshAppService.restoreFromEncryptedBackup(encryptedBackupJson, passphrase);
    expect((await freshAppService.settings.get())?.business_name).toBe('Apex Tyres & Spares');
    expect((await freshAppService.settings.get())?.invoice_prefix).toBe('APX');
    const restoredCust = await freshAppService.customers.getById(testCust.id);
    expect(restoredCust?.name).toBe('Pooja Auto Agency');
    expect(restoredCust?.gstin).toBe('27AAPFU0939F1ZV');
  });

  it('rejects decryption when an incorrect passphrase is provided', async () => {
    const sourceDb = makeDb();
    const source = new AppService(sourceDb);
    await setupBusiness(source, 'Apex Tyres & Spares');
    const encryptedBackupJson = await source.createEncryptedBackup('CorrectPassword123');

    const targetDb = makeDb();
    const target = new AppService(targetDb);
    await setupBusiness(target, 'Keep Existing Business');
    await expect(target.restoreFromEncryptedBackup(encryptedBackupJson, 'WrongPassword456'))
      .rejects.toThrowError(/Incorrect passphrase|Decryption failed/i);
    expect((await target.settings.get())?.business_name).toBe('Keep Existing Business');
  });

  it('rejects restoration if the backup ciphertext has been tampered with', async () => {
    const sourceDb = makeDb();
    const source = new AppService(sourceDb);
    await setupBusiness(source, 'Apex Tyres & Spares');
    const encryptedBackupJson = await source.createEncryptedBackup('Pass123');
    const envelope = JSON.parse(encryptedBackupJson);
    const rawCipher = envelope.ciphertextHex as string;
    envelope.ciphertextHex = rawCipher.substring(0, rawCipher.length - 4) + 'abcd';
    const tamperedJson = JSON.stringify(envelope);

    const targetDb = makeDb();
    const target = new AppService(targetDb);
    await setupBusiness(target, 'Keep Existing Business');
    await expect(target.restoreFromEncryptedBackup(tamperedJson, 'Pass123'))
      .rejects.toThrowError(/Decryption failed|corrupted/i);
    expect((await target.settings.get())?.business_name).toBe('Keep Existing Business');
  });
});
