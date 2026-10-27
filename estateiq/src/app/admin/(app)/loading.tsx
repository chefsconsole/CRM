export default function Loading() {
  return (
    <div className="mx-auto max-w-[1500px]" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-12 w-72" />
      <div className="skeleton mt-3 h-4 w-96" />
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton h-32 rounded-3xl" />)}</div>
      <div className="skeleton mt-6 h-80 rounded-3xl" />
    </div>
  );
}
