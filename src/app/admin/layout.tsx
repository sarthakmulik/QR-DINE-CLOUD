import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { AdminNav } from "@/components/admin/admin-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();
  if (!user || user.role !== "superadmin") {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0F0F11]">
      <AdminNav user={user} />
      <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
