import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";

function parseKey(encodedKey: string) {
  const key = Buffer.from(encodedKey, "base64");

  if (key.length !== 32) {
    throw new Error("Token encryption requires a 32-byte base64 key.");
  }

  return key;
}

export function encryptToken(token: string, encodedKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, parseKey(encodedKey), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptToken(encryptedToken: string, encodedKey: string) {
  const [iv, tag, ciphertext, extra] = encryptedToken.split(".");

  if (!iv || !tag || !ciphertext || extra) {
    throw new Error("Encrypted token has an invalid format.");
  }

  const decipher = createDecipheriv(algorithm, parseKey(encodedKey), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
