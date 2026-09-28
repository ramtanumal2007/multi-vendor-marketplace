import { redirect } from "next/navigation";

export default function AdminFinanceRedirect() {
  redirect("/admin/finance/bank-accounts");
}
