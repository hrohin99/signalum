import { Switch, Route } from "wouter";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { FeedbackWidget } from "@/components/feedback-widget";
import { Search } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import CapturePage from "./capture";
import InboxPage from "./inbox";
import MapPage from "./map";
import BriefPage from "./brief";
import SettingsPage from "./settings";
import TopicViewPage from "./topic-view";
import AdminPage from "./admin";
import BriefingSettingsPage from "./briefing-settings";

export default function Dashboard() {
  console.log("WORKSPACE RENDERED");
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center gap-2 h-14 px-4 border-b border-border shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex-1" />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    disabled
                    className="p-2 rounded-md text-muted-foreground opacity-50 cursor-not-allowed"
                    data-testid="button-search-disabled"
                  >
                    <Search className="w-5 h-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Coming Soon — search everything in your workspace</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </header>
          <main className="flex-1 overflow-auto">
            <Switch>
              <Route path="/" component={MapPage} />
              <Route path="/workspace" component={MapPage} />
              <Route path="/capture" component={CapturePage} />
              <Route path="/inbox" component={InboxPage} />
              <Route path="/map" component={MapPage} />
              <Route path="/brief" component={BriefPage} />
              <Route path="/settings/briefing" component={BriefingSettingsPage} />
              <Route path="/settings" component={SettingsPage} />
              <Route path="/admin" component={AdminPage} />
              <Route path="/topic/:category/:entity">{(params) => <TopicViewPage params={params} />}</Route>
            </Switch>
          </main>
        </div>
      </div>
      <FeedbackWidget />
    </SidebarProvider>
  );
}
