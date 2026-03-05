import { Switch, Route } from "wouter";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import CapturePage from "./capture";
import InboxPage from "./inbox";
import MapPage from "./map";
import BriefPage from "./brief";
import SettingsPage from "./settings";
import TopicViewPage from "./topic-view";

export default function Dashboard() {
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
          </header>
          <main className="flex-1 overflow-auto">
            <Switch>
              <Route path="/" component={MapPage} />
              <Route path="/capture" component={CapturePage} />
              <Route path="/inbox" component={InboxPage} />
              <Route path="/map" component={MapPage} />
              <Route path="/brief" component={BriefPage} />
              <Route path="/settings" component={SettingsPage} />
              <Route path="/topic/:category/:entity">{(params) => <TopicViewPage params={params} />}</Route>
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
