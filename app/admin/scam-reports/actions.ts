"use server";

import {
  deleteScamReportFromNocoDB,
  updateScamReportAdminCommentInNocoDB,
  updateScamReportStatusInNocoDB,
  type ScamReportStatus,
} from "@/lib/nocodb-scam-report";
import { revalidatePath } from "next/cache";

export async function updateScamReportStatusAction(
  reportId: string,
  status: ScamReportStatus
) {
  const id = reportId.trim();
  if (!id) throw new Error("Report ID is required");
  if (status !== "Pending" && status !== "Approve") {
    throw new Error("Status must be Pending or Approve");
  }

  await updateScamReportStatusInNocoDB(id, status);
  revalidatePath("/admin/scam-reports");
}

export async function updateScamReportAdminCommentAction(
  reportId: string,
  adminComment: string
) {
  const id = reportId.trim();
  if (!id) throw new Error("Report ID is required");

  await updateScamReportAdminCommentInNocoDB(id, adminComment);
  revalidatePath("/admin/scam-reports");
}

export async function deleteScamReportAction(reportId: string) {
  const id = reportId.trim();
  if (!id) throw new Error("Report ID is required");

  await deleteScamReportFromNocoDB(id);
  revalidatePath("/admin/scam-reports");
}
