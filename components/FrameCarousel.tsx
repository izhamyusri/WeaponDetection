'use client';

import React, { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';

interface Detection {
  class_id: number;
  class_name: string;
  confidence: number;
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

interface FrameData {
  type: string;
  frame_number: number;
  timestamp: number;
  detections: Detection[];
  count: number;
  snapshot: string;
}

interface FrameCarouselProps {
  frames: FrameData[];
}

export const FrameCarousel: React.FC<FrameCarouselProps> = ({ frames }) => {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: 'start',
    slidesToScroll: 1
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);

  const scrollTo = useCallback(
    (index: number) => emblaApi && emblaApi.scrollTo(index),
    [emblaApi]
  );

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    setScrollSnaps(emblaApi.scrollSnapList());
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
  }, [emblaApi, onSelect]);

  if (frames.length === 0) {
    return null;
  }

  return (
    <div className="border-2 border-green-500 p-4 bg-black shadow-[0_0_20px_rgba(34,197,94,0.2)]">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-bold text-green-500 tracking-wider flex items-center gap-2">
          <span className="text-red-500">■</span>
          DETECTED FRAMES [{frames.length}]
        </div>
      </div>

      {/* Carousel */}
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex gap-4">
          {frames.map((frame) => (
            <div
              key={frame.frame_number}
              className="flex-[0_0_300px] min-w-0"
            >
              <div className="border-2 border-green-500/70 bg-black/80 p-3 hover:border-green-400 transition-colors">
                {/* Frame Number */}
                <div className="text-xs font-bold text-red-400 mb-2 flex items-center gap-2">
                  <span className="bg-red-500/20 px-2 py-1 border border-red-500/50">
                    FRAME {frame.frame_number}
                  </span>
                  <span className="text-green-500/50 text-[10px]">
                    {frame.count} OBJECT{frame.count !== 1 ? 'S' : ''}
                  </span>
                </div>

                {/* Frame Image */}
                <div className="relative mb-2 border border-green-500/30">
                  <img
                    src={`data:image/jpeg;base64,${frame.snapshot}`}
                    alt={`Frame ${frame.frame_number}`}
                    className="w-full h-auto"
                  />
                </div>

                {/* Detections */}
                <div className="space-y-1">
                  {frame.detections.map((det, idx) => (
                    <div
                      key={idx}
                      className="text-xs flex justify-between items-center border-l-4 border-red-500 pl-2 py-1 bg-red-500/5"
                    >
                      <span className="text-green-400 uppercase font-mono font-bold">
                        {det.class_name}
                      </span>
                      <span className="text-red-500 font-bold">
                        {(det.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation Dots */}
      {frames.length > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          {scrollSnaps.map((_, index) => (
            <button
              key={index}
              onClick={() => scrollTo(index)}
              className={`w-2 h-2 border ${
                index === selectedIndex
                  ? 'bg-green-500 border-green-500'
                  : 'bg-transparent border-green-500/50'
              } transition-all`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      )}

      {/* Navigation Buttons */}
      {frames.length > 1 && (
        <div className="flex justify-between mt-3 gap-2">
          <button
            onClick={() => emblaApi?.scrollPrev()}
            disabled={selectedIndex === 0}
            className={`px-3 py-1 text-xs border ${
              selectedIndex === 0
                ? 'border-gray-600 text-gray-600 cursor-not-allowed'
                : 'border-green-500 text-green-500 hover:bg-green-500 hover:text-black'
            } transition font-bold tracking-wide`}
          >
            &lt; PREV
          </button>
          <div className="flex items-center text-xs text-green-500 font-mono">
            {selectedIndex + 1} / {frames.length}
          </div>
          <button
            onClick={() => emblaApi?.scrollNext()}
            disabled={selectedIndex === frames.length - 1}
            className={`px-3 py-1 text-xs border ${
              selectedIndex === frames.length - 1
                ? 'border-gray-600 text-gray-600 cursor-not-allowed'
                : 'border-green-500 text-green-500 hover:bg-green-500 hover:text-black'
            } transition font-bold tracking-wide`}
          >
            NEXT &gt;
          </button>
        </div>
      )}
    </div>
  );
};
