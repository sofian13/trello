export const AUTH_COOKIE = "tb_auth";
const SALT = "teamboard-v1";

// Jeton déposé en cookie quand le mot de passe est bon. Dérivé du mot de passe,
// donc le cookie ne contient jamais le mot de passe en clair. Compatible Edge.
export async function authToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`${SALT}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
