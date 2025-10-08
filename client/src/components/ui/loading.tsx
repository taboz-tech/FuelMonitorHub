// client/src/components/ui/loading.tsx
import React from 'react';
import { cn } from "@/lib/utils";

interface LoadingProps {
  variant?: 'fullscreen' | 'page' | 'inline' | 'card';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  message?: string;
  submessage?: string;
  className?: string;
  showFuelSystem?: boolean;
}

export function Loading({ 
  variant = 'inline', 
  size = 'md', 
  message = "Loading...", 
  submessage,
  className,
  showFuelSystem = true 
}: LoadingProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-20 h-20'
  };

  const containerClasses = {
    fullscreen: 'fixed inset-0 bg-white z-50 flex items-center justify-center',
    page: 'min-h-[60vh] flex items-center justify-center',
    inline: 'flex items-center justify-center py-8',
    card: 'flex items-center justify-center p-6'
  };

  const LoadingContent = () => (
    <div className="flex flex-col items-center space-y-6">
      {showFuelSystem ? (
        <FuelSystemLoader size={size} />
      ) : (
        <SimpleSpinner size={size} />
      )}
      
      <div className="text-center space-y-2">
        <h3 className={cn(
          "font-semibold text-gray-700",
          size === 'sm' && "text-sm",
          size === 'md' && "text-base",
          size === 'lg' && "text-lg",
          size === 'xl' && "text-xl"
        )}>
          {message}
        </h3>
        {submessage && (
          <p className={cn(
            "text-gray-500",
            size === 'sm' && "text-xs",
            size === 'md' && "text-sm",
            size === 'lg' && "text-base",
            size === 'xl' && "text-lg"
          )}>
            {submessage}
          </p>
        )}
      </div>
    </div>
  );

  if (variant === 'fullscreen') {
    return (
      <div className={cn(containerClasses[variant], className)}>
        <div className="bg-white rounded-2xl shadow-xl border p-8 max-w-md mx-4">
          <LoadingContent />
        </div>
      </div>
    );
  }

  return (
    <div className={cn(containerClasses[variant], className)}>
      <LoadingContent />
    </div>
  );
}

// Fuel System Loader (based on your HTML design)
function FuelSystemLoader({ size }: { size: string }) {
  const scale = {
    sm: 'scale-50',
    md: 'scale-75',
    lg: 'scale-100',
    xl: 'scale-125'
  }[size];

  return (
    <div className={cn("relative", scale)}>
      <style jsx>{`
        @keyframes fuelFill {
          0%, 100% { height: 25%; }
          50% { height: 80%; }
        }

        @keyframes fuelWave {
          0%, 100% { transform: translateX(-100%); }
          50% { transform: translateX(100%); }
        }

        @keyframes indicatorPulse {
          0%, 100% { 
            transform: translateY(-50%) scale(1);
            opacity: 0.8;
          }
          50% { 
            transform: translateY(-50%) scale(1.3);
            opacity: 1;
          }
        }

        @keyframes pumpPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }

        @keyframes pumpProgress {
          0% { width: 8px; }
          100% { width: 44px; }
        }

        @keyframes hoseFlow {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.1); }
        }

        @keyframes dropFall {
          0% { 
            top: 0; 
            opacity: 1;
            transform: translateX(-50%) scale(1);
          }
          100% { 
            top: 40px; 
            opacity: 0;
            transform: translateX(-50%) scale(0.3);
          }
        }

        @keyframes ringRotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .fuel-tank {
          position: relative;
          width: 80px;
          height: 120px;
          border: 4px solid #e5e7eb;
          border-radius: 12px;
          background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
          overflow: hidden;
          box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .fuel-level {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(180deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%);
          animation: fuelFill 3s ease-in-out infinite;
          border-radius: 0 0 8px 8px;
          box-shadow: 0 -2px 8px rgba(59, 130, 246, 0.3);
        }

        .fuel-surface {
          position: absolute;
          top: -2px;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, 
            transparent 0%, 
            rgba(255, 255, 255, 0.4) 25%, 
            rgba(255, 255, 255, 0.8) 50%, 
            rgba(255, 255, 255, 0.4) 75%, 
            transparent 100%);
          animation: fuelWave 2s ease-in-out infinite;
          border-radius: 2px;
        }

        .fuel-indicator {
          position: absolute;
          left: -12px;
          top: 50%;
          transform: translateY(-50%);
          width: 8px;
          height: 8px;
          background: #10b981;
          border-radius: 50%;
          animation: indicatorPulse 2s ease-in-out infinite;
          box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);
        }

        .fuel-indicator::before {
          content: '';
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          width: 16px;
          height: 2px;
          background: #e5e7eb;
          border-radius: 1px;
        }

        .pump-handle {
          width: 60px;
          height: 40px;
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          border-radius: 8px;
          position: relative;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.25);
          animation: pumpPulse 2.5s ease-in-out infinite;
        }

        .pump-handle::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 8px;
          transform: translateY(-50%);
          width: 44px;
          height: 4px;
          background: rgba(255, 255, 255, 0.3);
          border-radius: 2px;
        }

        .pump-handle::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 8px;
          transform: translateY(-50%);
          width: 32px;
          height: 4px;
          background: white;
          border-radius: 2px;
          animation: pumpProgress 3s ease-in-out infinite;
        }

        .fuel-hose {
          width: 4px;
          height: 60px;
          background: linear-gradient(180deg, #6b7280 0%, #4b5563 100%);
          border-radius: 2px;
          position: relative;
          animation: hoseFlow 2s linear infinite;
        }

        .drop {
          position: absolute;
          width: 6px;
          height: 8px;
          background: #3b82f6;
          border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
          animation: dropFall 1.5s linear infinite;
        }

        .drop:nth-child(1) { animation-delay: 0s; }
        .drop:nth-child(2) { animation-delay: 0.5s; }
        .drop:nth-child(3) { animation-delay: 1s; }

        .progress-ring {
          width: 80px;
          height: 80px;
          border: 6px solid #f3f4f6;
          border-radius: 50%;
          position: relative;
          margin-left: 24px;
        }

        .ring-progress {
          width: 100%;
          height: 100%;
          border: 6px solid transparent;
          border-top: 6px solid #3b82f6;
          border-right: 6px solid #60a5fa;
          border-radius: 50%;
          animation: ringRotate 2s linear infinite;
          position: absolute;
          top: -6px;
          left: -6px;
        }
      `}</style>
      
      <div className="flex items-center gap-6">
        {/* Fuel Tank */}
        <div className="fuel-tank">
          <div className="fuel-level">
            <div className="fuel-surface"></div>
          </div>
          <div className="fuel-indicator"></div>
        </div>
        
        {/* Pump System */}
        <div className="flex flex-col items-center gap-3">
          <div className="pump-handle"></div>
          <div className="fuel-hose">
            <div className="absolute top-full left-1/2 transform -translate-x-1/2">
              <div className="drop"></div>
              <div className="drop"></div>
              <div className="drop"></div>
            </div>
          </div>
        </div>
        
        {/* Progress Ring */}
        <div className="progress-ring">
          <div className="ring-progress"></div>
        </div>
      </div>
    </div>
  );
}

// Simple Spinner for cases where fuel system is too much
function SimpleSpinner({ size }: { size: string }) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  };

  return (
    <div className={cn(
      "animate-spin rounded-full border-4 border-gray-200 border-t-blue-600",
      sizeClasses[size]
    )} />
  );
}

// Specialized loading components for specific use cases
export function AuthLoading() {
  return (
    <Loading 
      variant="fullscreen"
      size="lg"
      message="Initializing Application"
      submessage="Checking authentication status..."
    />
  );
}

export function PageLoading({ message, submessage }: { message?: string; submessage?: string }) {
  return (
    <Loading 
      variant="page"
      size="md"
      message={message || "Loading page..."}
      submessage={submessage}
    />
  );
}

export function CardLoading({ message }: { message?: string }) {
  return (
    <Loading 
      variant="card"
      size="sm"
      message={message || "Loading..."}
      showFuelSystem={false}
    />
  );
}

export function InlineLoading({ message, size = 'sm' }: { message?: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <Loading 
      variant="inline"
      size={size}
      message={message || "Loading..."}
      showFuelSystem={false}
    />
  );
}