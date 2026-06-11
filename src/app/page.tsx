import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role === "superadmin") {
    redirect("/admin");
  }

  if (user.role === "staff") {
    redirect("/staff");
  }

  redirect("/dashboard");
}
