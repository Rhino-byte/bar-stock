import { redirect } from "next/navigation";

export default function ClerkStockOutRedirectPage() {
  redirect("/clerk/closing-stock");
}
