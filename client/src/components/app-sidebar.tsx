import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Shield,
  PenLine,
  Inbox,
  Network,
  Newspaper,
  Settings,
  LogOut,
  Lock,
  Zap,
} from "lucide-react";

const navItems = [
  { title: "My Workspace", url: "/", icon: Network },
  { title: "Capture", url: "/capture", icon: PenLine },
  { title: "Updates Feed", url: "/inbox", icon: Inbox },
  { title: "Today's Brief", url: "/brief", icon: Newspaper },
  { title: "Weekly Email", url: "/settings/briefing", icon: Zap },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, signOut } = useAuth();

  return (
    <Sidebar>
      <SidebarHeader className="p-4 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-[#1e3a5f] flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="text-base font-semibold tracking-tight">Watchloom</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {user?.email === "hrohin99@gmail.com" && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/admin"}
                    data-testid="nav-admin"
                  >
                    <Link href="/admin">
                      <Lock className="w-4 h-4" />
                      <span>Admin</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 pt-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center text-xs font-medium text-[#1e3a5f]">
            {user?.email?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.email || "User"}</p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={signOut}
            data-testid="button-sign-out"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
