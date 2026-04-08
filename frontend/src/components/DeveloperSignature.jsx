import React, { useState, useEffect } from 'react';

const DeveloperSignature = ({ developerName = "Desarrollado por Leija05", position = "bottom-right" }) => {
  const [text, setText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (currentIndex < developerName.length) {
      const timeout = setTimeout(() => {
        setText(prev => prev + developerName[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, 100);
      return () => clearTimeout(timeout);
    } else {
      setIsComplete(true);
    }
  }, [currentIndex, developerName]);

  const positionClasses = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
  };

  return (
    <div
      className={`fixed ${positionClasses[position]} z-50 pointer-events-none select-none`}
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <div className="relative">
        <div
          className="text-xs font-mono font-semibold tracking-wide"
          style={{
            background: 'linear-gradient(135deg, #002FA7 0%, #0052CC 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            textShadow: '0 0 1px rgba(0,47,167,0.1)',
            opacity: isComplete ? 0.85 : 1,
            transition: 'opacity 0.3s ease'
          }}
        >
          {text}
          {!isComplete && (
            <span
              className="inline-block w-0.5 h-3 ml-0.5 bg-[#002FA7] animate-pulse"
              style={{ animation: 'blink 1s step-start infinite' }}
            />
          )}
        </div>
      </div>
      <style jsx>{`
        @keyframes blink {
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default DeveloperSignature;
