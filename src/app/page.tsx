import { DispatcherDashboard } from "@/components/dashboard/DispatcherDashboard";
import { LiveBackendProvider } from "@/components/dashboard/LiveBackendContext";

export default function Home() {
  return (
    <LiveBackendProvider>
      <DispatcherDashboard />
    </LiveBackendProvider>
  );
}
