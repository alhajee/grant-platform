"use client";

import { useState } from "react";
import { ChevronDownIcon, EyeIcon, KeyRoundIcon, LogOutIcon, MailIcon, MoreVerticalIcon } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { LocalUser } from "@/lib/local-session";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { DepartmentArt } from "@/components/ubec/department-art";
import { RoleArt } from "@/components/role-art";

export function AccountMenu({ user, onViewPlan, disabled = false, badgeRole }: { user: LocalUser | null; onViewPlan?: () => void; disabled?: boolean; /** The stored role, when `user.role` is a display title (UBEC). */ badgeRole?: string }) {
  const name = user?.name || "Your account";
  const role = user?.role?.replaceAll("_", " ") || "";
  const [changing, setChanging] = useState(false);
  // A Super Admin acting as someone else cannot change that person's password.
  const canChangePassword = !!user && !user.impersonation && !onViewPlan;
  // The BEAP Chair (a SUBEB's nominated one, or a UBEC BEAP Chair holder) wears the crown badge of the chair-limit row.
  const chairLabel = user?.isBeapChair ? (user.stateCode === "UBEC" ? "UBEC BEAP Chair" : "Nominated BEAP Chair") : "";
  const initials = user?.name?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("") || "—";
  async function signOut() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      window.location.assign("/");
    } catch { toast.error("Unable to sign out. Please try again."); }
  }

  return (<>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {onViewPlan ? <Button variant="outline" size="icon" disabled={disabled} aria-label="More plan options"><MoreVerticalIcon /></Button> : (
          <Button variant="ghost" className="account-trigger" disabled={disabled} aria-label={`Account menu for ${name}`}>
            <span className="account-trigger-copy"><strong>{name}</strong>{role && <small>{role}</small>}</span>
            <span className="account-avatar-wrap">
              <Avatar size="lg" className="account-avatar"><AvatarFallback>{initials}</AvatarFallback></Avatar>
              {chairLabel && <span className="account-chair-seal" title={chairLabel} aria-label={chairLabel}><DepartmentArt department="chair" className="account-chair-crown" /></span>}
            </span>
            <ChevronDownIcon className="account-chevron" aria-hidden="true" data-icon="inline-end" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} collisionPadding={12} className="account-dropdown">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="account-menu-profile">
            <span className="account-avatar-wrap">
              <Avatar size="lg" className="account-avatar"><AvatarFallback>{initials}</AvatarFallback></Avatar>
            </span>
            <span><strong>{name}</strong>{role && <small className="account-menu-role"><RoleArt role={badgeRole ?? user?.role ?? ""} className="department-art-xs" />{role}</small>}{chairLabel && role !== chairLabel && <span className="account-chair-label"><DepartmentArt department="chair" className="department-art-xs" />{chairLabel}</span>}</span>
          </DropdownMenuLabel>
          {user?.email && <div className="account-menu-email"><MailIcon aria-hidden="true" /><span>{user.email}</span></div>}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {onViewPlan && <><DropdownMenuGroup><DropdownMenuItem onSelect={onViewPlan}><EyeIcon />View full plan</DropdownMenuItem></DropdownMenuGroup><DropdownMenuSeparator /></>}
        <DropdownMenuGroup>
          {canChangePassword && <DropdownMenuItem onSelect={() => setChanging(true)}><KeyRoundIcon />Change password</DropdownMenuItem>}
          <DropdownMenuItem onSelect={signOut}><LogOutIcon />Sign out</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    {canChangePassword && <ChangePasswordDialog open={changing} onOpenChange={setChanging} />}
  </>);
}
