import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export function initAuth() { return supabase; }

export async function loginWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) throw error;
}

export function checkRedirectResult() { return Promise.resolve(null); }

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function onAuth(callback) {
  supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
}

export function currentUser() {
  return supabase.auth.getUser().then(({ data }) => data.user ?? null);
}
