import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { App } from "./App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ApiError } from "./lib/api-client";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Retrying a 401 or a 404 just delays the error the user needs to see.
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* `reducedMotion="user"` makes every `motion` component in the app
          honour the OS setting centrally — the alternative is remembering to
          check it at each of the dozen call sites, which is the kind of thing
          that gets missed on the thirteenth. */}
      <MotionConfig reducedMotion="user">
        {/* Global so no future tooltip has to remember to add one locally. */}
        <TooltipProvider delayDuration={200}>
          <App />
          {/* Write confirmations. Verifying a record, changing a role and
              deactivating an account previously all completed in silence. */}
          <Toaster />
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
);
