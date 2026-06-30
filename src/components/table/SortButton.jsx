import { ArrowUp , ArrowDown } from 'lucide-react';

export default function SortButton({ active, direction, onClick }) {
  return (
    <button onClick={onClick} className="flex leading-none cursor-pointer">
      <ArrowUp
        size={20}
        className={active && direction === 'asc' ? 'text-gray-600' : 'text-gray-300'}
      />
      <ArrowDown
        size={20}
        className={active && direction === 'desc' ? 'text-gray-600' : 'text-gray-300'}
      />
    </button>
  );
}