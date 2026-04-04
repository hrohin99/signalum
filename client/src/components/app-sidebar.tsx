import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useRole } from "@/App";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
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
  Brain,
  Lightbulb,
  TrendingUp,
  ChevronRight,
  Zap,
} from "lucide-react";

const navItems = [
  { title: "My Workspace", url: "/", icon: Network },
  { title: "Capture", url: "/capture", icon: PenLine, requiresWrite: true },
  { title: "Live Feed", url: "/inbox", icon: Inbox },
  { title: "Briefings", url: "/briefings", icon: Newspaper },
];

const intelligenceSubItems = [
  { title: "Strategic Pulse", url: "/intelligence", icon: Zap },
  { title: "Market Signals", url: "/market-signals", icon: TrendingUp },
];

const settingsItems = [
  { title: "My Product", url: "/settings/product-intelligence", icon: Lightbulb },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, signOut } = useAuth();
  const { role } = useRole();

  const isReadOnly = role === "read_only";
  const isSubAdmin = role === "sub_admin";
  const isAdmin = !role || role === "admin";

  const showAdminNav = isAdmin && user?.email === "hrohin99@gmail.com";

  const intelligenceActive = intelligenceSubItems.some((i) => location === i.url);

  return (
    <Sidebar>
      <SidebarHeader className="p-4 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-[#1e3a5f] flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="text-base font-semibold tracking-tight">Signalum</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.filter(item => !(item.requiresWrite && isReadOnly)).map((item) => (
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

              <SidebarMenuItem>
                <Collapsible defaultOpen={intelligenceActive} className="group/intelligence w-full">
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      isActive={intelligenceActive}
                      data-testid="nav-intelligence"
                    >
                      <Brain className="w-4 h-4" />
                      <span>Intelligence</span>
                      <ChevronRight className="ml-auto w-4 h-4 transition-transform group-data-[state=open]/intelligence:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {intelligenceSubItems.map((item) => (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={location === item.url}
                            data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                          >
                            <Link href={item.url}>
                              <item.icon className="w-4 h-4" />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>

              {showAdminNav && (
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
        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => (
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
            {isReadOnly && (
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-medium">
                Read only
              </span>
            )}
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
