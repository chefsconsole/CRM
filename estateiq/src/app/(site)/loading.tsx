export default function Loading() {
  return (
    <div className="mx-auto max-w-[1400px] px-5 pb-24 pt-32 md:px-10" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-4 w-24" />
      <div className="skeleton mt-4 h-16 w-2/3" />
      <div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton aspect-[4/5] rounded-[28px]" />)}</div>
    </div>
  );
}
