import { HDKey } from '@scure/bip32';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

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

self.onmessage = async (event) => {
  const { xpub, startIndex, endIndex, targetAddress } = event.data;

  let master: HDKey;
  try {
    master = HDKey.fromExtendedKey(xpub.trim());
  } catch (e) {
    self.postMessage({ type: 'error', message: 'Invalid HD Key format.' });
    return;
  }

  const normalizedTarget = targetAddress.trim();
  let checked = 0;
  const startedAt = performance.now();

  for (let index = startIndex; index <= endIndex; index++) {
    try {
      const child = master.derive(`m/0/0/${index}`);
      if (!child.publicKey) continue;

      const address = legacyAddressFromPublicKey(child.publicKey);
      
      if (address === normalizedTarget) {
        const result: any = { index, address };
        if (child.privateKey) {
          result.privateKeyHex = privateKeyToHex(child.privateKey);
          result.privateKeyWif = privateKeyToWif(child.privateKey);
        }
        self.postMessage({ type: 'found', result });
        return;
      }

      checked++;
      if (checked % 1000 === 0) {
        const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
        self.postMessage({
          type: 'progress',
          index,
          address,
          keysPerSecond: Math.floor(checked / elapsedSeconds),
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } catch (e) {
      // ignore errors for individual indexes
    }
  }

  self.postMessage({ type: 'exhausted' });
};
