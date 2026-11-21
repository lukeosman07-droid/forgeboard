import { logout } from "@/app/(auth)/actions";
import MonitoringUser from "@/components/app/monitoring-user";
import { Avatar, Icon } from "@/components/work/ui";

// Signed-in user + log out, at the bottom of the sidebar.
export default function UserCard({ user }: { user: { id: string; email: string | null; name: string } }) {
  return (
    <div className="flex items-center gap-2.5">
      <MonitoringUser id={user.id} />
      <Avatar name={user.name} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{user.name}</p>
        <p className="truncate text-xs text-slate-500">{user.email}</p>
      </div>
      <form action={logout}>
        <button type="submit" aria-label="Log out" title="Log out" className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white">
          <Icon name="logout" />
        </button>
      </form>
    </div>
  );
}
