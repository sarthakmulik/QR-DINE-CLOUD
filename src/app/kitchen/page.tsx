import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";

export default async function KitchenRootPage() {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login?redirect=/kitchen");
  }

  if (user.role === "superadmin") {
    redirect("/admin");
  }

  if (!user.hotelId) {
    redirect("/login?error=no_profile");
  }

  redirect(`/kitchen/${user.hotelId}`);
}
