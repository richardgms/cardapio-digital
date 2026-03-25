"use client";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="text-6xl">📶</div>
      <h1 className="text-2xl font-bold text-gray-800">Sem conexão</h1>
      <p className="max-w-sm text-gray-500">
        Você está offline. Verifique sua conexão com a internet e tente novamente.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-4 rounded-lg bg-orange-500 px-6 py-3 font-semibold text-white hover:bg-orange-600 active:bg-orange-700"
      >
        Tentar novamente
      </button>
    </div>
  );
}
