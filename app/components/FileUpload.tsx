'use client';

import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { FileSpreadsheet } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  maxSizeMB?: number;
}

const ACCEPTED_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const ACCEPTED_EXTENSIONS = ['.csv', '.xls', '.xlsx', '.xlsm'];

export default function FileUpload({ onFileSelect, maxSizeMB = 10 }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    // Check file type
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    const isValidType = 
      ACCEPTED_TYPES.includes(file.type) || 
      ACCEPTED_EXTENSIONS.includes(fileExtension);

    if (!isValidType) {
      return `Invalid file type. Accepted formats: ${ACCEPTED_EXTENSIONS.join(', ')}`;
    }

    // Check file size
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSizeMB) {
      return `File size exceeds ${maxSizeMB}MB limit. Current size: ${fileSizeMB.toFixed(2)}MB`;
    }

    return null;
  };

  const handleFile = (file: File) => {
    setError(null);
    const validationError = validateFile(file);
    
    if (validationError) {
      setError(validationError);
      return;
    }

    onFileSelect(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          terminal-border p-16 rounded-lg text-center transition-all duration-500 ease-out
          ${isDragging 
            ? 'bg-hacker-green-glow/30 border-hacker-cyan/40 shadow-hacker-glow-sm scale-[1.01]' 
            : 'bg-hacker-bg-tertiary/50 hover:bg-hacker-bg-tertiary/70 hover:scale-[1.005]'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xls,.xlsx,.xlsm"
          onChange={handleFileInputChange}
          className="hidden"
          aria-label="Select spreadsheet file to upload"
        />

        <div className="space-y-4">
          <div className="mb-4 flex justify-center">
            <FileSpreadsheet className="w-16 h-16 text-yellow-400" />
          </div>
          {isDragging ? (
            <p className="text-hacker-text-primary terminal-glow-sm text-lg">
              &gt; Drop file here...
            </p>
          ) : (
            <>
              <p className="text-hacker-text-primary text-lg mb-2">
                &gt; Drag and drop your spreadsheet here
              </p>
              <p className="text-hacker-text-primary-dim text-sm mb-4">or</p>
              <button
                onClick={handleButtonClick}
                className="terminal-border px-6 py-3 bg-hacker-bg-tertiary/60 hover:bg-hacker-bg-tertiary/80 hover:border-hacker-cyan transition-all terminal-glow-sm focus:outline-none focus:ring-2 focus:ring-hacker-cyan focus:ring-offset-2 focus:ring-offset-hacker-bg"
                aria-label="Browse and select a file to upload"
              >
                Browse Files
              </button>
            </>
          )}
          <p className="text-hacker-text-primary-dim text-xs mt-4">
            Supported: CSV, XLS, XLSX (Max {maxSizeMB}MB)
          </p>
        </div>
      </div>

      {error && (
        <div 
          className="mt-4 terminal-border p-4 bg-red-900/20 border-red-500/50 animate-fade-in"
          role="alert"
          aria-live="polite"
        >
          <p className="text-red-400 text-sm font-bold mb-1">
            &gt; ERROR:
          </p>
          <p className="text-red-300 text-sm">
            {error}
          </p>
        </div>
      )}
    </div>
  );
}

