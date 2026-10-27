import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';

export function generateBase32Secret(size = 20): string {
  const secret = new OTPAuth.Secret({ size });
  return secret.base32;
}

export function generateTOTP(secretBase32: string): string {
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secretBase32),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  return totp.generate();
}

export function verifyTOTP(secretBase32: string, code: string): boolean {
  const cleanCode = code.trim();
  if (cleanCode.length !== 6) return false;

  try {
    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(secretBase32),
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });
    // window = 2 permits checking t-2, t-1, t, t+1, t+2 (+/- 60s clock drift tolerance)
    const delta = totp.validate({ token: cleanCode, window: 2 });
    return delta !== null;
  } catch {
    return false;
  }
}

export async function generateQrCodeDataUrl(accountName: string, secretBase32: string, issuer = 'Tavolo Cloud HQ'): Promise<string> {
  const totp = new OTPAuth.TOTP({
    issuer,
    label: accountName,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  const otpauthUrl = totp.toString();
  return await QRCode.toDataURL(otpauthUrl);
}

