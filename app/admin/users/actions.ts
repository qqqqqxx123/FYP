"use server";

import { deleteUserFromNocoDB, updateUserInNocoDB } from "@/lib/nocodb";
import { revalidatePath } from "next/cache";

const STRONG_PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export async function removeUserAction(userId: string) {
  const id = userId.trim();
  if (!id) throw new Error("User ID is required");

  await deleteUserFromNocoDB(id);
  revalidatePath("/admin/users");
}

export async function updateUserAction(
  userId: string,
  username: string,
  password?: string,
  confirmPassword?: string
) {
  const id = userId.trim();
  if (!id) throw new Error("User ID is required");

  const trimmedPassword = password?.trim() ?? "";
  const trimmedConfirmPassword = confirmPassword?.trim() ?? "";

  if (trimmedPassword) {
    if (!STRONG_PASSWORD_PATTERN.test(trimmedPassword)) {
      throw new Error(
        "Password must be at least 8 characters and include letters, numbers, and symbols"
      );
    }
    if (trimmedPassword !== trimmedConfirmPassword) {
      throw new Error("Passwords do not match");
    }
  }

  await updateUserInNocoDB(id, {
    username,
    password: trimmedPassword || undefined,
  });
  revalidatePath("/admin/users");
}
