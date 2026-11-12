import { logout } from "@/app/(auth)/actions";
import { Avatar, Icon } from "@/components/work/ui";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

// Signed-in user + log out, at the bottom of the sidebar.
export default async function UserCard() {
  const user = await getCurrentUser();
  const supabase = user ? await createClient() : null;
  const { data: profile } =
    (user && (await supabase?.from("profiles").select("full_name").eq("id", user.id).maybeSingle<Pick<Profile, "full_name">>())) || {};
  const name = profile?.full_name || user?.email?.split("@")[0] || "You";

  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={name} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{name}</p>
        <p className="truncate text-xs text-slate-500">{user?.email}</p>
      </div>
      <form action={logout}>
        <button type="submit" aria-label="Log out" title="Log out" className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white">
          <Icon name="logout" />
        </button>
      </form>
    </div>
  );
}
