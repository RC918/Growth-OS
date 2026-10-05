// Standard Web Crypto SHA-256: no Node/NPM imports, keys, or custom algorithm.
export async function sha256Hex(text) {
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
 return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}
