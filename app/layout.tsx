import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Abraham Bike | Quản trị điều hành',
  description: 'Dashboard điều hành Abraham Bike',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
