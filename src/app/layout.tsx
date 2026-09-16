import type { Metadata } from 'next';
import { StudioProvider } from '@/components/studio-context';
import { Shell } from '@/components/shell';
import './globals.css';
import './creator.css';
import './account.css';
export const metadata: Metadata = {
  title: 'Chriklfield — Creator Studio',
  description:
    'Entwickle eigene KI-Influencer und erstelle ihre Looks, Posts und Clips in deinem privaten Creator-Studio.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" data-scroll-behavior="smooth">
      <body>
        <StudioProvider>
          <Shell>{children}</Shell>
        </StudioProvider>
      </body>
    </html>
  );
}
