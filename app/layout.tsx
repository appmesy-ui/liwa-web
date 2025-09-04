import "./globals.css"

export const metadata = {
  title: "Liwa",
  description: "Liwa – OEE App",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-gray-50 flex flex-col">
        <header className="p-4 bg-white shadow-md">
          <h1 className="text-xl font-bold text-indigo-600">Liwa</h1>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </body>
    </html>
  )
}
