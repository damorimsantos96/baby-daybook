import { Platform } from "react-native";
import { supabase } from "./supabase";
import type { Child, Measurement, UserProfile, AppVersionConfig } from "@/types";

type UploadChildPhotoInput = {
  childId: string;
  uri: string;
  mimeType?: string;
  base64Data?: string;
  webFile?: File | null;
};

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_LOOKUP = new Uint8Array(123).fill(255);

for (let index = 0; index < BASE64_CHARS.length; index += 1) {
  BASE64_LOOKUP[BASE64_CHARS.charCodeAt(index)] = index;
}

function normalizeBase64(base64: string): string {
  return base64.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const clean = normalizeBase64(base64);
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  const bytes = new Uint8Array((clean.length * 3) / 4 - padding);
  let byteIndex = 0;

  for (let index = 0; index < clean.length; index += 4) {
    const thirdChar = clean.charCodeAt(index + 2);
    const fourthChar = clean.charCodeAt(index + 3);
    const encoded1 = BASE64_LOOKUP[clean.charCodeAt(index)];
    const encoded2 = BASE64_LOOKUP[clean.charCodeAt(index + 1)];
    const encoded3 = thirdChar === 61 ? 0 : BASE64_LOOKUP[thirdChar];
    const encoded4 = fourthChar === 61 ? 0 : BASE64_LOOKUP[fourthChar];

    if (
      encoded1 === 255 ||
      encoded2 === 255 ||
      (thirdChar !== 61 && encoded3 === 255) ||
      (fourthChar !== 61 && encoded4 === 255)
    ) {
      throw new Error("Invalid base64 photo data");
    }

    const chunk = (encoded1 << 18) | (encoded2 << 12) | (encoded3 << 6) | encoded4;
    bytes[byteIndex++] = (chunk >> 16) & 255;

    if (thirdChar !== 61) {
      bytes[byteIndex++] = (chunk >> 8) & 255;
    }

    if (fourthChar !== 61) {
      bytes[byteIndex++] = chunk & 255;
    }
  }

  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let output = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const chunk = (first << 16) | (second << 8) | third;

    output += BASE64_CHARS[(chunk >> 18) & 63];
    output += BASE64_CHARS[(chunk >> 12) & 63];
    output += index + 1 < bytes.length ? BASE64_CHARS[(chunk >> 6) & 63] : "=";
    output += index + 2 < bytes.length ? BASE64_CHARS[chunk & 63] : "=";
  }

  return output;
}

function buildDataUrl(base64Data: string, contentType: string): string {
  return `data:${contentType};base64,${normalizeBase64(base64Data)}`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === "undefined") {
      reject(new Error("FileReader unavailable"));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read selected photo"));
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Invalid selected photo"));
    };
    reader.readAsDataURL(file);
  });
}

async function buildInlinePhotoUrl({
  uri,
  mimeType,
  base64Data,
  webFile,
}: UploadChildPhotoInput): Promise<string> {
  const contentType = mimeType ?? "image/jpeg";

  if (uri.startsWith("data:")) {
    return uri;
  }

  if (base64Data) {
    return buildDataUrl(base64Data, contentType);
  }

  if (Platform.OS === "web") {
    if (webFile) {
      return fileToDataUrl(webFile);
    }

    const response = await fetch(uri);
    const blob = await response.blob();
    return fileToDataUrl(new File([blob], "child-photo", { type: contentType }));
  }

  const response = await fetch(uri);
  const buffer = await response.arrayBuffer();
  return buildDataUrl(arrayBufferToBase64(buffer), contentType);
}

async function buildStorageBody({
  childId,
  uri,
  mimeType,
  base64Data,
  webFile,
}: UploadChildPhotoInput): Promise<File | ArrayBuffer> {
  const contentType = mimeType ?? "image/jpeg";

  if (Platform.OS === "web") {
    if (webFile) {
      return webFile;
    }

    const response = await fetch(uri);
    return new File([await response.blob()], `${childId}.jpg`, { type: contentType });
  }

  if (base64Data) {
    return base64ToArrayBuffer(base64Data);
  }

  const response = await fetch(uri);
  return response.arrayBuffer();
}

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

export async function uploadChildPhoto({
  childId,
  uri,
  mimeType,
  base64Data,
  webFile,
}: UploadChildPhotoInput): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const path = `${user.id}/${childId}.jpg`;
  const contentType = mimeType ?? "image/jpeg";

  try {
    const file = await buildStorageBody({
      childId,
      uri,
      mimeType: contentType,
      base64Data,
      webFile,
    });

    const { error } = await supabase.storage
      .from("child-photos")
      .upload(path, file, {
        contentType,
        upsert: true,
      });

    if (error) throw error;
    return "uploaded";
  } catch (error) {
    try {
      return await buildInlinePhotoUrl({
        childId,
        uri,
        mimeType: contentType,
        base64Data,
        webFile,
      });
    } catch {
      throw error;
    }
  }
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
