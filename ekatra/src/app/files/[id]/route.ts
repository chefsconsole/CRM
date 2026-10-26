import { db } from "@/lib/db";
import { getTeamUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getObject } from "@/lib/storage";

// Serves uploaded files. Private documents require an authenticated team member with document access.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return new Response("Not found", { status: 404 });
  if (doc.isPrivate) {
    const user = await getTeamUser();
    if (!user || !can(user.role, doc.agreementId ? "commercial:read" : "projects:read")) return new Response("Not found", { status: 404 });
  }
  try {
    const data = await getObject(doc.storageKey);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `${doc.mimeType.startsWith("image/") ? "inline" : "attachment"}; filename="${doc.fileName.replace(/[^\w.\- ]/g, "_")}"`,
        "Cache-Control": doc.isPrivate ? "private, no-store" : "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("File missing", { status: 410 });
  }
}
