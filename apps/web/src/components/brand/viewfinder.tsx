/** Camera viewfinder corners over whatever it is placed in (the parent must be `relative`). Decorative. */
export function Viewfinder({ className = "", inset = "inset-2.5" }: { className?: string; inset?: string }) {
  const corner = "absolute size-5 border-brand";
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute ${inset} ${className}`}>
      <span className={`${corner} left-0 top-0 rounded-tl-md border-l-[3px] border-t-[3px]`} />
      <span className={`${corner} right-0 top-0 rounded-tr-md border-r-[3px] border-t-[3px]`} />
      <span className={`${corner} bottom-0 left-0 rounded-bl-md border-b-[3px] border-l-[3px]`} />
      <span className={`${corner} bottom-0 right-0 rounded-br-md border-b-[3px] border-r-[3px]`} />
    </span>
  );
}
