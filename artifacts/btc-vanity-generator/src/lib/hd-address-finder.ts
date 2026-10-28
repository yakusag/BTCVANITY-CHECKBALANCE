import { HDKey } from '@scure/bip32';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { isValidBitcoinAddressTarget } from '@/lib/bitcoin';

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export type HdAddressProgress = {
  index: number;
  address: string;
  keysPerSecond: number;
};

export type HdAddressMatch = {
  index: number;
  address: string;
  privateKeyWif?: string;
  privateKeyHex?: string;
};

function base58Encode(bytes: Uint8Array): string {
  let value = BigInt(
    `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`,
  );
  let encoded = '';

  while (value > 0n) {
    const digit = Number(value % 58n);
    encoded = BASE58_ALPHABET[digit] + encoded;
    value /= 58n;
  }

  let leadingZeroes = 0;
  while (leadingZeroes < bytes.length && bytes[leadingZeroes] === 0) {
    leadingZeroes += 1;
  }

  return `${'1'.repeat(leadingZeroes)}${encoded}`;
}

function legacyAddressFromPublicKey(publicKey: Uint8Array): string {
  const publicKeyHash = ripemd160(sha256(publicKey));
  const payload = new Uint8Array(21);
  payload[0] = 0;
  payload.set(publicKeyHash, 1);

  const checksum = sha256(sha256(payload)).slice(0, 4);
  const addressBytes = new Uint8Array(payload.length + checksum.length);
  addressBytes.set(payload);
  addressBytes.set(checksum, payload.length);
  return base58Encode(addressBytes);
}

function privateKeyToHex(privateKey: Uint8Array): string {
  return Array.from(privateKey, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function privateKeyToWif(privateKey: Uint8Array): string {
  const payload = new Uint8Array(34);
  payload[0] = 0x80;
  payload.set(privateKey, 1);
  payload[33] = 0x01;
  
  const checksum = sha256(sha256(payload)).slice(0, 4);
  const wifBytes = new Uint8Array(payload.length + checksum.length);
  wifBytes.set(payload);
  wifBytes.set(checksum, payload.length);
  return base58Encode(wifBytes);
}

export async function findHdAddressByXpub({
  xpub,
  startIndex,
  endIndex,
  targetAddress,
  signal,
  onProgress,
}: {
  xpub: string;
  startIndex: number;
  endIndex: number;
  targetAddress: string;
  signal?: AbortSignal;
  onProgress?: (progress: HdAddressProgress) => void;
}): Promise<HdAddressMatch | null> {
  const normalizedKey = xpub.trim();
  const normalizedTarget = targetAddress.trim();

  if (!normalizedKey.startsWith('xpub') && !normalizedKey.startsWith('xprv')) {
    throw new Error('Enter a mainnet xpub or xprv.');
  }
  if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex)) {
    throw new Error('Indexes must be whole numbers.');
  }
  if (startIndex < 0 || endIndex < startIndex) {
    throw new Error('Enter a valid index range.');
  }
  if (!isValidBitcoinAddressTarget(normalizedTarget, 'legacy')) {
    throw new Error('Enter a valid mainnet Legacy address.');
  }

  let master: HDKey;
  try {
    master = HDKey.fromExtendedKey(normalizedKey);
  } catch {
    throw new Error('The extended key is invalid.');
  }

  const startedAt = performance.now();
  let checked = 0;
  for (let index = startIndex; index <= endIndex; index += 1) {
    if (signal?.aborted) throw new Error('Search stopped.');

    let child: HDKey;
    try {
      child = master.derive(`m/0/0/${index}`);
    } catch {
      throw new Error(`Could not derive address index ${index}.`);
    }

    if (!child.publicKey) {
      throw new Error(`No public key was available at index ${index}.`);
    }

    const address = legacyAddressFromPublicKey(child.publicKey);
    if (address === normalizedTarget) {
      const result: HdAddressMatch = { index, address };
      
      if (child.privateKey) {
        result.privateKeyHex = privateKeyToHex(child.privateKey);
        result.privateKeyWif = privateKeyToWif(child.privateKey);
      }
      
      return result;
    }

    checked += 1;
    if (onProgress && checked % 100 === 0) {
      const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
      onProgress({
        index,
        address,
        keysPerSecond: Math.floor(checked / elapsedSeconds),
      });
    }

    if (checked % 1_000 === 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }

  return null;
    }
