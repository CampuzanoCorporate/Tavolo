import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { config } from '../../config';

function ensureQzSigningConfigured() {
  if (!config.qzTray.certificatePath || !config.qzTray.privateKeyPath) {
    throw new Error('QZ Tray no está configurado. Define QZ_TRAY_CERTIFICATE_PATH y QZ_TRAY_PRIVATE_KEY_PATH.');
  }
}

function getNodeSignatureAlgorithm(signatureAlgorithm: string) {
  const normalized = signatureAlgorithm.toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (normalized === 'SHA512') return 'sha512';
  if (normalized === 'SHA256') return 'sha256';
  if (normalized === 'SHA1') return 'sha1';

  throw new Error(`Algoritmo de firma QZ no soportado: ${signatureAlgorithm}`);
}

export async function getQzTrayCertificate() {
  ensureQzSigningConfigured();
  return fs.readFile(config.qzTray.certificatePath, 'utf8');
}

export async function signQzTrayPayload(payload: string) {
  ensureQzSigningConfigured();

  const privateKeyPem = await fs.readFile(config.qzTray.privateKeyPath, 'utf8');
  const signer = crypto.createSign(getNodeSignatureAlgorithm(config.qzTray.signatureAlgorithm));
  signer.update(payload, 'utf8');
  signer.end();

  return signer.sign(
    {
      key: privateKeyPem,
      passphrase: config.qzTray.privateKeyPassphrase || undefined,
    },
    'base64',
  );
}
