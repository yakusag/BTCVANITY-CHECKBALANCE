import { HDKey } from '@scure/bip32';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base58Check, privateKeyToHex, segwitAddress } from '@/lib/bitcoin';

export type AddressFormat = "legacy" | "segwit";

export type HdAddressResult = {
  index: number;
  address: string;
  privateKeyHex?: string;
  privateKeyWif?: string;
};

export async function searchHDAddresses({
  masterKey,
  startIndex,
  endIndex,
  targetAddress,
  format = "legacy",
  signal,
  onProgress,
}: {
  masterKey: string;
  startIndex: number;
  endIndex: number;
  targetAddress: string;
  format?: AddressFormat;
  signal?: AbortSignal;
  onProgress?: (index: number, currentAddress: string, speed: number) => void;
}): Promise<HdAddressResult | null> {
  
  let master: HDKey;
  try {
    master = HDKey.fromExtendedKey(masterKey.trim());
  } catch (e) {
    throw new Error("Invalid HD Key format (xpub or xprv expected).");
  }

  if (startIndex < 0 || endIndex < startIndex) {
    throw new Error("Invalid index range.");
  }

  let iterations = 0;
  const startTime = performance.now();

  for (let index = startIndex; index <= endIndex; index++) {
    if (signal?.aborted) throw new Error("Search stopped.");

    const child = master.derive(`m/0/0/${index}`);
    if (!child.publicKey) continue;

    let address: string;
    const pubHash = ripemd160(sha256(child.publicKey));

    if (format === "legacy") {
      address = base58Check(Uint8Array.of(0x00, ...pubHash));
    } else {
      address = segwitAddress(pubHash);
    }

    if (address === targetAddress.trim()) {
      let wif: string | undefined;
      let hex: string | undefined;

      if (child.privateKey) {
        const wifPayload = new Uint8Array(34);
        wifPayload[0] = 0x80;
        wifPayload.set(child.privateKey, 1);
        wifPayload[33] = 0x01;
        wif = base58Check(wifPayload);
        hex = privateKeyToHex(child.privateKey);
      }

      return { index, address, privateKeyHex: hex, privateKeyWif: wif };
    }

    iterations++;
    if (onProgress && iterations % 1000 === 0) {
      const elapsed = (performance.now() - startTime) / 1000;
      onProgress(index, address, Math.floor(iterations / elapsed));
    }

    if (iterations % 1000 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return null;
    }
