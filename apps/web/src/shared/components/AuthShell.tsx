import type { ReactNode } from "react";
import { AuthArt } from "../../shared/components/AuthArt";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-57px)] items-center justify-center p-4 sm:p-8">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl bg-paper md:grid-cols-2">
        <div className="hidden items-center justify-center bg-sand p-10 md:flex">
          <AuthArt />
        </div>
        <div className="flex justify-center px-8 py-10 sm:px-14">{children}</div>
      </div>
    </div>
  );
}
