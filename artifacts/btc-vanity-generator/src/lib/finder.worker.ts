/// <reference lib="webworker" />

import { HDKey } from '@scure/bip32';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BECH32_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function base58Encode(bytes: Uint8Array): string {
  let value = BigInt(`0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`);
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

function convertBits(data: Uint8Array, fromBits: number, toBits: number, pad: boolean): number[] {
  let accumulator = 0;
  let bits = 0;
  const output: number[] = [];
  const maxValue = (1 << toBits) - 1;
  const maxAccumulator = (1 << (fromBits + toBits - 1)) - 1;
  for (const value of data) {
    if (value < 0 || value >> fromBits !== 0) throw new Error("Invalid bit group.");
    accumulator = ((accumulator << fromBits) | value) & maxAccumulator;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      output.push((accumulator >> bits) & maxValue);
    }
  }
  if (pad && bits > 0) output.push((accumulator << (toBits - bits)) & maxValue);
  return output;
}

function bech32Polymod(values: number[]): number {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let index = 0; index < 5; index += 1) {
      if ((top >>> index) & 1) checksum ^= generators[index];
    }
  }
  return checksum >>> 0;
}

function segwitAddress(witnessProgram: Uint8Array): string {
  const hrp = "bc";
  const data = [0, ...convertBits(witnessProgram, 8, 5, true)];
  const expandedHrp = [
    ...Array.from(hrp, (c) => c.charCodeAt(0) >> 5), 0, ...Array.from(hrp, (c) => c.charCodeAt(0) & 31),
  ];
  const values = [...expandedHrp, ...data, 0, 0, 0, 0, 0, 0];
  const polymod = bech32Polymod(values) ^ 1;
  const checksum = Array.from({ length: 6 }, (_, i) => (polymod >>> (5 * (5 - i))) & 31);
  return `${hrp}1${[...data, ...checksum].map((v) => BECH32_ALPHABET[v]).join("")}`;
}

function getAddress(publicKey: Uint8Array, format: "legacy" | "segwit"): string {
  const publicKeyHash = ripemd160(sha256(publicKey));
  if (format === "legacy") {
    const payload = new Uint8Array(21);
    payload[0] = 0;
    payload.set(publicKeyHash, 1);
    const checksum = sha256(sha256(payload)).slice(0, 4);
    const addressBytes = new Uint8Array(payload.length + checksum.length);
    addressBytes.set(payload);
    addressBytes.set(checksum, payload.length);
    return base58Encode(addressBytes);
  } else {
    return segwitAddress(publicKeyHash);
  }
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
  const { xpub, startIndex, endIndex, targetAddress, format } = event.data;
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
      const address = getAddress(child.publicKey, format);

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
      // ignore
    }
  }
  self.postMessage({ type: 'exhausted' });
};
