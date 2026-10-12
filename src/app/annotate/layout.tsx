import { ReactNode } from 'react';

export default function AnnotateLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen relative">{children}</div>;
}
