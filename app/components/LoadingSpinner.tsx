'use client';

export default function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-4 bg-transparent">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="w-16 h-16 object-contain"
        aria-label="Loading"
      >
        <source src="/eye.mp4" type="video/mp4" />
      </video>
    </div>
  );
}

