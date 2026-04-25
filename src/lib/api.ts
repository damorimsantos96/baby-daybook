import { supabase } from "./supabase";
import type { Child, Measurement, UserProfile, AppVersionConfig } from "@/types";

// ─── User Profile ─────────────────────────────────────────────────────────────

export async function fetchUserProfile(): Promise<UserProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  return data;
}

export async function upsertUserProfile(name: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase.from("user_profiles").upsert(
    { user_id: user.id, name },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}

// ─── Children ─────────────────────────────────────────────────────────────────

export async function fetchChildren(): Promise<Child[]> {
  const { data, error } = await supabase
    .from("children")
    .select("*")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchChild(id: string): Promise<Child | null> {
  const { data, error } = await supabase
    .from("children")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertChild(
  child: Partial<Child> & { id?: string }
): Promise<Child> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (child.id) {
    const { id, ...rest } = child;
    const { data, error } = await supabase
      .from("children")
      .update({ ...rest, user_id: user.id })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from("children")
    .insert({ ...child, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteChild(id: string): Promise<void> {
  const { error } = await supabase.from("children").delete().eq("id", id);
  if (error) throw error;
}

// ─── Child Photo ──────────────────────────────────────────────────────────────

export async function uploadChildPhoto(
  childId: string,
  uri: string
): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const path = `${user.id}/${childId}.jpg`;

  const response = await fetch(uri);
  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();

  const { error } = await supabase.storage
    .from("child-photos")
    .upload(path, arrayBuffer, {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (error) throw error;

  const { data } = await supabase.storage
    .from("child-photos")
    .createSignedUrl(path, 60 * 60 * 24); // 24h

  return data?.signedUrl ?? "";
}

export async function getChildPhotoUrl(childId: string): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const path = `${user.id}/${childId}.jpg`;
  const { data } = await supabase.storage
    .from("child-photos")
    .createSignedUrl(path, 60 * 60 * 24);
  return data?.signedUrl ?? null;
}

// ─── Measurements ─────────────────────────────────────────────────────────────

export async function fetchMeasurements(childId: string): Promise<Measurement[]> {
  const { data, error } = await supabase
    .from("measurements")
    .select("*")
    .eq("child_id", childId)
    .order("date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function upsertMeasurement(
  m: Partial<Measurement> & { child_id: string; date: string }
): Promise<Measurement> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const payload = { ...m, user_id: user.id };
  const { data, error } = await supabase
    .from("measurements")
    .upsert(payload, { onConflict: "child_id,date" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMeasurement(id: string): Promise<void> {
  const { error } = await supabase.from("measurements").delete().eq("id", id);
  if (error) throw error;
}

// ─── App Version Config ───────────────────────────────────────────────────────

export async function fetchAppVersionConfig(): Promise<AppVersionConfig | null> {
  const { data } = await supabase
    .from("app_version_config")
    .select("*")
    .limit(1)
    .maybeSingle();
  return data;
}
