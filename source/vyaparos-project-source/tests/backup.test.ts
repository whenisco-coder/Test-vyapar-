import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabaseClientForTesting } from '../src/data/sqliteClient';
import { AppService } from '../src/domain/services';
import { generateUUIDv7 } from '../src/domain/uuid';
import { Customer } from '../src/domain/types';

describe('Encrypted Backup & Restore System (T6, D14)', () => {
  let appService: AppService;
  let db = resetDatabaseClientForTesting();

  beforeEach(async () => {
    db = resetDatabaseClientForTesting();
    appService = new AppService(db);
    await appService.init();
  });

  it('performs full round-trip backup and restore into fresh database', async () => {
    // 1. Seed data
    await appService.setupBusiness({
      businessName: 'Apex Tyres & Spares',
      stateCode: '27',
      invoicePrefix: 'APX',
    });

    const testCust: Customer = {
      id: generateUUIDv7(),
      name: 'Pooja Auto Agency',
      type: 'customer',
      party_kind: 'B2B',
      gstin: '27AAPFU0939F1ZV',
      state_code: '27',
      device_id: 'dev-1',
      user_id: 'usr-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await appService.customers.save(testCust);

    // 2. Create encrypted backup
    const passphrase = 'SuperSecretBackupPassword2026!';
    const encryptedBackupJson = await appService.createEncryptedBackup(passphrase);
    expect(encryptedBackupJson).toContain('business-os-encrypted-backup-v1');
    expect(encryptedBackupJson).toContain('checksum');

    // 3. Clear database completely
    const freshDb = resetDatabaseClientForTesting();
    const freshAppService = new AppService(freshDb);
    await freshAppService.init();

    // Verify database is empty of our business
    expect(await freshAppService.settings.get()).toBeNull();
    expect(await freshAppService.customers.getById(testCust.id)).toBeNull();

    // 4. Restore from encrypted backup
    await freshAppService.restoreFromEncryptedBackup(encryptedBackupJson, passphrase);

    // 5. Verify restored data matches exactly
    const restoredSettings = await freshAppService.settings.get();
    expect(restoredSettings?.business_name).toBe('Apex Tyres & Spares');
    expect(restoredSettings?.invoice_prefix).toBe('APX');

    const restoredCust = await freshAppService.customers.getById(testCust.id);
    expect(restoredCust?.name).toBe('Pooja Auto Agency');
    expect(restoredCust?.gstin).toBe('27AAPFU0939F1ZV');
  });

  it('rejects decryption when an incorrect passphrase is provided', async () => {
    await appService.setupBusiness({
      businessName: 'Apex Tyres & Spares',
      stateCode: '27',
    });

    const encryptedBackupJson = await appService.createEncryptedBackup('CorrectPassword123');

    // Attempt restore with wrong password
    await expect(
      appService.restoreFromEncryptedBackup(encryptedBackupJson, 'WrongPassword456')
    ).rejects.toThrowError(/Incorrect passphrase|Decryption failed/i);
  });

  it('rejects restoration if the backup ciphertext has been tampered with', async () => {
    await appService.setupBusiness({
      businessName: 'Apex Tyres & Spares',
      stateCode: '27',
    });

    const encryptedBackupJson = await appService.createEncryptedBackup('Pass123');
    const envelope = JSON.parse(encryptedBackupJson);

    // Tamper with ciphertext
    const rawCipher = envelope.ciphertextHex as string;
    envelope.ciphertextHex =
      rawCipher.substring(0, rawCipher.length - 4) + 'abcd';
    const tamperedJson = JSON.stringify(envelope);

    await expect(
      appService.restoreFromEncryptedBackup(tamperedJson, 'Pass123')
    ).rejects.toThrowError(/Decryption failed|corrupted/i);
  });
});
