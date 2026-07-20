import type { PropertyOffer } from "./model";
import { assertPropertyOffer } from "./validation";

const AES_KEY_BYTES = 32;
const AES_IV_BYTES = 12;
const AES_TAG_LENGTH = 128;
const PROPERTY_OFFER_AAD = toArrayBuffer(new TextEncoder().encode("property-offer/v1"));

export interface EncryptedPropertyOfferEnvelope {
  version: 1;
  algorithm: "A256GCM";
  iv: string;
  ciphertext: string;
}

export interface PropertyOfferFragment {
  key: string | null;
}

/** Encodes bytes without Buffer so the helper stays usable in browser clients. */
export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new TypeError("Neplatný base64url řetězec.");
  }
  const padding = (4 - (value.length % 4)) % 4;
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padding);
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new TypeError("Neplatný base64url řetězec.");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function sha256(value: string | Uint8Array): Promise<Uint8Array> {
  const data = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(data));
  return new Uint8Array(digest);
}

export async function sha256Base64Url(value: string | Uint8Array): Promise<string> {
  return encodeBase64Url(await sha256(value));
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const digest = await sha256(value);
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function generateOfferSlug(): string {
  return randomBase64Url(12);
}

export function generateRevokeToken(): string {
  return randomBase64Url(32);
}

export async function encryptJson<T>(value: T, rawKey?: string): Promise<{ encryptedPayload: string; key: string }> {
  const keyBytes = rawKey == null ? randomBytes(AES_KEY_BYTES) : validateRawKey(rawKey);
  const key = await importAesGcmKey(keyBytes, ["encrypt"]);
  const iv = randomBytes(AES_IV_BYTES);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
      additionalData: PROPERTY_OFFER_AAD,
      tagLength: AES_TAG_LENGTH,
    },
    key,
    toArrayBuffer(plaintext),
  );

  const envelope: EncryptedPropertyOfferEnvelope = {
    version: 1,
    algorithm: "A256GCM",
    iv: encodeBase64Url(iv),
    ciphertext: encodeBase64Url(new Uint8Array(encrypted)),
  };

  return {
    encryptedPayload: JSON.stringify(envelope),
    key: encodeBase64Url(keyBytes),
  };
}

export async function decryptJson<T>(encryptedPayload: string, rawKey: string): Promise<T> {
  const envelope = parseEncryptedEnvelope(encryptedPayload);
  const keyBytes = validateRawKey(rawKey);
  const iv = decodeBase64Url(envelope.iv);
  if (iv.byteLength !== AES_IV_BYTES) {
    throw new TypeError("Neplatná délka inicializačního vektoru.");
  }
  const ciphertext = decodeBase64Url(envelope.ciphertext);
  if (ciphertext.byteLength <= AES_TAG_LENGTH / 8) {
    throw new TypeError("Šifrovaný payload je příliš krátký.");
  }

  const key = await importAesGcmKey(keyBytes, ["decrypt"]);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
        additionalData: PROPERTY_OFFER_AAD,
        tagLength: AES_TAG_LENGTH,
      },
      key,
      toArrayBuffer(ciphertext),
    );
  } catch {
    throw new Error("Nabídku se nepodařilo dešifrovat. Odkaz je neplatný nebo byl payload změněn.");
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)) as T;
  } catch {
    throw new Error("Dešifrovaný payload neobsahuje platná JSON data.");
  }
}

export async function encryptPropertyOffer(
  offer: PropertyOffer,
): Promise<{ encryptedPayload: string; key: string }> {
  assertPropertyOffer(offer);
  return encryptJson(offer);
}

export async function decryptPropertyOffer(
  encryptedPayload: string,
  key: string,
): Promise<PropertyOffer> {
  const value = await decryptJson<unknown>(encryptedPayload, key);
  assertPropertyOffer(value);
  return value;
}

export function parseEncryptedEnvelope(encryptedPayload: string): EncryptedPropertyOfferEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(encryptedPayload);
  } catch {
    throw new TypeError("Šifrovaný payload není platné JSON.");
  }

  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).version !== 1 ||
    (value as Record<string, unknown>).algorithm !== "A256GCM" ||
    typeof (value as Record<string, unknown>).iv !== "string" ||
    typeof (value as Record<string, unknown>).ciphertext !== "string"
  ) {
    throw new TypeError("Nepodporovaný formát šifrovaného payloadu.");
  }

  return value as EncryptedPropertyOfferEnvelope;
}

/** Builds a URL fragment whose AES key is never sent to the server. */
export function buildOfferKeyFragment(key: string): string {
  validateRawKey(key);
  const params = new URLSearchParams({ k: key });
  return `#${params.toString()}`;
}

export function parseOfferKeyFragment(fragment: string): PropertyOfferFragment {
  const rawFragment = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  const params = new URLSearchParams(rawFragment);
  const key = params.get("k");

  if (key != null) validateRawKey(key);

  return { key };
}

function validateRawKey(value: string): Uint8Array {
  const bytes = decodeBase64Url(value);
  if (bytes.byteLength !== AES_KEY_BYTES) {
    throw new TypeError("AES-GCM klíč musí mít 256 bitů.");
  }
  return bytes;
}

async function importAesGcmKey(bytes: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", toArrayBuffer(bytes), { name: "AES-GCM", length: 256 }, false, usages);
}

function randomBase64Url(byteLength: number): string {
  return encodeBase64Url(randomBytes(byteLength));
}

function randomBytes(byteLength: number): Uint8Array {
  if (!Number.isInteger(byteLength) || byteLength <= 0) {
    throw new RangeError("Počet náhodných bajtů musí být kladné celé číslo.");
  }
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Creates an ArrayBuffer-backed copy accepted by TS 5.9 Web Crypto types. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
