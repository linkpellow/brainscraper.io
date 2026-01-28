'use client';

import { useEffect, useRef } from 'react';
import { DayPicker } from 'react-day-picker';
import { X } from 'lucide-react';
import 'react-day-picker/style.css';

interface DatePickerModalProps {
  isOpen: boolean;
  selectedDate: string | null;
  onDateSelect: (date: string | null) => void;
  onClose: () => void;
  availableDates?: string[];
}

export default function DatePickerModal({
  isOpen,
  selectedDate,
  onDateSelect,
  onClose,
  availableDates = [],
}: DatePickerModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;

    // Store the previously focused element
    previousActiveElement.current = document.activeElement as HTMLElement;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      // Restore focus when modal closes
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, onClose]);

  // Focus trap: focus the modal when it opens
  useEffect(() => {
    if (isOpen && modalRef.current) {
      const firstFocusable = modalRef.current.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) as HTMLElement;
      firstFocusable?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Convert selectedDate string to Date object for DayPicker
  const selectedDateObj = selectedDate ? new Date(selectedDate + 'T00:00:00') : undefined;

  // Convert availableDates strings to Date objects
  const availableDatesSet = new Set(availableDates);

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      // Format as YYYY-MM-DD
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      onDateSelect(dateStr);
      onClose();
    }
  };

  const handleClear = () => {
    onDateSelect(null);
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Custom modifiers for available dates
  const modifiers = {
    available: (date: Date) => {
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return availableDatesSet.has(dateStr);
    },
  };

  const modifiersClassNames = {
    available: 'rdp-day_available',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="date-picker-title"
    >
      <div
        ref={modalRef}
        className="relative bg-slate-800 rounded-xl shadow-2xl border border-slate-700 p-6 max-w-sm w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 id="date-picker-title" className="text-lg font-semibold text-white">
            Select Date
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded hover:bg-slate-700"
            aria-label="Close date picker"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Calendar */}
        <div className="mb-4">
          <style jsx global>{`
            .rdp {
              --rdp-cell-size: 36px;
              --rdp-accent-color: #ff5757;
              --rdp-background-color: rgba(255, 87, 87, 0.1);
              --rdp-accent-color-dark: #ff5757;
              --rdp-background-color-dark: rgba(255, 87, 87, 0.2);
              --rdp-outline: 2px solid var(--rdp-accent-color);
              --rdp-outline-selected: 2px solid var(--rdp-accent-color);
              margin: 0;
            }

            .rdp-months {
              display: flex;
            }

            .rdp-month {
              margin: 0;
            }

            .rdp-table {
              width: 100%;
              max-width: 100%;
            }

            .rdp-head_cell {
              color: #cbd5e1;
              font-size: 0.75rem;
              font-weight: 600;
              padding: 0.5rem 0;
            }

            .rdp-cell {
              padding: 0.125rem;
            }

            .rdp-button {
              color: #e2e8f0;
              border: none;
              background: transparent;
              cursor: pointer;
              border-radius: 0.375rem;
              transition: all 0.2s;
            }

            .rdp-button:hover:not([disabled]) {
              background-color: rgba(255, 255, 255, 0.1);
              color: #ffffff;
            }

            .rdp-button[disabled] {
              color: #475569;
              cursor: not-allowed;
            }

            .rdp-day_selected {
              background-color: #ff5757;
              color: #ffffff;
              font-weight: 600;
            }

            .rdp-day_selected:hover {
              background-color: #ff5757;
              opacity: 0.9;
            }

            .rdp-day_available {
              position: relative;
            }

            .rdp-day_available::after {
              content: '';
              position: absolute;
              bottom: 4px;
              left: 50%;
              transform: translateX(-50%);
              width: 4px;
              height: 4px;
              background-color: #10b981;
              border-radius: 50%;
            }

            .rdp-day_available.rdp-day_selected::after {
              background-color: #ffffff;
            }

            .rdp-caption {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 0.5rem 0;
              margin-bottom: 0.5rem;
            }

            .rdp-caption_label {
              color: #ffffff;
              font-weight: 600;
              font-size: 0.875rem;
            }

            .rdp-nav {
              display: flex;
              gap: 0.25rem;
            }

            .rdp-nav_button {
              padding: 0.25rem;
              color: #cbd5e1;
            }

            .rdp-nav_button:hover {
              color: #ffffff;
              background-color: rgba(255, 255, 255, 0.1);
            }
          `}</style>
          <DayPicker
            mode="single"
            selected={selectedDateObj}
            onSelect={handleDateSelect}
            modifiers={modifiers}
            modifiersClassNames={modifiersClassNames}
            className="text-slate-200"
            classNames={{
              months: 'months',
              month: 'month',
              caption: 'caption',
              caption_label: 'caption_label',
              nav: 'nav',
              nav_button: 'nav_button',
              nav_button_previous: 'nav_button_previous',
              nav_button_next: 'nav_button_next',
              table: 'table',
              head_row: 'head_row',
              head_cell: 'head_cell',
              row: 'row',
              cell: 'cell',
              day: 'day',
              day_button: 'button',
              day_selected: 'day_selected',
              day_disabled: 'day_disabled',
              day_hidden: 'day_hidden',
            }}
          />
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-700">
          <button
            onClick={handleClear}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            Clear
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
