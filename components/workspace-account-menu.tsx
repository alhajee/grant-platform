"use client";

import { ChevronDownIcon, EyeIcon, LogOutIcon, MailIcon, MoreVerticalIcon } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { LocalUser } from "@/lib/local-session";

export function AccountMenu({ user, onViewPlan, disabled = false }: { user: LocalUser | null; onViewPlan?: () => void; disabled?: boolean }) {
  const name = user?.name || "Your account";
  const role = user?.role?.replaceAll("_", " ") || "";
  const initials = user?.name?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("") || "—";
  async function signOut() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      window.location.assign("/");
    } catch { toast.error("Unable to sign out. Please try again."); }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {onViewPlan ? <Button variant="outline" size="icon" disabled={disabled} aria-label="More plan options"><MoreVerticalIcon /></Button> : (
          <Button variant="ghost" className="account-trigger" disabled={disabled} aria-label={`Account menu for ${name}`}>
            <span className="account-trigger-copy"><strong>{name}</strong>{role && <small>{role}</small>}</span>
            <Avatar size="lg" className="account-avatar"><AvatarFallback>{initials}</AvatarFallback></Avatar>
            <ChevronDownIcon className="account-chevron" aria-hidden="true" data-icon="inline-end" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} collisionPadding={12} className="account-dropdown">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="account-menu-profile">
            <Avatar size="lg" className="account-avatar"><AvatarFallback>{initials}</AvatarFallback></Avatar>
            <span><strong>{name}</strong>{role && <small>{role}</small>}</span>
          </DropdownMenuLabel>
          {user?.email && <div className="account-menu-email"><MailIcon aria-hidden="true" /><span>{user.email}</span></div>}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {onViewPlan && <><DropdownMenuGroup><DropdownMenuItem onSelect={onViewPlan}><EyeIcon />View full plan</DropdownMenuItem></DropdownMenuGroup><DropdownMenuSeparator /></>}
        <DropdownMenuGroup><DropdownMenuItem onSelect={signOut}><LogOutIcon />Sign out</DropdownMenuItem></DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
