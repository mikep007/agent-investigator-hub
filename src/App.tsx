import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import BreachMonitoring from "./pages/BreachMonitoring";
import Comparison from "./pages/Comparison";
import Cases from "./pages/Cases";
import CaseDetail from "./pages/CaseDetail";
import SelectorEnrichment from "./pages/SelectorEnrichment";
import WazeDashboard from "./pages/WazeDashboard";
import OSINTGraph from "./components/OSINTGraph";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/breach-monitoring" element={<BreachMonitoring />} />
          <Route path="/comparison" element={<Comparison />} />
          <Route path="/cases" element={<Cases />} />
          <Route path="/cases/:id" element={<CaseDetail />} />
          <Route path="/selector-enrichment" element={<SelectorEnrichment />} />
          <Route path="/waze" element={<WazeDashboard />} />
          <Route path="/graph" element={<div className="h-screen w-screen"><OSINTGraph /></div>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
